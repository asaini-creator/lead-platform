// routes/api.js
// JSON API for leads. See README for full API contract.

const express = require('express');
const db = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const VALID_STATUSES = ['new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost'];

function logActivity(leadId, actorId, action, details) {
  db.prepare(
    'INSERT INTO lead_activity (lead_id, actor_id, action, details) VALUES (?, ?, ?, ?)'
  ).run(leadId, actorId, action, details || null);
}

// ---- Public: capture form submits here, no auth required ----
router.post('/api/public/leads', (req, res) => {
  const { name, email, company, phone, source } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'invalid email format' });
  }
  const info = db.prepare(`
    INSERT INTO leads (name, email, company, phone, source, status)
    VALUES (?, ?, ?, ?, ?, 'new')
  `).run(name.trim(), email.trim(), company || null, phone || null, source || 'website');

  logActivity(info.lastInsertRowid, null, 'lead_created', 'Submitted via public capture form');
  return res.status(201).json({ id: info.lastInsertRowid, message: 'Lead captured' });
});

// Everything below requires auth
router.use('/api/leads', authenticate);

// GET /api/leads?status=&assigned_to=&q=&page=&pageSize=
router.get('/api/leads', (req, res) => {
  const { status, assigned_to, q } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = {};

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `invalid status filter. Valid: ${VALID_STATUSES.join(', ')}` });
    }
    where.push('status = @status');
    params.status = status;
  }
  if (assigned_to) {
    where.push('assigned_to = @assigned_to');
    params.assigned_to = assigned_to;
  }
  if (q) {
    where.push('(name LIKE @q OR email LIKE @q OR company LIKE @q)');
    params.q = `%${q}%`;
  }

  // Members only see leads assigned to them; admins see everything.
  if (req.user.role === 'member') {
    where.push('assigned_to = @self');
    params.self = req.user.id;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM leads ${whereClause}`).get(params).c;
  const rows = db.prepare(`
    SELECT * FROM leads ${whereClause}
    ORDER BY created_at DESC
    LIMIT @pageSize OFFSET @offset
  `).all({ ...params, pageSize, offset });

  return res.status(200).json({
    data: rows,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  });
});

// GET /api/leads/:id
router.get('/api/leads/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role === 'member' && lead.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: not assigned to you' });
  }
  const notes = db.prepare('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC').all(lead.id);
  const activity = db.prepare('SELECT * FROM lead_activity WHERE lead_id = ? ORDER BY created_at DESC').all(lead.id);
  return res.status(200).json({ ...lead, notes, activity });
});

// PATCH /api/leads/:id  (status change / reassignment)
router.patch('/api/leads/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role === 'member' && lead.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: not assigned to you' });
  }

  const { status, assigned_to } = req.body;
  const updates = [];
  const params = { id: lead.id };

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `invalid status. Valid: ${VALID_STATUSES.join(', ')}` });
    }
    updates.push('status = @status');
    params.status = status;
  }
  if (assigned_to !== undefined) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can reassign leads' });
    }
    updates.push('assigned_to = @assigned_to');
    params.assigned_to = assigned_to;
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  updates.push("updated_at = datetime('now')");
  db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = @id`).run(params);

  if (status) logActivity(lead.id, req.user.id, 'status_changed', `${lead.status} -> ${status}`);
  if (assigned_to !== undefined) logActivity(lead.id, req.user.id, 'reassigned', `assigned_to -> ${assigned_to}`);

  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id);
  return res.status(200).json(updated);
});

// POST /api/leads/:id/notes
router.post('/api/leads/:id/notes', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role === 'member' && lead.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: not assigned to you' });
  }
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Note body is required' });

  const info = db.prepare(
    'INSERT INTO lead_notes (lead_id, author_id, body) VALUES (?, ?, ?)'
  ).run(lead.id, req.user.id, body.trim());
  logActivity(lead.id, req.user.id, 'note_added', body.trim().slice(0, 80));

  return res.status(201).json({ id: info.lastInsertRowid, body: body.trim() });
});

// DELETE /api/leads/:id  (admin only)
router.delete('/api/leads/:id', requireRole('admin'), (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  db.prepare('DELETE FROM leads WHERE id = ?').run(lead.id);
  return res.status(204).send();
});

module.exports = router;
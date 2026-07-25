// routes/pages.js
// Server-rendered HTML views (separate from the JSON API in routes/api.js).

const express = require('express');
const db = require('../db/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const VALID_STATUSES = ['new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost'];

router.get('/', (req, res) => res.render('capture', { success: false }));

router.post('/capture', (req, res) => {
  const { name, email, company, phone } = req.body;
  if (!name || !email) return res.render('capture', { success: false, error: 'Name and email required' });
  db.prepare(`
    INSERT INTO leads (name, email, company, phone, source, status)
    VALUES (?, ?, ?, ?, 'website', 'new')
  `).run(name.trim(), email.trim(), company || null, phone || null);
  res.render('capture', { success: true });
});

router.get('/dashboard', authenticate, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const leads = isAdmin
    ? db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM leads WHERE assigned_to = ? ORDER BY created_at DESC').all(req.user.id);
  const users = isAdmin ? db.prepare('SELECT id, name FROM users').all() : [];

  res.render('dashboard', { user: req.user, leads, users, statuses: VALID_STATUSES });
});

router.get('/leads/:id', authenticate, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).render('error', { message: 'Lead not found' });
  if (req.user.role === 'member' && lead.assigned_to !== req.user.id) {
    return res.status(403).render('error', { message: 'This lead is not assigned to you.' });
  }
  const notes = db.prepare('SELECT n.*, u.name AS author_name FROM lead_notes n LEFT JOIN users u ON u.id = n.author_id WHERE lead_id = ? ORDER BY n.created_at DESC').all(lead.id);
  const activity = db.prepare('SELECT a.*, u.name AS actor_name FROM lead_activity a LEFT JOIN users u ON u.id = a.actor_id WHERE lead_id = ? ORDER BY a.created_at DESC').all(lead.id);
  const users = req.user.role === 'admin' ? db.prepare('SELECT id, name FROM users').all() : [];

  res.render('lead-detail', { user: req.user, lead, notes, activity, users, statuses: VALID_STATUSES });
});

module.exports = router;
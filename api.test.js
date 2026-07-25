// tests/api.test.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../server');
const db = require('../db/db');
const { signToken } = require('../middleware/auth');

function tokenFor(email) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return signToken(user);
}

describe('Public capture flow', () => {
  test('anonymous user can submit a lead with valid data', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({ name: 'Test Lead', email: 'test@example.com', company: 'Acme' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  test('rejects submission missing required fields', async () => {
    const res = await request(app).post('/api/public/leads').send({ name: 'No Email' });
    expect(res.status).toBe(400);
  });

  test('rejects malformed email', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({ name: 'Bad Email', email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('Authentication', () => {
  test('unauthenticated request to /api/leads is rejected', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  test('invalid token is rejected', async () => {
    const res = await request(app).get('/api/leads').set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
  });

  test('valid admin token is accepted', async () => {
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`);
    expect(res.status).toBe(200);
  });
});

describe('Role-based permissions', () => {
  test('admin sees all leads', async () => {
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`);
    const allCount = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
    expect(res.body.pagination.total).toBe(allCount);
  });

  test('member only sees leads assigned to them', async () => {
    const member = db.prepare("SELECT * FROM users WHERE email = 'member@demo.com'").get();
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${tokenFor('member@demo.com')}`);
    const assignedCount = db.prepare('SELECT COUNT(*) c FROM leads WHERE assigned_to = ?').get(member.id).c;
    expect(res.body.pagination.total).toBe(assignedCount);
    res.body.data.forEach(lead => expect(lead.assigned_to).toBe(member.id));
  });

  test('member cannot reassign a lead (admin-only action)', async () => {
    const lead = db.prepare('SELECT * FROM leads LIMIT 1').get();
    const res = await request(app)
      .patch(`/api/leads/${lead.id}`)
      .set('Authorization', `Bearer ${tokenFor('member@demo.com')}`)
      .send({ assigned_to: 1 });
    expect(res.status).toBe(403);
  });

  test('member cannot delete a lead (admin-only action)', async () => {
    const lead = db.prepare('SELECT * FROM leads LIMIT 1').get();
    const res = await request(app)
      .delete(`/api/leads/${lead.id}`)
      .set('Authorization', `Bearer ${tokenFor('member@demo.com')}`);
    expect(res.status).toBe(403);
  });

  test('member cannot view a lead not assigned to them', async () => {
    const unassigned = db.prepare('SELECT * FROM leads WHERE assigned_to IS NULL LIMIT 1').get();
    const res = await request(app)
      .get(`/api/leads/${unassigned.id}`)
      .set('Authorization', `Bearer ${tokenFor('member@demo.com')}`);
    expect(res.status).toBe(403);
  });
});

describe('Core flow: status pipeline + notes', () => {
  let leadId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({ name: 'Pipeline Test', email: 'pipeline@example.com' });
    leadId = res.body.id;
  });

  test('admin can update lead status', async () => {
    const res = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`)
      .send({ status: 'contacted' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('contacted');
  });

  test('rejects invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`)
      .send({ status: 'not_a_real_status' });
    expect(res.status).toBe(400);
  });

  test('admin can add a note, and it appears in lead detail with timestamp', async () => {
    const noteRes = await request(app)
      .post(`/api/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`)
      .send({ body: 'Called, left voicemail' });
    expect(noteRes.status).toBe(201);

    const detail = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`);
    expect(detail.body.notes.length).toBeGreaterThan(0);
    expect(detail.body.notes[0]).toHaveProperty('created_at');
  });

  test('status change and note creation are recorded in activity trail', async () => {
    const detail = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`);
    const actions = detail.body.activity.map(a => a.action);
    expect(actions).toEqual(expect.arrayContaining(['status_changed', 'note_added']));
  });

  test('empty note body is rejected', async () => {
    const res = await request(app)
      .post(`/api/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`)
      .send({ body: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('Pagination and filtering', () => {
  test('pagination respects pageSize', async () => {
    const res = await request(app)
      .get('/api/leads?pageSize=1&page=1')
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.pageSize).toBe(1);
  });

  test('filtering by status only returns matching leads', async () => {
    const res = await request(app)
      .get('/api/leads?status=contacted')
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`);
    res.body.data.forEach(lead => expect(lead.status).toBe('contacted'));
  });

  test('invalid status filter returns 400', async () => {
    const res = await request(app)
      .get('/api/leads?status=bogus')
      .set('Authorization', `Bearer ${tokenFor('admin@demo.com')}`);
    expect(res.status).toBe(400);
  });
});
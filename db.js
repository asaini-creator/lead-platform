// db/db.js
// Uses Node's built-in node:sqlite (no native compile step needed).
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.NODE_ENV === 'test'
  ? ':memory:'
  : path.join(__dirname, 'data.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','member')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      phone TEXT,
      source TEXT DEFAULT 'website',
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','contacted','qualified','proposal_sent','won','lost')),
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
  `);
}

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  );
  const adminHash = bcrypt.hashSync('AdminPass123!', 10);
  const memberHash = bcrypt.hashSync('MemberPass123!', 10);

  insertUser.run('Asha Admin', 'admin@demo.com', adminHash, 'admin');
  insertUser.run('Milo Member', 'member@demo.com', memberHash, 'member');

  const insertLead = db.prepare(`
    INSERT INTO leads (name, email, company, phone, source, status, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertLead.run('Rahul Verma', 'rahul@brightretail.com', 'Bright Retail', '9876543210', 'website', 'new', 2);
  insertLead.run('Sara Khan', 'sara@nimbuscorp.com', 'Nimbus Corp', '9123456780', 'referral', 'contacted', 2);
  insertLead.run('James Lee', 'james@orbitshop.com', 'Orbit Shop', '9988776655', 'website', 'qualified', null);
}

migrate();
seed();

module.exports = db;
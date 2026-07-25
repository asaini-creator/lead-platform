# Lead Management Platform

A full stack lead management application built for a small sales team — public lead capture, authenticated dashboard with role-based access, lead lifecycle tracking, and a documented JSON API.

Built for **Digital Heroes** — Full Stack Development, Task A.

---

## Features

- **Public lead capture form** — anyone can submit a lead without logging in.
- **Authenticated dashboard** with two roles:
  - **Admin** — full access: view/manage all leads, manage users, change lead assignment.
  - **Member** — can view and manage only the leads assigned to them.
- **Role-based permissions enforced on both client and server** — the UI hides actions a role can't perform, and every request is independently re-checked server-side via middleware (client-side checks alone are never trusted).
- **Lead lifecycle management**:
  - Status pipeline (`new → contacted → qualified → proposal_sent → won/lost`)
  - Assignment of leads to a specific user
  - Timestamped notes on each lead
  - Full activity trail (status changes, assignment changes, notes) per lead
- **JSON API** for leads with pagination, filtering, and proper HTTP status codes (see below).
- **Automated tests** (Jest + Supertest) covering authentication/authorization rules and core lead flows.
- **Deployed on a free-tier host** with separate demo logins for each role.

---

## Tech Stack

- **Backend:** Node.js, Express 5
- **Views:** EJS (server-rendered templates)
- **Auth:** JWT, issued and verified via `jsonwebtoken`, stored in an HTTP cookie (`cookie-parser`)
- **Password hashing:** bcryptjs
- **Database:** SQLite, via Node's built-in `node:sqlite` module (no native compile step needed) — `db/db.js` handles connection, schema migration, and seeding
- **Testing:** Jest + Supertest
- **Deployment:** [ADD: e.g. Render / Railway / Vercel]

---

## Database Schema

SQLite database (`db/data.sqlite`), managed via `db/db.js` — auto-migrates and seeds demo data on startup. Uses `:memory:` automatically when `NODE_ENV=test`.

- **`users`** — `id`, `name`, `email` (unique), `password_hash`, `role` (`admin` | `member`), `created_at`
- **`leads`** — `id`, `name`, `email`, `company`, `phone`, `source`, `status` (`new` | `contacted` | `qualified` | `proposal_sent` | `won` | `lost`), `assigned_to` (FK → users), `created_at`, `updated_at`
- **`lead_notes`** — `id`, `lead_id` (FK → leads), `author_id` (FK → users), `body`, `created_at`
- **`lead_activity`** — `id`, `lead_id` (FK → leads), `actor_id` (FK → users), `action`, `details`, `created_at` — this is the activity trail shown per lead

Indexes on `leads.status` and `leads.assigned_to` for fast filtering.

---

## Project Structure

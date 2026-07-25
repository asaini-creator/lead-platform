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
  - Status pipeline (e.g. `New → Contacted → Qualified → Won/Lost`)
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
- **Deployment:** Railway (deploy in progress — see note below)

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
lead-platform/
├── db/
│ ├── db.js # SQLite connection, schema migration, and demo data seeding
│ └── data.sqlite # SQLite database file (gitignored in production use)
├── middleware/ # Auth checks (JWT verification), role guards, request validation
├── public/ # Static assets (CSS, client-side JS, images)
├── routes/
│ ├── auth.js # Login/signup routes
│ ├── pages.js # Server-rendered page routes (dashboard, forms)
│ └── api.js # JSON API routes for leads
├── tests/ # Jest + Supertest test suite
├── views/ # EJS templates
├── server.js # App entry point
├── package.json
└── .gitignore
---

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)

### Installation

```bash
git clone <this-repo-url>
cd lead-platform
npm install
```

### Environment Variables

Create a `.env` file in the root (never committed — see `.gitignore`):
PORT=3000
JWT_SECRET=your_secret_key

### Run locally

```bash
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

App runs at `http://localhost:3000`.

### Run tests

```bash
npm test
```

---

## Demo / Deployed Application

- **Live URL:** Not yet deployed — a deployment attempt is in progress on Railway. In the meantime, run locally via `npm install && npm start` (see Getting Started above).
- **Admin login:** `admin@demo.com` / `AdminPass123!`
- **Member login:** `member@demo.com` / `MemberPass123!`

> Demo accounts are auto-seeded on first run (see `db/db.js`) — no manual setup needed.

---

## API Documentation

Base URL: `/api/leads`

All routes below require authentication (JWT cookie). Members only see/act on leads assigned to them; Admins see/act on all leads.

| Method | Endpoint              | Description                                | Access        |
|--------|------------------------|---------------------------------------------|---------------|
| GET    | `/api/leads`            | List leads (supports pagination & filters) | Admin, Member |
| GET    | `/api/leads/:id`        | Get a single lead with its activity trail  | Admin, Member |
| POST   | `/api/leads`             | Create a new lead                          | Admin, Member |
| PATCH  | `/api/leads/:id`         | Update a lead (status, assignment, notes)  | Admin, Member* |
| DELETE | `/api/leads/:id`         | Delete a lead                              | Admin only    |

*Members can only update leads assigned to them.*

### Query Parameters (GET `/api/leads`)

| Param        | Type   | Description                     |
|--------------|--------|-----------------------------------|
| `page`       | number | Page number (default: 1)         |
| `limit`      | number | Results per page (default: 10)   |
| `status`     | string | Filter by pipeline status         |
| `assignedTo` | string | Filter by assigned user ID       |

### Response / Status Codes

| Code | Meaning                              |
|------|----------------------------------------|
| 200  | Success                                |
| 201  | Lead created                           |
| 400  | Invalid request body                   |
| 401  | Not authenticated (missing/invalid JWT)|
| 403  | Authenticated but not permitted (role) |
| 404  | Lead not found                         |
| 500  | Server error                           |

**Example — create a lead**

```json
POST /api/leads
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "source": "Website Form",
  "status": "new"
}
```

**Example — response**

```json
{
  "id": 4,
  "name": "Jane Doe",
  "status": "new",
  "assignedTo": null,
  "createdAt": "2026-07-25T10:00:00Z"
}
```

---

## Authentication Flow

1. User logs in via `/login` with email + password.
2. Password is verified against the bcrypt hash stored for that user.
3. On success, a JWT is signed (`jsonwebtoken`) containing the user's ID and role, and set as an HTTP cookie.
4. Every subsequent request passes through auth middleware, which verifies the JWT and attaches the user (with role) to the request.
5. Role-guard middleware then checks the user's role against what the route requires before allowing access.

---

## Testing Coverage

- **Auth rules:** unauthenticated access blocked on protected routes, role-based access enforced (Admin vs Member) on both page routes and API routes.
- **Core flows covered:** lead creation, lead status update, lead assignment.

Run with:
```bash
npm test
```

---

## AI Usage Note

Parts of this project (scaffolding, boilerplate, and this README) were built with AI assistance (Claude). Business logic, permission rules, and the final structure were reviewed and adjusted manually to fit the actual codebase.

---

## Assumptions

- Deployment to Railway was attempted but is currently blocked by a module-resolution error (`Cannot find module './routes/auth'`) not present in local runs; the app has been verified working locally via `npm start`, and deployment will be completed once this is resolved.

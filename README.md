# Resource Blocking Calendar

An internal resource planner with a React/TypeScript frontend and an Express/TypeScript API. The calendar uses a responsive resource-row timeline built without the paid FullCalendar resource-timeline license or any paid service.

## Requirements

- Node.js 20+
- npm

## Setup

Open two terminals from the project root.

### Backend

```sh
cd backend
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The API starts at `http://localhost:4000`. Set a strong `JWT_SECRET` in `backend/.env` before deployment. SQLite is used by default; change the Prisma datasource provider and `DATABASE_URL` to migrate to PostgreSQL.

### Frontend

```sh
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend is available at `http://localhost:5173`. Its API URL can be set with `VITE_API_URL`.

## Move the project to GitHub

1. Extract the project archive into a working folder and open a terminal there.
2. Create an empty repository on GitHub (do not initialize it with a README).
3. Initialize and push the source:

```sh
git init -b main
git add .
git commit -m "Initial resource blocking calendar"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

`.gitignore` excludes local `.env` files, dependencies, build output, and SQLite databases. Keep secrets out of GitHub; configure `backend/.env` separately on each machine.

## Default accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Team Lead | `lead` | `Lead@123` |
| Project Manager | `pm` | `Pm@123` |

Change seeded passwords immediately for non-local environments.

## Features

- HttpOnly, SameSite JWT cookie sessions and protected routes.
- Server-side role enforcement for resource, booking, booking-request, and user operations.
- Resource CRUD/deactivation, Admin/Team Lead booking creation/edit/deletion, and administrator user management.
- Project Managers have read-only calendar access and submit work requests with task type, task number, schedule, and duration, without selecting a resource. Admins and Team Leads assign an active resource before approving or rejecting; approval creates the calendar booking only after rechecking availability and schedule conflicts.
- Full 24-hour day and week resource views; search, type filters, and booking rescheduling by drag-and-drop.
- Booking task types are required for new blocks: Banner, Emailer, IVA, Website, or Screenshot.
- All-day blocks cover complete local calendar days and conflict with every hourly booking in that interval.
- Prevents creating or rescheduling resource blocks into past dates/times, in both the calendar UI and API.
- Zod request validation, consistent JSON errors, and overlap conflicts reported as HTTP 409.
- Responsive interface with toasts, loading placeholders, empty states, and labelled forms.
- Admin reports dashboard with live-updating booking details, date-range resource summaries, an all-resource `.xlsx` export, and per-resource `.xlsx` exports; full-day bookings count as 8 blocked hours per day.
- Users can hold multiple roles; Admins can update role assignments at any time, and changes apply to active sessions immediately.

## API

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST/PUT/DELETE /api/resources`
- `GET/POST/PUT/DELETE /api/bookings` (`GET` accepts `from`, `to`, `resourceId`)
- `GET/POST /api/booking-requests`, `POST /api/booking-requests/:id/approve` (Team Lead/Admin supplies `resourceId`), `POST /api/booking-requests/:id/reject`
- `GET/POST/PATCH/DELETE /api/users` (Admin only)
- `GET /api/health`

## Tests

```sh
cd backend
npm test
```

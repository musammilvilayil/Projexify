# Projexify

Projexify is a multi-role project incubation and mentoring platform built with Node.js, Express, MongoDB, Socket.IO and a responsive static web frontend.

## Core features

- Student-only public registration with JWT authentication
- Admin, Center Admin, Mentor and Student RBAC
- Admin-managed users and Center Admin + Center onboarding
- Center project management with ZIP/resource uploads
- Active-project marketplace, project details and enrollment
- Capacity-aware mentor assignment and progress tracking
- Project milestones, groups and notifications
- Protected project asset access and ZIP download
- Virtual Lab collaboration with Socket.IO authentication
- Meeting/session workflows and Jitsi integration
- Optional Gemini-powered mentoring/pricing helpers
- Password reset tokens with one-hour expiry
- Production health endpoint: `GET /api/health`

## Stack

- Node.js / Express
- MongoDB / Mongoose
- Socket.IO
- Vanilla HTML/CSS/JavaScript frontend
- JWT + bcrypt
- Multer + AdmZip
- Nodemailer
- Google Generative AI (optional)

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3005`.

For the first admin account, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before first startup. No default admin credential is included.

## Production requirements

Production startup requires:

- `MONGODB_URI`
- `JWT_SECRET`

For uploaded project files, set `UPLOAD_DIR` to a persistent mounted disk. Files stored on an ephemeral filesystem can disappear after a redeploy.

SMTP variables are required for password-reset email delivery. Gemini is optional.

## Enrollment/payment note

Free projects enroll normally. Paid-project enrollment is blocked unless `ENABLE_DEMO_PAYMENTS=true`. Demo payment mode is explicitly for portfolio/testing and does **not** represent real payment capture. A real checkout provider is V2 work.

## Scripts

- `npm run dev` — development server
- `npm start` — production server
- `npm test` — Jest suite (integration groups are skipped unless explicitly enabled)
- `npm run test:syntax` — syntax-check project JavaScript
- `npm run test:integration` — run workflow test against a running server

## Useful routes

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/admin/create-center-admin`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/enrollment/free`
- `GET /api/projects/:id/assets/download`

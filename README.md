# Projexify

Projexify is a full-stack platform for managing learning projects,
enrollments, virtual labs, and real-time collaboration.

## Features
- Project catalog with asset uploads and automatic ZIP extraction
- Student enrollment, progress tracking, and mentor assignment
- Virtual lab file manager with downloads, edits, and real-time updates
- Token-based API security
- Role-based administration and project-centre management

## Quick Start
1) Install dependencies
```
npm install
```
2) Configure environment
- Copy `.env.example` to `.env`
- Set `MONGODB_URI` and any other required variables

3) Run the server
```
npm run dev
```
The default port is `3005`. Change `PORT` in `.env` when required.

## Scripts
- `npm run dev` — start backend with nodemon
- `npm start` — start the production server
- `npm test` — run the Jest test suite

## API Notes
- Assets ZIP download: `GET /api/projects/:id/assets/download`
- Auth: Bearer token expected in `Authorization` header

# Deploying Projexify (Vercel frontend + Render backend)

The Render free plan sleeps after ~15 idle minutes. The frontend (`assets/js/api-base.js`) wakes it as soon as
someone opens any page (a "Starting the server…" banner shows while it boots), holds API calls until it answers,
and pings it every 8 minutes while a tab is open, so it stays up for active users.

## 1. Database
Create a free MongoDB Atlas cluster and copy its connection string (allow access from anywhere, 0.0.0.0/0).

## 2. Backend on Render
1. Render dashboard > New > Blueprint > pick this repo (it reads `render.yaml`).
2. Fill in: `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, optional `GEMINI_API_KEY`.
   Leave `CORS_ORIGIN` / `FRONTEND_URL` until step 3, then set both to your Vercel URL
   (several origins allowed in `CORS_ORIGIN`, comma separated).
3. Note the URL, e.g. `https://projexify-api.onrender.com`.
Note: the free plan has no persistent disk, so uploaded files (project ZIPs, workspaces) are lost on restart.
Use a paid plan with a disk mounted at `UPLOAD_DIR` for real use.

## 3. Frontend on Vercel
1. Vercel > Add New > Project > import this repo. `vercel.json` sets the build and output folder.
2. Environment variable: `BACKEND_URL` = the Render URL from step 2 (no trailing slash).
3. Deploy, then put the Vercel URL into Render's `CORS_ORIGIN` and `FRONTEND_URL`.

Every push to `main` redeploys both.

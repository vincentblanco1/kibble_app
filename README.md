# Kibble app (Render testing deployment)

## Before deploying
- This repo combines the supplied `server.js` and `public/` frontend.
- `npm start` runs the Express server. Render provides `PORT` automatically.
- Add required secrets in Render Environment settings; never commit `.env`.
- SQLite is included only for temporary testing. Render free services have ephemeral storage, so database changes can be lost after restarts, redeploys, or spin-downs. Do not use for real user data.
- Review/remove default admin accounts and rotate any credentials before making the app public.

## Local run
1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Create `.env` from `.env.example` and fill in valid values.
4. Run `npm start`.

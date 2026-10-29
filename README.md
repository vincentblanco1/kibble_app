# Kibble Supabase PostgreSQL migration

This kit contains the server-side code changes and a one-time importer. It does not contain your private `petfood.db` file.

## Before using
- Keep your existing project and `petfood.db` backed up.
- Do not replace the whole project with this ZIP. Copy these files into your existing Kibble project, replacing `server.js` and `package.json`, and adding `migrate-sqlite-to-supabase.js`.
- Keep the existing `public` folder and all other frontend files.

## Import existing SQLite data first
1. Copy `migrate-sqlite-to-supabase.js` into the same folder as your local `petfood.db`.
2. Make sure `DATABASE_URL` is set in a local `.env` file to your Supabase Session Pooler URI. Do not commit `.env`.
3. In that project folder, run:
   - `npm install`
   - `npm run import:supabase`
4. The importer creates tables and preserves row IDs and UNIQUE constraints. It refuses to import into a target table that already contains rows. If it stops, do not clear anything blindly; inspect the Supabase tables first.
5. Check the reported row counts before deploying.

## Then deploy
Commit the updated `server.js`, `package.json`, and `migrate-sqlite-to-supabase.js` to GitHub. Keep `DATABASE_URL` configured in Render. The app's database adapter uses PostgreSQL at runtime.

## Important
The code has been checked for JavaScript syntax, but has not been tested against your actual Supabase project. Verify the import and test app routes before relying on it. This importer needs `sqlite3` and `pg` installed locally; the runtime server uses `pg`.

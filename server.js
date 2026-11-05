require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const upload = multer({ storage: multer.memoryStorage() });

const app = express();

// A Postgres TIMESTAMP column comes back from `pg` as a real JS Date object,
// not a string -- but most of this file was written against the old SQLite
// build, which always returned "YYYY-MM-DD HH:MM:SS" text, and "fixed" that
// into a real Date with `new Date(String(ts).replace(' ', 'T') + 'Z')`. Fed a
// Date object instead of a string, that hack produces an Invalid Date (its
// String() form has a space in the wrong place), and anything calling
// .toISOString() or .toLocaleDateString() on the result throws -- silently
// crashing the request before a response is ever sent. This handles both
// shapes safely and never throws.
function toSafeDate(ts) {
  if (ts instanceof Date) return isNaN(ts.getTime()) ? new Date() : ts;
  const d = new Date(String(ts).replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? new Date() : d;
}

// "5m ago" style label from a scan/notification timestamp
function timeAgo(ts) {
  const then = toSafeDate(ts).getTime();
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

// The very first page a customer sees when they open the shared Render link.
// Without this, express.static's default "/" lookup falls through to
// public/index.html -- the logged-in scan dashboard -- instead of the public
// marketing page. landing.html's own script still handles sending mobile
// visitors to mobile-landing.html (or mobile-index.html if already logged in).
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// Route fallbacks: serve admin dashboard for /dashboard.html, and user dashboard for /Dashboard.html
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/Dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Dashboard.html'));
});

// Connect to Supabase PostgreSQL. Set DATABASE_URL in Render's Environment settings.
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Add the Supabase connection string in your environment.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase pooler connections use TLS.
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});
pool.on('error', (err) => console.error('[PostgreSQL] Idle client error:', err.message));

// Small callback-compatible adapter so existing route handlers can migrate incrementally.
// Queries are serialized to preserve the original SQLite schema/seed initialization order.
let dbQueue = Promise.resolve();
function postgresSql(sql) {
  let q = String(sql)
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/ig, 'INSERT INTO')
    .replace(/INSERT\s+OR\s+REPLACE\s+INTO/ig, 'INSERT INTO')
    .replace(/datetime\(\s*'now'\s*\)/ig, 'CURRENT_TIMESTAMP')
    .replace(/\s+COLLATE\s+NOCASE/ig, '')
    .replace(/\bDATETIME\b/ig, 'TIMESTAMP');
  q = q.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/ig, 'SERIAL PRIMARY KEY');
  let n = 0;
  q = q.replace(/\?/g, () => '$' + (++n));
  if (/INSERT\s+OR\s+IGNORE/i.test(sql)) q += ' ON CONFLICT DO NOTHING';
  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+users/i.test(sql)) {
    q += ' ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role';
  }
  return q;
}
function runQuery(sql, params = []) {
  const task = dbQueue.then(async () => {
    let query = postgresSql(sql);
    // Callbacks use this.lastID for inserted records.
    if (/^\s*INSERT\s+INTO/i.test(query) && !/\bRETURNING\b/i.test(query) && !/^\s*INSERT\s+INTO\s+email_codes\b/i.test(query)) query += ' RETURNING id';
    return pool.query(query, params);
  });
  dbQueue = task.then(() => undefined, () => undefined);
  return task;
}
const db = {
  serialize(fn) { fn(); },
  run(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    params = params || [];
    runQuery(sql, params).then(result => {
      if (callback) callback.call({ lastID: result.rows?.[0]?.id ?? null, changes: result.rowCount || 0 }, null);
    }).catch(err => { if (callback) callback.call({ lastID: null, changes: 0 }, err); else console.error('[PostgreSQL]', err.message); });
    return this;
  },
  get(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    runQuery(sql, params || []).then(result => callback && callback(null, result.rows[0])).catch(err => callback && callback(err));
  },
  all(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    runQuery(sql, params || []).then(result => callback && callback(null, result.rows)).catch(err => callback && callback(err));
  },
  prepare(sql) {
    return {
      run(params, callback) {
        if (!Array.isArray(params)) { callback = typeof params === 'function' ? params : callback; params = []; }
        db.run(sql, params, callback);
        return this;
      },
      finalize(callback) { if (callback) callback(null); }
    };
  }
};
console.log('[PostgreSQL] Configured Supabase connection.');

// --- SCHEMA SETUP & AUTO-MIGRATION ---
db.serialize(() => {
  // 1. Users Table (ensures both password and password_hash exist)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    password_hash TEXT,
    role TEXT DEFAULT 'user',
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Auto-migrate columns if table already existed from an older run
  db.run(`ALTER TABLE users ADD COLUMN password TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN password_hash TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN ban_reason TEXT`, () => {});

  // Seed default admin accounts
  const seedAdmins = [
    { name: 'Dr. Sarah Chen', email: 'sarah.chen@kibbleguard.app', password: 'Kibbleguard2024!', role: 'Chief Admin' },
    { name: 'Jamie Benwick', email: 'jamie.benwick@kibbleguard.app', password: 'Kibbleguard2024!', role: 'Ingredient Reviewer' },
    { name: 'Alex Rivera', email: 'alex.rivera@kibbleguard.app', password: 'Kibbleguard2024!', role: 'Support Admin' }
  ];

  seedAdmins.forEach(admin => {
    db.run(
      `INSERT OR REPLACE INTO users (name, email, password, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [admin.name, admin.email.toLowerCase(), admin.password, admin.password, admin.role]
    );
  });

  // 2. Pets Table
  db.run(`CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    species TEXT,
    breed TEXT,
    gender TEXT,
    birthdate TEXT,
    weight REAL,
    allergies TEXT,
    vaccine_status TEXT,
    deworming_date TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`ALTER TABLE pets ADD COLUMN life_stage TEXT`, () => {});
  db.run(`ALTER TABLE pets ADD COLUMN takes_medicine TEXT`, () => {});
  db.run(`ALTER TABLE pets ADD COLUMN takes_supplements TEXT`, () => {});
  db.run(`ALTER TABLE pets ADD COLUMN medical_conditions TEXT`, () => {});

  // Add profile columns to users table
  db.run(`ALTER TABLE users ADD COLUMN middle_name TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN birthdate TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN gender TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN city TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN region TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN country TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN barangay TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN caregiver_role TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN feeding_style TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN pet_count INTEGER`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, () => {});

  // Admin panel: generic key-value store for admin UI state that the admin
  // pages already treat as a synced "kibbleguard-..." localStorage key --
  // safety rules, the admin roster + invites, activity log, team chat,
  // retention settings, triage-seen markers, ingredient edit history, etc.
  // One flexible table instead of one per list, because the admin frontend
  // (public/admin/db-sync.js) was already built around exactly this shape:
  // GET/PUT a key, get back a JSON blob, keep it versioned client-side.
  db.run(`CREATE TABLE IF NOT EXISTS admin_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed the admin roster into admin_state so the frontend recognises seeded
  // admins as active.  Uses INSERT … ON CONFLICT DO NOTHING so it only writes
  // the roster once — after that, the admin settings page owns the data.
  const seedRoster = seedAdmins.map(a => ({
    name: a.name,
    email: a.email.toLowerCase(),
    role: a.role,
    status: 'active'
  }));
  db.run(
    `INSERT INTO admin_state (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO NOTHING`,
    ['kibbleguard-admin-accounts', JSON.stringify(seedRoster)]
  );

  // Admin login sessions (Bearer tokens the admin pages send as
  // Authorization: Bearer <token>, or ?t=<token> for <img> tags).
  db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    user_id INTEGER,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Alerts shown in the owner's bell + Notification & Alert Center
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    category TEXT,
    title TEXT,
    message TEXT,
    link TEXT,
    source TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Signup email codes (only a hash of the code is stored)
  db.run(`CREATE TABLE IF NOT EXISTS email_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT,
    expires_at BIGINT,
    attempts INTEGER DEFAULT 0,
    last_sent BIGINT
  )`);
  // Fix columns if the table was created with INTEGER (too small for Date.now())
  db.run(`ALTER TABLE email_codes ALTER COLUMN expires_at TYPE BIGINT`, () => {});
  db.run(`ALTER TABLE email_codes ALTER COLUMN last_sent TYPE BIGINT`, () => {});

  // 3. Ingredients Table
  db.run(`CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    category TEXT,
    canine_rating TEXT,
    feline_rating TEXT,
    description TEXT,
    risks TEXT
  )`);

  // 4. Scans Table
  db.run(`CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    pet_id TEXT,
    product_name TEXT,
    image_url TEXT,
    raw_text TEXT,
    summary TEXT,
    risk_score INTEGER,
    rating TEXT,
    flagged_ingredients TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Older databases lack these columns; the errors are ignored when they already exist
  db.run(`ALTER TABLE scans ADD COLUMN species TEXT`, () => {});
  db.run(`ALTER TABLE scans ADD COLUMN results_json TEXT`, () => {});

  // 5. Products Table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT,
    product_name TEXT,
    target_species TEXT,
    overall_score INTEGER,
    rating TEXT,
    ingredients_list TEXT,
    analysis_notes TEXT
  )`);

  // 6. Pet Logs Table
  db.run(`CREATE TABLE IF NOT EXISTS pet_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id TEXT,
    log_type TEXT,
    title TEXT,
    value TEXT,
    date TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 7. Favorites Table
  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    item_type TEXT,
    item_id TEXT,
    item_title TEXT,
    item_subtitle TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 8. Tickets Table
  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    scan_id TEXT,
    category TEXT,
    message TEXT,
    timestamp TEXT,
    status TEXT DEFAULT 'pending',
    reply_message TEXT,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // these three are no-ops on a brand-new table (the CREATE above already has them) but fill
  // them in on a table that existed before this change -- same pattern as is_banned below
  db.run(`ALTER TABLE tickets ADD COLUMN status TEXT DEFAULT 'pending'`, () => {});
  db.run(`ALTER TABLE tickets ADD COLUMN reply_message TEXT`, () => {});
  db.run(`ALTER TABLE tickets ADD COLUMN resolved_at DATETIME`, () => {});

  // De-dupe log for Safety Feed broadcasts -- the admin page's alert row ids are generated
  // client-side and are NOT guaranteed unique across browser sessions, so this keys off a
  // stable id minted once when an alert first goes Live, to make "publish" idempotent (a page
  // refresh or a second admin re-saving the same alert should never re-notify every pet owner).
  db.run(`CREATE TABLE IF NOT EXISTS safety_alert_broadcasts (
    alert_id TEXT PRIMARY KEY,
    title TEXT,
    delivered_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed Ingredients
  const seedIngredients = [
    ['BHA (Butylated Hydroxyanisole)', 'Preservative', 'Caution', 'Toxic', 'Synthetic preservative used to prevent fat spoilage.', 'Known metabolic risk factor; cats lack glucuronidation pathways to safely process it.'],
    ['BHT (Butylated Hydroxytoluene)', 'Preservative', 'Caution', 'Toxic', 'Chemical antioxidant fat stabilizer.', 'Carcinogenic risks reported in prolonged animal feeding trials.'],
    ['Acacia Gum', 'Fiber', 'Safe', 'Safe', 'Natural plant-based fiber from acacia tree sap.', 'None in moderation; acts as a prebiotic.'],
    ['Agar Agar', 'Additive', 'Safe', 'Safe', 'Natural thickening and gelling agent derived from red algae.', 'None; non-nutritive plant fiber.'],
    ['Algal Oil', 'Fat', 'Safe', 'Safe', 'Marine algae oil rich in DHA omega-3 fatty acids.', 'None; supports cognitive and retinal health.'],
    ['Animal Digest', 'Palatant', 'Caution', 'Caution', 'Chemically hydrolyzed clean animal tissues.', 'Vague source material; difficult to identify individual allergens.'],
    ['Animal Fat', 'Fat', 'Caution', 'Caution', 'Rendered generic animal fat.', 'Unspecified sourcing; prone to oxidation.'],
    ['Beef Heart', 'Protein', 'Safe', 'Safe', 'Lean organ meat packed with taurine and essential micronutrients.', 'None; excellent species-appropriate protein.'],
    ['Garlic & Onion Extracts', 'Flavoring', 'Toxic', 'Toxic', 'Allium family seasonings.', 'Causes oxidative damage to red blood cells leading to hemolytic anemia.'],
    ['Xylitol / Birch Sugar', 'Sweetener', 'Toxic', 'Toxic', 'Sugar alcohol sweetener.', 'Causes acute hypoglycemic collapse and severe liver failure.']
  ];

  const stmtIng = db.prepare(`INSERT OR IGNORE INTO ingredients (name, category, canine_rating, feline_rating, description, risks) VALUES (?, ?, ?, ?, ?, ?)`);
  seedIngredients.forEach(item => stmtIng.run(item));
  stmtIng.finalize();

  // Seed Products
  const seedProducts = [
    ['Royal Canin', 'Digestive Care Dry', 'Cat', 88, 'Safe', 'Dehydrated poultry protein, rice, vegetable protein isolate...', 'Well balanced feline digestive blend with high bioavailability.'],
    ['Purina Pro Plan', 'Sensitive Skin & Stomach Salmon', 'Dog', 90, 'Safe', 'Salmon, barley, rice, oat meal, fish meal...', 'Omega-rich single-source novel protein formula for sensitive canines.'],
    ['Generic Value Kibble', 'Meat Medley Dry Formula', 'Dog', 42, 'Caution', 'Corn, poultry by-product meal, meat and bone meal, animal fat (preserved with BHA), artificial color...', 'Contains multiple synthetic preservatives and ambiguous protein sources.']
  ];

  const stmtProd = db.prepare(`INSERT OR IGNORE INTO products (brand, product_name, target_species, overall_score, rating, ingredients_list, analysis_notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  seedProducts.forEach(item => stmtProd.run(item));
  stmtProd.finalize();
});

// --- AUTH ROUTES ---
// --- SIGNUP EMAIL VERIFICATION ---
// A 6-digit code is emailed to the address being registered, and /api/register only creates the account
// when that code is sent back. SMTP credentials are supplied through Render environment variables.
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { console.warn('[EMAIL] nodemailer is not installed. Run: npm install nodemailer'); }
let mailTransporter = null;
function getMailer() {
  if (mailTransporter) return mailTransporter;
  if (!nodemailer || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  const port = Number(process.env.EMAIL_PORT || 587);
  mailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
    port,
    secure: port === 465,
    auth: { user: process.env.EMAIL_USER, pass: String(process.env.EMAIL_PASS).replace(/\s+/g, '') }
  });
  return mailTransporter;
}

const CODE_TTL_MS = 10 * 60 * 1000;        // a code works for 10 minutes
const RESEND_WAIT_MS = 60 * 1000;          // one new code per email per minute
const MAX_WRONG_TRIES = 5;                 // then the code is cancelled
const IP_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_IP = 5;                // stops someone using the form to flood inboxes
const sendsByIp = new Map();
const hashCode = (email, code) => crypto.createHash('sha256').update(email + ':' + code + ':' + (process.env.CODE_SECRET || 'kibbleguard')).digest('hex');
const sameHash = (a, b) => { try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); } catch (e) { return false; } };

function verificationMail(to, code) {
  return {
    from: process.env.EMAIL_FROM || '"Kibble" <vincentblanco17@gmail.com>',
    to,
    subject: 'Your KibbleGuard verification code',
    text: 'Your KibbleGuard verification code is ' + code + '.\n\nIt expires in 10 minutes. If you did not try to create an account, you can ignore this email.',
    html: '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #ebdcd0;border-radius:16px">' +
      '<h2 style="color:#182811;margin:0 0 8px">Verify your email</h2>' +
      '<p style="color:#555;margin:0">Use this code to finish creating your KibbleGuard account:</p>' +
      '<p style="font-size:34px;letter-spacing:8px;font-weight:bold;color:#45671d;margin:16px 0">' + code + '</p>' +
      '<p style="color:#888;font-size:12px;margin:0">This code expires in 10 minutes. If you did not try to sign up, you can ignore this email.</p></div>'
  };
}

app.post('/api/auth/send-code', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const mailer = getMailer();
  if (!mailer) return res.status(503).json({ error: 'Email sending is not set up on the server yet.' });

  const now = Date.now();
  const ip = req.ip || 'unknown';
  const recent = (sendsByIp.get(ip) || []).filter(t => now - t < IP_WINDOW_MS);
  if (recent.length >= MAX_SENDS_PER_IP) return res.status(429).json({ error: 'Too many code requests. Please try again in a few minutes.' });

  db.get('SELECT id FROM users WHERE lower(email) = ?', [email], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (user) return res.status(409).json({ error: 'An account with this email already exists.' });

    db.get('SELECT last_sent FROM email_codes WHERE email = ?', [email], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (row && now - row.last_sent < RESEND_WAIT_MS) {
        const wait = Math.ceil((RESEND_WAIT_MS - (now - row.last_sent)) / 1000);
        return res.status(429).json({ error: 'Please wait ' + wait + ' seconds before asking for another code.', retryAfter: wait });
      }
      const code = String(crypto.randomInt(100000, 1000000));
      db.run(
        `INSERT INTO email_codes (email, code_hash, expires_at, attempts, last_sent) VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, last_sent=excluded.last_sent`,
        [email, hashCode(email, code), now + CODE_TTL_MS, now],
        (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          mailer.sendMail(verificationMail(email, code)).then(() => {
            sendsByIp.set(ip, recent.concat(now));
            res.json({ success: true });
          }).catch((mailErr) => {
            console.error('[EMAIL] could not send the code:', mailErr.message);
            db.run('DELETE FROM email_codes WHERE email = ?', [email]);
            res.status(502).json({ error: 'We could not send the email. Check the address and try again.' });
          });
        }
      );
    });
  });
});

app.post('/api/register', (req, res) => {
  const { name, email, password, code } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!code) return res.status(400).json({ error: 'Please enter the verification code we emailed you.' });

  db.get('SELECT * FROM email_codes WHERE email = ?', [cleanEmail], (codeErr, row) => {
    if (codeErr) return res.status(500).json({ error: codeErr.message });
    if (!row || Date.now() > row.expires_at) {
      if (row) db.run('DELETE FROM email_codes WHERE email = ?', [cleanEmail]);
      return res.status(400).json({ error: 'That code has expired or was never requested. Please request a new one.' });
    }
    if (row.attempts >= MAX_WRONG_TRIES) {
      db.run('DELETE FROM email_codes WHERE email = ?', [cleanEmail]);
      return res.status(429).json({ error: 'Too many wrong attempts. Please request a new code.' });
    }
    if (!sameHash(hashCode(cleanEmail, String(code).trim()), row.code_hash)) {
      db.run('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?', [cleanEmail]);
      const left = MAX_WRONG_TRIES - (row.attempts + 1);
      return res.status(400).json({ error: left > 0 ? 'Incorrect code. ' + left + ' attempt' + (left === 1 ? '' : 's') + ' left.' : 'Incorrect code. Please request a new one.' });
    }
    db.run('DELETE FROM email_codes WHERE email = ?', [cleanEmail]);   // a code works once

    const query = `INSERT INTO users (name, email, password, password_hash, role) VALUES (?, ?, ?, ?, 'user')`;
    db.run(query, [name || 'Pet Parent', cleanEmail, password, password], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'An account with this email already exists.' });
        }
        return res.status(500).json({ error: err.message });
      }
      console.log(`[AUTH] New user registered: ID ${this.lastID} (${cleanEmail})`);
      res.json({ id: this.lastID, name: name || 'Pet Parent', email: cleanEmail, role: 'user' });
    });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const query = `
    SELECT id, name, middle_name, email, role, is_banned, ban_reason,
           birthdate, gender, city, region, country, barangay, caregiver_role, feeding_style, pet_count, avatar
    FROM users
    WHERE LOWER(email) = ? AND (password = ? OR password_hash = ?)
  `;

  db.get(query, [cleanEmail, password, password], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    const isBanned =
  user.is_banned === true ||
  user.is_banned === 1 ||
  user.is_banned === '1' ||
  user.is_banned === 'true';

if (isBanned) {
  return res.status(403).json({
    error: `Account suspended: ${user.ban_reason || 'Please contact support.'}`
  });
}

    console.log(`[AUTH] User logged in: \({user.email} (\){user.role})`);
    // Build profile object so the frontend can store it in localStorage
    const nameParts = (user.name || '').trim().split(/\s+/);
    const profile = {
      firstName: nameParts[0] || '',
      middleName: user.middle_name || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : ''),
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
      email: user.email,
      birthdate: user.birthdate || '',
      gender: user.gender || '',
      city: user.city || '',
      region: user.region || '',
      country: user.country || '',
      barangay: user.barangay || '',
      caregiverRole: user.caregiver_role || '',
      feedingStyle: user.feeding_style || '',
      avatar: user.avatar || ''
    };

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user'
      },
      profile: profile
    });
  });
});

// --- USER PROFILE UPDATE ---
app.patch('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { name, middle_name, birthdate, gender, city, region, country, barangay, caregiver_role, feeding_style, pet_count, avatar } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Invalid user ID.' });

  const fields = [];
  const vals = [];
  if (name !== undefined)          { fields.push('name=?');           vals.push(name); }
  if (middle_name !== undefined)   { fields.push('middle_name=?');    vals.push(middle_name); }
  if (birthdate !== undefined)     { fields.push('birthdate=?');      vals.push(birthdate); }
  if (gender !== undefined)        { fields.push('gender=?');         vals.push(gender); }
  if (city !== undefined)          { fields.push('city=?');           vals.push(city); }
  if (region !== undefined)        { fields.push('region=?');         vals.push(region); }
  if (country !== undefined)       { fields.push('country=?');        vals.push(country); }
  if (barangay !== undefined)      { fields.push('barangay=?');       vals.push(barangay); }
  if (caregiver_role !== undefined){ fields.push('caregiver_role=?'); vals.push(caregiver_role); }
  if (feeding_style !== undefined) { fields.push('feeding_style=?');  vals.push(feeding_style); }
  if (pet_count !== undefined)     { fields.push('pet_count=?');      vals.push(pet_count); }
  if (avatar !== undefined)        { fields.push('avatar=?');         vals.push(avatar); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  vals.push(userId);

  db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
    db.get(`SELECT id, name, middle_name, email, role, birthdate, gender, city, region, country, barangay, caregiver_role, feeding_style, pet_count, avatar FROM users WHERE id = ?`, [userId], (err2, row) => {
      if (err2) return res.json({ success: true });
      res.json({ success: true, user: row });
    });
  });
});

// --- OCR HELPER FUNCTIONS ---
function parseOcrIngredients(rawText) {
  if (!rawText || typeof rawText !== 'string') return { cleanedText: '', items: [] };

  // 1. Remove non-standard OCR artifact symbols (strip lone slashes, pipes, dashes, stray symbols)
  let text = rawText
    .replace(/[—_~|=–]+/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' '); // Keep standard printable ASCII

  // 2. Fuzzy match start anchor: "ingredients", "igredients", "ingred", "inactive ingredients"
  const startRegex = /(?:inactive\s+)?i[ng]{1,2}redien[a-z]{0,3}s?[:\s]*/i;
  const startMatch = text.match(startRegex);
  if (startMatch) {
    text = text.slice(startMatch.index + startMatch[0].length);
  }

  // 3. Stop anchor: "guaranteed analysis", "crude protein", "talk to us", "feeding", etc.
  const stopRegex = /(?:guaranteed\s+anal[a-z]+|crude\s+protein|talk\s+to\s+us|daily\s+feed[a-z]*|feeding\s+guide|manufactured\s+by)/i;
  const stopMatch = text.match(stopRegex);
  if (stopMatch) {
    text = text.slice(0, stopMatch.index);
  }

  // 4. Strip out trailing crude protein / percentage fragments if OCR merged columns
  text = text.replace(/crude\s+(?:protein|fat|ash|fiber)[\s\d%,.]*/gi, ' ');
  text = text.replace(/\b\d+[,.]\d+%\b/g, ' '); // remove standalone percentages like 26,0% or 13,0%

  // 5. Flatten newlines and multiple spaces into a single space
  text = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // 6. Protect commas/semicolons inside parentheses so sub-lists stay intact
  const protectedText = text.replace(/\(([^)]+)\)/g, (m) => m.replace(/[,;]/g, '___SEP___'));

  // 7. Split into ingredient items by comma, semicolon, or period-space
  const items = protectedText
    .split(/[,;•·]|\.\s+/)
    .map(item => item.replace(/___SEP___/g, ',').trim())
    // Filter out short noise, lone numbers, or single characters
    .filter(item => {
      const cleaned = item.replace(/[^a-zA-Z]/g, '');
      return cleaned.length > 2 && !/^(and|with|the|contains)$/i.test(cleaned);
    });

  return {
    cleanedText: items.join(', '),
    items
  };
}
// --- OCR HELPER FUNCTIONS ---
function parseOcrIngredients(rawText) {
  if (!rawText || typeof rawText !== 'string') return { cleanedText: '', items: [] };

  // 1. Isolate the ingredient block if common header labels exist
  let section = rawText;
  const startMatch = rawText.match(/(?:inactive\s+)?ingredients?:?/i);
  if (startMatch) {
    section = rawText.slice(startMatch.index + startMatch[0].length);
  }

  // 2. Stop parsing once non-ingredient sections appear (guaranteed analysis, feeding guides, footer text)
  const stopMatch = section.match(/(?:guaranteed\s+analysis|daily\s+feeding|feeding\s+guide|talk\s+to\s+us|directions|storage|manufactured\s+by)/i);
  if (stopMatch) {
    section = section.slice(0, stopMatch.index);
  }

  // 3. Normalize whitespace and cylindrical line break splits
  section = section.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // 4. Temporarily protect commas inside parentheses so nested details don't get shredded
  const protectedSection = section.replace(/\(([^)]+)\)/g, (m) => m.replace(/,/g, '___COMMA___'));

  // 5. Split into clean ingredient tokens
  const items = protectedSection
    .split(/[,;•·]/)
    .map(item => item.replace(/___COMMA___/g, ',').trim())
    .filter(item => item.length > 1 && !/^[:\-\.]$/.test(item));

  return {
    cleanedText: items.join(', '),
    items
  };
}

// Normalizes an ingredient name for matching: lowercase, strip parentheticals/punctuation,
// collapse whitespace. Mirrors the same normalization used client-side in results.js so
// OCR-extracted tokens reliably match Supabase primary_name/aliases values.
function normalizeIngredientName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9%\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Maps a Supabase risk value to the Safe/Caution/Toxic vocabulary the rest of the app expects.
function mapRiskToRating(risk) {
  const r = String(risk || '').toLowerCase();
  if (r === 'toxic' || r === 'highly toxic') return 'Toxic';
  if (r === 'caution') return 'Caution';
  return 'Safe';
}

// Fetches ALL ingredient risk data from Supabase — both dog_ingredients and cat_ingredients —
// merged by ingredient_id. An ingredient documented for only one species (e.g. "Egg" with a
// cat_ingredients row but no dog_ingredients row) is still recognized during a scan for the
// OTHER species too, instead of silently falling back to "no restrictions recorded". The
// species-specific risk/severity is still what drives scoring; the merge only affects whether
// the ingredient is *recognized* at all.
async function fetchMergedIngredients() {
  const [dogResult, catResult] = await Promise.all([
    pool.query(`SELECT ingredient_id, primary_name, aliases, category, risk, severity_score, notes, clinical_symptoms, dosage, emergency_action FROM dog_ingredients`),
    pool.query(`SELECT ingredient_id, primary_name, aliases, category, risk, severity_score, notes, clinical_symptoms, dosage, emergency_action FROM cat_ingredients`)
  ]);

  const dogMap = new Map(dogResult.rows.map(r => [r.ingredient_id, r]));
  const catMap = new Map(catResult.rows.map(r => [r.ingredient_id, r]));
  const allIds = new Set([...dogMap.keys(), ...catMap.keys()]);

  function shapeSpeciesRow(row) {
    if (!row) return null;
    return {
      rating: mapRiskToRating(row.risk),
      severity_score: Number(row.severity_score) || 0,
      notes: row.notes || '',
      clinical_symptoms: row.clinical_symptoms || '',
      dosage: row.dosage || '',
      emergency_action: row.emergency_action || ''
    };
  }

  const merged = [];
  allIds.forEach(id => {
    const dogRow = dogMap.get(id) || null;
    const catRow = catMap.get(id) || null;
    const primary = dogRow || catRow;
    merged.push({
      id,
      name: primary.primary_name,
      aliases: primary.aliases || '',
      category: primary.category || 'Ingredient',
      dog: shapeSpeciesRow(dogRow),
      cat: shapeSpeciesRow(catRow)
    });
  });

  return merged;
}

// Scores a list of ingredient names against the merged Supabase ingredient list (shared by
// scanning and re-opening a scan). Each match carries a real severity_score (0-100) from the
// database for the species being scanned, so the score deduction scales with how dangerous the
// ingredient actually is instead of a flat penalty per Caution/Toxic hit. An ingredient that's
// recognized but only documented for the OTHER species is still identified (with a note saying
// so) rather than treated as completely unknown.
function analyzeIngredients(tokens, mergedIngredients, speciesKey) {
  const flagged = [];
  const parsedResults = [];
  let score = 100;
  const isFeline = speciesKey === 'cat' || speciesKey === 'feline';

  // Flatten name + aliases into one lookup list so either can match
  const lookupEntries = [];
  mergedIngredients.forEach(item => {
    const primaryNorm = normalizeIngredientName(item.name);
    if (primaryNorm) lookupEntries.push({ key: primaryNorm, item });
    String(item.aliases || '').split(',').forEach(a => {
      const aliasNorm = normalizeIngredientName(a);
      if (aliasNorm) lookupEntries.push({ key: aliasNorm, item });
    });
  });

  function findMatch(token) {
    const tokenNorm = normalizeIngredientName(token);
    if (!tokenNorm) return null;

    const exact = lookupEntries.find(e => e.key === tokenNorm);
    if (exact) return exact.item;

    if (tokenNorm.length < 3) return null;
    let best = null;
    lookupEntries.forEach(e => {
      if (e.key.length < 3) return;
      if (tokenNorm.includes(e.key) || e.key.includes(tokenNorm)) {
        if (!best || e.key.length > best.key.length) best = e;
      }
    });
    return best ? best.item : null;
  }

  // Builds a short "Also known as: X, Y" line listing the database's primary name and
  // aliases that differ from what was actually scanned — so the label's own wording is never
  // replaced, but the reader still sees that e.g. a scanned "Chicken Broth" is the same
  // database entry as "Meat Broth".
  function buildAlsoKnownAs(matchedItem, token) {
    const tokenNorm = normalizeIngredientName(token);
    const seen = new Set([tokenNorm]);
    const names = [];

    const primaryNorm = normalizeIngredientName(matchedItem.name);
    if (primaryNorm && !seen.has(primaryNorm)) {
      names.push(matchedItem.name);
      seen.add(primaryNorm);
    }
    String(matchedItem.aliases || '').split(',').forEach(a => {
      const aTrim = a.trim();
      const aNorm = normalizeIngredientName(aTrim);
      if (aTrim && aNorm && !seen.has(aNorm)) {
        names.push(aTrim);
        seen.add(aNorm);
      }
    });

    return names.length ? `Also known in the database as: ${names.join(', ')}.` : '';
  }

  tokens.forEach(token => {
    const matchedItem = findMatch(token);

    if (matchedItem) {
      const speciesData = isFeline ? matchedItem.cat : matchedItem.dog;
      const otherSpeciesData = isFeline ? matchedItem.dog : matchedItem.cat;
      const alsoKnownAs = buildAlsoKnownAs(matchedItem, token);

      if (speciesData) {
        // We have a species-specific row — score normally off its real severity_score
        const itemRating = speciesData.rating || 'Safe';
        const severity = speciesData.severity_score || 0;

        if (itemRating === 'Toxic') {
          const deduction = Math.max(15, Math.round(severity * 0.45));
          score -= deduction;
          flagged.push({ name: token, rating: 'Toxic', risks: speciesData.notes });
        } else if (itemRating === 'Caution') {
          const deduction = Math.max(5, Math.round(severity * 0.3));
          score -= deduction;
          flagged.push({ name: token, rating: 'Caution', risks: speciesData.notes });
        }

        const baseNotes = speciesData.notes || 'Evaluated compound';
        parsedResults.push({
          name: token,
          category: matchedItem.category,
          status: itemRating,
          notes: alsoKnownAs ? `${baseNotes} ${alsoKnownAs}` : baseNotes,
          severity_score: severity,
          clinical_symptoms: speciesData.clinical_symptoms || '',
          dosage: speciesData.dosage || '',
          emergency_action: speciesData.emergency_action || ''
        });
      } else {
        // Recognized ingredient, but no row for THIS species yet. Don't silently claim
        // "no restrictions recorded" — say plainly it hasn't been independently evaluated
        // for this species, and surface what IS known from the other species' entry.
        const speciesWord = isFeline ? 'cats' : 'dogs';
        const baseNote = otherSpeciesData
          ? `Not independently evaluated for ${speciesWord} in the KibbleGuard database yet. Known data for the other species: ${otherSpeciesData.notes || 'no notes recorded'}.`
          : `Recognized as "${matchedItem.category}" but not yet evaluated for ${speciesWord} in the KibbleGuard database.`;

        parsedResults.push({
          name: token,
          category: matchedItem.category,
          status: 'Safe',
          notes: alsoKnownAs ? `${baseNote} ${alsoKnownAs}` : baseNote
        });
      }
    } else {
      parsedResults.push({
        name: token,
        category: 'Ingredient',
        status: 'Safe',
        notes: 'No specific restrictions recorded.'
      });
    }
  });

  score = Math.max(15, Math.min(100, score));
  const finalRating = score >= 80 ? 'Safe' : score >= 50 ? 'Caution' : 'Toxic';
  return { flagged, parsedResults, score, finalRating };
}

// --- ALLERGY CHECK: compares the selected pet's profile allergies with a scanned label ---
const ALLERGY_STOP = new Set(['synthetic', 'artificial', 'natural', 'added', 'sensitivity', 'sensitive', 'allergy', 'allergic', 'allergen', 'intolerance', 'to', 'and', 'or', 'known', 'flag', 'dietary', 'diet', 'free', 'with', 'the', 'of']);
const ALLERGY_NONE = /^(none|n\/?a|nil|no known allergies|no known allergens|no allergies|no allergens|no specific restrictions( recorded)?|not applicable)\.?$/i;

function allergyStem(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}
function allergyWords(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean).map(allergyStem);
}

// Groups of related ingredients. A pet allergic to one member may react to the others,
// so those are reported as a "possible" match. If the profile names the whole group
// (for example "poultry" or "grain") every member counts as a direct match.
// More specific groups come first.
const ALLERGY_FAMILIES = [
  { aliases: ['corn', 'maize'], members: ['corn', 'maize', 'cornmeal', 'cornstarch', 'hominy'] },
  { aliases: ['poultry', 'fowl'], members: ['poultry', 'fowl', 'chicken', 'hen', 'turkey', 'duck', 'goose', 'quail'] },
  { aliases: ['beef', 'bovine', 'cattle'], members: ['beef', 'bovine', 'cattle', 'veal'] },
  { aliases: ['lamb', 'mutton', 'sheep'], members: ['lamb', 'mutton', 'sheep'] },
  { aliases: ['pork', 'swine', 'pig'], members: ['pork', 'swine', 'pig', 'ham', 'bacon'] },
  { aliases: ['fish', 'seafood'], members: ['fish', 'seafood', 'salmon', 'tuna', 'whitefish', 'herring', 'sardine', 'anchovy', 'cod', 'trout', 'mackerel', 'menhaden', 'pollock', 'tilapia', 'haddock', 'krill', 'shrimp', 'crab', 'lobster', 'shellfish', 'clam', 'mussel', 'oyster'] },
  { aliases: ['dairy', 'milk', 'lactose'], members: ['dairy', 'milk', 'cheese', 'whey', 'casein', 'caseinate', 'yogurt', 'yoghurt', 'lactose', 'butter', 'cream', 'buttermilk'] },
  { aliases: ['egg'], members: ['egg', 'albumen'] },
  { aliases: ['soy', 'soya', 'soybean'], members: ['soy', 'soya', 'soybean', 'edamame', 'tofu'] },
  { aliases: ['gluten'], members: ['gluten', 'wheat', 'barley', 'rye', 'spelt'] },
  { aliases: ['grain', 'cereal'], members: ['grain', 'cereal', 'wheat', 'corn', 'maize', 'barley', 'oat', 'oatmeal', 'rye', 'rice', 'sorghum', 'millet', 'gluten', 'cornmeal', 'cornstarch', 'spelt'] },
  { aliases: ['legume', 'pulse'], members: ['legume', 'pulse', 'pea', 'lentil', 'chickpea', 'bean', 'soy', 'soybean', 'lupin'] }
].map(f => ({
  aliases: new Set(f.aliases.map(allergyStem)),
  members: new Set(f.members.map(allergyStem)),
  all: new Set(f.members.concat(f.aliases).map(allergyStem))
}));

// "Chicken, Synthetic BHA/BHT, High Sodium (Renal Monitoring)" -> terms to look for.
// Entries that start with High/Low describe nutrient levels, not ingredients, so they are skipped.
function parseAllergyTerms(text) {
  const terms = [];
  const skipped = [];
  String(text || '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;\n\/|&]+|\s+(?:and|or)\s+/i)
    .map(t => t.trim())
    .filter(Boolean)
    .forEach(raw => {
      if (ALLERGY_NONE.test(raw)) return;
      if (/^(high|low)\b/i.test(raw)) { skipped.push(raw); return; }
      const words = allergyWords(raw).filter(w => !ALLERGY_STOP.has(w));
      if (words.length) terms.push({ raw, words });
    });
  return { terms, skipped };
}

// candidates: word lists for one ingredient (the label wording and the database name)
function findAllergyMatch(candidates, terms) {
  let best = null;
  for (const term of terms) {
    for (const cand of candidates) {
      if (!cand.length) continue;
      if (term.words.every(w => cand.includes(w))) return { term: term.raw, match: 'direct' };
      for (const fam of ALLERGY_FAMILIES) {
        if (term.words.some(w => fam.all.has(w)) && cand.some(w => fam.members.has(w))) {
          const wholeGroup = term.words.length === 1 && fam.aliases.has(term.words[0]);
          if (wholeGroup) return { term: term.raw, match: 'direct' };
          if (!best) best = { term: term.raw, match: 'related' };
          break;
        }
      }
    }
  }
  return best;
}

// Adds allergy flags to a finished analysis (mutates it) and returns a summary for the scan page.
function applyPetAllergies(analysis, tokens, pet) {
  const { terms, skipped } = parseAllergyTerms(pet && pet.allergies);
  const summary = { pet: pet.name, terms: terms.map(t => t.raw), skipped, matches: [] };
  if (!terms.length) return summary;

  let score = analysis.score;
  analysis.parsedResults.forEach((item, i) => {
    const hit = findAllergyMatch([allergyWords(tokens[i]), allergyWords(item.name)], terms);
    if (!hit) return;
    const direct = hit.match === 'direct';
    const message = direct
      ? `${pet.name} is allergic to ${hit.term}.`
      : `Possible match: ${pet.name}'s profile lists ${hit.term}, which is related to this ingredient.`;
    item.allergy = { pet: pet.name, term: hit.term, match: hit.match, message };
    analysis.flagged.push({ name: item.name, rating: 'Allergen', risks: message });
    score -= direct ? 35 : 15;
    summary.matches.push({ ingredient: item.name, term: hit.term, match: hit.match });
  });

  if (summary.matches.length) {
    score = Math.max(15, Math.min(79, score)); // never "Safe" when the pet's own allergen is on the label
    analysis.score = score;
    analysis.finalRating = score >= 80 ? 'Safe' : score >= 50 ? 'Caution' : 'Toxic';
  }
  return summary;
}

// --- PET-FOOD CHECK: what Gemini says the photo shows ---
function normalizeProductType(value) {
  const v = String(value || '').toLowerCase().trim();
  if (['dog_or_cat_food', 'pet_food', 'dog_food', 'cat_food'].includes(v)) return 'dog_or_cat_food';
  if (['other_animal_food', 'not_pet_food', 'unclear'].includes(v)) return v;
  return null;
}
function notPetFoodResponse(type, reason) {
  const messages = {
    not_pet_food: "This doesn't look like pet food.",
    other_animal_food: 'This looks like food for another type of animal. KibbleGuard only checks dog and cat food.',
    unclear: "We can't tell whether this is dog or cat food."
  };
  return { error: messages[type], notPetFood: true, productType: type, reason: String(reason || '').slice(0, 240) };
}

// --- OCR & INGREDIENT ANALYSIS ROUTE ---
app.post(['/api/assess', '/api/ocr-scan'], upload.single('labelImage'), async (req, res) => {
  try {
    const { user_id, pet_id, product_name, species, manual_text } = req.body;
    let ingredientTokens = [];
    let imageUrl = null;

    if (req.file) {
      imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

      let aiResponse;
      const maxRetries = 3;
      let delayMs = 1500;

      const requestPayload = {
        model: 'gemini-3.5-flash-lite',
        contents: [
          {
            inlineData: {
              mimeType: req.file.mimetype,
              data: req.file.buffer.toString('base64'),
            },
          },
          {
            text: `You are an expert OCR parser for pet food packages. Look at the photo and first decide what it shows. Set product_type to exactly one of: "dog_or_cat_food" (the packaging or ingredient label of food, treats or supplements made for dogs or cats; typical clues are words like dog, cat, puppy, kitten, "complete and balanced", guaranteed analysis, AAFCO, or ingredients such as meat meal or animal digest), "other_animal_food" (food made for another animal, such as birds, fish, horses, rabbits or reptiles), "not_pet_food" (anything else: human food or drink, medicine, cosmetics, household products, or a photo with no product label), or "unclear" (a label that could be pet food but has nothing that shows what it is for). Write one short sentence in reason saying what the photo shows. Only when product_type is dog_or_cat_food, extract ONLY the ingredients list, normalizing each item into its clear ingredient name (e.g., "Beef", "Rice", "Sunflower Lecithin") and leaving out percentages, guaranteed analysis values, feeding instructions, and manufacturer details. For every other product_type return an empty ingredients list.`,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              product_type: {
                type: Type.STRING,
                description: 'One of: dog_or_cat_food, other_animal_food, not_pet_food, unclear',
              },
              reason: {
                type: Type.STRING,
                description: 'One short sentence saying what the photo shows',
              },
              ingredients: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Clean list of extracted ingredients (empty unless dog_or_cat_food)',
              },
            },
            required: ['product_type', 'reason', 'ingredients'],
          },
        },
      };

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          aiResponse = await ai.models.generateContent(requestPayload);
          break;
        } catch (err) {
          const isRetryable = err.status === 503 || err.status === 429 || err.code === 503;
          if (isRetryable && attempt < maxRetries) {
            console.warn(`[VISION AI] Attempt ${attempt} hit traffic spike (${err.status || err.message}). Retrying in ${delayMs / 1000}s...`);
            await new Promise((res) => setTimeout(res, delayMs));
            delayMs *= 2;
          } else {
            throw err;
          }
        }
      }

      const parsedData = JSON.parse(aiResponse.text);
      const productType = normalizeProductType(parsedData.product_type);
      if (productType && productType !== 'dog_or_cat_food') {
        // not scored, not saved: no scan row, no photo, nothing in History
        return res.status(422).json(notPetFoodResponse(productType, parsedData.reason));
      }
      if (!productType) console.warn('[VISION AI] The answer had no usable product_type; continuing without the pet-food check.');
      ingredientTokens = parsedData.ingredients || [];
    } else if (manual_text) {
      ingredientTokens = manual_text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    }

    if (ingredientTokens.length === 0) {
      return res.status(400).json({ error: 'No ingredients detected. Please provide a clear label image or text.' });
    }

    const speciesKey = (species || '').toLowerCase();

    let mergedIngredients;
    try {
      mergedIngredients = await fetchMergedIngredients();
    } catch (dbErr) {
      console.error('[ASSESS] Failed to load Supabase ingredient data:', dbErr.message);
      return res.status(500).json({ error: 'Failed to load ingredient database: ' + dbErr.message });
    }

    const runAnalysis = (pet) => {
      const analysis = analyzeIngredients(ingredientTokens, mergedIngredients, speciesKey);
      const allergy = pet ? applyPetAllergies(analysis, ingredientTokens, pet) : null;
      const { flagged, parsedResults, score, finalRating } = analysis;

      const insertQuery = `
        INSERT INTO scans (user_id, pet_id, product_name, species, image_url, raw_text, summary, risk_score, rating, flagged_ingredients, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(insertQuery, [
        user_id || 1,
        pet_id || null,
        product_name || 'Pet Food Scan',
        species || 'Unknown',
        imageUrl,
        ingredientTokens.join(', '),
        `${species || 'Companion'} nutritional safety scan processed via Vision AI.`,
        score,
        finalRating,
        JSON.stringify(flagged),
        JSON.stringify(parsedResults)
      ], function(saveErr) {
        if (saveErr) return res.status(500).json({ error: saveErr.message });

        res.json({
          success: true,
          scanId: this.lastID,
          score,
          rating: finalRating,
          results: parsedResults,
          flagged,
          parsedIngredients: ingredientTokens,
          allergy: allergy || undefined
        });
        createScanAlert({ userId: user_id || 1, scanId: this.lastID, rating: finalRating, flagged, allergy, species });
      });
    };

    // the pet chosen on the scan page (must belong to this user) supplies the allergy list
    if (pet_id) {
      db.get('SELECT name, species, allergies FROM pets WHERE id = ? AND user_id = ?', [pet_id, user_id || 1], (petErr, pet) => {
        runAnalysis(petErr ? null : pet);
      });
    } else {
      runAnalysis(null);
    }

  } catch (error) {
    console.error('[VISION AI ERROR]', error);
    res.status(500).json({ error: 'Processing failed: ' + error.message });
  }
});
   
// --- PETS ROUTE (USER-SPECIFIC) ---
app.get('/api/pets', (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.json([]);

  db.all(`SELECT * FROM pets WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/pets', (req, res) => {
  const { id, user_id, name, species, breed, gender, birthdate, weight, allergies, vaccine_status, deworming_date, image_url, life_stage, takes_medicine, takes_supplements, medical_conditions } = req.body;
  const query = `
    INSERT INTO pets (id, user_id, name, species, breed, gender, birthdate, weight, allergies, vaccine_status, deworming_date, image_url, life_stage, takes_medicine, takes_supplements, medical_conditions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, species=excluded.species, breed=excluded.breed, gender=excluded.gender,
      birthdate=excluded.birthdate, weight=excluded.weight, allergies=excluded.allergies,
      vaccine_status=excluded.vaccine_status, deworming_date=excluded.deworming_date, image_url=excluded.image_url,
      life_stage=excluded.life_stage, takes_medicine=excluded.takes_medicine,
      takes_supplements=excluded.takes_supplements, medical_conditions=excluded.medical_conditions
  `;
  db.run(query, [id, user_id || 1, name, species, breed, gender, birthdate, weight, allergies, vaccine_status, deworming_date, image_url, life_stage || null, takes_medicine || null, takes_supplements || null, medical_conditions || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id });
  });
});

app.delete('/api/pets/:id', (req, res) => {
  db.run(`DELETE FROM pets WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- PET LOGS & HEALTH TRACKING ROUTES ---
app.get('/api/pets/:petId/logs', (req, res) => {
  db.all(`SELECT * FROM pet_logs WHERE pet_id = ? ORDER BY date DESC`, [req.params.petId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/pets/logs', (req, res) => {
  const { pet_id, log_type, title, value, date, notes } = req.body;
  const query = `INSERT INTO pet_logs (pet_id, log_type, title, value, date, notes) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(query, [pet_id, log_type, title, value, date || new Date().toISOString().split('T')[0], notes || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, logId: this.lastID });
  });
});

// --- PRODUCTS CATALOG ROUTES ---
app.get('/api/products', (req, res) => {
  const species = req.query.species;
  const query = species ? `SELECT * FROM products WHERE target_species = ? COLLATE NOCASE` : `SELECT * FROM products`;
  const params = species ? [species] : [];
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- WIKI INGREDIENT TABLES (Supabase dog_ingredients / cat_ingredients) ---
app.get('/api/dog-ingredients', async (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : null;
    let sql = `SELECT id, category, ingredient_id, primary_name, aliases, risk, severity_score, notes, dosage, weight_specific_data, age_specific_data, breed_specific_data, clinical_symptoms, emergency_action, updated_at FROM dog_ingredients`;
    const params = [];
    if (search) {
      sql += ` WHERE primary_name ILIKE $1 OR category ILIKE $1 OR notes ILIKE $1`;
      params.push(search);
    }
    sql += ` ORDER BY category ASC, primary_name ASC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[dog-ingredients]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cat-ingredients', async (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : null;
    let sql = `SELECT id, category, ingredient_id, primary_name, aliases, risk, severity_score, notes, dosage, weight_specific_data, age_specific_data, breed_specific_data, clinical_symptoms, emergency_action, updated_at FROM cat_ingredients`;
    const params = [];
    if (search) {
      sql += ` WHERE primary_name ILIKE $1 OR category ILIKE $1 OR notes ILIKE $1`;
      params.push(search);
    }
    sql += ` ORDER BY category ASC, primary_name ASC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[cat-ingredients]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Combined endpoint for wiki page (both species)
app.get('/api/wiki-ingredients', async (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : null;
    const category = req.query.category || null;

    let dogSql = `SELECT *, 'dog' AS species FROM dog_ingredients`;
    let catSql = `SELECT *, 'cat' AS species FROM cat_ingredients`;
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(primary_name ILIKE $${paramIdx} OR category ILIKE $${paramIdx} OR notes ILIKE $${paramIdx})`);
      params.push(search);
      paramIdx++;
    }
    if (category) {
      conditions.push(`category = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    dogSql += where;
    catSql += where;

    const [dogResult, catResult] = await Promise.all([
      pool.query(dogSql + ` ORDER BY category ASC, primary_name ASC`, params),
      pool.query(catSql + ` ORDER BY category ASC, primary_name ASC`, params)
    ]);

    res.json({ dog: dogResult.rows, cat: catResult.rows });
  } catch (err) {
    console.error('[wiki-ingredients]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- INGREDIENTS & SCANS ROUTES ---
app.get('/api/ingredients', (req, res) => {
  db.all(`SELECT * FROM ingredients ORDER BY name ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/ingredients/search', (req, res) => {
  const query = `%${req.query.q || ''}%`;
  db.all(`SELECT * FROM ingredients WHERE name LIKE ? OR category LIKE ? ORDER BY name ASC`, [query, query], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Scan history in the shape the owner app's History page expects
app.get('/api/history', (req, res) => {
  const userId = req.query.user_id || 1;
  const query = `
    SELECT s.id, s.pet_id, p.name AS pet_name, s.product_name, s.rating, s.risk_score, s.flagged_ingredients, s.results_json, s.raw_text, s.created_at, COALESCE(s.species, p.species) AS species
    FROM scans s
    LEFT JOIN pets p ON p.id = s.pet_id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC, s.id DESC
  `;
  db.all(query, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(r => {
      let flagged = [];
      let hasAllergy = false;
      try {
        const all = JSON.parse(r.flagged_ingredients || '[]') || [];
        hasAllergy = all.some(f => f && f.rating === 'Allergen');
        flagged = all.map(f => f.name).filter(Boolean).filter((n, i, a) => a.indexOf(n) === i);
      } catch (e) { flagged = []; }
      let tokens = 0;
      try { tokens = JSON.parse(r.results_json || '[]').length; } catch (e) { tokens = 0; }
      if (!tokens && r.raw_text) tokens = String(r.raw_text).split(/,\s*/).filter(Boolean).length;
      return {
      id: r.id,
      petId: r.pet_id || null,
      petName: r.pet_name || null,
      tokens,
      allergy: hasAllergy,
      createdAt: Number.isNaN(new Date(r.created_at).getTime())
        ? new Date().toISOString()
        : new Date(r.created_at).toISOString(),
      flagged,
      score: r.risk_score,
      productName: r.product_name,
      batchNumber: 'Scan #' + r.id,
      species: r.species || 'Canine',
      date: Number.isNaN(new Date(r.created_at).getTime())
        ? 'Unknown date'
        : new Date(r.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }),
      result: r.rating
      };
    }));
  });
});
// One saved scan in full (photo + every ingredient), used when you click Inspect in History
app.get('/api/history/:id', (req, res) => {
  const userId = req.query.user_id || 1;
  const query = `
    SELECT s.*, COALESCE(s.species, p.species) AS species_final
    FROM scans s
    LEFT JOIN pets p ON p.id = s.pet_id
    WHERE s.id = ? AND s.user_id = ?
  `;
  db.get(query, [req.params.id, userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Scan not found.' });

    const species = row.species_final || 'Canine';
    let flagged = [];
    try { flagged = JSON.parse(row.flagged_ingredients || '[]') || []; } catch (e) { flagged = []; }
    // Only a real photo is returned (scans saved by an earlier buggy version stored broken text)
    const image = row.image_url && /^data:image\//.test(row.image_url) ? row.image_url : null;

    const send = (results, flaggedOut) => res.json({
      scanId: row.id,
      productName: row.product_name,
      species,
      score: row.risk_score,
      rating: row.rating,
      results,
      flagged: flaggedOut,
      image,
      date: toSafeDate(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    });

    // Scans saved after this update keep their exact results
    if (row.results_json) {
      try { return send(JSON.parse(row.results_json), flagged); } catch (e) { /* fall through and rebuild */ }
    }

    // Older scans: rebuild the list from the extracted ingredient text
    const tokens = String(row.raw_text || '').split(',').map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) return send([], flagged);
    const speciesKey = species.toLowerCase();
    fetchMergedIngredients()
      .then(mergedIngredients => {
        const rebuilt = analyzeIngredients(tokens, mergedIngredients, speciesKey);
        send(rebuilt.parsedResults, rebuilt.flagged);
      })
      .catch(e2 => res.status(500).json({ error: e2.message }));
  });
});

app.get('/api/scans', (req, res) => {
  const userId = req.query.user_id || 1;
  db.all(`SELECT * FROM scans WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/scans', (req, res) => {
  const { user_id, pet_id, product_name, image_url, raw_text, summary, risk_score, rating, flagged_ingredients } = req.body;
  const query = `
    INSERT INTO scans (user_id, pet_id, product_name, image_url, raw_text, summary, risk_score, rating, flagged_ingredients, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `;
  db.run(query, [
    user_id || 1, pet_id || null, product_name || 'Pet Food Scan', image_url || null,
    raw_text || '', summary || '', risk_score || 0, rating || 'Safe',
    typeof flagged_ingredients === 'object' ? JSON.stringify(flagged_ingredients) : (flagged_ingredients || '[]')
  ], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to save scan.' });
    res.json({ success: true, scanId: this.lastID });
  });
});

// --- FAVORITES ROUTES ---
app.get('/api/favorites', (req, res) => {
  const userId = req.query.user_id || 1;
  db.all(`SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/favorites', (req, res) => {
  const { user_id, item_type, item_id, item_title, item_subtitle } = req.body;
  const query = `INSERT INTO favorites (user_id, item_type, item_id, item_title, item_subtitle) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [user_id || 1, item_type, item_id, item_title, item_subtitle], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, favoriteId: this.lastID });
  });
});

// --- ADMIN: ALL USERS WITH PETS & SCANS ---
app.get('/api/admin/users-pets', (req, res) => {
  const query = `
    SELECT 
      u.id, u.name, u.email, u.role, u.is_banned, u.created_at,
      (SELECT COUNT(*) FROM scans WHERE user_id = u.id) AS scan_count,
      (SELECT COUNT(*) FROM scans WHERE user_id = u.id AND rating != 'Safe') AS warning_count
    FROM users u
    ORDER BY u.created_at DESC
  `;

  db.all(query, [], (err, users) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(`SELECT * FROM pets`, [], (petErr, pets) => {
      if (petErr) return res.status(500).json({ error: petErr.message });

      const responseData = (users || []).map(user => {
        const userPets = (pets || []).filter(p => p.user_id == user.id);
        return {
          ...user,
          pets: userPets
        };
      });

      res.json(responseData);
    });
  });
});

// --- NOTIFICATIONS & ALERTS ---
// Alerts reach the owner two ways: a scan that flags something, and admin actions (replies, finalized scans).
function createNotification(userId, n, cb) {
  db.run(
    `INSERT INTO notifications (user_id, type, category, title, message, link, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, n.type || 'info', n.category || 'system', n.title, n.message, n.link || null, n.source || 'system'],
    function (err) { if (cb) cb(err, this && this.lastID); }
  );
}

function createScanAlert({ userId, scanId, rating, flagged, allergy, species }) {
  const names = (flagged || []).filter(f => f && f.rating !== 'Allergen').map(f => f.name).filter(Boolean)
    .filter((n, i, a) => a.indexOf(n) === i);
  const matches = allergy && allergy.matches ? allergy.matches : [];
  const link = 'results.html?batch=KG-' + scanId;
  const who = String(species || 'pet').toLowerCase();
  if (matches.length) {
    const items = matches.map(m => m.ingredient).filter((n, i, a) => a.indexOf(n) === i).slice(0, 3).join(', ');
    createNotification(userId, {
      type: 'allergy', category: 'hazard', source: 'scan', link,
      title: 'Allergy alert for ' + allergy.pet,
      message: items + ' in scan #KG-' + scanId + ' matches ' + allergy.pet + "'s allergy profile."
    });
  } else if (names.length || rating === 'Toxic' || rating === 'Caution') {
    // anything flagged is worth an alert, even when the overall verdict stays Safe (for example one preservative)
    const toxic = rating === 'Toxic' || (flagged || []).some(f => f && f.rating === 'Toxic');
    const shown = names.slice(0, 3).join(', ') || 'An ingredient';
    createNotification(userId, {
      type: toxic ? 'danger' : 'warning', category: 'hazard', source: 'scan', link,
      title: toxic ? 'Toxic ingredient detected' : 'Caution: ingredient flagged',
      message: shown + ' flagged for your ' + who + ' in scan #KG-' + scanId + '.'
    });
  }
}

app.get('/api/notifications', (req, res) => {
  const userId = req.query.user_id || 1;
  db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(r => ({
      id: String(r.id),
      type: r.type,
      category: r.category,
      title: r.title,
      message: r.message,
      link: r.link,
      source: r.source,
      read: !!r.is_read,
      createdAt: toSafeDate(r.created_at).toISOString(),
      time: timeAgo(r.created_at)
    })));
  });
});

app.patch('/api/notifications/read-all', (req, res) => {
  db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [req.query.user_id || 1], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

app.patch('/api/notifications/:id/read', (req, res) => {
  db.run(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [req.params.id, req.query.user_id || 1], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

app.delete('/api/notifications/:id', (req, res) => {
  db.run(`DELETE FROM notifications WHERE id = ? AND user_id = ?`, [req.params.id, req.query.user_id || 1], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

app.delete('/api/notifications', (req, res) => {
  db.run(`DELETE FROM notifications WHERE user_id = ?`, [req.query.user_id || 1], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// Admin panel -> pet owner. The admin says which owner by email, or by the scan the message is about.
const ADMIN_NOTIFICATION_TITLES = {
  'inquiry-reply': { title: 'Reply to your inquiry', type: 'info' },
  'dispute-reply': { title: 'Update on your scan dispute', type: 'info' },
  'scan-still-reviewing': { title: 'Your scan is still being reviewed', type: 'warning' },
  'scan-final-result': { title: 'Your scan result is ready', type: 'success' },
  'scan-result-ready': { title: 'Your scan is complete', type: 'success' }
};
app.post('/api/notifications/in-app', (req, res) => {
  const p = req.body || {};
  const meta = ADMIN_NOTIFICATION_TITLES[p.type] || { title: 'Message from KibbleGuard', type: 'info' };
  const message = String(p.message || '').trim();
  if (!message) return res.status(400).json({ error: 'A notification needs a message.' });

  const scanDigits = String(p.scan || '').match(/(\d+)\s*$/);
  const finish = (userId, scanId) => {
    if (!userId) return res.json({ success: true, delivered: false, reason: 'No pet owner matched this notification.' });
    let link = null;
    if (scanId) link = 'results.html?batch=KG-' + scanId;
    else if (p.type === 'inquiry-reply') link = 'settings.html';
    createNotification(userId, { type: meta.type, category: 'system', title: meta.title, message, link, source: 'admin' }, (err, id) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, delivered: true, id: String(id) });
    });
  };
  const viaScan = () => {
    if (!scanDigits) return finish(null);
    db.get(`SELECT id, user_id FROM scans WHERE id = ?`, [scanDigits[1]], (err, row) => finish(row ? row.user_id : null, row ? row.id : null));
  };

  if (p.user_id) return finish(p.user_id, scanDigits ? scanDigits[1] : null);
  if (p.to) {
    return db.get(`SELECT id FROM users WHERE lower(email) = lower(?)`, [String(p.to).trim()], (err, row) => {
      if (row) return finish(row.id, scanDigits ? scanDigits[1] : null);
      viaScan();
    });
  }
  viaScan();
});

app.get('/api/alerts/live', (req, res) => {
  res.json(null);
});

// ---------- Safety Feed publishing: the admin "Publish New Alert" button used to only save the
// alert into the admin's own browser-synced state -- nothing ever told a real pet owner. These
// two endpoints make "Live" actually mean something: publish writes a real notifications row for
// every matching (non-banned, species-matching) pet owner, and published-ids lets the admin page
// know on load which alerts have already gone out, so a refresh can't re-send one. ----------
app.get('/api/admin/safety-alerts/published-ids', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT alert_id FROM safety_alert_broadcasts');
    res.json({ ids: result.rows.map(r => r.alert_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/safety-alerts/publish', requireAdminAuth, async (req, res) => {
  const { id, title, body, species, severity } = req.body || {};
  if (!id || !title) return res.status(400).json({ error: 'Missing alert id or title.' });
  try {
    const already = await pool.query('SELECT 1 FROM safety_alert_broadcasts WHERE alert_id = $1', [id]);
    if (already.rows.length) return res.json({ success: true, alreadySent: true, delivered: 0 });

    const [users, pets] = await Promise.all([
      new Promise((resolve, reject) => {
        db.all(`SELECT id, is_banned FROM users WHERE role = 'user'`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
      }),
      new Promise((resolve, reject) => {
        db.all(`SELECT user_id, species FROM pets`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
      })
    ]);
    const petsByUser = {};
    pets.forEach(p => { (petsByUser[p.user_id] = petsByUser[p.user_id] || []).push(p); });

    // Same truthy check used everywhere else this flag is read, because a Postgres bigint
    // column comes back as the STRING "0"/"1", not a real boolean/number.
    const isBanned = (v) => v === true || v === 1 || v === '1' || v === 'true';
    const targetUserIds = users.filter(u => {
      if (isBanned(u.is_banned)) return false;
      const myPets = petsByUser[u.id] || [];
      if (!myPets.length) return false;
      if (species === 'Canine') return myPets.some(p => !/fel|cat/i.test(p.species || ''));
      if (species === 'Feline') return myPets.some(p => /fel|cat/i.test(p.species || ''));
      return true; // 'Both' (or anything unrecognized) reaches every owner with a registered pet
    }).map(u => u.id);

    const message = String(body || title).trim();
    await Promise.all(targetUserIds.map(uid => new Promise((resolve) => {
      createNotification(uid, {
        type: severity === 'Urgent' ? 'warning' : 'info',
        category: 'safety-feed',
        title: 'Safety Alert: ' + title,
        message,
        link: 'wiki.html',
        source: 'admin'
      }, () => resolve());
    })));

    await pool.query(
      'INSERT INTO safety_alert_broadcasts (alert_id, title, delivered_count) VALUES ($1, $2, $3) ON CONFLICT (alert_id) DO NOTHING',
      [id, title, targetUserIds.length]
    );
    res.json({ success: true, delivered: targetUserIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/status', (req, res) => {
  res.json({ is_flagged: 0, is_banned: 0 });
});

// Support Ticket Route
app.post('/api/support/tickets', (req, res) => {
  const { category, message, timestamp, user_id, scan_id } = req.body;
  const ticketId = 'ticket_' + Date.now();
  const finalUserId = user_id || req.headers['x-user-id'] || 'Anonymous';
  
  const sql = `INSERT INTO tickets (id, user_id, scan_id, category, message, timestamp) VALUES (?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [ticketId, finalUserId, scan_id || null, category, message, timestamp], function(err) {
    if (err) {
      console.error('Error saving ticket:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    console.log(`New Ticket Saved: \({ticketId} by User:\){finalUserId}`);
    res.json({ success: true, message: 'Ticket received and saved', ticketId });
  });
});

// Lets the pet-owner app show real status instead of every report being permanently stuck on
// "Under Review" -- that label used to be hardcoded client-side at submit time and never
// checked again. This is the live source of truth, read by the same account id the ticket was
// submitted under.
app.get('/api/support/tickets', (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.json([]);
  db.all(
    `SELECT id, category, message, scan_id, status, reply_message, resolved_at, created_at FROM tickets WHERE user_id = ? ORDER BY created_at DESC`,
    [String(userId)],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map(r => ({
        id: r.id,
        category: r.category,
        message: r.message,
        reference: r.scan_id || 'N/A',
        status: r.status === 'resolved' ? 'Resolved' : 'Under Review',
        reply: r.reply_message || '',
        resolvedAt: r.resolved_at ? toSafeDate(r.resolved_at).toISOString() : null,
        createdAt: toSafeDate(r.created_at).toISOString()
      })));
    }
  );
});

// The admin "resolve + reply" action used to only ever touch the admin's own synced state
// (kibbleguard-inquiry-replies) -- the ticket row itself never learned it had been answered, so
// the pet owner's own dispute log had no way to ever find out. This is what actually marks it.
app.post('/api/admin/tickets/:id/resolve', requireAdminAuth, (req, res) => {
  const reply = String((req.body || {}).reply || '').trim();
  db.run(
    `UPDATE tickets SET status = 'resolved', reply_message = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [reply, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, updated: this.changes });
    }
  );
});

// --- ADMIN DASHBOARD OVERVIEW API ---
app.get('/api/admin/dashboard-stats', async (req, res) => {
  try {
    // 1. Scans count
    const scanRow = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) AS total_scans FROM scans`, [], (err, row) => err ? reject(err) : resolve(row));
    });

    // 2. Pet owners count
    const userRow = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) AS total_users FROM users WHERE role = 'user'`, [], (err, row) => err ? reject(err) : resolve(row));
    });

    // 3. Ingredients count -- the real, live Supabase database (dog_ingredients
    // + cat_ingredients, merged by ingredient_id), not the old unused SQLite
    // "ingredients" seed table.
    const mergedIngredients = await fetchMergedIngredients();
    const totalIngredients = mergedIngredients.length;

    // 4. Latest 5 scans for the Live Assessment Stream
    const streamQuery = `
      SELECT s.id, s.product_name, s.rating, s.created_at, u.name AS owner_name, p.name AS pet_name, COALESCE(p.species, s.species) AS species
      FROM scans s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN pets p ON p.id = s.pet_id
      ORDER BY s.created_at DESC
      LIMIT 5
    `;
    const recentScans = await new Promise((resolve, reject) => {
      db.all(streamQuery, [], (err, rows) => err ? reject(err) : resolve(rows));
    });

    // 5. Species exposure counts (all-time; the Dashboard's own 7-day window
    // is handled by /api/admin/species-exposure)
    const speciesQuery = `
      SELECT
        SUM(CASE WHEN LOWER(p.species) = 'canine' OR LOWER(p.species) = 'dog' THEN 1 ELSE 0 END) AS canine_count,
        SUM(CASE WHEN LOWER(p.species) = 'feline' OR LOWER(p.species) = 'cat' THEN 1 ELSE 0 END) AS feline_count
      FROM scans s
      LEFT JOIN pets p ON p.id = s.pet_id
    `;
    const speciesRow = await new Promise((resolve, reject) => {
      db.get(speciesQuery, [], (err, row) => err ? reject(err) : resolve(row));
    });

    res.json({
      total_scans: scanRow?.total_scans || 0,
      total_users: userRow?.total_users || 0,
      total_ingredients: totalIngredients,
      recent_scans: (recentScans || []).map(r => ({ ...r, time_ago: timeAgo(r.created_at) })),
      species: {
        canine: speciesRow?.canine_count || 0,
        feline: speciesRow?.feline_count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// --- ADMIN PANEL: AUTH, GENERIC STATE SYNC, AND REAL-TABLE ACTIONS ---
// =====================================================================

// Reads the Bearer token from the Authorization header, or ?t= for <img>
// tags (which can't send custom headers).
function getAdminToken(req) {
  const header = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (m) return m[1];
  if (req.query && req.query.t) return String(req.query.t);
  return null;
}

function requireAdminAuth(req, res, next) {
  const token = getAdminToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  db.get(
    `SELECT s.user_id, s.email AS session_email, u.name, u.email, u.role, u.is_banned
     FROM admin_sessions s LEFT JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row || !row.user_id) return res.status(401).json({ error: 'Session expired. Please log in again.' });
      const banned = row.is_banned === true || row.is_banned === 1 || row.is_banned === '1' || row.is_banned === 'true';
      if (banned) return res.status(403).json({ error: 'This account cannot log in.' });
      req.adminUser = { id: row.user_id, email: row.email || row.session_email, name: row.name, role: row.role };
      next();
    }
  );
}

// Reads the admin roster blob (the single source of truth the admin pages
// already use for invites/deactivation), returns [] if nothing saved yet.
function readAdminAccounts(cb) {
  db.get(`SELECT value FROM admin_state WHERE key = 'kibbleguard-admin-accounts'`, [], (err, row) => {
    if (err || !row) return cb([]);
    let accounts;
    try { accounts = JSON.parse(row.value); } catch (e) { accounts = null; }
    cb(Array.isArray(accounts) ? accounts : []);
  });
}
function writeAdminState(key, value, cb) {
  db.run(
    `INSERT INTO admin_state (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
     RETURNING key`,
    [key, value],
    (err) => cb && cb(err)
  );
}
// bumps the companion "<key>-v" counter the admin pages use to detect that
// another admin changed something while this page was open
function bumpAdminStateVersion(key, cb) {
  db.get('SELECT value FROM admin_state WHERE key = ?', [key + '-v'], (err, row) => {
    const next = String((parseInt(row && row.value, 10) || 0) + 1);
    writeAdminState(key + '-v', next, cb);
  });
}

// ---------- Login ----------
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(401).json({ error: 'Incorrect email or password.' });
  const cleanEmail = String(email).trim().toLowerCase();
  console.log('[admin-login] attempt for', cleanEmail);
  db.get(`SELECT * FROM users WHERE LOWER(email) = ? AND role != 'user'`, [cleanEmail], (err, user) => {
    if (err) { console.error('[admin-login] DB error:', err.message); return res.status(500).json({ error: err.message }); }
    if (!user) { console.log('[admin-login] no admin user found'); return res.status(401).json({ error: 'Incorrect email or password.' }); }
    console.log('[admin-login] found user id=%s is_banned=%s (type=%s)', user.id, user.is_banned, typeof user.is_banned);
    const ok = (password === user.password || password === user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });
    const isBanned = user.is_banned === true || user.is_banned === 1 || user.is_banned === '1' || user.is_banned === 'true';
    if (isBanned) return res.status(403).json({ error: 'This account cannot log in.' });

    // Ensure the admin roster exists in admin_state so the dashboard recognises
    // logged-in admins.  If no roster exists yet, build one from the users table.
    readAdminAccounts((accounts) => {
      const acc = accounts.find(a => String(a.email).toLowerCase() === cleanEmail);
      if (acc && acc.status === 'deactivated') {
        return res.status(403).json({ error: 'Your admin access was deactivated. A Chief Admin can restore it.' });
      }

      const finishLogin = (roster) => {
        const token = crypto.randomBytes(32).toString('hex');
        db.run('INSERT INTO admin_sessions (token, user_id, email) VALUES (?, ?, ?)', [token, user.id, cleanEmail], (e2) => {
          if (e2) { console.error('[admin-login] session insert error:', e2.message); return res.status(500).json({ error: e2.message }); }
          console.log('[admin-login] success for', cleanEmail);
          res.json({ token, email: user.email, name: user.name, role: user.role, accounts: roster });
        });
      };

      if (accounts.length > 0) {
        // Roster exists — make sure this user is in it
        if (!acc) {
          accounts.push({ name: user.name, email: cleanEmail, role: user.role, status: 'active' });
          writeAdminState('kibbleguard-admin-accounts', JSON.stringify(accounts), () => finishLogin(accounts));
        } else {
          finishLogin(accounts);
        }
      } else {
        // No roster at all — build one from all admin users in the DB
        console.log('[admin-login] no roster found, building from users table');
        db.all(`SELECT name, email, role FROM users WHERE role != 'user'`, [], (e3, admins) => {
          const newRoster = (admins || []).map(a => ({
            name: a.name,
            email: String(a.email).toLowerCase(),
            role: a.role,
            status: 'active'
          }));
          if (!newRoster.find(a => a.email === cleanEmail)) {
            newRoster.push({ name: user.name, email: cleanEmail, role: user.role, status: 'active' });
          }
          writeAdminState('kibbleguard-admin-accounts', JSON.stringify(newRoster), () => {
            console.log('[admin-login] roster created with', newRoster.length, 'admins');
            finishLogin(newRoster);
          });
        });
      }
    });
  });
});

// ---------- Invite accept flow ----------
// (The invite itself is created client-side today -- settings.js writes the
// pending account straight into the kibbleguard-admin-accounts state blob,
// which is why only the accept side needs real server routes.)
app.get('/api/admin/invite/:token', (req, res) => {
  readAdminAccounts((accounts) => {
    const acc = accounts.find(a => a.inviteToken === req.params.token && a.status === 'pending');
    if (!acc) return res.status(404).json({ error: 'Invalid or expired invite link.' });
    res.json({ name: acc.name, email: acc.email });
  });
});

app.post('/api/admin/accept-invite', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Missing token or password.' });
  readAdminAccounts((accounts) => {
    const idx = accounts.findIndex(a => a.inviteToken === token && a.status === 'pending');
    if (idx === -1) return res.status(404).json({ error: 'Invalid or expired invite link.' });
    const acc = accounts[idx];
    const cleanEmail = String(acc.email).trim().toLowerCase();
    db.run(
      `INSERT INTO users (name, email, password, password_hash, role) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password,
         password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
       RETURNING id`,
      [acc.name, cleanEmail, password, password, acc.role || 'Support Admin'],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        const updated = accounts.slice();
        updated[idx] = Object.assign({}, acc, { status: 'active' });
        delete updated[idx].inviteToken;
        writeAdminState('kibbleguard-admin-accounts', JSON.stringify(updated), (e2) => {
          if (e2) return res.status(500).json({ error: e2.message });
          bumpAdminStateVersion('kibbleguard-admin-accounts', () => res.json({ success: true }));
        });
      }
    );
  });
});

// ---------- Change own password ----------
app.post('/api/admin/change-password', requireAdminAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password fields.' });
  db.get('SELECT * FROM users WHERE id = ?', [req.adminUser.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    const ok = user && (currentPassword === user.password || currentPassword === user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
    db.run('UPDATE users SET password = ?, password_hash = ? WHERE id = ?', [newPassword, newPassword, user.id], (e2) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ success: true });
    });
  });
});

// ---------- Generic admin UI state sync (safety rules, chat, activity log,
// admin roster/invites, retention settings, ingredient edit history, scan
// overrides, inquiry reply drafts, triage-seen markers, and their "-v"
// version counters) ----------
app.get('/api/admin/state', requireAdminAuth, (req, res) => {
  db.all('SELECT key, value FROM admin_state', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const state = {};
    (rows || []).forEach(r => { state[r.key] = r.value; });
    res.json({ state });
  });
});

app.put('/api/admin/state', requireAdminAuth, (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Missing key.' });
  if (value === null || value === undefined) {
    return db.run('DELETE FROM admin_state WHERE key = ?', [key], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  }
  writeAdminState(key, String(value), (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ---------- Real, normalized data the admin pages build their tables from
// (pet owners, pets, ingredients, scans with per-ingredient breakdown, and
// support tickets) ----------
app.get('/api/admin/data', requireAdminAuth, async (req, res) => {
  // Real Supabase ingredient data (650 rows across dog_ingredients/cat_ingredients), not the old
  // 10-row SQLite `ingredients` table. Fetched up front so a failure here returns a clean 500
  // instead of getting buried inside the callback pyramid below.
  let mergedIngredients;
  try {
    mergedIngredients = await fetchMergedIngredients();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  db.all(`SELECT id, name, email, is_banned, ban_reason, created_at FROM users WHERE role = 'user' ORDER BY created_at DESC`, [], (e1, users) => {
    if (e1) return res.status(500).json({ error: e1.message });
    db.all(`SELECT * FROM pets`, [], (e2, pets) => {
      if (e2) return res.status(500).json({ error: e2.message });
      {
        const scanQuery = `
          SELECT s.id, s.user_id, s.product_name, s.rating, s.risk_score, s.image_url, s.raw_text, s.results_json,
                 s.created_at, COALESCE(s.species, p.species) AS species,
                 u.name AS owner, u.email AS ownerEmail, p.name AS pet, p.breed AS petBreed
          FROM scans s
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN pets p ON p.id = s.pet_id
          ORDER BY s.created_at DESC
        `;
        db.all(scanQuery, [], (e4, scanRows) => {
          if (e4) return res.status(500).json({ error: e4.message });
          const scans = (scanRows || []).map(r => {
            let results = [];
            try { results = JSON.parse(r.results_json || '[]') || []; } catch (e) {}
            const substances = results.map(x => ({
              name: x.name,
              category: x.category,
              level: x.status || 'Safe',
              unrated: x.category === 'Ingredient' && /no specific restrictions/i.test(x.notes || ''),
              note: x.notes || ''
            }));
            const createdIso = toSafeDate(r.created_at).toISOString();
            return {
              id: r.id,
              user_id: r.user_id,
              product: r.product_name,
              rating: r.rating,
              score: r.risk_score,
              species: /fel|cat/i.test(r.species || '') ? 'feline' : 'canine',
              owner: r.owner || 'Unknown owner',
              ownerEmail: r.ownerEmail || '',
              pet: r.pet || '',
              petBreed: r.petBreed || '',
              timestamp: createdIso,
              hasImage: !!(r.image_url && /^data:image\//.test(r.image_url)),
              rawOcrText: r.raw_text || '',
              substances
            };
          });
          // Postgres doesn't guarantee it only tries t.user_id::integer on rows that already
          // passed the '^[0-9]+$' check -- it's free to evaluate AND conditions in any order,
          // so a non-numeric user_id (anonymous tickets are saved with user_id = 'Anonymous')
          // could still hit the cast and throw "invalid input syntax for type integer",
          // crashing this whole endpoint. Casting u.id to text instead never fails.
          // The pet-owner app has a bug (being fixed separately in settings.js) where it was
          // sending the user's EMAIL as `user_id` instead of their numeric id, so some tickets
          // have a real email sitting in a column meant for a numeric id. Matching on id alone
          // left every one of those tickets with no owner at all -- "Unknown owner" -- even
          // though the real account is right there. This matches either shape.
          const ticketQuery = `
            SELECT t.id, t.category, t.message, t.created_at, u.id AS owner_id, u.name AS owner, u.email AS ownerEmail
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id::text OR LOWER(t.user_id) = LOWER(u.email)
            ORDER BY t.created_at DESC
          `;
          db.all(ticketQuery, [], (e5, tickets) => {
            if (e5) return res.status(500).json({ error: e5.message });
            res.json({
              users: users || [],
              pets: pets || [],
              ingredients: mergedIngredients.map(i => ({
                name: i.name,
                category: i.category,
                canine: i.dog ? i.dog.rating : 'Unrated',
                feline: i.cat ? i.cat.rating : 'Unrated',
                description: (i.dog && i.dog.notes) || (i.cat && i.cat.notes) || '',
                risks: (i.dog && i.dog.clinical_symptoms) || (i.cat && i.cat.clinical_symptoms) || ''
              })),
              scans,
              tickets: (tickets || []).map(t => ({
                id: t.id,
                category: t.category,
                message: t.message,
                // The real account id this ticket was matched to -- sent straight through so a
                // reply can notify that exact account by id, instead of re-matching by email a
                // second time later (a second lookup is just one more place this can silently
                // fail; matching once, here, and reusing the result is safer).
                ownerId: t.owner_id || null,
                owner: t.owner || 'Unknown owner',
                ownerEmail: t.ownerEmail || '',
                timestamp: toSafeDate(t.created_at).toISOString()
              }))
            });
          });
        });
      }
    });
  });
});

// ---------- Ban / unban a pet owner (real users table) ----------
app.post('/api/admin/users/status', requireAdminAuth, (req, res) => {
  const { id, is_banned, ban_reason } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing user id.' });
  db.run('UPDATE users SET is_banned = ?, ban_reason = ? WHERE id = ?', [is_banned ? 1 : 0, ban_reason || null, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ---------- Ingredient Database edits (real Supabase dog_ingredients/cat_ingredients tables) ----------
// The admin page's editor only knows name/category/canine rating/feline rating/description/risks --
// it has no UI for severity_score, dosage, weight/age/breed-specific data, aliases or
// emergency_action, so those richer fields are never overwritten here: an UPDATE touches only the
// columns this form actually controls, and a brand-new ingredient gets safe, empty defaults for the
// rest rather than blanks stomping real clinical data later.

// Finds the shared ingredient_id for a name by matching either table's primary_name or aliases.
async function findIngredientId(name) {
  const [dogHit, catHit] = await Promise.all([
    pool.query(`SELECT ingredient_id FROM dog_ingredients WHERE LOWER(primary_name) = LOWER($1) OR $1 = ANY(aliases) LIMIT 1`, [name]),
    pool.query(`SELECT ingredient_id FROM cat_ingredients WHERE LOWER(primary_name) = LOWER($1) OR $1 = ANY(aliases) LIMIT 1`, [name])
  ]);
  const found = dogHit.rows[0] || catHit.rows[0];
  return found ? found.ingredient_id : null;
}

// Creates or updates one species' row for an ingredient. If the admin left that species
// "Unrated", no row is created/touched for it -- an ingredient can legitimately be documented
// for only one species, and writing a blank "Unrated" row would just be noise.
async function upsertSpeciesIngredient(table, ingredientId, name, category, rating, notes, clinicalSymptoms) {
  if (!rating || rating === 'Unrated') return;
  const existing = await pool.query(`SELECT ingredient_id FROM ${table} WHERE ingredient_id = $1`, [ingredientId]);
  if (existing.rows.length) {
    await pool.query(
      `UPDATE ${table} SET category = $2, primary_name = $3, risk = $4, notes = $5, clinical_symptoms = $6, updated_at = NOW() WHERE ingredient_id = $1`,
      [ingredientId, category || 'Ingredient', name, rating, notes || '', clinicalSymptoms || '']
    );
  } else {
    await pool.query(
      `INSERT INTO ${table}
         (ingredient_id, category, primary_name, aliases, risk, severity_score, notes, dosage, weight_specific_data, age_specific_data, breed_specific_data, clinical_symptoms, emergency_action, updated_at)
       VALUES ($1, $2, $3, '{}', $4, '0', $5, '', '', '', '', $6, '', NOW())`,
      [ingredientId, category || 'Ingredient', name, rating, notes || '', clinicalSymptoms || '']
    );
  }
}

app.post('/api/admin/ingredients/sync', requireAdminAuth, async (req, res) => {
  const { upsert, remove } = req.body || {};
  try {
    for (const i of (upsert || [])) {
      if (!i.name) continue;
      let ingredientId = await findIngredientId(i.name);
      if (!ingredientId) {
        // New ingredient the admin typed in that doesn't match anything in either table yet.
        ingredientId = 'ADM' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);
      }
      await upsertSpeciesIngredient('dog_ingredients', ingredientId, i.name, i.category, i.canine, i.description, i.risks);
      await upsertSpeciesIngredient('cat_ingredients', ingredientId, i.name, i.category, i.feline, i.description, i.risks);
    }
    for (const name of (remove || [])) {
      const ingredientId = await findIngredientId(name);
      if (ingredientId) {
        await pool.query(`DELETE FROM dog_ingredients WHERE ingredient_id = $1`, [ingredientId]);
        await pool.query(`DELETE FROM cat_ingredients WHERE ingredient_id = $1`, [ingredientId]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Scan photo for the admin Inspect window (data: URI stored on
// the scan row, re-served as a real image so <img src> can load it) ----------
app.get('/api/admin/scan-image/:id', requireAdminAuth, (req, res) => {
  db.get('SELECT image_url FROM scans WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).end();
    const m = row && row.image_url ? /^data:([^;]+);base64,(.+)$/.exec(row.image_url) : null;
    if (!m) return res.status(404).end();
    res.set('Content-Type', m[1]);
    res.send(Buffer.from(m[2], 'base64'));
  });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
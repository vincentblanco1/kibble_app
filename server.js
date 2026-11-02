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

// "5m ago" style label from a SQLite UTC timestamp (used by the admin dashboard stream)
function timeAgo(ts) {
  const then = new Date(String(ts).replace(' ', 'T') + 'Z').getTime();
  if (isNaN(then)) return 'Just now';
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
    .replace(/\s+COLLATE\s+NOCASE/ig, '');
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
    if (/^\s*INSERT\s+INTO/i.test(query) && !/\bRETURNING\b/i.test(query)) query += ' RETURNING id';
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
    expires_at INTEGER,
    attempts INTEGER DEFAULT 0,
    last_sent INTEGER
  )`);

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
// Email verification is intentionally disabled; registration creates accounts directly.

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = String(name || 'Pet Parent').trim() || 'Pet Parent';
  const query = `INSERT INTO users (name, email, password, password_hash, role) VALUES (?, ?, ?, ?, 'user')`;

  db.run(query, [cleanName, cleanEmail, password, password], function (err) {
    if (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.toLowerCase().includes('duplicate'))) {
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }
      return res.status(500).json({ error: err.message });
    }
    console.log(`[AUTH] New user registered: ID ${this.lastID} (${cleanEmail})`);
    res.json({ id: this.lastID, name: cleanName, email: cleanEmail, role: 'user' });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const query = `
    SELECT id, name, email, role, is_banned, ban_reason 
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
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user'
      }
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

// Scores a list of ingredient names against the ingredients table (shared by scanning and re-opening a scan)
function analyzeIngredients(tokens, dbIngredients) {
  const flagged = [];
  const parsedResults = [];
  let score = 95;

  tokens.forEach(token => {
    const tokenLower = token.toLowerCase();
    const matchedDbItem = dbIngredients.find(dbItem =>
      tokenLower.includes(dbItem.name.toLowerCase()) || dbItem.name.toLowerCase().includes(tokenLower)
    );

    if (matchedDbItem) {
      const itemRating = matchedDbItem.rating || 'Safe';
      if (itemRating === 'Toxic') {
        score -= 35;
        flagged.push({ name: matchedDbItem.name, rating: 'Toxic', risks: matchedDbItem.risks });
      } else if (itemRating === 'Caution') {
        score -= 15;
        flagged.push({ name: matchedDbItem.name, rating: 'Caution', risks: matchedDbItem.risks });
      }
      parsedResults.push({
        name: matchedDbItem.name,
        category: matchedDbItem.category,
        status: itemRating,
        notes: matchedDbItem.risks || matchedDbItem.description || 'Evaluated compound'
      });
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
    const ratingCol = (speciesKey === 'cat' || speciesKey === 'feline') ? 'feline_rating' : 'canine_rating';

    db.all(`SELECT name, category, ${ratingCol} AS rating, description, risks FROM ingredients`, [], (err, dbIngredients) => {
      if (err) return res.status(500).json({ error: err.message });

      const runAnalysis = (pet) => {
      const analysis = analyzeIngredients(ingredientTokens, dbIngredients);
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
    });

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
  const { id, user_id, name, species, breed, gender, birthdate, weight, allergies, vaccine_status, deworming_date, image_url, life_stage } = req.body;
  const query = `
    INSERT INTO pets (id, user_id, name, species, breed, gender, birthdate, weight, allergies, vaccine_status, deworming_date, image_url, life_stage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, species=excluded.species, breed=excluded.breed, gender=excluded.gender,
      birthdate=excluded.birthdate, weight=excluded.weight, allergies=excluded.allergies,
      vaccine_status=excluded.vaccine_status, deworming_date=excluded.deworming_date, image_url=excluded.image_url,
      life_stage=excluded.life_stage
  `;
  db.run(query, [id, user_id || 1, name, species, breed, gender, birthdate, weight, allergies, vaccine_status, deworming_date, image_url, life_stage || null], function(err) {
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
      date: new Date(String(row.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    });

    // Scans saved after this update keep their exact results
    if (row.results_json) {
      try { return send(JSON.parse(row.results_json), flagged); } catch (e) { /* fall through and rebuild */ }
    }

    // Older scans: rebuild the list from the extracted ingredient text
    const tokens = String(row.raw_text || '').split(',').map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) return send([], flagged);
    const speciesKey = species.toLowerCase();
    const ratingCol = (speciesKey === 'cat' || speciesKey === 'feline') ? 'feline_rating' : 'canine_rating';
    db.all(`SELECT name, category, ${ratingCol} AS rating, description, risks FROM ingredients`, [], (e2, dbIngredients) => {
      if (e2) return res.status(500).json({ error: e2.message });
      const rebuilt = analyzeIngredients(tokens, dbIngredients);
      send(rebuilt.parsedResults, rebuilt.flagged);
    });
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
      createdAt: new Date(String(r.created_at).replace(' ', 'T') + 'Z').toISOString(),
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
    res.json({ success: true, message: 'Ticket received and saved' });
  });
});
// --- ADMIN DASHBOARD OVERVIEW API ---
app.get('/api/admin/dashboard-stats', (req, res) => {
  // 1. Scans count
  db.get(`SELECT COUNT(*) AS total_scans FROM scans`, [], (err, scanRow) => {
    if (err) return res.status(500).json({ error: err.message });

    // 2. Pet owners count
    db.get(`SELECT COUNT(*) AS total_users FROM users WHERE role = 'user'`, [], (err2, userRow) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // 3. Ingredients count
      db.get(`SELECT COUNT(*) AS total_ingredients FROM ingredients`, [], (err3, ingRow) => {
        if (err3) return res.status(500).json({ error: err3.message });

        // 4. Latest 5 scans for the stream
        const streamQuery = `
          SELECT s.id, s.product_name, s.rating, s.created_at, u.name AS owner_name, p.name AS pet_name, COALESCE(p.species, s.species) AS species
          FROM scans s
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN pets p ON p.id = s.pet_id
          ORDER BY s.created_at DESC
          LIMIT 5
        `;
        db.all(streamQuery, [], (err4, recentScans) => {
          if (err4) return res.status(500).json({ error: err4.message });

          // 5. Species exposure counts
          const speciesQuery = `
            SELECT 
              SUM(CASE WHEN LOWER(p.species) = 'canine' OR LOWER(p.species) = 'dog' THEN 1 ELSE 0 END) AS canine_count,
              SUM(CASE WHEN LOWER(p.species) = 'feline' OR LOWER(p.species) = 'cat' THEN 1 ELSE 0 END) AS feline_count
            FROM scans s
            LEFT JOIN pets p ON p.id = s.pet_id
          `;
          db.get(speciesQuery, [], (err5, speciesRow) => {
            if (err5) return res.status(500).json({ error: err5.message });

            res.json({
              total_scans: scanRow?.total_scans || 0,
              total_users: userRow?.total_users || 0,
              total_ingredients: ingRow?.total_ingredients || 0,
              recent_scans: (recentScans || []).map(r => ({ ...r, time_ago: timeAgo(r.created_at) })),
              species: {
                canine: speciesRow?.canine_count || 0,
                feline: speciesRow?.feline_count || 0
              }
            });
          });
        });
      });
    });
  });
});
// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
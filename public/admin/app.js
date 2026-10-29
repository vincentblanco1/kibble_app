/* Must load right after the Tailwind CDN script so classes resolve correctly. */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
        display: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#45671D',
          hover: '#344E16',
          light: '#E9EDE4',
        },
        dark: '#2A241C',
        caution: '#C17817',
        danger: '#B91C1C',
        safe: '#15803D',
      }
    }
  }
}

/* Theme applies to <html>, not <body>, so it can run from a <head> script
   before body content parses -- avoids a flash of the wrong theme. */
function computeEffectiveTheme(preference) {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  // 'system': follow the OS-level preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

// switches the actual dark-mode class based on whatever preference resolves to
function applyTheme(preference) {
  var effective = computeEffectiveTheme(preference);
  document.documentElement.classList.toggle('dark-theme', effective === 'dark');
}

// runs on every page load, also listens for the OS theme changing mid-session
// (only matters if the saved preference is 'system')
function restoreThemeState() {
  var saved = localStorage.getItem('kibbleguard-theme') || 'system';
  applyTheme(saved);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      var current = localStorage.getItem('kibbleguard-theme') || 'system';
      if (current === 'system') applyTheme('system');
    });
  }
}

// called from the theme dropdown in Settings
function setTheme(preference) {
  localStorage.setItem('kibbleguard-theme', preference);
  applyTheme(preference);
  if (typeof updateThemeSelectorUI === 'function') updateThemeSelectorUI(preference);
}

// puts a fade at the edge of any scrollable table so it's obvious there's
// more to scroll to, instead of the table just cutting off with no hint.
//
// the fades live in a plain wrapper AROUND the scrolling box, not inside it.
// an absolutely-positioned child of a scroll container scrolls along with the
// content, so when they were inside it the fade drifted into the middle of the
// table as you scrolled sideways (a pale band across the columns). outside the
// scroll box they stay pinned to its visible edges
function initScrollFadeIndicators() {
  document.querySelectorAll('.overflow-x-auto').forEach(function (wrap) {
    if (wrap.parentNode && wrap.parentNode.classList && wrap.parentNode.classList.contains('scroll-fade-host')) return;

    var host = document.createElement('div');
    host.className = 'scroll-fade-host';
    host.style.position = 'relative';
    wrap.parentNode.insertBefore(host, wrap);
    host.appendChild(wrap);

    var fadeRight = document.createElement('div');
    fadeRight.className = 'scroll-fade-right';
    var fadeLeft = document.createElement('div');
    fadeLeft.className = 'scroll-fade-left hidden-fade';
    host.appendChild(fadeRight);
    host.appendChild(fadeLeft);

    function updateFades() {
      /* Tables with a sticky right-edge Actions column are always fully visible
         there regardless of scroll, so the fade must stop before it -- otherwise
         it permanently washes out the one column that should never look faded. */
      var stickyCol = wrap.querySelector('.sticky.right-0');
      fadeRight.style.right = stickyCol ? stickyCol.offsetWidth + 'px' : '0px';

      var hasMoreRight = wrap.scrollWidth - wrap.scrollLeft - wrap.clientWidth > 4;
      var hasMoreLeft = wrap.scrollLeft > 4;
      fadeRight.classList.toggle('hidden-fade', !hasMoreRight);
      fadeLeft.classList.toggle('hidden-fade', !hasMoreLeft);
    }
    wrap.addEventListener('scroll', updateFades);
    window.addEventListener('resize', updateFades);
    window.addEventListener('load', updateFades);
    updateFades();
  });
}

// controls the sidebar's red dot next to Dashboard/OCR Scan Records,
// on/off toggle lives in Settings > Platform Prefs. computes both counts
// live from real, saved data, so the dot always matches what's genuinely pending
function getLiveNotificationCounts() {
  var triageCount = 3;
  try {
    var savedTriage = JSON.parse(localStorage.getItem('kibbleguard-triage-rows'));
    if (savedTriage) triageCount = savedTriage.length;
  } catch (e) {}

  // reads which scans are disputed from OCR Scan Records' own saved rows
  // (data-disputed="true"), the same table that page itself renders from,
  // rather than from the RECORD_TRACES demo dataset -- upholdDispute()
  // (ocr-scans.js) only ever clears the row's own data-disputed attribute
  // when a dispute is closed, never anything in RECORD_TRACES, so reading
  // the row directly is what keeps this in step with that action. one
  // real limitation worth knowing, the same one buildRangeData (dashboard.js)
  // already has: restorePersistedRows only seeds this table into
  // localStorage once OCR Scan Records has actually been opened in this
  // browser, so on a brand new session where it hasn't been opened yet,
  // this honestly counts zero disputes rather than guessing
  var disputeCount = 0;
  var savedScanRows = null;
  try { savedScanRows = JSON.parse(localStorage.getItem('kibbleguard-scans-rows')); } catch (e) { savedScanRows = null; }
  if (savedScanRows && savedScanRows.length) {
    var scanTemp = document.createElement('table');
    scanTemp.innerHTML = '<tbody>' + savedScanRows.join('') + '</tbody>';
    Array.prototype.forEach.call(scanTemp.querySelectorAll('tr[data-disputed="true"]'), function (row) {
      var scanId = 'KB-' + row.id.replace('row-', '');
      if (!isDisputeResolved(scanId)) disputeCount++;
    });
  }

  var inquiryCount = 0;
  var inquiries = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS : {};
  Object.keys(inquiries).forEach(function (inquiryId) {
    if (!isInquiryResolved(inquiryId)) inquiryCount++;
  });

  return { triage: triageCount, dispute: disputeCount, inquiry: inquiryCount };
}

/* ---------- Role-based access control ----------
   Three roles reflect a real organizational split: Ingredient Reviewer owns
   the safety-critical/classification side, Support Admin owns the
   user-facing/operational side, Chief Admin oversees both. */
var ROLE_PERMISSIONS = {
  chief: ['manageIngredients', 'manageSafetyRules', 'resolveDisputes', 'verifyTriage', 'manageUsers', 'manageSafetyFeed', 'manageAdminTeam', 'manageInquiries'],
  ingredient: ['manageIngredients', 'manageSafetyRules', 'resolveDisputes', 'verifyTriage'],
  support: ['manageUsers', 'manageSafetyFeed', 'manageInquiries']
};

var ROLE_ACCESS_SUMMARY = {
  chief: 'Full access: manage ingredients, safety rules, disputes, OCR verification, users, the safety feed, pet owner inquiries, and the admin team.',
  ingredient: 'Can manage the Ingredient Database and Safety Rules, resolve scan disputes, and verify low-confidence OCR matches. Cannot manage users, the safety feed, pet owner inquiries, or the admin team.',
  support: 'Can manage Users & Pets, the Safety Feed, and pet owner Inquiries. Cannot edit ingredients, safety rules, or OCR verification.'
};

var PERMISSION_REQUIRES_LABEL = {
  manageIngredients: 'an Ingredient Reviewer or Chief Admin',
  manageSafetyRules: 'an Ingredient Reviewer or Chief Admin',
  resolveDisputes: 'an Ingredient Reviewer or Chief Admin',
  verifyTriage: 'an Ingredient Reviewer or Chief Admin',
  manageUsers: 'a Support Admin or Chief Admin',
  manageSafetyFeed: 'a Support Admin or Chief Admin',
  manageAdminTeam: 'a Chief Admin',
  manageInquiries: 'a Support Admin or Chief Admin'
};

// converts the human-readable role name (shown in the UI) to the short key
// used everywhere else in the code (chief/ingredient/support)
function roleStringToKey(roleString) {
  if (roleString === 'Chief Admin') return 'chief';
  if (roleString === 'Ingredient Reviewer') return 'ingredient';
  if (roleString === 'Support Admin') return 'support';
  return 'chief';
}

// the actual "who's logged in" check - almost everything else in the RBAC
// system (permissions, sidebar identity, page redirects) is built on top of
// whatever this returns
function getLoggedInAdmin() {
  var email = localStorage.getItem('kibbleguard-admin-email');
  if (!email) return null;
  var account = getAdminAccounts().find(function (a) { return a.email === email && a.status === 'active'; });
  return account || null;
}

// defaults to 'chief' if nobody's logged in, mainly so pages don't crash
// trying to check permissions before the login redirect kicks in
function getActiveRole() {
  var account = getLoggedInAdmin();
  return account ? roleStringToKey(account.role) : 'chief';
}

// the actual permission check - looks up the current role in ROLE_PERMISSIONS
// (defined per-page) and sees if this specific capability is in their list
function hasPermission(capability) {
  if (typeof ROLE_PERMISSIONS === 'undefined') return true;
  var perms = ROLE_PERMISSIONS[getActiveRole()] || [];
  return perms.indexOf(capability) !== -1;
}

// fills in the sidebar's name/role/avatar based on whoever's actually
// logged in, so it's never showing the wrong admin
function applySidebarIdentity() {
  var account = getLoggedInAdmin();
  if (!account) return;
  var link = document.querySelector('.admin-card-link');
  if (!link) return;
  var nameEl = link.querySelector('p.text-xs');
  var titleEl = link.querySelector('p.text-\\[10px\\]');
  var avatarEl = link.querySelector('img');
  if (avatarEl) avatarEl.src = getAvatarSrc(account);
  if (nameEl) nameEl.textContent = account.name;
  if (titleEl) titleEl.textContent = account.role;
  link.title = account.name + ', ' + account.role;
}

// uses their uploaded photo if they have one, otherwise generates a simple
// initials icon on the fly so nobody has a broken image
function getAvatarSrc(account) {
  if (account.avatarDataUrl) return account.avatarDataUrl;
  var initials = account.name.split(' ').map(function (n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="10" fill="#E9EDE4"/><text x="20" y="26" font-family="Inter,sans-serif" font-size="14" font-weight="700" fill="#45671D" text-anchor="middle">' + initials + '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// this is what actually greys out buttons the current role can't use -
// finds every element tagged data-perm="something" and disables it if
// hasPermission says no, with a tooltip explaining why
function applyPermissionGating() {
  var labels = (typeof PERMISSION_REQUIRES_LABEL !== 'undefined') ? PERMISSION_REQUIRES_LABEL : {};
  document.querySelectorAll('[data-perm]').forEach(function (el) {
    var capability = el.dataset.perm;
    var allowed = hasPermission(capability);
    if (el.dataset.origTitle === undefined) el.dataset.origTitle = el.getAttribute('title') || '';
    el.disabled = !allowed;
    if (!allowed) {
      el.classList.add('opacity-40', 'cursor-not-allowed');
      el.setAttribute('title', 'Requires ' + (labels[capability] || 'a different role'));
    } else {
      el.classList.remove('opacity-40', 'cursor-not-allowed');
      if (el.dataset.origTitle) el.setAttribute('title', el.dataset.origTitle);
      else el.removeAttribute('title');
    }
  });
}

// runs on every page load: kicks you to login if you're not signed in,
// otherwise sets up the sidebar and applies permission gating
function applyRoleState() {
  if (!getLoggedInAdmin()) {
    window.location.href = 'auth.html';
    return;
  }
  applySidebarIdentity();
  applyPermissionGating();
  applyNavVisibility();
}

// Users & Pets and Inquiries links are fully hidden (not just greyed out) for
// Ingredient Reviewer, since that role has no reason to browse personal user
// data or handle pet-owner support requests at all
function applyNavVisibility() {
  var role = getActiveRole();
  var usersPetsLink = document.querySelector('a[href="users-pets.html"]');
  if (usersPetsLink) usersPetsLink.classList.toggle('hidden', role === 'ingredient');
  var inquiriesLink = document.querySelector('a[href="inquiries.html"]');
  if (inquiriesLink) inquiriesLink.classList.toggle('hidden', role === 'ingredient');
}

// backup for applyNavVisibility - stops someone from just typing the URL
// directly to get to a page their role shouldn't see at all
function restrictPageToRoles(allowedRoles) {
  if (allowedRoles.indexOf(getActiveRole()) === -1) {
    window.location.href = 'dashboard.html';
  }
}

// lives here, not in ocr-scans.js, so other pages (like Ingredient
// Database's "times scanned" count) read the same data instead of a
// separate copy that could drift out of sync
var RECORD_TRACES = {
  'KB-902144': {
    user_id: '5521', owner: 'Sarah Jenkins', ownerEmail: 'sarah.jenkins@gmail.com', species: 'canine', timestamp: '2024-05-28T14:42:09Z', confidence: '96%', clarity: 'Excellent',
    rawOcrText: 'INGREDIENTS: CHICKEN MEAT MEAL, WHOLE GRAIN RCE, CHICKEN FAT, DRIED BEET PULP, VITAMIN E SUPPLEMENT (TOCOPHEROLS), NATURAL FLAVOR...',
    substances: [
      { name: 'Chicken Muscle Meat', category: 'Animal Proteins', level: 'Safe', note: 'Primary protein source, highly bioavailable for canines.' },
      { name: 'Whole Grain Rice', category: 'Grains & Carbohydrates', level: 'Safe', note: 'Digestible carbohydrate source, well tolerated.' },
      { name: 'Vitamin E (Tocopherols)', category: 'Antioxidants', level: 'Safe', note: 'Natural antioxidant preservative.' }
    ]
  },
  'KB-902143': {
    user_id: '8329', owner: 'Linda Wu', ownerEmail: 'linda.wu@outlook.com', species: 'feline', timestamp: '2024-05-28T14:15:22Z', confidence: '91%', clarity: 'Excellent',
    rawOcrText: 'INGREDIENTS: BEEF, BEEF LIVER, NATURAL FLAVORNG, ONlON POWDER, VITAMIN E SUPPLEMENT, TAURINE...',
    substances: [
      { name: 'Allium Cepa', category: 'Toxic Plants & Fruits', level: 'Toxic', note: 'Onion-derived compound; causes hemolytic anemia in cats.' },
      { name: 'Beef Muscle Meat', category: 'Animal Proteins', level: 'Safe', note: 'Primary protein source.' },
      { name: 'Vitamin E (Tocopherols)', category: 'Antioxidants', level: 'Safe', note: 'Natural antioxidant preservative.' }
    ],
    dispute: {
      owner: 'Linda Wu',
      ownerEmail: 'linda.wu@outlook.com',
      note: '&ldquo;Misty has eaten this exact paté before with no issues. Are you sure about the onion powder? The label just says &lsquo;natural flavoring.&rsquo;&rdquo;'
    }
  },
  'KB-902142': {
    user_id: '6675', owner: 'Marcus Thorne', ownerEmail: 'marcus.thorne@yahoo.com', species: 'canine', timestamp: '2024-05-28T13:58:41Z', confidence: '88%', clarity: 'Good',
    rawOcrText: 'INGREDIENTS: SALM0N, GARLC POWDER, VEGETABLE GLYCERIN, NATURAL SMOKE FLAVOR, MIXED TOCOPHEROLS...',
    substances: [
      { name: 'Salmon Muscle Meat', category: 'Fish Proteins', level: 'Safe', note: 'Rich in Omega-3 fatty acids.' },
      { name: 'Garlic Powder', category: 'Plant Ingredients Requiring Moderation', level: 'Caution', note: 'Low concentration detected; monitor for cumulative exposure.' },
      { name: 'Vegetable Glycerin', category: 'Functional & Specialty Ingredients', level: 'Safe', note: 'Common humectant, well tolerated.' }
    ]
  },
  // SAMPLE: a cat owner scanning a dog-only joint supplement, so the "Not Rated"
  // handling has something real to show. Glucosamine is in the Ingredient Database
  // (Safe for dogs, Not rated for cats); Chondroitin Sulfate isn't in it at all.
  'KB-902145': {
    user_id: '5521', owner: 'Sarah Jenkins', ownerEmail: 'sarah.jenkins@gmail.com', species: 'feline', timestamp: '2024-05-29T11:20:00Z', confidence: '93%', clarity: 'Good',
    rawOcrText: 'INGREDIENTS: CHICKEN LIVER POWDER, GLUCOSAMINE HYDR0CHL0RIDE, CH0NDR0ITIN SULFATE, VITAMIN E SUPPLEMENT (TOCOPHEROLS)...',
    substances: [
      { name: 'Chicken Liver Powder', category: 'Animal Proteins', level: 'Safe', note: 'Palatant and protein source, well tolerated.' },
      { name: 'Glucosamine Hydrochloride', category: 'Functional & Specialty Ingredients', level: 'Unrated', note: 'Rated for dogs only. No rating exists for cats yet.' },
      { name: 'Chondroitin Sulfate', category: 'Functional & Specialty Ingredients', level: 'Unrated', note: 'Not in the Ingredient Database yet.' },
      { name: 'Vitamin E (Tocopherols)', category: 'Antioxidants', level: 'Safe', note: 'Natural antioxidant preservative.' }
    ]
  },
  'KB-902141': {
    user_id: '4410', owner: 'Vincent Gregg Blanco', ownerEmail: 'vincent.blanco@gmail.com', species: 'feline', timestamp: '2024-05-27T09:21:03Z', confidence: '79%', clarity: 'Fair',
    rawOcrText: 'INGRE0IENTS: R0LLED 0ATS, GRAPE JUlCE C0NCENTRATE, SUNFL0WER 0IL, MlXED T0C0PHER0LS (blurred/curved label surface)',
    unresolvedTokens: 2,
    substances: [
      { name: 'Grapes & Raisins', category: 'Toxic Plants & Fruits', level: 'Toxic', note: 'Low OCR confidence on this token. Recommend manual triage review, but treated as Toxic since that is the worst-case match.' },
      { name: 'Rolled Oats', category: 'Grains & Carbohydrates', level: 'Safe', note: 'Common whole-grain filler.' }
    ]
  }
};

// overturned disputes: corrected ingredient levels are applied to RECORD_TRACES
// here, so every page that reads scan traces sees the corrected data
function getScanOverrides() {
  var o = {};
  try { o = JSON.parse(localStorage.getItem('kibbleguard-scan-overrides')) || {}; } catch (e) { o = {}; }
  return o;
}
(function applyScanOverrides() {
  var o = getScanOverrides();
  Object.keys(o).forEach(function (id) {
    var t = RECORD_TRACES[id];
    if (!t) return;
    t.substances.forEach(function (s) {
      if (s.name === o[id].ingredient) { s.level = o[id].level; s.note = 'Corrected after owner dispute: ' + o[id].reason; }
    });
  });
})();

// saves a message sent to a pet owner into the same history Users & Pets
// shows under "Messages Sent" (same key and shape as saveMessageToHistory there)
function appendMessageHistory(email, entry) {
  var all = {};
  try { all = JSON.parse(localStorage.getItem('kibbleguard-message-history')) || {}; } catch (e) { all = {}; }
  if (!all[email]) all[email] = [];
  all[email].push(entry);
  localStorage.setItem('kibbleguard-message-history', JSON.stringify(all));
}

// lives here for the same reason RECORD_TRACES does -- so getLiveNotificationCounts()
// (below) can compute the Inquiries sidebar badge on every page, not just on
// inquiries.html itself. Fed by the pet-owner-facing Help, Support & Inquiries
// form (not yet built) -- these four categories are exactly its dropdown options
var INQUIRY_RECORDS = {
  'INQ-1004': {
    owner: 'Linda Wu', ownerEmail: 'linda.wu@outlook.com', usersPetsRowId: 'row-linda',
    category: 'Account Flag / Suspension Appeal', timestamp: '2024-05-29T10:05:00Z',
    message: 'I noticed my account shows as flagged when I logged in today. Can you tell me why? I haven’t done anything I’m aware of other than asking about the onion powder in one of my scan results.'
  },
  'INQ-1003': {
    owner: 'Marcus Thorne', ownerEmail: 'marcus.thorne@yahoo.com',
    category: 'Application Bug / OCR Issue', timestamp: '2024-05-29T08:40:00Z',
    message: 'When I scan Rocky’s treat bag the app freezes on the "Analyzing label..." screen every time and never shows a result. I tried 3 times with good lighting.'
  },
  'INQ-1002': {
    owner: 'Sarah Jenkins', ownerEmail: 'sarah.jenkins@gmail.com', suggestedIngredient: 'Brewer’s Yeast',
    category: 'Suggest Missing Ingredient for Encyclopedia', timestamp: '2024-05-28T19:22:00Z',
    message: 'Buster’s kibble lists "Brewer’s Yeast" but it doesn’t come up as a match in my scan results at all. Could you add it? I’d like to know if it’s actually fine for him.'
  },
  'INQ-1001': {
    owner: 'Vincent Gregg Blanco', ownerEmail: 'vincent.blanco@gmail.com',
    category: 'General Complaint / Feedback', timestamp: '2024-05-27T16:10:00Z',
    message: 'Really appreciate this app, it caught something I would have missed on Buster’s bag. One small request: it would help to see the scan date printed on the result screen itself, not just in history.',
    reply: 'Thanks so much for the kind words, Vincent! Great suggestion -- we’ve passed the scan-date request to the app team for the result screen.'
  }
};

// checks the shared "resolved inquiries" list, same pattern as
// isDisputeResolved below -- keeps INQUIRY_RECORDS itself as static seed data
// while which ones are actually closed lives in localStorage
function isInquiryResolved(inquiryId) {
  var resolved = [];
  try { resolved = JSON.parse(localStorage.getItem('kibbleguard-resolved-inquiries')) || []; } catch (e) { resolved = []; }
  if (resolved.indexOf(inquiryId) !== -1) return true;
  // seed data can ship already resolved, with its reply baked in (INQ-1001) --
  // treated as resolved from the start, same as if an admin had already
  // replied; there's no "reopen" action, so this can't drift out of sync
  var seed = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS[inquiryId] : null;
  return !!(seed && seed.reply);
}

// the write side of isInquiryResolved above
function markInquiryResolved(inquiryId) {
  var resolved = [];
  try { resolved = JSON.parse(localStorage.getItem('kibbleguard-resolved-inquiries')) || []; } catch (e) { resolved = []; }
  if (resolved.indexOf(inquiryId) === -1) resolved.push(inquiryId);
  localStorage.setItem('kibbleguard-resolved-inquiries', JSON.stringify(resolved));
}

// checks the shared "resolved disputes" list, read by both OCR Scan
// Records and Users & Pets, so the two pages can't disagree about whether
// a dispute is actually closed
function isDisputeResolved(scanId) {
  var resolved = [];
  try { resolved = JSON.parse(localStorage.getItem('kibbleguard-resolved-disputes')) || []; } catch (e) { resolved = []; }
  return resolved.indexOf(scanId) !== -1;
}

// the write side of isDisputeResolved above
function markDisputeResolved(scanId) {
  var resolved = [];
  try { resolved = JSON.parse(localStorage.getItem('kibbleguard-resolved-disputes')) || []; } catch (e) { resolved = []; }
  if (resolved.indexOf(scanId) === -1) resolved.push(scanId);
  localStorage.setItem('kibbleguard-resolved-disputes', JSON.stringify(resolved));
}

// powers the "click Times Scanned to see who" feature on Ingredient
// Database - loops through every scan and checks if this ingredient
// showed up in it
function getScansContainingIngredient(ingredientName) {
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  var matches = [];
  Object.keys(traces).forEach(function (scanId) {
    var trace = traces[scanId];
    var found = trace.substances.some(function (s) { return s.name === ingredientName; });
    if (found) {
      matches.push({
        scanId: scanId,
        owner: trace.owner || 'Unknown owner',
        ownerEmail: trace.ownerEmail || '',
        species: trace.species,
        timestamp: trace.timestamp
      });
    }
  });
  return matches;
}

// counts how many different scans each ingredient showed up in (only counts
// once per scan even if it appears twice in the same label), sorted by
// most-scanned first - this is the "Times Scanned" number itself
function tallyIngredientFrequency() {
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  var counts = {};
  var scanCount = Object.keys(traces).length;
  Object.keys(traces).forEach(function (scanId) {
    var trace = traces[scanId];
    var seenInThisScan = {};
    trace.substances.forEach(function (s) {
      if (seenInThisScan[s.name]) return;
      seenInThisScan[s.name] = true;
      if (!counts[s.name]) counts[s.name] = { name: s.name, category: s.category, level: s.level, count: 0 };
      counts[s.name].count++;
    });
  });
  var list = Object.keys(counts).map(function (k) { return counts[k]; });
  list.sort(function (a, b) { return b.count - a.count; });
  return { list: list, scanCount: scanCount };
}

// single source of truth for who can log in -- read by auth.html,
// accept-invite.html, and settings.js, so none of them keep their own,
// possibly-drifting copy
function getAdminAccounts() {
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem('kibbleguard-admin-accounts')); } catch (e) { stored = null; }
  // each seed account carries a fixed, never-edited "id" - matching on this
  // instead of email is what lets a seed admin change their own email
  // through Settings without the reseed logic below losing track of which
  // stored record is theirs and pushing a stale duplicate back in
  var seeded = [
    { id: 'seed-sarah-chen', name: 'Dr. Sarah Chen', email: 'sarah.chen@kibbleguard.app', role: 'Chief Admin', status: 'active', password: 'Kibbleguard2024!', joinedDate: '2024-01-14T09:00:00Z' },
    { id: 'seed-jamie-benwick', name: 'Jamie Benwick', email: 'jamie.benwick@kibbleguard.app', role: 'Ingredient Reviewer', status: 'active', password: 'Kibbleguard2024!', joinedDate: '2024-03-02T09:00:00Z' },
    { id: 'seed-alex-rivera', name: 'Alex Rivera', email: 'alex.rivera@kibbleguard.app', role: 'Support Admin', status: 'active', password: 'Kibbleguard2024!', joinedDate: '2024-05-20T09:00:00Z' }
  ];
  if (!stored || !stored.length) {
    localStorage.setItem('kibbleguard-admin-accounts', JSON.stringify(seeded));
    return seeded;
  }
  // resets the 3 seed accounts to default passwords, unless the password
  // was actually changed through Update Password (hasCustomPassword flag).
  // real invited admins never touch this, since they're not in the seed list.
  //
  // only the password field on each record is touched here, never the
  // whole record - replacing a whole record by its array index would
  // silently overwrite a profile edit (name/email via Settings' Save
  // Profile) back to the seed defaults the next time this function runs,
  // even though that save had genuinely succeeded. matching by id instead
  // (falling back to email for any record that doesn't have one yet,
  // which gets backfilled with the id once found) is what keeps that safe
  // even after the admin has changed their own email
  var changed = false;
  seeded.forEach(function (seedAccount) {
    var index = stored.findIndex(function (a) { return a.id === seedAccount.id; });
    if (index === -1) index = stored.findIndex(function (a) { return !a.id && a.email === seedAccount.email; });
    if (index === -1) {
      stored.push(seedAccount);
      changed = true;
    } else {
      if (!stored[index].id) { stored[index].id = seedAccount.id; changed = true; }
      if (!stored[index].hasCustomPassword && stored[index].password !== seedAccount.password) {
        stored[index].password = seedAccount.password;
        changed = true;
      }
    }
  });
  if (changed) localStorage.setItem('kibbleguard-admin-accounts', JSON.stringify(stored));
  return stored;
}

/* Same "last writer wins" protection the saved lists have (see savePersistedRows),
   for settings stored as one value instead of a list of rows: the admin team and the
   Safety Rules thresholds. Each key carries a version number that goes up on every
   save. A page remembers the version it loaded; a save is refused if the stored
   version has moved on, because another admin saved in the meantime and this page
   would be overwriting their change with an older copy. Callers that run inside
   withSavingState() already turn the thrown error into a toast. Once a real backend
   exists, this is the version/ETag it sends back with a 409. */
var KEY_LOADED_VERSION = {};
function getKeyVersion(key) { return parseInt(localStorage.getItem(key + '-v'), 10) || 0; }
function markKeyLoaded(key) { KEY_LOADED_VERSION[key] = getKeyVersion(key); }
function isKeyCurrent(key) { return KEY_LOADED_VERSION[key] === undefined || getKeyVersion(key) === KEY_LOADED_VERSION[key]; }
function assertKeyCurrent(key, what) {
  if (!isKeyCurrent(key)) {
    throw new Error('another admin changed ' + what + ' while you had this page open. Press Refresh (or reload the page) to see their change, then try again');
  }
}
// opts.unguarded: skip the check (for a write that re-reads the stored value right
// before saving and only touches the caller's own record, so nothing can be lost).
// It still bumps the version, so other open pages notice the change.
function saveVersionedValue(key, jsonText, opts) {
  opts = opts || {};
  var wasCurrent = isKeyCurrent(key);
  if (!opts.unguarded) assertKeyCurrent(key, opts.what || 'this');
  localStorage.setItem(key, jsonText);
  var next = getKeyVersion(key) + 1;
  localStorage.setItem(key + '-v', String(next));
  // only treat this page as up to date again if it was up to date before: an
  // unguarded save from a stale page must not hide that it is still stale
  if (wasCurrent) KEY_LOADED_VERSION[key] = next;
}
markKeyLoaded('kibbleguard-admin-accounts');

// the write side of getAdminAccounts above. Guarded by default, so acting on a stale
// view of the admin team (remove, revoke, restore, invite) is refused instead of
// overwriting another admin's change. Pass { unguarded: true } when the caller just
// re-read the accounts and only edits its own record or token.
function saveAdminAccounts(accounts, opts) {
  saveVersionedValue('kibbleguard-admin-accounts', JSON.stringify(accounts), { unguarded: !!(opts && opts.unguarded), what: 'the admin team' });
}

// the 4 password rules shown live as someone types (8+ chars, mixed case,
// a number, a special character) - same rules used for admin passwords
// and the new-admin invite flow, so they can't drift apart
function getPasswordChecks(password) {
  return {
    length: password.length >= 8,
    mixedCase: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password)
  };
}

function queueInAppNotification(payload) {
  // sends the notification to the server; the pet owner sees it in their bell and Notification & Alert Center.
  // this is for routine stuff (inbox msg, scan status update) - not urgent
  // enough for email/push, those go through sendSystemEmail below
  return fetch('/api/notifications/in-app', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (res) {
    if (!res.ok) throw new Error('Notification failed to queue');
    return res.json();
  }).then(function (data) {
    // the sample records in the admin panel have no real owner behind them, so nobody is notified for those
    if (data && data.delivered === false) console.warn('No registered pet owner matched this notification:', data.reason);
    return data;
  });
}

function sendSystemEmail(payload) {
  // stubbed the same way, until there's a backend to actually send this:
  //   return fetch('/api/notifications/email', { method: 'POST', body: JSON.stringify(payload) })
  //     .then(function (res) { if (!res.ok) throw new Error('Email failed to send'); });
  // every place calling this already handles success and failure correctly
  return new Promise(function (resolve) {
    setTimeout(resolve, 600);
  });
}

// this pair is what makes admin actions actually survive a page refresh -
// without it, adding an ingredient or banning a user would just vanish the
// moment you reload, since nothing was ever saved anywhere
// runs once on page load, only overrides the seed rows if something was
// actually saved before - otherwise leaves the demo content alone
function restorePersistedRows(key, tbody) {
  if (!tbody) return false;
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch (e) { saved = null; }
  markRowsLoaded(key);
  if (!saved || !saved.length) {
    // nothing saved under this key yet - this page's own seed rows in the
    // HTML are the real starting data, so save them now instead of waiting
    // for the first edit. this is what makes a page's seed data visible to
    // OTHER pages that read the same key before anyone's made a change here
    // (e.g. the Dashboard chart reading OCR Scan Records' real seed rows on
    // a completely fresh browser that's never opened OCR Scan Records)
    savePersistedRows(key, tbody);
    return false;
  }
  tbody.innerHTML = saved.join('');
  return true;
}

// called right after every add/edit/delete/ban/etc so the change sticks
/* Two admins (or two tabs) can have the same page open at once. Every saved list
   carries a version number that goes up on each save. A page remembers the version
   it last loaded (markRowsLoaded), and savePersistedRows refuses to save if the
   stored version has moved on -- otherwise it would overwrite the other admin's
   changes with this page's older copy. Throwing here is safe: every caller already
   rolls its change back and shows the message (see withSavingState). Once a real
   backend exists, the same idea is the version/ETag it sends back with a 409. */
var ROWS_LOADED_VERSION = {};
function getRowsVersion(key) { return parseInt(localStorage.getItem(key + '-v'), 10) || 0; }
function markRowsLoaded(key) { ROWS_LOADED_VERSION[key] = getRowsVersion(key); }
function savePersistedRows(key, tbody) {
  if (!tbody) return;
  if (ROWS_LOADED_VERSION[key] !== undefined && getRowsVersion(key) !== ROWS_LOADED_VERSION[key]) {
    throw new Error('another admin changed this list while you had it open. Close this window, press Refresh, then try again');
  }
  var rows = Array.prototype.map.call(tbody.children, function (tr) { return tr.outerHTML; });
  localStorage.setItem(key, JSON.stringify(rows));
  var next = getRowsVersion(key) + 1;
  localStorage.setItem(key + '-v', String(next));
  ROWS_LOADED_VERSION[key] = next;
}

// wraps a save/delete/ban/resolve/etc action with a brief loading state on
// the button that triggered it, matching the same disable + spinner + short
// delay shape the login form already uses for real (see auth.html's
// handleLoginSubmit). commitFn does the actual DOM change and persisting -
// it only runs after the delay, so nothing on screen changes until the
// "save" has gone through, instead of updating the screen immediately and
// hoping the persistence step behind it doesn't fail.
//
// that failure path isn't hypothetical even without a backend -
// localStorage.setItem throws a real QuotaExceededError once a browser's
// storage limit is hit (5-10MB depending on browser, private-browsing modes
// are often much smaller) - so commitFn is wrapped in try/catch here: if it
// throws, the change is never applied and an error toast explains it,
// rather than the screen showing something that was never actually saved.
// once a real backend exists, commitFn is exactly where an `await fetch(...)`
// call (and its own try/catch) would go instead of the current
// localStorage-only writes - nothing calling this needs to change
function withSavingState(btn, loadingLabel, commitFn) {
  var originalHtml = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-not-allowed');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + loadingLabel;
  }
  setTimeout(function () {
    try {
      commitFn();
    } catch (e) {
      showToast('Something went wrong saving that - ' + (e && e.message ? e.message : 'please try again') + '.', 'danger');
    }
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.innerHTML = originalHtml;
    }
  }, 450);
}

// updates a KPI number to match what's actually saved, instead of the hardcoded seed number.
// falls back to the seed count on a fresh browser with nothing saved yet.
// lives here (not on one page's own JS file) since more than one page uses it -
// Dashboard for the ingredient/owner counts, Safety Feed for its "Pet Owners Reached" card
//
// each table's hidden empty-state row is marked with data-empty-row="true" so it's
// never miscounted as a real record - reading this attribute directly is more
// robust than checking the raw saved HTML string for a literal substring like
// '-empty-row"' would be, since that kind of string match only works by
// coincidence (every empty row's id happens to end that way) and would silently
// stop working the moment that stopped being true, with nothing to catch it
function refreshKpiFromPersistedRows(key, elementId, fallbackCount) {
  var el = document.getElementById(elementId);
  if (!el) return;
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch (e) { saved = null; }
  var count = fallbackCount;
  if (saved && saved.length) {
    var temp = document.createElement('table');
    temp.innerHTML = '<tbody>' + saved.join('') + '</tbody>';
    // real records always carry data-search; the hidden empty-state row never does. checking the
    // attribute (not only data-empty-row) also copes with rows saved by an older build, where
    // the empty-state row had no marker and was being counted as one extra record
    var realRows = Array.prototype.filter.call(temp.querySelectorAll('tr'), function (tr) {
      return tr.dataset.emptyRow !== 'true' && tr.hasAttribute('data-search');
    });
    if (realRows.length) count = realRows.length;
  }
  el.dataset.target = count;
  el.textContent = count.toLocaleString();
}

// makes up a random-looking token for the invite link - not secure enough
// for real use, a real backend needs to generate and check this server-side
function generateInviteToken() {
  return 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// puts a little red dot on the Dashboard/OCR Scan Records nav links
// when something's pending, respecting the on/off toggles in Settings
function renderNavBadges() {
  var counts = getLiveNotificationCounts();
  var triageOn = localStorage.getItem('kibbleguard-notify-triage') !== 'false';
  var disputeOn = localStorage.getItem('kibbleguard-notify-dispute') !== 'false';
  var inquiryOn = localStorage.getItem('kibbleguard-notify-inquiries') !== 'false';

  var dashboardLink = document.querySelector('a[href="dashboard.html"]');
  var ocrLink = document.querySelector('a[href="ocr-scans.html"]');
  var inquiriesLink = document.querySelector('a[href="inquiries.html"]');

  [[dashboardLink, triageOn && counts.triage > 0],
   [ocrLink, disputeOn && counts.dispute > 0],
   [inquiriesLink, inquiryOn && counts.inquiry > 0]].forEach(function (pair) {
    var link = pair[0], shouldShow = pair[1];
    if (!link) return;
    var existing = link.querySelector('.nav-notify-dot');
    if (shouldShow && !existing) {
      var dot = document.createElement('span');
      dot.className = 'nav-notify-dot';
      link.style.position = link.style.position || 'relative';
      link.appendChild(dot);
    } else if (!shouldShow && existing) {
      existing.remove();
    }
  });
}

// writes to the Activity Log - kept in localStorage since there's no real
// backend yet, capped at 50 entries so it doesn't grow forever
function logAdminAction(text, category) {
  var log = [];
  try { log = JSON.parse(localStorage.getItem('kibbleguard-activity-log') || '[]'); } catch (e) { log = []; }
  // credited to whoever is actually logged in; falls back to a neutral label
  // (never to a specific person) if there is no active session
  var actor = (typeof getLoggedInAdmin === 'function') ? getLoggedInAdmin() : null;
  log.unshift({ text: text, category: category, admin: actor ? actor.name : 'Unknown admin', time: new Date().toISOString() });
  if (log.length > 50) log = log.slice(0, 50);
  localStorage.setItem('kibbleguard-activity-log', JSON.stringify(log));
}

function restoreTableDensityState() {
  // compact/comfortable table spacing, set in Settings, remembered per browser
  if (localStorage.getItem('kibbleguard-table-density') === 'compact') {
    document.documentElement.classList.add('compact-density');
  }
}

// called from the density toggle in Settings
function setTableDensity(density) {
  localStorage.setItem('kibbleguard-table-density', density);
  document.documentElement.classList.toggle('compact-density', density === 'compact');
  if (typeof updateDensitySelectorUI === 'function') updateDensitySelectorUI(density);
}

// needs to run before the sidebar finishes rendering, or you'd see it
// flash open then collapse
function restoreSidebarCollapsedState() {
  if (localStorage.getItem('kibbleguard-sidebar-collapsed') === 'true') {
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('collapsed');
  }
}

// the hamburger-menu sidebar on small screens, separate from the desktop collapse toggle further below
function toggleMobileSidebar() {
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('mobile-sidebar-backdrop');
  var isOpen = sidebar.classList.toggle('mobile-open');
  if (backdrop) backdrop.classList.toggle('open', isOpen);
}

// the desktop "shrink to icons only" toggle
function toggleSidebarCollapse() {
  var aside = document.getElementById('sidebar');
  var isCollapsed = aside.classList.toggle('collapsed');
  localStorage.setItem('kibbleguard-sidebar-collapsed', isCollapsed ? 'true' : 'false');
  // don't leave a tooltip hanging in mid-air if the user toggles collapse
  // while the mouse happens to still be sitting over the icon it belongs to
  var tip = document.getElementById('sidebar-icon-tooltip');
  if (tip) tip.classList.remove('visible');
}

// wires up the collapsed-sidebar icon tooltips (see the .sidebar-icon-tooltip
// comment in style.css for why this is a single element appended to <body>,
// positioned on hover, instead of a per-link CSS pseudo-element -- the
// pseudo-element version was getting clipped by the nav's own
// overflow-y-auto scrollbox). Deferred to DOMContentLoaded because app.js
// itself loads in <head>, before the sidebar markup below it exists yet.
function initSidebarIconTooltips() {
  var links = document.querySelectorAll('.sidebar-link[data-tooltip]');
  if (!links.length) return;

  var tip = document.getElementById('sidebar-icon-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'sidebar-icon-tooltip';
    tip.className = 'sidebar-icon-tooltip';
    document.body.appendChild(tip);
  }

  links.forEach(function (link) {
    link.addEventListener('mouseenter', function () {
      var sidebar = document.getElementById('sidebar');
      // the label is already visible next to the icon when expanded, so
      // there's nothing for this tooltip to add in that state
      if (!sidebar || !sidebar.classList.contains('collapsed')) return;
      var rect = link.getBoundingClientRect();
      tip.textContent = link.dataset.tooltip;
      tip.style.left = (rect.right + 14) + 'px';
      tip.style.top = (rect.top + rect.height / 2) + 'px';
      tip.classList.add('visible');
    });
    link.addEventListener('mouseleave', function () {
      tip.classList.remove('visible');
    });
  });
}
document.addEventListener('DOMContentLoaded', initSidebarIconTooltips);

// keeps the page header out of the scrollbar's way.
//
// every page's <header> sits INSIDE <main>, and <main> is the thing that
// scrolls (h-screen overflow-y-auto). a scroll container's scrollbar
// gutter runs the full height of the box, so the scrollbar was reserving a
// strip down the right edge right through the header's height -- the header
// got narrowed by the scrollbar's width and a sliver of the paw background
// showed through beside it, so the header looked cut off with the
// scrollbar notched in next to it.
//
// the fix is to make <main> a plain, non-scrolling frame (header on top) and
// move everything after the header into its own scrolling pane. now the
// header spans the full width and the scrollbar starts right under it.
// done in JS (once, here) rather than by editing the markup of every page,
// so all the dashboard pages get the same fix and can't drift apart; the
// nodes are only moved, never recreated, so ids and event listeners survive
//
// until the shell is built (right as the header is parsed, see
// scrollShellObserver below) <main> is still the old scroll box, whose
// scrollbar would run past the header. this style (injected right now, while
// app.js loads in <head>) keeps the scrollbar's 6px gutter but makes it
// invisible until then, so the layout width never changes.
// webkit-only on purpose: setting the standard scrollbar-color would make
// Chrome/Edge ignore the ::-webkit-scrollbar sizing in style.css
(function hideScrollbarUntilShellReady() {
  var s = document.createElement('style');
  s.textContent =
    'main.paw-field:not(.has-scroll-shell)::-webkit-scrollbar-thumb,' +
    'main.paw-field:not(.has-scroll-shell)::-webkit-scrollbar-track' +
    '{ background: transparent !important; }';
  document.head.appendChild(s);
})();

// builds (or continues building) the shell. safe to call over and over: it
// only ever does the part that's still missing, so it can run while the page
// is still being parsed.
function buildScrollShell() {
  var main = document.querySelector('main.paw-field');
  if (!main) return false;

  var header = null;
  for (var i = 0; i < main.children.length; i++) {
    if (main.children[i].tagName === 'HEADER') { header = main.children[i]; break; }
  }
  if (!header) return false;

  var pane = main.querySelector(':scope > .page-scroll');
  if (!pane) {
    pane = document.createElement('div');
    pane.className = 'page-scroll';
    // inline so it works without touching style.css; min-height:0 is what
    // lets a flex child actually shrink and scroll instead of growing past
    // the viewport
    pane.style.cssText = 'flex:1 1 0%;min-height:0;overflow-y:auto;';
    header.after(pane);
    main.style.overflow = 'hidden';
    header.style.flexShrink = '0';
    main.classList.add('has-scroll-shell');
  }

  // anything the parser has appended to <main> after the pane since last time
  // belongs inside the pane (the parser keeps adding to <main> itself, not to
  // the pane). nodes are moved, never recreated, so ids/listeners survive
  while (pane.nextSibling) pane.appendChild(pane.nextSibling);

  // pages were written when the header was inside the scroll box, so any
  // offset meant to clear the header (the dashboard's right column is
  // "lg:sticky lg:top-[104px]" = 80px header + 24px gap, and sections use
  // "scroll-mt-24" for scrollIntoView) is measured from the top of the
  // scrolling area. now that the pane already starts BELOW the header,
  // those offsets would count the header twice -- sticky columns sat
  // ~80px too low and no longer lined up with the cards beside them. read
  // the offsets back from the class names (not computed styles or
  // offsetHeight, neither is reliable yet while the Tailwind CDN is still
  // generating its CSS) and take the header's height off them. the header's
  // height is its min-h-* class (min-h-20 = 80px), the same 80px those
  // offsets were written against
  var headerH = 80;
  var minH = (header.className || '').match(/(?:^|\s)min-h-(\d+)(?:\s|$)/);
  if (minH) headerH = +minH[1] * 4;
  pane.querySelectorAll('[class*="sticky"], [class*="scroll-mt-"]').forEach(function (el) {
    if (el.dataset.shellAdjusted) return;
    el.dataset.shellAdjusted = '1';
    var classes = el.className && el.className.split ? el.className.split(/\s+/) : [];
    var isSticky = classes.some(function (c) { return /(^|:)sticky$/.test(c); });
    classes.forEach(function (c) {
      var top = c.match(/(?:^|:)top-\[(\d+)px\]$/);
      if (isSticky && top && +top[1] > headerH) el.style.top = (+top[1] - headerH) + 'px';
      var mt = c.match(/(?:^|:)scroll-mt-(\d+)$/);
      if (mt && +mt[1] * 4 > headerH) el.style.scrollMarginTop = (+mt[1] * 4 - headerH) + 'px';
    });
  });
  return true;
}

// runs the shell as early as possible instead of waiting for
// DOMContentLoaded. that event only fires after every script in <head> (the
// CDN ones especially) has downloaded, and the page is painted long before
// that -- so the scrollbar was visibly running up beside the header for a
// second or two, then jumping down. a MutationObserver fires as soon as the
// header (and then each later chunk of the page) is parsed, before the
// browser gets a chance to paint it. one last pass at DOMContentLoaded
// catches anything left, then the observer is dropped
var scrollShellObserver = new MutationObserver(buildScrollShell);
scrollShellObserver.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', function () {
  buildScrollShell();
  scrollShellObserver.disconnect();
});

/* ---------- Shared UI kit: toast + modal ---------- */
var activeToast = null;
// shared pagination helper for the tables, call right after a page's filter
// function runs. filter functions set row.dataset.filterMatch instead of
// touching style.display directly, since pagination needs sole control of
// display to correctly track which rows match across page changes
var PAGINATION_STATE = {};
function applyTablePagination(tbodyId, controlsId, rowsPerPage, resetPage) {
  var tbody = document.getElementById(tbodyId);
  var controls = document.getElementById(controlsId);
  if (!tbody || !controls) return;
  if (!PAGINATION_STATE[tbodyId] || resetPage) PAGINATION_STATE[tbodyId] = 1;

  var allRows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-search]'));
  var matchingRows = allRows.filter(function (r) { return r.dataset.filterMatch !== 'false'; });
  var totalPages = Math.max(1, Math.ceil(matchingRows.length / rowsPerPage));
  if (PAGINATION_STATE[tbodyId] > totalPages) PAGINATION_STATE[tbodyId] = totalPages;
  var page = PAGINATION_STATE[tbodyId];

  allRows.forEach(function (row) { row.style.display = 'none'; });
  matchingRows.forEach(function (row, i) {
    var onCurrentPage = i >= (page - 1) * rowsPerPage && i < page * rowsPerPage;
    if (onCurrentPage) row.style.display = '';
  });

  if (matchingRows.length <= rowsPerPage) {
    controls.innerHTML = '';
    return;
  }
  controls.innerHTML =
    '<button onclick="changeTablePage(\'' + tbodyId + '\',\'' + controlsId + '\',' + rowsPerPage + ',-1)" ' + (page <= 1 ? 'disabled' : '') +
      ' class="press px-3 py-1.5 rounded-lg text-xs font-bold border border-stone-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50">Previous</button>' +
    '<span class="text-xs font-bold text-stone-500 px-2">Page ' + page + ' of ' + totalPages + '</span>' +
    '<button onclick="changeTablePage(\'' + tbodyId + '\',\'' + controlsId + '\',' + rowsPerPage + ',1)" ' + (page >= totalPages ? 'disabled' : '') +
      ' class="press px-3 py-1.5 rounded-lg text-xs font-bold border border-stone-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50">Next</button>';
}
// called by the Previous/Next buttons themselves
function changeTablePage(tbodyId, controlsId, rowsPerPage, delta) {
  PAGINATION_STATE[tbodyId] = (PAGINATION_STATE[tbodyId] || 1) + delta;
  applyTablePagination(tbodyId, controlsId, rowsPerPage, false);
}

// need to escape user-typed text before putting it in innerHTML.
// otherwise, someone typing <script> into a name/reason field would
// actually run it as real code
function escapeHTML(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// the little popup in the corner - type is 'success'/'danger'/'info',
// controls the color and icon
function showToast(message, type) {
  type = type || 'info';
  var colors = { success: 'bg-safe', danger: 'bg-danger', info: 'bg-dark' };
  var icons = { success: 'fa-circle-check', danger: 'fa-triangle-exclamation', info: 'fa-circle-info' };

  // new toast replaces the old one instead of stacking, so a "Sending..."
  // toast and a "Sent" toast right after can't overlap each other
  if (activeToast) {
    clearTimeout(activeToast.hideTimer);
    clearTimeout(activeToast.removeTimer);
    activeToast.el.remove();
    activeToast = null;
  }

  var toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 z-[200] flex items-center gap-3 ' + (colors[type] || colors.info) +
    ' text-white text-sm font-bold px-6 py-4 rounded-xl shadow-2xl transition-all duration-300 translate-y-4 opacity-0 max-w-md';
  toast.style.transitionTimingFunction = 'var(--ease-out)';
  toast.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + ' shrink-0 text-base"></i><span>' + message + '</span>';
  document.body.appendChild(toast);
  requestAnimationFrame(function () { toast.classList.remove('translate-y-4', 'opacity-0'); });

  // give longer messages more time on screen, with a floor/ceiling so short
  // toasts don't linger and long ones don't get cut off before you can read them
  var visibleDuration = Math.max(2800, Math.min(6000, message.length * 60));

  var hideTimer = setTimeout(function () {
    toast.classList.add('translate-y-4', 'opacity-0');
    var removeTimer = setTimeout(function () {
      toast.remove();
      if (activeToast && activeToast.el === toast) activeToast = null;
    }, 300);
    if (activeToast && activeToast.el === toast) activeToast.removeTimer = removeTimer;
  }, visibleDuration);

  activeToast = { el: toast, hideTimer: hideTimer, removeTimer: null };
}

// lets Esc close whatever modal is open
function escCloseHandler(e) { if (e.key === 'Escape') closeModal(); }

// every modal in the whole app goes through this one function. it takes
// a title, an optional subtitle, and the body/footer html to show.
// title and subtitle are auto-escaped; bodyHtml/footerHtml are not, since
// those are meant to actually contain real html like buttons
function openModal(opts) {
  removeModalImmediate();
  var overlay = document.createElement('div');
  overlay.id = 'kg-modal-overlay';
  overlay.className = 'fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-6';
  overlay.style.transition = 'opacity 200ms var(--ease-out)';
  overlay.innerHTML =
    '<div class="animate-modal-in bg-white rounded-[2rem] shadow-2xl w-full ' + (opts.wide ? 'max-w-2xl' : 'max-w-lg') + ' max-h-[85vh] overflow-y-auto" role="dialog" aria-modal="true">' +
      '<div class="p-8 border-b border-stone-50 flex items-start justify-between gap-4">' +
        '<div><h3 class="font-display font-bold text-lg text-dark">' + escapeHTML(opts.title) + '</h3>' +
        (opts.subtitle ? '<p class="text-xs text-stone-400 font-medium mt-1">' + escapeHTML(opts.subtitle) + '</p>' : '') + '</div>' +
        '<button onclick="closeModal()" aria-label="Close" class="press w-9 h-9 rounded-xl hover:bg-stone-50 flex items-center justify-center text-stone-400 hover:text-dark transition-all shrink-0"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<div class="p-8">' + opts.bodyHtml + '</div>' +
      (opts.footerHtml ? '<div class="p-8 pt-0 flex items-center justify-end gap-3">' + opts.footerHtml + '</div>' : '') +
    '</div>';
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseHandler);
  if (typeof applyPermissionGating === 'function') applyPermissionGating();
}

/* Instant, non-animated removal. Used internally when swapping modal content
   so a new modal can never race a fade-out. */
function removeModalImmediate() {
  var overlay = document.getElementById('kg-modal-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', escCloseHandler);
}

// grab the overlay by reference here instead of re-querying by id later --
// if a new modal opens with the same id before this one finishes closing,
// re-querying would grab the wrong one
function closeModal() {
  var overlay = document.getElementById('kg-modal-overlay');
  if (!overlay) { document.removeEventListener('keydown', escCloseHandler); return; }
  var inner = overlay.firstElementChild;
  if (inner) inner.classList.add('animate-modal-out');
  overlay.style.opacity = '0';
  document.removeEventListener('keydown', escCloseHandler);
  setTimeout(function () {
    if (overlay.parentNode) overlay.remove();
  }, 160);
}

/* ---------- Shared "Print / PDF" report view ----------
   Opens a clean, formatted report in a new tab and triggers the browser's
   own print dialog. Every browser already offers "Save as PDF" right there
   in that dialog, so this covers both printing and PDF export without
   pulling in a separate PDF-generation library.
   opts: { title, subtitle (optional), filterSummary (optional array of
   short strings describing the active filters), headers (array of column
   names), rows (array of arrays, same order as headers) } */
function openPrintReport(opts) {
  var win = window.open('', '_blank');
  if (!win) {
    showToast('Please allow pop-ups for this site to print a report', 'danger');
    return;
  }

  var theadHtml = '<tr>' + opts.headers.map(function (h) {
    return '<th>' + escapeHTML(h) + '</th>';
  }).join('') + '</tr>';

  var tbodyHtml = opts.rows.map(function (row) {
    return '<tr>' + row.map(function (cell) {
      return '<td>' + escapeHTML(cell) + '</td>';
    }).join('') + '</tr>';
  }).join('');

  var filterHtml = (opts.filterSummary && opts.filterSummary.length)
    ? '<p class="filters">' + opts.filterSummary.map(function (f) { return escapeHTML(f); }).join(' &middot; ') + '</p>'
    : '';

  var doc =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escapeHTML(opts.title) + '</title>' +
    '<style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#292524;margin:36px;}' +
      '.brand{font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#e8734a;margin-bottom:14px;}' +
      'h1{font-size:20px;margin:0 0 4px;}' +
      '.meta{color:#78716c;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin:2px 0;}' +
      '.filters{color:#78716c;font-size:11px;margin:10px 0 22px;}' +
      'table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}' +
      'th{text-align:left;text-transform:uppercase;letter-spacing:0.04em;font-size:9px;color:#78716c;border-bottom:2px solid #d6d3d1;padding:8px 10px;word-wrap:break-word;}' +
      'td{padding:8px 10px;border-bottom:1px solid #e7e5e4;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;}' +
      'tr:nth-child(even) td{background:#fafaf9;}' +
      /* wide reports (lots of optional columns checked) fit much better in
         landscape -- this just sets the default the print dialog opens
         with, the admin can still switch back to portrait there */
      '@page{ size: landscape; margin: 16mm; }' +
      '@media print{ body{margin:14px;} }' +
    '</style></head><body>' +
      '<p class="brand">KibbleGuard Admin</p>' +
      '<h1>' + escapeHTML(opts.title) + '</h1>' +
      (opts.subtitle ? '<p class="meta">' + escapeHTML(opts.subtitle) + '</p>' : '') +
      '<p class="meta">Generated ' + escapeHTML(new Date().toLocaleString()) + '</p>' +
      filterHtml +
      '<table><thead>' + theadHtml + '</thead><tbody>' + tbodyHtml + '</tbody></table>' +
    '<script>window.onload = function () { window.focus(); window.print(); };</script>' +
    '</body></html>';

  win.document.open();
  win.document.write(doc);
  win.document.close();
}

/* ---------- Shared: log out ---------- */
function confirmLogout() {
  // just a confirmation dialog, actual logout is the button's own onclick below
  openModal({
    title: 'Log Out',
    subtitle: 'You will need to sign in again to access the admin panel',
    bodyHtml: '<p class="text-sm text-stone-600 leading-relaxed">Are you sure you want to log out of the KibbleGuard admin panel?</p>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button onclick="localStorage.removeItem(&#39;kibbleguard-admin-email&#39;);window.location.href=&#39;auth.html&#39;" class="press px-6 py-2.5 text-xs font-bold text-white bg-danger hover:bg-red-600 rounded-xl shadow-lg shadow-danger/20 transition-all">Log Out</button>'
  });
}

/* ---------- Shared badge helpers ---------- */
var RISK_LEVELS = ['Safe', 'Caution', 'Toxic'];
var RISK_LEVEL_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-amber-50 text-amber-500 border-amber-100' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10' }
};
// the Safe/Caution/Toxic pill used all over Ingredient Database
function riskBadgeHtml(level) {
  var m = RISK_LEVEL_STYLES[level] || RISK_LEVEL_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + level + '</span>';
}
// the same 3 levels as a <select> dropdown's <option> list.
// used for the canine/feline classification fields on the ingredient add/edit form
function riskOptions(selected) {
  return RISK_LEVELS.map(function (l) {
    return '<option value="' + l + '"' + (l === selected ? ' selected' : '') + '>' + l + '</option>';
  }).join('');
}

var VERDICT_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10',       label: 'Safe' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-caution/10 text-caution border-caution/10', label: 'Caution' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10', label: 'Toxic' }
};
// same idea as riskBadgeHtml above but for a finished scan's overall
// verdict, used on OCR Scan Records
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- Shared: count-up entrance animation for hero/summary numbers ---------- */
function animateCountUp(el, duration) {
  var initialTarget = parseInt(el.dataset.target, 10);
  if (isNaN(initialTarget)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = initialTarget.toLocaleString();
    return;
  }
  var startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    var currentTarget = parseInt(el.dataset.target, 10);
    if (isNaN(currentTarget)) currentTarget = initialTarget;
    var progress = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * currentTarget).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = currentTarget.toLocaleString();
  }
  requestAnimationFrame(step);
}

// runs the count-up animation on every KPI number on the page at once,
// called on load
function animateAllCountUps() {
  document.querySelectorAll('[data-target]').forEach(function (el) {
    animateCountUp(el, 900);
  });
}


/* ---------- Shared: password field helpers ----------
   Used by accept-invite.html and Settings > Update Password so both behave
   identically. Two things live here:
   1. the show/hide eye -- crossed-out eye = password hidden, plain eye =
      password visible (the browser's own built-in reveal icon is hidden by
      CSS, since Edge/Chrome draw theirs the opposite way round)
   2. the live requirement checklist -- each rule turns green with a check
      mark the moment it's met, and goes back to a grey dot if it stops
      being met.
   The marks are inline SVG swapped in place rather than Font Awesome class
   swaps, because Font Awesome's "nest" mode re-renders a changed <i> into a
   second icon and left doubled-up dots on screen. */
var PW_REQ_DOT_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg>';
var PW_REQ_CHECK_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.2l2.2 2.2 4.2-4.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// one requirement row: <p id="..."><span class="req-mark"></span>text</p>
function passwordRequirementHtml(id, text) {
  return '<p class="text-[11px] text-stone-400 flex items-center gap-1.5 transition-colors" id="' + id + '" data-met="false">' +
    '<span class="req-mark w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center">' + PW_REQ_DOT_SVG + '</span><span>' + text + '</span></p>';
}

function setPasswordRequirementState(el, met) {
  if (!el) return;
  el.classList.toggle('text-safe', met);
  el.classList.toggle('font-semibold', met);
  el.classList.toggle('text-stone-400', !met);
  el.setAttribute('data-met', met ? 'true' : 'false');
  var mark = el.querySelector('.req-mark');
  if (mark) mark.innerHTML = met ? PW_REQ_CHECK_SVG : PW_REQ_DOT_SVG;
}

// idPrefix is e.g. 'req-' or 'settings-req-' (the rows are idPrefix + length/mixedCase/number/special)
function updatePasswordRequirementList(idPrefix, password) {
  var checks = getPasswordChecks(password);
  Object.keys(checks).forEach(function (key) {
    setPasswordRequirementState(document.getElementById(idPrefix + key), checks[key]);
  });
  return checks;
}

// crossed-out eye while hidden, open eye while visible (same as the Log In page)
function passwordToggleButtonHtml(inputId) {
  return '<button type="button" onclick="togglePasswordField(\'' + inputId + '\', this)" aria-label="Show password" aria-pressed="false" class="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-dark transition-colors">' +
    '<i class="pw-icon-hidden fa-solid fa-eye-slash text-xs"></i><i class="pw-icon-visible fa-solid fa-eye text-xs hidden"></i></button>';
}

function togglePasswordField(inputId, btn) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var willShow = input.type === 'password';
  input.type = willShow ? 'text' : 'password';
  var hiddenIcon = btn.querySelector('.pw-icon-hidden');
  var visibleIcon = btn.querySelector('.pw-icon-visible');
  if (hiddenIcon) hiddenIcon.classList.toggle('hidden', willShow);
  if (visibleIcon) visibleIcon.classList.toggle('hidden', !willShow);
  btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
  btn.setAttribute('aria-pressed', willShow ? 'true' : 'false');
}


/* ---------- Shared: which classification applies to the scanned species ----------
   Ingredient Database stores a separate classification per species (data-canine /
   data-feline), and either one can be "Unrated" when the ingredient isn't assessed
   for that species. Whatever resolves an ingredient for a scan should go through
   this, so a missing or Not-rated species comes back as 'Unrated' and never as
   'Safe'. OCR Scan Records scores 'Unrated' without a penalty but won't let it
   count towards a Safe verdict (see computeScanOutcome in ocr-scans.js). */
function levelForSpecies(classifications, species) {
  var level = species === 'feline' ? classifications.feline : classifications.canine;
  return (level === 'Safe' || level === 'Caution' || level === 'Toxic') ? level : 'Unrated';
}

/* ---------- Shared: Refresh control ----------
   Adds a "Refresh" button (and a "last updated" time) to the right side of a
   page's header. opts: { key (short page id), label (used in the toast),
   onRefresh (function that re-reads the saved data and redraws the page),
   auto (true to also offer an Auto switch that refreshes every 60 seconds) }.
   Nothing here reloads the page, so search boxes, filters and scroll position
   stay as they are. A refresh is skipped while a popup window is open, so it
   can never pull the data out from under something being edited. */
function initRefreshControl(opts) {
  var header = document.querySelector('main header');
  if (!header || document.getElementById('refresh-control')) return;
  var autoKey = 'kibbleguard-auto-refresh-' + opts.key;
  var autoOn = !!opts.auto && localStorage.getItem(autoKey) === 'true';

  var wrap = document.createElement('div');
  wrap.id = 'refresh-control';
  wrap.className = 'flex items-center gap-3 flex-wrap';
  wrap.innerHTML =
    '<span id="refresh-updated" class="text-[10px] font-bold text-stone-400 uppercase tracking-widest"></span>' +
    (opts.auto ? '<button type="button" id="refresh-auto-btn" aria-pressed="false" title="Refresh automatically every 60 seconds" class="press px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all"></button>' : '') +
    '<button type="button" id="refresh-btn" class="press px-4 py-2.5 text-xs font-bold text-brand border-2 border-brand rounded-xl hover:bg-brand hover:text-white transition-colors duration-200 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">' +
      '<span id="refresh-icon" class="inline-block"><i class="fa-solid fa-rotate text-[11px]"></i></span>Refresh</button>';
  header.appendChild(wrap);

  var btn = document.getElementById('refresh-btn');
  var icon = document.getElementById('refresh-icon');
  var stamp = document.getElementById('refresh-updated');
  var autoBtn = document.getElementById('refresh-auto-btn');
  var busy = false;
  var timer = null;

  function markUpdated() {
    stamp.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function paintAuto() {
    if (!autoBtn) return;
    autoBtn.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
    autoBtn.innerHTML = '<span class="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ' + (autoOn ? 'bg-brand live-pulse' : 'bg-stone-300') + '"></span>Auto ' + (autoOn ? 'On' : 'Off');
    autoBtn.className = 'press px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ' +
      (autoOn ? 'bg-brand-light text-brand border-brand/20' : 'bg-stone-100 text-stone-500 border-stone-200');
  }
  function run(manual) {
    if (busy) return;
    if (document.getElementById('kg-modal-overlay')) {
      if (manual) showToast('Close the open window first, then refresh', 'info');
      return;
    }
    busy = true;
    btn.disabled = true;
    icon.classList.add('animate-spin');
    setTimeout(function () {
      var ok = true;
      try { opts.onRefresh(); } catch (e) { ok = false; if (window.console) console.error(e); }
      icon.classList.remove('animate-spin');
      btn.disabled = false;
      busy = false;
      if (ok) {
        markUpdated();
        if (manual) showToast((opts.label || 'Page') + ' refreshed', 'success');
      } else if (manual) {
        showToast('Could not refresh, please try again', 'danger');
      }
    }, manual ? 450 : 250);
  }
  function startTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    if (autoOn) timer = setInterval(function () { if (!document.hidden) run(false); }, 60000);
  }

  btn.addEventListener('click', function () { run(true); });
  if (autoBtn) {
    autoBtn.addEventListener('click', function () {
      autoOn = !autoOn;
      localStorage.setItem(autoKey, autoOn ? 'true' : 'false');
      paintAuto();
      startTimer();
      showToast(autoOn ? 'Auto-refresh on, updating every 60 seconds' : 'Auto-refresh off', 'info');
    });
  }
  markUpdated();
  paintAuto();
  startTimer();
}

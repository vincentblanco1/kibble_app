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
  var nameEl = link.querySelector('[data-admin-name]');
  var titleEl = link.querySelector('[data-admin-role]');
  var avatarEl = link.querySelector('img');
  if (avatarEl) avatarEl.src = getAvatarSrc(account);
  if (nameEl) nameEl.textContent = account.name;
  if (titleEl) titleEl.textContent = account.role;
  link.title = account.name + ', ' + account.role;
  // the header avatar menu shows the same person, so it follows any name/photo/role change
  if (typeof updateProfileMenu === 'function') updateProfileMenu();
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
  initNotificationBell();
  initAdminChat();
  initProfileMenu();
  initGlobalSearch();
  initIdleSignOut();
  initMobileTopbar();
  initMobileScrollIndicator();
}

/* ---------- Auto sign-out after inactivity ----------
   Optional (Settings > Platform Preferences). Off by default. Activity is stored in
   localStorage so several open tabs share one clock: working in any tab keeps all of them
   signed in. About a minute before the limit a "Still there?" window appears. The warning
   is skipped if another window is already open, so it never wipes out a form being edited,
   but the sign-out itself still happens. Applies per browser, like the other preferences. */
var IDLE_KEY = 'kibbleguard-idle-timeout';            // minutes, '0' or missing = never
var IDLE_ACTIVITY_KEY = 'kibbleguard-last-activity';
var IDLE_WARN_MS = 60 * 1000;

function getIdleTimeoutMs() {
  var minutes = parseInt(localStorage.getItem(IDLE_KEY), 10);
  return (isNaN(minutes) || minutes <= 0) ? 0 : minutes * 60000;
}
function touchActivity() {
  try { localStorage.setItem(IDLE_ACTIVITY_KEY, String(Date.now())); } catch (e) {}
}
function idleSignOut() {
  var actor = getLoggedInAdmin();
  // logged BEFORE the session is cleared: logAdminAction credits whoever is still signed in
  if (actor) logAdminAction(actor.name + ' was signed out automatically after inactivity', 'security');
  localStorage.removeItem('kibbleguard-admin-email');
  localStorage.removeItem('kibbleguard-session-token');
  window.location.href = 'auth.html?idle=1';
}
function stayIdleSignedIn() {
  touchActivity();
  closeModal();
}
function showIdleWarning() {
  openModal({
    title: 'Still there?',
    subtitle: 'You will be signed out soon',
    bodyHtml: '<div id="idle-warning"><p class="text-sm text-stone-600 leading-relaxed">You have been inactive for a while. To protect the admin panel, you will be signed out in about a minute unless you stay signed in.</p></div>',
    footerHtml:
      '<button onclick="idleSignOut()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Sign Out Now</button>' +
      '<button onclick="stayIdleSignedIn()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Stay Signed In</button>'
  });
}
function initIdleSignOut() {
  if (window.__idleWatching) return;
  window.__idleWatching = true;
  touchActivity();
  var lastWrite = Date.now();
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (evt) {
    document.addEventListener(evt, function () {
      // while the warning is up, only a deliberate click or key press counts
      if (document.getElementById('idle-warning') && evt !== 'click' && evt !== 'keydown') return;
      if (Date.now() - lastWrite < 5000) return;   // at most one write per 5 seconds
      lastWrite = Date.now();
      touchActivity();
    }, true);
  });
  setInterval(function () {
    var warning = document.getElementById('idle-warning');
    var limit = getIdleTimeoutMs();
    if (!limit) { if (warning) closeModal(); return; }
    var last = parseInt(localStorage.getItem(IDLE_ACTIVITY_KEY), 10) || Date.now();
    var idle = Date.now() - last;
    if (idle >= limit) { idleSignOut(); return; }
    if (idle >= limit - IDLE_WARN_MS) {
      if (!warning && !document.getElementById('kg-modal-overlay')) showIdleWarning();
    } else if (warning) {
      closeModal();   // activity in another tab already reset the clock
    }
  }, 5000);
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
var RECORD_TRACES = (window.KGDB && window.KGDB.recordTraces) || {};

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
var INQUIRY_RECORDS = (window.KGDB && window.KGDB.inquiryRecords) || {};

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
  return Array.isArray(stored) ? stored : [];
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
  function restore() {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.innerHTML = originalHtml;
    }
  }
  setTimeout(function () {
    var result;
    try {
      result = commitFn();
    } catch (e) {
      showToast('Something went wrong saving that - ' + (e && e.message ? e.message : 'please try again') + '.', 'danger');
      restore();
      return;
    }
    // commitFn can return a Promise when the real save is a network request (e.g.
    // posting an ingredient straight to the database) that has to be waited on
    // before the button re-enables -- plain synchronous commitFns (most callers)
    // behave exactly as before, restoring immediately.
    if (result && typeof result.then === 'function') {
      result.catch(function (e) {
        showToast('Something went wrong saving that - ' + (e && e.message ? e.message : 'please try again') + '.', 'danger');
      }).then(restore);
    } else {
      restore();
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

  // [link, show it?, how many are waiting]. Expanded sidebar shows the number as a pill at the
  // right of the link; the collapsed (icons-only) sidebar keeps the small red dot on the icon.
  [[dashboardLink, triageOn && counts.triage > 0, counts.triage],
   [ocrLink, disputeOn && counts.dispute > 0, counts.dispute],
   [inquiriesLink, inquiryOn && counts.inquiry > 0, counts.inquiry]].forEach(function (pair) {
    var link = pair[0], shouldShow = pair[1], n = pair[2];
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
    var pill = link.querySelector('.nav-notify-count');
    if (shouldShow) {
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'nav-notify-count';
        link.appendChild(pill);
      }
      pill.textContent = n > 99 ? '99+' : String(n);
    } else if (pill) {
      pill.remove();
    }
    // the link's aria-label replaces its inner text for screen readers, so the number goes there too
    if (link.dataset.baseLabel === undefined) link.dataset.baseLabel = link.getAttribute('aria-label') || '';
    if (link.dataset.baseLabel) link.setAttribute('aria-label', link.dataset.baseLabel + (shouldShow ? ', ' + n + ' waiting' : ''));
  });
  updateNotificationBell();
}

/* ---------- Header notification bell ----------
   One place to see everything waiting for this admin. It lists only what the signed-in
   role can act on (same permissions as the buttons) and respects the three notification
   switches in Settings, and the numbers come from the same live counts as the sidebar
   badges, so the two can never disagree. */
function getNotificationItems() {
  var counts = getLiveNotificationCounts();
  var on = function (key) { return localStorage.getItem(key) !== 'false'; };
  var items = [];
  if (hasPermission('verifyTriage') && on('kibbleguard-notify-triage') && counts.triage > 0) {
    items.push({ count: counts.triage, icon: 'fa-microscope', tone: 'bg-danger/10 text-danger', href: 'dashboard.html#high-risk-triage-section',
      title: counts.triage + ' scan' + (counts.triage === 1 ? '' : 's') + ' waiting for manual verification',
      text: 'Low-confidence OCR matches on the Dashboard' });
  }
  if (hasPermission('resolveDisputes') && on('kibbleguard-notify-dispute') && counts.dispute > 0) {
    items.push({ count: counts.dispute, icon: 'fa-comment-dots', tone: 'bg-caution/10 text-caution', href: 'ocr-scans.html',
      title: counts.dispute + ' open scan dispute' + (counts.dispute === 1 ? '' : 's'),
      text: 'Pet owners are waiting for a reply on OCR Scan Records' });
  }
  if (hasPermission('manageInquiries') && on('kibbleguard-notify-inquiries') && counts.inquiry > 0) {
    items.push({ count: counts.inquiry, icon: 'fa-headset', tone: 'bg-brand-light text-brand', href: 'inquiries.html',
      title: counts.inquiry + ' pending inquir' + (counts.inquiry === 1 ? 'y' : 'ies'),
      text: 'Help and support requests from pet owners' });
  }
  return items;
}

// adds the bell to the right-hand end of the page header (creating the right-hand group
// if the page doesn't have one yet). Safe to call more than once.
function initNotificationBell() {
  var header = document.querySelector('main header');
  if (!header || document.getElementById('notif-bell-wrap')) return;
  var group = header.querySelector(':scope > div.gap-3');
  if (!group) {
    group = document.createElement('div');
    group.className = 'flex items-center gap-3 flex-wrap';
    header.appendChild(group);
  }
  var wrap = document.createElement('div');
  wrap.id = 'notif-bell-wrap';
  wrap.className = 'relative';
  wrap.innerHTML =
    '<button type="button" id="notif-bell-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false" class="press relative w-10 h-10 rounded-xl bg-stone-50 hover:bg-stone-100 flex items-center justify-center text-dark transition-colors">' +
      '<i class="fa-solid fa-bell"></i>' +
      '<span id="notif-bell-badge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center"></span>' +
    '</button>' +
    '<div id="notif-panel" class="hidden absolute right-0 top-full mt-3 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-stone-100 z-[60] overflow-hidden" role="menu"></div>';
  group.appendChild(wrap);

  var btn = document.getElementById('notif-bell-btn');
  var panel = document.getElementById('notif-panel');
  function setOpen(open) {
    panel.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) updateNotificationBell();
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(panel.classList.contains('hidden')); });
  // capture phase: the header buttons stop their own clicks from bubbling, so a normal listener
  // never heard a click on the chat, profile or search box and left this panel open behind them
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) setOpen(false); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  updateNotificationBell();
}

// redraws the bell's number and the dropdown list from the live counts
function updateNotificationBell() {
  var badge = document.getElementById('notif-bell-badge');
  var panel = document.getElementById('notif-panel');
  if (!badge || !panel) return;
  var items = getNotificationItems();
  var total = items.reduce(function (sum, it) { return sum + it.count; }, 0);
  badge.textContent = total > 9 ? '9+' : String(total);
  badge.classList.toggle('hidden', total === 0);
  var btn = document.getElementById('notif-bell-btn');
  if (btn) btn.setAttribute('aria-label', total ? ('Notifications, ' + total + ' waiting') : 'Notifications, none waiting');

  var body = items.length
    ? '<div class="divide-y divide-stone-50">' + items.map(function (it) {
        return '<a href="' + it.href + '" role="menuitem" class="feed-row flex items-center gap-4 p-4 hover:bg-stone-50/50 transition-colors">' +
          '<div class="w-10 h-10 rounded-xl ' + it.tone + ' flex items-center justify-center text-sm shrink-0"><i class="fa-solid ' + it.icon + '"></i></div>' +
          '<div class="min-w-0 flex-1"><p class="text-xs font-bold text-dark leading-snug">' + escapeHTML(it.title) + '</p>' +
          '<p class="text-[11px] text-stone-400 mt-0.5">' + escapeHTML(it.text) + '</p></div>' +
          '<i class="fa-solid fa-chevron-right text-[10px] text-stone-300 shrink-0"></i></a>';
      }).join('') + '</div>'
    : '<div class="p-8 text-center"><p class="text-sm font-bold text-dark">You\'re all caught up</p>' +
      '<p class="text-[11px] text-stone-400 mt-1">Nothing is waiting for you right now.</p></div>';
  panel.innerHTML =
    '<div class="px-5 py-4 border-b border-stone-50 flex items-center justify-between">' +
      '<p class="text-xs font-bold text-dark uppercase tracking-widest">Notifications</p>' +
      '<span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest">' + (total ? total + ' waiting' : 'None waiting') + '</span>' +
    '</div>' + body;
}

/* ---------- Global search (header) ----------
   One search box that looks across ingredients, scans, owners, alerts and inquiries and
   jumps to the right page. It searches the same saved data each page uses (so it can never
   show something a page doesn't have), skips anything the signed-in role can't open, and
   says so honestly when a page's data hasn't been saved in this browser yet (a page's data
   is saved the first time that page is opened). Choosing a result opens the page with that
   record open (a scan or owner profile) or the page's own search pre-filled (?q=). */
var GS_CACHE = {};
function gsRowsFor(key) {
  var raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
  if (!raw) return null;
  if (GS_CACHE[key] && GS_CACHE[key].raw === raw) return GS_CACHE[key].rows;
  var saved = null;
  try { saved = JSON.parse(raw); } catch (e) { saved = null; }
  if (!saved || !saved.length) return null;
  var tmp = document.createElement('table');
  tmp.innerHTML = '<tbody>' + saved.join('') + '</tbody>';
  var rows = Array.prototype.filter.call(tmp.querySelectorAll('tr'), function (tr) {
    return tr.hasAttribute('data-search') && tr.dataset.emptyRow !== 'true';
  });
  GS_CACHE[key] = { raw: raw, rows: rows };
  return rows;
}
function gsText(row, selector) {
  var el = row.querySelector(selector);
  return el ? el.textContent.trim() : '';
}
function gsHasAll(haystack, words) {
  haystack = String(haystack).toLowerCase();
  return words.every(function (w) { return haystack.indexOf(w) !== -1; });
}
var GLOBAL_SEARCH_SOURCES = [
  { label: 'Ingredients', icon: 'fa-dna', pageName: 'Ingredient Database', page: 'ingredient-database.html', key: 'kibbleguard-ingredients-rows',
    allowed: function () { return true; },
    hit: function (row) {
      var name = gsText(row, '[data-field="name"]');
      var lvl = function (l) { return l === 'Unrated' ? 'Not rated' : l; };
      return { title: name, meta: gsText(row, '[data-field="category"]') + ' · Dog: ' + lvl(row.dataset.canine) + ' · Cat: ' + lvl(row.dataset.feline),
        href: 'ingredient-database.html?q=' + encodeURIComponent(name) };
    } },
  { label: 'Scans', icon: 'fa-camera-retro', pageName: 'OCR Scan Records', page: 'ocr-scans.html', key: 'kibbleguard-scans-rows',
    allowed: function () { return true; },
    hit: function (row) {
      var p = row.querySelector('td:nth-child(2) p');
      var c = p ? p.cloneNode(true) : null;
      if (c) c.querySelectorAll('span').forEach(function (b) { b.remove(); });
      var id = 'KB-' + row.id.replace('row-', '');
      var verdict = row.dataset.verdict ? row.dataset.verdict.charAt(0).toUpperCase() + row.dataset.verdict.slice(1) : '';
      return { title: (c ? c.textContent.trim() : id), meta: '#' + id + ' · ' + gsText(row, 'td:nth-child(3) p.font-bold') + (verdict ? ' · ' + verdict : ''),
        href: 'ocr-scans.html?inspect=' + encodeURIComponent(id) };
    } },
  { label: 'Pet owners', icon: 'fa-users', pageName: 'Users & Pets', page: 'users-pets.html', key: 'kibbleguard-users-rows',
    allowed: function () { return hasPermission('manageUsers'); },
    hit: function (row) {
      return { title: row.dataset.name || '', meta: (row.dataset.email || '') + ' · ' + (row.dataset.status || ''),
        href: 'users-pets.html?openProfile=' + encodeURIComponent(row.id) };
    } },
  { label: 'Safety alerts', icon: 'fa-bullhorn', pageName: 'Safety Feed', page: 'safety-feed.html', key: 'kibbleguard-alerts-rows',
    allowed: function () { return true; },
    hit: function (row) {
      var title = gsText(row, '[data-field="title"]');
      return { title: title, meta: gsText(row, '[data-field="type"]') + ' · ' + gsText(row, '[data-field="species"]') + ' · ' + gsText(row, '[data-field="status-badge"]'),
        href: 'safety-feed.html?q=' + encodeURIComponent(title) };
    } },
  { label: 'Inquiries', icon: 'fa-headset', pageName: 'Inquiries', page: 'inquiries.html', key: null,
    allowed: function () { return hasPermission('manageInquiries'); } }
];
var GS_PER_GROUP = 4;

// returns { groups: [{ src, total, hits }], unloaded: [page names with nothing saved yet] }
function runGlobalSearch(query) {
  var words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  var groups = [], unloaded = [];
  GLOBAL_SEARCH_SOURCES.forEach(function (src) {
    if (!src.allowed()) return;
    var hits = [];
    if (src.key === null) {
      var inq = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS : {};
      Object.keys(inq).sort(function (a, b) { return b.localeCompare(a); }).forEach(function (id) {
        var d = inq[id];
        if (!gsHasAll([id, d.owner, d.ownerEmail, d.category, d.message].join(' '), words)) return;
        hits.push({ title: '#' + id + ' · ' + d.category, meta: d.owner + ' · ' + (isInquiryResolved(id) ? 'Resolved' : 'Pending'),
          href: 'inquiries.html?q=' + encodeURIComponent(id) });
      });
    } else {
      var rows = gsRowsFor(src.key);
      if (!rows) { unloaded.push(src.pageName); return; }
      rows.forEach(function (row) { if (gsHasAll(row.dataset.search, words)) hits.push(src.hit(row)); });
    }
    if (hits.length) groups.push({ src: src, total: hits.length, hits: hits.slice(0, GS_PER_GROUP) });
  });
  return { groups: groups, unloaded: unloaded };
}

function initGlobalSearch() {
  var header = document.querySelector('main header');
  if (!header || document.getElementById('global-search-wrap')) return;
  var group = header.querySelector(':scope > div.gap-3');
  var wrap = document.createElement('div');
  wrap.id = 'global-search-wrap';
  wrap.className = 'relative w-full lg:w-auto lg:flex-1 lg:max-w-md min-w-[220px] order-last lg:order-none';
  wrap.innerHTML =
    '<div class="relative">' +
    '<i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-xs pointer-events-none"></i>' +
    '<input type="text" id="global-search-input" autocomplete="off" aria-label="Search the admin panel" aria-expanded="false" aria-keyshortcuts="/" title="Tip: press the / key anywhere on the page to jump to this search" placeholder="Search all pages..." class="w-full pl-10 pr-10 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-brand transition-all">' +
    '<kbd id="global-search-kbd" aria-hidden="true" class="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 items-center justify-center rounded-md border border-stone-200 bg-white text-[10px] font-bold text-stone-400 pointer-events-none">/</kbd>' +
    '</div>' +
    '<div id="global-search-panel" class="hidden absolute left-0 top-full mt-3 w-full min-w-[320px] bg-white rounded-2xl shadow-2xl border border-stone-100 z-[60] overflow-hidden max-h-[70vh] overflow-y-auto" role="listbox"></div>';
  if (group) header.insertBefore(wrap, group); else header.appendChild(wrap);

  var input = document.getElementById('global-search-input');
  var panel = document.getElementById('global-search-panel');
  var kbd = document.getElementById('global-search-kbd');
  var active = -1, timer = null;
  // the little "/" key badge is a reminder that pressing / jumps here; it steps aside
  // while you are typing in the box
  function syncKbd() { if (kbd) kbd.style.display = (document.activeElement === input || input.value) ? 'none' : ''; }

  function items() { return Array.prototype.slice.call(panel.querySelectorAll('[data-gs-item]')); }
  function setActive(i) {
    var list = items();
    if (!list.length) { active = -1; return; }
    active = (i + list.length) % list.length;
    list.forEach(function (a, n) {
      a.classList.toggle('bg-brand-light', n === active);
      if (n === active) a.scrollIntoView({ block: 'nearest' });
    });
  }
  function close() { panel.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; }
  function render() {
    var q = input.value.trim();
    panel.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    active = -1;
    if (q.length < 2) {
      panel.innerHTML = '<div class="p-6 text-center"><p class="text-xs font-bold text-dark">Search the whole panel</p>' +
        '<p class="text-[11px] text-stone-400 mt-1">Type at least 2 letters to find ingredients, scans, pet owners, safety alerts and inquiries.</p>' +
        '<p class="text-[11px] text-stone-400 mt-3">Tip: press the <span class="px-1.5 py-0.5 rounded border border-stone-200 font-bold text-dark">/</span> key anywhere to jump to this box.</p></div>';
      return;
    }
    var r = runGlobalSearch(q);
    var firstWord = q.split(/\s+/)[0];
    var html = r.groups.map(function (g) {
      return '<div class="py-2"><p class="px-5 pt-2 pb-1 text-[10px] font-bold text-stone-400 uppercase tracking-widest"><i class="fa-solid ' + g.src.icon + ' mr-1.5"></i>' + g.src.label + '</p>' +
        g.hits.map(function (h) {
          return '<a href="' + escapeHTML(h.href) + '" role="option" data-gs-item class="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-stone-50/50 transition-colors">' +
            '<div class="min-w-0"><p class="text-xs font-bold text-dark truncate">' + escapeHTML(h.title) + '</p>' +
            '<p class="text-[11px] text-stone-400 truncate">' + escapeHTML(h.meta) + '</p></div>' +
            '<i class="fa-solid fa-chevron-right text-[10px] text-stone-300 shrink-0"></i></a>';
        }).join('') +
        (g.total > g.hits.length
          ? '<a href="' + escapeHTML(g.src.page + '?q=' + encodeURIComponent(firstWord)) + '" data-gs-item class="block px-5 py-2 text-[11px] font-bold text-brand hover:underline">' + (g.total - g.hits.length) + ' more in ' + g.src.pageName + '</a>'
          : '') +
        '</div>';
    }).join('<div class="border-t border-stone-50"></div>');
    if (!r.groups.length) {
      html = '<div class="p-6 text-center"><p class="text-xs font-bold text-dark">No matches for &ldquo;' + escapeHTML(q) + '&rdquo;</p>' +
        '<p class="text-[11px] text-stone-400 mt-1">Try a name, an owner, a scan ID or an alias.</p></div>';
    }
    if (r.unloaded.length) {
      html += '<div class="px-5 py-3 border-t border-stone-50 bg-stone-50/10"><p class="text-[10px] text-stone-400 leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i>Could not search: ' +
        escapeHTML(r.unloaded.join(', ')) + '. The data for ' + (r.unloaded.length === 1 ? 'that page is' : 'those pages is') + ' unavailable right now.</p></div>';
    }
    panel.innerHTML = html;
  }

  input.addEventListener('input', function () { syncKbd(); clearTimeout(timer); timer = setTimeout(render, 120); });
  input.addEventListener('focus', function () { syncKbd(); if (input.value.trim().length) render(); });
  input.addEventListener('blur', syncKbd);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (panel.classList.contains('hidden')) render(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      var list = items();
      var target = list[active >= 0 ? active : 0];
      if (target) { e.preventDefault(); window.location.href = target.getAttribute('href'); }
    } else if (e.key === 'Escape') { close(); input.blur(); }
  });
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); }, true);   // capture phase, same reason as the bell
  // "/" jumps to the search box from anywhere, unless you are typing in a field or a window is open
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (document.getElementById('kg-modal-overlay')) return;
    e.preventDefault();
    input.focus();
  });
}

// arriving from a global search result with ?q=...: puts it into this page's own search box
// and runs that page's filter (each list page already filters on "input"), so the matching
// rows are what you see
document.addEventListener('DOMContentLoaded', function () {
  var q = new URLSearchParams(window.location.search).get('q');
  if (!q) return;
  var ids = ['ingredient-search', 'records-search', 'user-search', 'feed-search', 'inquiry-search'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) { el.value = q; el.dispatchEvent(new Event('input', { bubbles: true })); break; }
  }
});

// writes to the Activity Log - kept in localStorage since there's no real
// backend yet, capped at 50 entries so it doesn't grow forever.
// "link" is optional: a relative href (e.g. "ocr-scans.html?inspect=KB-53")
// to the actual record this action was about, which the Activity Log page
// turns into a clickable row. Omitted when there's no specific record to
// jump back to (a sign-out, a settings tweak with nothing to deep-link).
function logAdminAction(text, category, link) {
  var log = [];
  try { log = JSON.parse(localStorage.getItem('kibbleguard-activity-log') || '[]'); } catch (e) { log = []; }
  // credited to whoever is actually logged in; falls back to a neutral label
  // (never to a specific person) if there is no active session
  var actor = (typeof getLoggedInAdmin === 'function') ? getLoggedInAdmin() : null;
  log.unshift({ text: text, category: category, admin: actor ? actor.name : 'Unknown admin', time: new Date().toISOString(), link: link || null });
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

// Sidebar scroll memory. Every page is its own HTML file, so each click reloads the sidebar and
// its menu snaps back to the top; on a short screen that hides the page you are on (for example
// Settings, at the bottom). This keeps the menu where you left it for the session and, if the
// current page's link would still be out of view, scrolls it to the middle of the menu.
function initSidebarScrollMemory() {
  var nav = document.querySelector('#sidebar nav');
  if (!nav) return;
  var KEY = 'kibbleguard-sidebar-scroll';
  var saved = null;
  try { saved = parseInt(sessionStorage.getItem(KEY), 10); } catch (e) { saved = NaN; }
  if (!isNaN(saved)) nav.scrollTop = saved;
  var active = nav.querySelector('.sidebar-link.active');
  if (active && nav.scrollHeight > nav.clientHeight) {
    var navRect = nav.getBoundingClientRect(), linkRect = active.getBoundingClientRect();
    if (linkRect.top < navRect.top || linkRect.bottom > navRect.bottom) {
      var linkTop = linkRect.top - navRect.top + nav.scrollTop;
      nav.scrollTop = Math.max(0, linkTop - (nav.clientHeight - active.offsetHeight) / 2);
    }
  }
  if (!nav.dataset.scrollMemory) {
    nav.dataset.scrollMemory = '1';
    nav.addEventListener('scroll', function () {
      try { sessionStorage.setItem(KEY, String(nav.scrollTop)); } catch (e) {}
    });
  }
}
document.addEventListener('DOMContentLoaded', initSidebarScrollMemory);
// layout isn't final until the Tailwind CDN has styled the page, so check again once everything has loaded
window.addEventListener('load', initSidebarScrollMemory);

// sidebar wordmark: "Kibble" keeps the normal dark text, "Guard" is a light green. Done here once
// (instead of editing the markup of every page) so all pages with the sidebar stay identical
(function () {
  var s = document.createElement('style');
  s.textContent =
    '.kg-wordmark-guard{color:#5E8C2A;}' +
    'html.dark-theme .kg-wordmark-guard{color:#A5D06B !important;}';
  document.head.appendChild(s);
})();
function initSidebarWordmark() {
  var name = document.querySelector('#sidebar .logo-row span.font-display');
  if (name && !name.querySelector('.kg-wordmark-guard') && name.textContent.trim() === 'KibbleGuard') {
    name.innerHTML = 'Kibble<span class="kg-wordmark-guard">Guard</span>';
  }
}
document.addEventListener('DOMContentLoaded', initSidebarWordmark);

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

// desktop (640px and wider): the page's scroll bar runs the full height of the window, at its
// outer right edge, and the header sits to the left of it like the rest of the page. For that the
// scrolling pane fills the whole <main> (its scroll bar is then full height) and the header is laid
// over its top-left, as wide as the pane minus the scroll bar. The pane gets top padding equal to the
// header's height so the content starts below the header. Both numbers are measured by
// initHeaderOverlay() below. Phones (under 640px) keep the layout described above. The scroll bar's
// track is a solid page colour so the paw pattern doesn't show through beside the header.
(function injectHeaderOverlayCss() {
  var s = document.createElement('style');
  s.textContent =
    '@media (min-width:640px){' +
      'main.paw-field.has-scroll-shell{position:relative;}' +
      'main.paw-field.has-scroll-shell > .page-scroll{position:absolute !important;top:0;right:0;bottom:0;left:0;flex:none !important;padding-top:var(--kg-header-h,80px);}' +
      'main.paw-field.has-scroll-shell > header{position:absolute !important;top:0;left:0;right:var(--kg-scrollbar-w,6px);}' +
      'main.paw-field.has-scroll-shell > #chat-page{padding-top:var(--kg-header-h,80px);}' +
      'main.paw-field.has-scroll-shell > .page-scroll::-webkit-scrollbar-track{background:#FAF6EE;}' +
      'html.dark-theme main.paw-field.has-scroll-shell > .page-scroll::-webkit-scrollbar-track{background:#17181b;}' +
    '}';
  document.head.appendChild(s);
})();

// measures the two numbers the desktop layout above needs: the header's height (the content's top
// padding) and the scroll bar's width (how far the header stops short of the right edge, which is 0
// when the page is too short to scroll). Re-measured whenever the header, the pane or what is inside
// the pane changes size, because a scroll bar appears and disappears as the page grows and shrinks.
function initHeaderOverlay(main, header, pane) {
  if (main.dataset.headerOverlay) return;
  main.dataset.headerOverlay = '1';
  var last = {};
  function set(name, value) {
    if (last[name] === value) return;
    last[name] = value;
    main.style.setProperty(name, value);
  }
  function measure() {
    set('--kg-header-h', header.offsetHeight + 'px');
    set('--kg-scrollbar-w', Math.max(0, pane.offsetWidth - pane.clientWidth) + 'px');
  }
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(measure);
    ro.observe(header);
    ro.observe(pane);
    var watchChildren = function () { Array.prototype.forEach.call(pane.children, function (c) { ro.observe(c); }); };
    watchChildren();
    if (window.MutationObserver) new MutationObserver(watchChildren).observe(pane, { childList: true });
  }
  setInterval(measure, 1000);   // safety net for anything the observers can't see
}

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
  initHeaderOverlay(main, header, pane);

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
  var overlay = !(window.matchMedia && window.matchMedia('(max-width: 639px)').matches);   // desktop: offsets stay as written
  var headerH = 80;
  var minH = (header.className || '').match(/(?:^|\s)min-h-(\d+)(?:\s|$)/);
  if (minH) headerH = +minH[1] * 4;
  (overlay ? [] : pane.querySelectorAll('[class*="sticky"], [class*="scroll-mt-"]')).forEach(function (el) {
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
// the sidebar wordmark is colored in the same early pass (it used to wait for
// DOMContentLoaded, so "Guard" showed dark for a second before turning green).
// characterData is watched too in case the parser delivers the name in pieces
var scrollShellObserver = new MutationObserver(function () {
  buildScrollShell();
  initSidebarWordmark();
});
scrollShellObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
document.addEventListener('DOMContentLoaded', function () {
  buildScrollShell();
  scrollShellObserver.disconnect();
});

// phone-only slim bar. on phones the big header scrolls away with the page (it can be 3 rows
// tall), which left the menu button out of reach on long pages. this small fixed bar (menu
// button + page title) slides in only while the real header is off-screen, and hides again
// when you scroll back up. style.css only shows it below 640px.
function initMobileTopbar() {
  var main = document.querySelector('main.paw-field');
  var header = main ? main.querySelector(':scope > header') : null;
  if (!main || !header || document.getElementById('mobile-topbar') || !window.IntersectionObserver) return;
  var h1 = header.querySelector('h1');
  var bar = document.createElement('div');
  bar.id = 'mobile-topbar';
  bar.innerHTML =
    '<button type="button" tabindex="-1" onclick="toggleMobileSidebar()" aria-label="Open navigation menu" class="press w-9 h-9 rounded-xl bg-stone-50 flex items-center justify-center text-dark shrink-0"><i class="fa-solid fa-bars"></i></button>' +
    '<span class="mobile-topbar-title font-display font-bold text-sm text-dark truncate">' + escapeHTML(h1 ? h1.textContent.trim() : document.title) + '</span>';
  document.body.appendChild(bar);
  var btn = bar.querySelector('button');
  new IntersectionObserver(function (entries) {
    var show = !entries[0].isIntersecting;
    bar.classList.toggle('show', show);
    btn.tabIndex = show ? 0 : -1;
  }, { root: main, threshold: 0 }).observe(header);
}

// phone scroll indicator. On phones the page scrolls inside <main> and its native scrollbar is
// hidden (it would run down beside the header like a notch), which left no sign at all that the
// page scrolls. This draws a thin thumb that shows only while the page is scrolling and fades out
// a little over a second after it stops, like the scroll indicator on iPhone and Android. While it
// is visible you can press and hold it and drag to scroll quickly through a long page. It does
// nothing on larger screens, where the normal scrollbar stays visible.
function initMobileScrollIndicator() {
  var main = document.querySelector('main.paw-field');
  if (!main || document.getElementById('mobile-scroll-thumb')) return;
  var st = document.createElement('style');
  // the element itself is an 18px-wide invisible strip (easy to grab with a finger); the visible
  // 4px bar is its ::after. The strip only catches touches while the thumb is showing, so when it
  // is faded out nothing at the screen edge is ever blocked.
  st.textContent =
    '#mobile-scroll-thumb{display:none}' +
    '@media (max-width:639px){' +
      '#mobile-scroll-thumb{display:block;position:fixed;right:0;top:0;width:18px;height:0;opacity:0;transition:opacity 350ms ease;pointer-events:none;touch-action:none;z-index:46;}' +
      '#mobile-scroll-thumb::after{content:"";position:absolute;top:0;bottom:0;right:2px;width:4px;border-radius:4px;background:rgba(42,36,28,.42);transition:width 120ms ease,background 120ms ease;}' +
      '#mobile-scroll-thumb.show{opacity:1;transition-duration:100ms;pointer-events:auto;}' +
      '#mobile-scroll-thumb.drag::after{width:7px;background:rgba(42,36,28,.65);}' +
      'html.dark-theme #mobile-scroll-thumb::after{background:rgba(255,255,255,.55);}' +
      'html.dark-theme #mobile-scroll-thumb.drag::after{background:rgba(255,255,255,.8);}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){#mobile-scroll-thumb,#mobile-scroll-thumb::after{transition:none !important;}}';
  document.head.appendChild(st);
  var thumb = document.createElement('div');
  thumb.id = 'mobile-scroll-thumb';
  document.body.appendChild(thumb);
  var phone = window.matchMedia ? window.matchMedia('(max-width: 639px)') : null;
  var hideTimer = null;
  var drag = null;   // { startY, startScrollTop } while a finger is holding the thumb

  function geometry() {
    var viewH = main.clientHeight, total = main.scrollHeight;
    if (total <= viewH + 1) return null;                        // nothing to scroll
    var track = viewH - 4;                                      // 2px breathing room top and bottom
    var thumbH = Math.max(36, track * viewH / total);
    return { viewH: viewH, total: total, track: track, thumbH: thumbH };
  }
  function place() {
    var g = geometry();
    if (!g) return false;
    var ratio = main.scrollTop / (g.total - g.viewH);
    ratio = Math.max(0, Math.min(1, ratio));                    // iOS rubber-banding overshoots
    thumb.style.height = g.thumbH + 'px';
    thumb.style.top = (main.getBoundingClientRect().top + 2 + ratio * (g.track - g.thumbH)) + 'px';
    return true;
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!drag) thumb.classList.remove('show'); }, 1200);
  }
  main.addEventListener('scroll', function () {
    if (phone && !phone.matches) return;
    if (!place()) return;
    thumb.classList.add('show');
    scheduleHide();
  }, { passive: true });

  // press and hold the thumb, then drag: moving the thumb by x pixels moves the page by the
  // matching share of its length
  thumb.addEventListener('pointerdown', function (e) {
    if (!geometry()) return;
    drag = { startY: e.clientY, startScrollTop: main.scrollTop };
    thumb.classList.add('drag');
    clearTimeout(hideTimer);
    try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  thumb.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var g = geometry();
    if (!g) return;
    var movable = g.track - g.thumbH;
    if (movable <= 0) return;
    main.scrollTop = drag.startScrollTop + (e.clientY - drag.startY) * (g.total - g.viewH) / movable;
    e.preventDefault();
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    thumb.classList.remove('drag');
    scheduleHide();
  }
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);
}

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

// toast text is escaped (it can contain names typed by users). The few typographic entities the
// app's own messages use (curly quotes, arrow, dot) are let through so they still display.
function toastSafe(message) {
  return escapeHTML(message).replace(/&amp;(ldquo|rdquo|lsquo|rsquo|rarr|middot);/g, '&$1;');
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
  toast.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + ' shrink-0 text-base"></i><span>' + toastSafe(message) + '</span>';
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
  if (typeof stopScanCamera === 'function') stopScanCamera();
  var overlay = document.getElementById('kg-modal-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', escCloseHandler);
}

// grab the overlay by reference here instead of re-querying by id later --
// if a new modal opens with the same id before this one finishes closing,
// re-querying would grab the wrong one
function closeModal() {
  // Scan Label's camera, if it was ever opened, must stop here too -- Escape
  // and the overlay's own X both skip submitLabelScan()'s cleanup.
  if (typeof stopScanCamera === 'function') stopScanCamera();
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
      '<button onclick="localStorage.removeItem(&#39;kibbleguard-admin-email&#39;);localStorage.removeItem(&#39;kibbleguard-session-token&#39;);window.location.href=&#39;auth.html&#39;" class="press px-6 py-2.5 text-xs font-bold text-white bg-danger hover:bg-red-600 rounded-xl shadow-lg shadow-danger/20 transition-all">Log Out</button>'
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
(function () {
  var st = document.createElement('style');
  st.textContent =
    '@media (max-width:639px){' +
      /* the actions row (Refresh, Add, chat, bell, account) was wrapping and leaving the account photo alone on a line */
      'main.paw-field > header > div.gap-3{gap:0.5rem !important;}' +
      'main.paw-field > header > div.gap-3 > button{padding-left:0.9rem !important;padding-right:0.9rem !important;}' +
      '#refresh-control{gap:0.5rem !important;}' +
      '#refresh-btn{padding:0.65rem 0.8rem !important;gap:0 !important;}' +
      '#refresh-btn .refresh-label{display:none;}' +
    '}';
  document.head.appendChild(st);
})();

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
    '<button type="button" id="refresh-btn" aria-label="Refresh" title="Refresh" class="press px-4 py-2.5 text-xs font-bold text-brand border-2 border-brand rounded-xl hover:bg-brand hover:text-white transition-colors duration-200 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">' +
      '<span id="refresh-icon" class="inline-block"><i class="fa-solid fa-rotate text-[11px]"></i></span><span class="refresh-label">Refresh</span></button>';
  var rightGroup = header.querySelector(':scope > div.gap-3');
  if (rightGroup) rightGroup.insertBefore(wrap, rightGroup.firstChild); else header.appendChild(wrap);

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



/* ---------- Admin team chat ----------
   Private one-to-one chat between admins (the chat icon in the header, left of the bell).
   Messages are kept in this browser's localStorage, the same way the rest of this build
   shares data between admins, so two admins on the SAME browser/device can talk now, and
   the panel says so. With a backend, only chatLoad() and chatSend() change (fetch the
   thread, POST a message). Chat text is deliberately NOT written to the Activity Log. */
var CHAT_KEY = 'kibbleguard-admin-chat';
var CHAT_READ_KEY = 'kibbleguard-admin-chat-read';
var CHAT_MAX_STORED = 300;
var CHAT_TEXT_MAX = 500;

function chatLoad() {
  var m = [];
  try { m = JSON.parse(localStorage.getItem(CHAT_KEY)) || []; } catch (e) { m = []; }
  return m;
}
function chatReadMap() {
  var r = {};
  try { r = JSON.parse(localStorage.getItem(CHAT_READ_KEY)) || {}; } catch (e) { r = {}; }
  return r;
}
function chatContacts(me) {
  return getAdminAccounts().filter(function (a) { return a.status === 'active' && a.email !== me.email; });
}
function chatThread(a, b) {
  return chatLoad().filter(function (m) { return (m.from === a && m.to === b) || (m.from === b && m.to === a); });
}
function chatUnreadFrom(me, other) {
  var last = (chatReadMap()[me] || {})[other] || '';
  return chatLoad().filter(function (m) { return m.from === other && m.to === me && m.time > last; }).length;
}
function chatUnreadTotal(me) {
  return chatContacts({ email: me }).reduce(function (sum, c) { return sum + chatUnreadFrom(me, c.email); }, 0);
}
function chatMarkRead(me, other) {
  var latest = '';
  chatThread(me, other).forEach(function (m) { if (m.from === other && m.time > latest) latest = m.time; });
  if (!latest) return;
  var map = chatReadMap();
  if (!map[me]) map[me] = {};
  if (map[me][other] === latest) return;
  map[me][other] = latest;
  try { localStorage.setItem(CHAT_READ_KEY, JSON.stringify(map)); } catch (e) {}
}
function chatSend(from, to, text) {
  var all = chatLoad();
  all.push({ id: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: from, to: to, text: text, time: new Date().toISOString() });
  if (all.length > CHAT_MAX_STORED) all = all.slice(all.length - CHAT_MAX_STORED);
  localStorage.setItem(CHAT_KEY, JSON.stringify(all));
}
function chatTimeLabel(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + t;
}

function initAdminChat() {
  var header = document.querySelector('main header');
  if (!header || document.getElementById('chat-wrap')) return;
  var group = header.querySelector(':scope > div.gap-3');
  if (!group) {
    group = document.createElement('div');
    group.className = 'flex items-center gap-3 flex-wrap';
    header.appendChild(group);
  }
  var wrap = document.createElement('div');
  wrap.id = 'chat-wrap';
  wrap.className = 'relative';
  wrap.innerHTML =
    '<button type="button" id="chat-btn" aria-label="Team chat" aria-haspopup="true" aria-expanded="false" class="press relative w-10 h-10 rounded-xl bg-stone-50 hover:bg-stone-100 flex items-center justify-center text-dark transition-colors">' +
      '<i class="fa-solid fa-comments"></i>' +
      '<span id="chat-badge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center"></span>' +
    '</button>' +
    '<div id="chat-panel" class="hidden absolute right-0 top-full mt-3 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-stone-100 z-[60] overflow-hidden"></div>';
  var bell = document.getElementById('notif-bell-wrap');
  if (bell && bell.parentNode === group) group.insertBefore(wrap, bell); else group.appendChild(wrap);

  var btn = document.getElementById('chat-btn');
  var panel = document.getElementById('chat-panel');
  var openWith = null;   // email of the admin whose conversation is open, or null for the list

  function meEmail() { var m = getLoggedInAdmin(); return m ? m.email : ''; }
  function paintBadge() {
    var badge = document.getElementById('chat-badge');
    var me = meEmail();
    if (!badge || !me) return;
    var n = chatUnreadTotal(me);
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.classList.toggle('hidden', n === 0);
    btn.setAttribute('aria-label', n ? ('Team chat, ' + n + ' unread') : 'Team chat');
  }
  function avatarOf(a) { return '<img src="' + getAvatarSrc(a) + '" alt="" class="w-10 h-10 rounded-full object-cover shrink-0">'; }

  // the enlarge button now opens the full Messages page (see openChatPage below)
  function sizeBtnHtml() {
    return '<button type="button" data-chat-size aria-label="Open full messages page" title="Open full messages page" class="press w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-dark transition-colors">' +
      '<i class="fa-solid fa-expand text-xs"></i></button>';
  }

  function renderList() {
    openWith = null;
    var me = getLoggedInAdmin();
    if (!me) return;
    var contacts = chatContacts(me);
    var rows = contacts.map(function (c) {
      var thread = chatThread(me.email, c.email);
      var last = thread[thread.length - 1];
      var unread = chatUnreadFrom(me.email, c.email);
      var preview = last ? ((last.from === me.email ? 'You: ' : '') + last.text) : 'No messages yet';
      return '<button type="button" data-chat-with="' + escapeHTML(c.email) + '" class="feed-row w-full text-left flex items-center gap-3 px-5 py-3.5 hover:bg-stone-50/50 transition-colors">' +
        avatarOf(c) +
        '<div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><p class="text-xs font-bold text-dark truncate">' + escapeHTML(c.name) + '</p>' +
          (last ? '<span class="text-[10px] text-stone-400 shrink-0">' + escapeHTML(chatTimeLabel(last.time)) + '</span>' : '') + '</div>' +
          '<p class="text-[11px] ' + (unread ? 'text-dark font-bold' : 'text-stone-400') + ' truncate">' + escapeHTML(preview) + '</p>' +
          '<p class="text-[9px] text-brand font-bold uppercase tracking-widest mt-0.5">' + escapeHTML(c.role) + '</p></div>' +
        (unread ? '<span class="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center shrink-0">' + unread + '</span>' : '') +
      '</button>';
    }).join('');
    panel.innerHTML =
      '<div class="px-5 py-4 border-b border-stone-50 flex items-center justify-between"><p class="text-xs font-bold text-dark uppercase tracking-widest">Team Chat</p>' +
        '<div class="flex items-center gap-2"><span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest">' + contacts.length + ' admin' + (contacts.length === 1 ? '' : 's') + '</span>' + sizeBtnHtml() + '</div></div>' +
      (contacts.length
        ? '<div class="divide-y divide-stone-50 max-h-96 overflow-y-auto">' + rows + '</div>'
        : '<div class="p-8 text-center"><p class="text-sm font-bold text-dark">No other active admins yet</p><p class="text-[11px] text-stone-400 mt-1">Invite a teammate from Settings and they will show up here.</p></div>');
  }

  function paintMessages() {
    var box = document.getElementById('chat-msgs');
    var me = getLoggedInAdmin();
    if (!box || !me || !openWith) return;
    var thread = chatThread(me.email, openWith);
    box.innerHTML = thread.length ? thread.map(function (m) {
      var mine = m.from === me.email;
      return '<div class="flex ' + (mine ? 'justify-end' : 'justify-start') + '"><div class="max-w-[80%]">' +
        '<div class="px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words whitespace-pre-wrap ' + (mine ? 'bg-brand text-white rounded-br-md' : 'bg-stone-100 text-dark rounded-bl-md') + '">' + escapeHTML(m.text) + '</div>' +
        '<p class="text-[9px] text-stone-400 mt-1 ' + (mine ? 'text-right' : '') + '">' + escapeHTML(chatTimeLabel(m.time)) + '</p></div></div>';
    }).join('') : '<p class="text-[11px] text-stone-400 text-center py-10">No messages yet. Say hello.</p>';
    box.scrollTop = box.scrollHeight;
    chatMarkRead(me.email, openWith);
    paintBadge();
  }

  function renderThread(email) {
    var me = getLoggedInAdmin();
    var other = getAdminAccounts().find(function (a) { return a.email === email && a.status === 'active'; });
    if (!me || !other) { renderList(); return; }
    openWith = email;
    panel.innerHTML =
      '<div class="px-4 py-3 border-b border-stone-50 flex items-center gap-3">' +
        '<button type="button" data-chat-back aria-label="Back to all chats" class="press w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-dark"><i class="fa-solid fa-chevron-left text-xs"></i></button>' +
        avatarOf(other) +
        '<div class="min-w-0"><p class="text-xs font-bold text-dark truncate">' + escapeHTML(other.name) + '</p><p class="text-[9px] text-brand font-bold uppercase tracking-widest">' + escapeHTML(other.role) + '</p></div>' +
        '<div class="ml-auto shrink-0">' + sizeBtnHtml() + '</div>' +
      '</div>' +
      '<div id="chat-msgs" class="h-72 overflow-y-auto p-4 space-y-3"></div>' +
      '<div class="p-3 border-t border-stone-50 flex items-end gap-2">' +
        '<textarea id="chat-input" rows="1" maxlength="' + CHAT_TEXT_MAX + '" placeholder="Write a message..." aria-label="Message" class="flex-1 px-3.5 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-xs resize-none focus:outline-none focus:border-brand transition-all"></textarea>' +
        '<button type="button" data-chat-send aria-label="Send message" class="press w-10 h-10 rounded-xl bg-brand hover:bg-brand-hover text-white flex items-center justify-center shrink-0"><i class="fa-solid fa-paper-plane text-xs"></i></button>' +
      '</div>';
    paintMessages();
    var input = document.getElementById('chat-input');
    if (input) input.focus();
  }

  function sendCurrent() {
    var me = getLoggedInAdmin();
    var input = document.getElementById('chat-input');
    if (!me || !input || !openWith) return;
    var text = input.value.trim();
    if (!text) return;
    try { chatSend(me.email, openWith, text.slice(0, CHAT_TEXT_MAX)); }
    catch (e) { showToast('Could not send that message, please try again', 'danger'); return; }
    input.value = '';
    paintMessages();
  }


  /* ---------- Full Messages page ----------
     The enlarge button swaps the page content (the area under the header, right of the sidebar)
     for a two-pane inbox: admins on the left, the conversation on the right. The sidebar and
     header stay exactly as they are. The back arrow or Esc returns to the page you were on, which
     is only hidden while Messages is open, never reloaded, so filters and scroll position survive. */
  var pageWith = null;
  function pageEl() { return document.getElementById('chat-page'); }
  function mainPane() { var m = document.querySelector('main.paw-field'); return m ? m.querySelector(':scope > .page-scroll') : null; }

  // while Messages is open the header must not claim to be the page underneath: the title becomes
  // "Messages" and that page's own buttons (Refresh, Add Ingredient, ...) are hidden. The chat,
  // bell and account buttons stay. Everything is put back exactly as it was on close.
  var chatHeaderSaved = null;
  function setHeaderForChat(on) {
    var header = document.querySelector('main header');
    if (!header) return;
    var h1 = header.querySelector('h1');
    var sub = h1 ? h1.nextElementSibling : null;
    var group = header.querySelector(':scope > div.gap-3');
    if (on) {
      if (chatHeaderSaved) return;
      chatHeaderSaved = { title: h1 ? h1.textContent : '', sub: sub ? sub.textContent : '', hidden: [] };
      if (h1) h1.textContent = 'Messages';
      if (sub) sub.textContent = 'Admin team chat';
      if (group) Array.prototype.forEach.call(group.children, function (el) {
        if (['chat-wrap', 'notif-bell-wrap', 'profile-menu-wrap'].indexOf(el.id) !== -1) return;
        chatHeaderSaved.hidden.push({ el: el, display: el.style.display });
        el.style.display = 'none';
      });
      var gs = document.getElementById('global-search-wrap');
      if (gs && window.matchMedia && window.matchMedia('(max-width: 639px)').matches) {
        chatHeaderSaved.hidden.push({ el: gs, display: gs.style.display });
        gs.style.display = 'none';
      }
    } else if (chatHeaderSaved) {
      if (h1) h1.textContent = chatHeaderSaved.title;
      if (sub) sub.textContent = chatHeaderSaved.sub;
      chatHeaderSaved.hidden.forEach(function (x) { x.el.style.display = x.display; });
      chatHeaderSaved = null;
    }
  }

  function closeChatPage() {
    var page = pageEl();
    if (page) page.remove();
    var pane = mainPane();
    if (pane) pane.style.display = '';
    pageWith = null;
    setHeaderForChat(false);
    paintBadge();
  }

  function paintPageList() {
    var list = document.getElementById('cp-list');
    var me = getLoggedInAdmin();
    if (!list || !me) return;
    var contacts = chatContacts(me);
    if (!contacts.length) {
      list.innerHTML = '<div class="p-8 text-center"><p class="text-sm font-bold text-dark">No other active admins yet</p><p class="text-[11px] text-stone-400 mt-1">Invite a teammate from Settings and they will show up here.</p></div>';
      return;
    }
    list.innerHTML = '<p class="px-5 pt-5 pb-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Admins &middot; ' + contacts.length + '</p>' + contacts.map(function (c) {
      var thread = chatThread(me.email, c.email);
      var last = thread[thread.length - 1];
      var unread = chatUnreadFrom(me.email, c.email);
      var preview = last ? ((last.from === me.email ? 'You: ' : '') + last.text) : 'No messages yet';
      var active = c.email === pageWith;
      return '<button type="button" data-cp-with="' + escapeHTML(c.email) + '" class="w-full text-left flex items-center gap-3 px-5 py-3.5 transition-colors ' + (active ? 'bg-brand-light' : 'hover:bg-stone-50/50') + '">' +
        avatarOf(c) +
        '<div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><p class="text-xs font-bold text-dark truncate">' + escapeHTML(c.name) + '</p>' +
          (last ? '<span class="text-[10px] text-stone-400 shrink-0">' + escapeHTML(chatTimeLabel(last.time)) + '</span>' : '') + '</div>' +
          '<p class="text-[11px] ' + (unread ? 'text-dark font-bold' : 'text-stone-400') + ' truncate">' + escapeHTML(preview) + '</p>' +
          '<p class="text-[9px] text-brand font-bold uppercase tracking-widest mt-0.5">' + escapeHTML(c.role) + '</p></div>' +
        (unread ? '<span class="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center shrink-0">' + unread + '</span>' : '') +
      '</button>';
    }).join('');
  }

  function paintPageMessages() {
    var box = document.getElementById('cp-msgs');
    var me = getLoggedInAdmin();
    if (!box || !me || !pageWith) return;
    var thread = chatThread(me.email, pageWith);
    box.innerHTML = thread.length ? thread.map(function (m) {
      var mine = m.from === me.email;
      return '<div class="flex ' + (mine ? 'justify-end' : 'justify-start') + '"><div class="max-w-[75%]">' +
        '<div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ' + (mine ? 'bg-brand text-white rounded-br-md' : 'bg-stone-100 text-dark rounded-bl-md') + '">' + escapeHTML(m.text) + '</div>' +
        '<p class="text-[10px] text-stone-400 mt-1 ' + (mine ? 'text-right' : '') + '">' + escapeHTML(chatTimeLabel(m.time)) + '</p></div></div>';
    }).join('') : '<p class="text-xs text-stone-400 text-center py-16">No messages yet. Say hello.</p>';
    box.scrollTop = box.scrollHeight;
    chatMarkRead(me.email, pageWith);
    paintBadge();
    paintPageList();
  }

  // builds the right-hand conversation pane for one admin (only when the admin changes, so a
  // half-typed message is never wiped by a repaint)
  function selectPageContact(email) {
    var me = getLoggedInAdmin();
    var thread = document.getElementById('cp-thread');
    if (!thread || !me) return;
    var other = getAdminAccounts().find(function (a) { return a.email === email && a.status === 'active'; });
    if (!other) {
      pageWith = null;
      var listPg = pageEl(); if (listPg) listPg.dataset.view = 'list';
      thread.innerHTML = '<div class="flex-1 flex flex-col items-center justify-center text-center p-10"><div class="w-14 h-14 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center text-xl mb-3"><i class="fa-solid fa-comments"></i></div><p class="text-sm font-bold text-dark">Select an admin to start chatting</p></div>';
      paintPageList();
      return;
    }
    pageWith = email;
    var threadPg = pageEl(); if (threadPg) threadPg.dataset.view = 'thread';
    thread.innerHTML =
      '<div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-100 flex items-center gap-3 shrink-0">' +
        avatarOf(other) +
        '<div class="min-w-0"><p class="text-sm font-bold text-dark truncate">' + escapeHTML(other.name) + '</p><p class="text-[10px] text-brand font-bold uppercase tracking-widest">' + escapeHTML(other.role) + '</p></div></div>' +
      '<div id="cp-msgs" class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-3"></div>' +
      '<div class="p-4 border-t border-stone-100 flex items-end gap-3 shrink-0">' +
        '<textarea id="cp-input" rows="1" maxlength="' + CHAT_TEXT_MAX + '" placeholder="Write a message..." aria-label="Message" class="flex-1 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-sm resize-none focus:outline-none focus:border-brand transition-all"></textarea>' +
        '<button type="button" data-cp-send aria-label="Send message" class="press w-11 h-11 rounded-xl bg-brand hover:bg-brand-hover text-white flex items-center justify-center shrink-0"><i class="fa-solid fa-paper-plane text-sm"></i></button>' +
      '</div>';
    paintPageMessages();
    var input = document.getElementById('cp-input');
    if (input) input.focus();
  }

  function sendFromPage() {
    var me = getLoggedInAdmin();
    var input = document.getElementById('cp-input');
    if (!me || !input || !pageWith) return;
    var text = input.value.trim();
    if (!text) return;
    try { chatSend(me.email, pageWith, text.slice(0, CHAT_TEXT_MAX)); }
    catch (e) { showToast('Could not send that message, please try again', 'danger'); return; }
    input.value = '';
    paintPageMessages();
  }

  (function () {
    if (document.getElementById('chat-page-phone-css')) return;
    var st = document.createElement('style');
    st.id = 'chat-page-phone-css';
    st.textContent =
      '@media (max-width:767px){' +
        '#chat-page[data-view="thread"] #cp-list{display:none;}' +
        '#chat-page[data-view="list"] #cp-thread{display:none;}' +
        '#chat-page #cp-list{max-height:none;border-bottom:0;flex:1 1 auto;}' +
      '}';
    document.head.appendChild(st);
  })();

  function openChatPage(email) {
    var me = getLoggedInAdmin();
    var pane = mainPane();
    if (!me || !pane) return;
    setOpen(false);
    var contacts = chatContacts(me);
    var pick = email && contacts.some(function (c) { return c.email === email; }) ? email : null;
    if (!pick) {
      var withUnread = contacts.filter(function (c) { return chatUnreadFrom(me.email, c.email) > 0; })[0];
      pick = (withUnread || contacts[0] || {}).email || null;
      // on a phone the list and the conversation cannot share the screen, so start on the list
      if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) pick = null;
    }
    var page = pageEl();
    if (page) page.remove();
    page = document.createElement('div');
    page.id = 'chat-page';
    page.style.cssText = 'flex:1 1 0%;min-height:0;display:flex;flex-direction:column;';
    page.innerHTML =
      '<div class="flex flex-col flex-1 min-h-0 p-3 sm:p-6 lg:p-10 gap-4 sm:gap-6 w-full max-w-[1600px] mx-auto">' +
        '<div class="flex items-center gap-4 shrink-0">' +
          '<button type="button" data-cp-close aria-label="Back" title="Back" class="press w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-dark hover:bg-stone-50 transition-colors"><i class="fa-solid fa-arrow-left text-sm"></i></button>' +
          '<div><h2 class="font-display font-bold text-xl sm:text-2xl text-dark leading-tight">Team Chat</h2><p class="text-xs text-stone-500 mt-0.5">Private conversations between admins</p></div>' +
        '</div>' +
        '<div class="flex flex-col md:flex-row flex-1 min-h-[26rem] bg-white border border-stone-100 rounded-[2rem] card-shadow overflow-hidden">' +
          '<div id="cp-list" class="md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-stone-100 overflow-y-auto max-h-56 md:max-h-none"></div>' +
          '<div id="cp-thread" class="flex-1 min-w-0 min-h-0 flex flex-col"></div>' +
        '</div>' +
      '</div>';
    pane.after(page);
    pane.style.display = 'none';
    setHeaderForChat(true);
    page.addEventListener('click', function (e) {
      if (e.target.closest('[data-cp-close]')) {
        // on a phone, inside a conversation, the arrow goes back to the admin list first
        var onPhone = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
        if (onPhone && page.dataset.view === 'thread') { selectPageContact(null); return; }
        closeChatPage();
        return;
      }
      if (e.target.closest('[data-cp-back]')) { selectPageContact(null); return; }
      var w = e.target.closest('[data-cp-with]');
      if (w) { selectPageContact(w.getAttribute('data-cp-with')); return; }
      if (e.target.closest('[data-cp-send]')) sendFromPage();
    });
    page.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'cp-input' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromPage(); }
    });
    selectPageContact(pick);
  }

  function setOpen(open) {
    panel.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { if (openWith) renderThread(openWith); else renderList(); }
  }

  btn.addEventListener('click', function (e) { e.stopPropagation(); if (pageEl()) { closeChatPage(); return; } setOpen(panel.classList.contains('hidden')); });
  // clicking an admin (or Back) rebuilds the panel's HTML, so by the time this document-level
  // listener runs, e.target has already been removed from the page and wrap.contains() would say
  // "outside" and close the chat. composedPath() is captured when the click happens, before the
  // re-render, so it still knows the click started inside the chat
  document.addEventListener('click', function (e) {
    var path = e.composedPath ? e.composedPath() : [];
    var inside = path.length ? path.indexOf(wrap) !== -1 : wrap.contains(e.target);
    if (!inside) setOpen(false);
  }, true);   // capture phase, so clicking the bell or the profile menu (which stop their own clicks) still closes the chat
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (pageEl() && !document.getElementById('kg-modal-overlay')) closeChatPage(); else setOpen(false);
  });
  panel.addEventListener('click', function (e) {
    if (e.target.closest('[data-chat-size]')) { openChatPage(openWith); return; }
    var open = e.target.closest('[data-chat-with]');
    if (open) { renderThread(open.getAttribute('data-chat-with')); return; }
    if (e.target.closest('[data-chat-back]')) { renderList(); return; }
    if (e.target.closest('[data-chat-send]')) sendCurrent();
  });
  panel.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
  });
  // another tab/window on this browser sent a message: refresh the badge and whatever is open
  window.addEventListener('storage', function (e) {
    if (e.key !== CHAT_KEY && e.key !== CHAT_READ_KEY) return;
    paintBadge();
    if (pageEl()) { paintPageList(); paintPageMessages(); }
    if (panel.classList.contains('hidden')) return;
    if (openWith) paintMessages(); else renderList();
  });
  paintBadge();
}

/* ---------- Header profile menu ----------
   The signed-in admin's photo at the far right of the header. Click it for who you are
   signed in as, what your role can do, shortcuts to Settings and the Activity Log, and
   Log Out. Everything shown comes from the same account record the sidebar uses, so the
   two can never disagree. */
function initProfileMenu() {
  var header = document.querySelector('main header');
  if (!header || document.getElementById('profile-menu-wrap')) return;
  var group = header.querySelector(':scope > div.gap-3');
  if (!group) {
    group = document.createElement('div');
    group.className = 'flex items-center gap-3 flex-wrap';
    header.appendChild(group);
  }
  var wrap = document.createElement('div');
  wrap.id = 'profile-menu-wrap';
  wrap.className = 'relative';
  wrap.innerHTML =
    '<button type="button" id="profile-menu-btn" aria-haspopup="true" aria-expanded="false" class="press block w-10 h-10 rounded-xl overflow-hidden ring-2 ring-transparent hover:ring-brand/40 focus:outline-none focus:ring-brand/60 transition-all">' +
      '<img id="profile-menu-avatar" alt="" class="w-10 h-10 object-cover">' +
    '</button>' +
    '<div id="profile-menu-panel" class="hidden absolute right-0 top-full mt-3 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-stone-100 z-[60] overflow-hidden" role="menu"></div>';
  group.appendChild(wrap);

  var btn = document.getElementById('profile-menu-btn');
  var panel = document.getElementById('profile-menu-panel');
  function setOpen(open) {
    panel.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      // only one dropdown open at a time
      var bell = document.getElementById('notif-panel'); if (bell) bell.classList.add('hidden');
      var bellBtn = document.getElementById('notif-bell-btn'); if (bellBtn) bellBtn.setAttribute('aria-expanded', 'false');
      var search = document.getElementById('global-search-panel'); if (search) search.classList.add('hidden');
    }
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(panel.classList.contains('hidden')); });
  // capture phase, so clicking the bell or the search box (which stop their own clicks) still closes this menu
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) setOpen(false); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  panel.addEventListener('click', function (e) {
    if (e.target.closest('[data-logout]')) { setOpen(false); confirmLogout(); }
  });
  updateProfileMenu();
}

function updateProfileMenu() {
  var btn = document.getElementById('profile-menu-btn');
  var panel = document.getElementById('profile-menu-panel');
  var account = getLoggedInAdmin();
  if (!btn || !panel || !account) return;
  var src = getAvatarSrc(account);
  document.getElementById('profile-menu-avatar').src = src;
  btn.setAttribute('aria-label', 'Account menu for ' + account.name);
  var summaries = (typeof ROLE_ACCESS_SUMMARY !== 'undefined') ? ROLE_ACCESS_SUMMARY : {};
  var access = summaries[roleStringToKey(account.role)] || '';
  var item = 'role="menuitem" class="feed-row flex items-center gap-3 px-5 py-3 text-xs font-bold text-stone-600 hover:bg-stone-50/50 transition-colors w-full text-left"';
  panel.innerHTML =
    '<div class="p-5 border-b border-stone-50">' +
      '<div class="flex items-center gap-3">' +
        '<img src="' + src + '" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0">' +
        '<div class="min-w-0">' +
          '<p class="text-sm font-bold text-dark truncate">' + escapeHTML(account.name) + '</p>' +
          '<p class="text-[11px] text-stone-500 truncate">' + escapeHTML(account.email) + '</p>' +
          '<span class="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-brand-light text-brand text-[9px] font-bold uppercase tracking-widest">' + escapeHTML(account.role) + '</span>' +
        '</div>' +
      '</div>' +
      (access ? '<p class="text-[11px] text-stone-400 leading-relaxed mt-3">' + escapeHTML(access) + '</p>' : '') +
    '</div>' +
    '<div class="py-2">' +
      '<a href="settings.html" ' + item + '><i class="fa-solid fa-gear w-4 text-stone-400"></i>Profile &amp; Settings</a>' +
    '</div>' +
    '<div class="py-2 border-t border-stone-50">' +
      '<button type="button" data-logout ' + item.replace('text-stone-600','text-danger') + '><i class="fa-solid fa-arrow-right-from-bracket w-4"></i>Log Out</button>' +
    '</div>';
}

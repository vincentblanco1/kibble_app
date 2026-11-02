// bump this whenever the seeded rows in users-pets.html change in a way that
// matters (a real data change, not just styling) -- otherwise a browser that
// already cached the OLD table via savePersistedRows below would keep
// silently restoring those stale rows over the new seed file forever, since
// restorePersistedRows has no way to know the seed changed on its own
var USERS_SEED_VERSION = 'v3-2026-09-27-barangay-noroles';
if (localStorage.getItem('kibbleguard-users-seed-version') !== USERS_SEED_VERSION) {
  localStorage.removeItem('kibbleguard-users-rows');
  localStorage.setItem('kibbleguard-users-seed-version', USERS_SEED_VERSION);
}
restorePersistedRows('kibbleguard-users-rows', document.getElementById('user-table-body'));

/* ---------- Shared badge helpers ---------- */
/* 5-tier per-species ingredient classification (Risk Library) */
var RISK_LEVELS = ['Safe', 'Caution', 'Toxic'];
var RISK_LEVEL_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-amber-50 text-amber-500 border-amber-100' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10' }
};
// unused here, kept for consistency with the other pages that share
// this same badge-helpers block
function riskBadgeHtml(level) {
  var m = RISK_LEVEL_STYLES[level] || RISK_LEVEL_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + level + '</span>';
}
function riskOptions(selected) {
  // also unused here
  return RISK_LEVELS.map(function (l) {
    return '<option value="' + l + '"' + (l === selected ? ' selected' : '') + '>' + l + '</option>';
  }).join('');
}

/* 3-tier overall scan verdict (Safe / Caution / Toxic) */
var VERDICT_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10',       label: 'Safe' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-caution/10 text-caution border-caution/10', label: 'Caution' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10', label: 'Toxic' }
};
// unused here too - shared block, not every page needs every helper
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- Users & Pets-specific interactions ---------- */
var currentUserStatusFilter = 'all';

// keeps the Status dropdown's "this one is active" green outline and the Clear
// filters button in step with the filter state
function syncUserFilterUI() {
  var el = document.getElementById('user-filter-status');
  if (el) {
    var active = currentUserStatusFilter !== 'all';
    el.value = currentUserStatusFilter;
    el.classList.toggle('border-brand', active);
    el.classList.toggle('bg-brand-light', active);
    el.classList.toggle('text-brand', active);
    el.classList.toggle('border-stone-200', !active);
    el.classList.toggle('bg-stone-100', !active);
    el.classList.toggle('text-dark', !active);
  }
  var clearBtn = document.getElementById('user-clear-filters');
  if (clearBtn) clearBtn.classList.toggle('hidden', currentUserStatusFilter === 'all');
}

// Status dropdown: all / active / flagged / banned
function setUserStatusFilter(status) {
  currentUserStatusFilter = status;
  syncUserFilterUI();
  filterUsers();
}

// the "Clear filters" button: status back to "All" (search box has its own way to clear)
function clearUserFilters() {
  currentUserStatusFilter = 'all';
  syncUserFilterUI();
  filterUsers();
}

// combines the search box with the status filter above
function filterUsers() {
  var q = document.getElementById('user-search').value.toLowerCase().trim();
  var rows = document.querySelectorAll('#user-table-body tr[data-search]');
  var visible = 0;
  rows.forEach(function (row) {
    var matchesSearch = row.dataset.search.indexOf(q) !== -1;
    var matchesStatus = currentUserStatusFilter === 'all' || row.dataset.status === currentUserStatusFilter;
    var match = matchesSearch && matchesStatus;
    row.dataset.filterMatch = match ? 'true' : 'false';
    if (match) visible++;
  });
  document.getElementById('user-empty-row').classList.toggle('hidden', visible !== 0);
  var label = document.getElementById('user-count-label');
  var isFiltered = q || currentUserStatusFilter !== 'all';
  label.textContent = isFiltered ? ('Showing ' + visible + ' matching result' + (visible === 1 ? '' : 's')) : 'Showing all ' + visible + ' users';
  applyTablePagination('user-table-body', 'user-pagination-controls', 10, true);
}

// closes whatever row's "..." action menu is currently open.
// bound to document clicks, so clicking anywhere else dismisses it
function closeAllMenus() {
  document.querySelectorAll('.kg-row-menu').forEach(function (m) { m.remove(); });
  document.removeEventListener('click', closeAllMenus);
}

// the "..." button's dropdown - built fresh each time since the flag/ban
// labels change depending on the account's current status (Flag vs Unflag)
function openRowMenu(event, rowId) {
  event.stopPropagation();
  closeAllMenus();
  var row = document.getElementById(rowId);
  var status = row.dataset.status;
  var rect = event.currentTarget.getBoundingClientRect();
  var menu = document.createElement('div');
  menu.className = 'kg-row-menu fixed z-[120] w-56 bg-white rounded-2xl shadow-2xl border border-stone-100 py-2 text-left';
  menu.style.top = (rect.bottom + 8) + 'px';
  menu.style.left = (rect.right - 224) + 'px';
  var flagLabel = status === 'flagged' ? 'Unflag Account' : 'Flag Account';
  var flagClasses = status === 'flagged' ? 'text-stone-600 hover:bg-stone-50' : 'text-caution hover:bg-caution/5';
  var banLabel = status === 'banned' ? 'Unban Account' : 'Ban Account';
  var banClasses = status === 'banned' ? 'text-stone-600 hover:bg-stone-50' : 'text-danger hover:bg-danger/5';
  menu.innerHTML =
    '<button onclick="viewUserProfile(\'' + rowId + '\')" class="w-full text-left px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-50 flex items-center gap-3"><i class="fa-solid fa-id-card w-4 text-stone-400"></i>View Profile</button>' +
    '<button onclick="sendUserMessage(\'' + rowId + '\')" data-perm="manageUsers" class="w-full text-left px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-50 flex items-center gap-3"><i class="fa-solid fa-paper-plane w-4 text-stone-400"></i>Send Message</button>' +
    '<button onclick="forcePasswordReset(\'' + rowId + '\')" data-perm="manageUsers" class="w-full text-left px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-50 flex items-center gap-3"><i class="fa-solid fa-key w-4 text-stone-400"></i>Force Password Reset</button>' +
    '<div class="my-2 border-t border-stone-50"></div>' +
    '<button onclick="toggleFlagUser(\'' + rowId + '\')" data-perm="manageUsers" class="w-full text-left px-4 py-2.5 text-xs font-bold ' + flagClasses + ' flex items-center gap-3"><i class="fa-solid fa-flag w-4"></i>' + flagLabel + '</button>' +
    '<button onclick="toggleBanUser(\'' + rowId + '\')" data-perm="manageUsers" class="w-full text-left px-4 py-2.5 text-xs font-bold ' + banClasses + ' flex items-center gap-3"><i class="fa-solid fa-ban w-4"></i>' + banLabel + '</button>';
  document.body.appendChild(menu);
  if (typeof applyPermissionGating === 'function') applyPermissionGating();
  setTimeout(function () { document.addEventListener('click', closeAllMenus); }, 0);
}

// real per-owner message history, keyed by email (not rowId, since that's
// what RECORD_TRACES and every other cross-page owner lookup uses too).
// separate from Activity Log's one-line "Sent message to X: <subject>"
// entry -- that's an admin-accountability trail, this is what was actually
// said to the pet owner, kept so a profile visit later can show the real
// conversation instead of nothing at all
function getMessageHistory(email) {
  var all = {};
  try { all = JSON.parse(localStorage.getItem('kibbleguard-message-history')) || {}; } catch (e) { all = {}; }
  return all[email] || [];
}
function saveMessageToHistory(email, entry) {
  var all = {};
  try { all = JSON.parse(localStorage.getItem('kibbleguard-message-history')) || {}; } catch (e) { all = {}; }
  if (!all[email]) all[email] = [];
  all[email].push(entry);
  localStorage.setItem('kibbleguard-message-history', JSON.stringify(all));
}

// same "2024-05-28 14:42" style already used for real timestamps elsewhere
// in the app (OCR Scan Records, Inquiries), just computed here since these
// come from an admin actually clicking Send just now, not hand-typed seed text
function formatMessageTimestamp(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
}

// the "Messages Sent" section at the bottom of a profile -- real history,
// newest first, or an honest empty state if nothing's ever actually been
// sent to this owner yet
function messageHistoryHtml(email) {
  var history = getMessageHistory(email).slice().reverse();
  var itemsHtml = history.length
    ? history.map(function (m) {
        return '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<div class="flex items-start justify-between gap-3 mb-1.5">' +
            '<p class="text-sm font-bold text-dark">' + escapeHTML(m.subject) + '</p>' +
            '<span class="text-[10px] text-stone-400 font-mono shrink-0">' + formatMessageTimestamp(m.time) + '</span>' +
          '</div>' +
          '<p class="text-xs text-stone-600 leading-relaxed mb-2">' + escapeHTML(m.body) + '</p>' +
          '<span class="text-[9px] font-bold text-stone-400 uppercase tracking-widest">' + (m.alsoEmail ? 'In-app + Email' : 'In-app only') + '</span>' +
        '</div>';
      }).join('')
    : '<p class="text-xs text-stone-400">No messages sent to this owner yet.</p>';
  return '<p class="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 mt-6">Messages Sent</p>' +
    '<div class="space-y-3">' + itemsHtml + '</div>';
}

// the full profile modal - pet list, scan history, and the flag/ban
// reason if either currently applies
function viewUserProfile(rowId) {
  closeAllMenus();
  var row = document.getElementById(rowId);
  var d = row.dataset;
  var avatarSrc = row.querySelector('img') ? row.querySelector('img').src : '';
  var statusPill = d.status === 'flagged'
    ? '<span class="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border text-danger bg-danger/10 border-danger/10">Flagged</span>'
    : d.status === 'banned'
    ? '<span class="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border text-white bg-dark border-dark">Banned</span>'
    : '<span class="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border text-safe bg-safe/10 border-safe/10">Active</span>';
  var rolePill = '<span class="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border text-brand bg-brand-light border-brand/20">' + escapeHTML(d.role) + '</span>';

  var scansMatch = d.scans.match(/(\d+)\s*Scans?/);
  var totalScans = scansMatch ? scansMatch[1] : '0';
  var warningsMatch = d.scans.match(/(\d+)\s*(Risk Warnings?|Warnings?|Dispute)/);
  var warningsLabel = d.scans.indexOf('Dispute') !== -1 ? 'Disputes' : 'Warnings';
  var warningsCount = warningsMatch ? warningsMatch[1] : '0';

  var pets = d.pets.split(';').map(function (p) {
    var parts = p.split('|');
    return { name: parts[0], species: parts[1], breed: parts[2], allergies: parts[3], age: parts[4], weight: parts[5], vaccination: parts[6], dewormed: parts[7] };
  });

  var petsHtml = pets.map(function (pet) {
    var icon = pet.species === 'cat' ? 'fa-cat' : 'fa-dog';
    var iconColor = pet.species === 'cat' ? 'text-[#B57EDC]' : 'text-[#03C4C9]';
    var allergyHtml = pet.allergies === 'None reported'
      ? '<span class="px-2.5 py-1 rounded-full bg-stone-100 text-stone-500 text-[9px] font-bold uppercase tracking-widest">No known allergies</span>'
      : pet.allergies.split(',').map(function (a) {
          return '<span class="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-100 text-[9px] font-bold uppercase tracking-widest">' + escapeHTML(a.trim()) + '</span>';
        }).join(' ');
    var vaccBadge = pet.vaccination === 'Up to Date'
      ? '<span class="px-2 py-0.5 rounded-full bg-safe/10 text-safe text-[9px] font-bold uppercase tracking-widest border border-safe/10">Up to Date</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-caution/10 text-caution text-[9px] font-bold uppercase tracking-widest border border-caution/10"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + escapeHTML(pet.vaccination) + '</span>';
    return '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200">' +
      '<div class="flex items-center gap-3 mb-3">' +
        '<div class="w-10 h-10 rounded-xl bg-brand-light ' + iconColor + ' flex items-center justify-center text-base shrink-0"><i class="fa-solid ' + icon + '"></i></div>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-bold text-dark leading-none">' + escapeHTML(pet.name) + '</p><p class="text-[10px] text-stone-400 font-medium mt-1">' + escapeHTML(pet.breed) + '</p></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-2 mb-3 text-[10px]">' +
        '<div class="p-2 rounded-lg bg-white border border-stone-100"><p class="text-stone-400 font-bold uppercase tracking-widest">Age / Weight</p><p class="text-dark font-bold mt-0.5">' + escapeHTML(pet.age) + ' &middot; ' + escapeHTML(pet.weight) + '</p></div>' +
        '<div class="p-2 rounded-lg bg-white border border-stone-100"><p class="text-stone-400 font-bold uppercase tracking-widest">Vaccination</p><div class="mt-1">' + vaccBadge + '</div></div>' +
      '</div>' +
      '<p class="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1.5">Flagged Allergens</p>' +
      '<div class="flex flex-wrap gap-1.5 mb-3">' + allergyHtml + '</div>' +
      '<p class="text-[10px] text-stone-400">Last dewormed: <span class="font-bold text-stone-600">' + escapeHTML(pet.dewormed) + '</span></p>' +
    '</div>';
  }).join('');

  openModal({
    title: d.name,
    subtitle: d.email,
    wide: true,
    bodyHtml:
      '<div class="flex items-center gap-4 mb-6 pb-6 border-b border-stone-50">' +
        '<img src="' + escapeHTML(avatarSrc) + '" class="w-16 h-16 rounded-2xl object-cover shadow-sm shrink-0">' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 flex-wrap">' + statusPill + rolePill + '</div>' +
          '<p class="text-[11px] text-stone-400 font-medium mt-2">Member since ' + escapeHTML(d.joined) + ' &middot; Last active ' + escapeHTML(d.lastActive) + '</p>' +
        '</div>' +
      '</div>' +
      (d.status === 'flagged' && d.flagReason ?
        '<div class="p-4 rounded-2xl bg-caution/5 border border-caution/10 mb-6"><p class="text-[10px] font-bold text-caution uppercase tracking-widest mb-1">Reason Flagged</p><p class="text-sm text-dark leading-relaxed">' + escapeHTML(d.flagReason) + '</p></div>' : '') +
      (d.status === 'banned' && d.banReason ?
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 mb-6"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Reason Banned</p><p class="text-sm text-dark leading-relaxed">' + escapeHTML(d.banReason) + '</p></div>' : '') +
      '<div class="grid grid-cols-3 gap-4 mb-6">' +
        '<button onclick="window.location.href=\'ocr-scans.html?ownerSearch=' + encodeURIComponent(d.name).replace(/'/g, '%27') + '\'" class="press p-4 rounded-2xl bg-stone-100 border border-stone-200 text-center hover:border-brand/30 transition-all cursor-pointer" title="View this owner\'s scans on OCR Scan Records">' +
          '<p class="text-xl font-display font-bold text-dark tabular-nums">' + totalScans + '</p>' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">Total Scans</p>' +
        '</button>' +
        '<button onclick="window.location.href=\'ocr-scans.html?ownerSearch=' + encodeURIComponent(d.name).replace(/'/g, '%27') + '&verdict=risk\'" class="press p-4 rounded-2xl ' + (parseInt(warningsCount) > 0 ? 'bg-danger/5 border border-danger/10' : 'bg-stone-100 border border-stone-200') + ' text-center hover:border-brand/30 transition-all cursor-pointer" title="View just this owner\'s Toxic/Caution scans on OCR Scan Records">' +
          '<p class="text-xl font-display font-bold ' + (parseInt(warningsCount) > 0 ? 'text-danger' : 'text-dark') + ' tabular-nums">' + warningsCount + '</p>' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">' + warningsLabel + '</p>' +
        '</button>' +
        '<button onclick="document.getElementById(\'profile-pets-section\').scrollIntoView({behavior:\'smooth\',block:\'start\'})" class="press p-4 rounded-2xl bg-stone-100 border border-stone-200 text-center hover:border-brand/30 transition-all cursor-pointer" title="Jump to Pet Profiles &amp; Medical Records below">' +
          '<p class="text-xl font-display font-bold text-dark tabular-nums">' + pets.length + '</p>' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">Pet' + (pets.length === 1 ? '' : 's') + '</p>' +
        '</button>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-4 mb-6">' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5"><i class="fa-solid fa-location-dot mr-1"></i>Location</p>' +
          '<p class="text-xs font-bold text-dark">Brgy. ' + escapeHTML(d.barangay || '?') + ', ' + escapeHTML(d.city) + '</p>' +
          '<p class="text-[10px] text-stone-400 mt-0.5">' + escapeHTML(d.region) + ', ' + escapeHTML(d.country) + '</p>' +
        '</div>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5"><i class="fa-solid fa-bowl-food mr-1"></i>Household Feeding Profile</p>' +
          '<p class="text-xs font-bold text-dark">' + escapeHTML(d.feedingStyle) + '</p>' +
          '<p class="text-[10px] text-stone-400 mt-0.5">' + d.ownedAnimals + ' owned animal' + (d.ownedAnimals === '1' ? '' : 's') + '</p>' +
        '</div>' +
      '</div>' +
      '<p id="profile-pets-section" class="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Pet Profiles & Medical Records</p>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">' + petsHtml + '</div>' +
      messageHistoryHtml(d.email),
    footerHtml:
      '<button onclick="sendUserMessage(\'' + rowId + '\')" data-perm="manageUsers" class="press px-4 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all flex items-center gap-2" title="Send Message"><i class="fa-solid fa-paper-plane"></i></button>' +
      '<button onclick="forcePasswordReset(\'' + rowId + '\')" data-perm="manageUsers" class="press px-4 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all flex items-center gap-2" title="Force Password Reset"><i class="fa-solid fa-key"></i></button>' +
      '<button onclick="toggleFlagUser(\'' + rowId + '\')" data-perm="manageUsers" class="px-4 py-2.5 text-xs font-bold ' + (d.status === 'flagged' ? 'text-stone-500 hover:text-dark' : 'text-caution hover:text-amber-600') + ' transition-all flex items-center gap-2 press" title="' + (d.status === 'flagged' ? 'Unflag Account' : 'Flag Account') + '"><i class="fa-solid fa-flag"></i></button>' +
      '<button onclick="toggleBanUser(\'' + rowId + '\')" data-perm="manageUsers" class="px-4 py-2.5 text-xs font-bold ' + (d.status === 'banned' ? 'text-stone-500 hover:text-dark' : 'text-danger hover:text-red-600') + ' transition-all flex items-center gap-2 press" title="' + (d.status === 'banned' ? 'Unban Account' : 'Ban Account') + '"><i class="fa-solid fa-ban"></i></button>' +
      '<button onclick="closeModal()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close</button>'
  });
}

// the "Send Message" modal - templates below can pre-fill it
function sendUserMessage(rowId) {
  closeAllMenus();
  var row = document.getElementById(rowId);
  var name = row.dataset.name;
  var email = row.dataset.email;

  openModal({
    title: 'Message ' + name,
    subtitle: 'Always delivered to their in-app inbox',
    bodyHtml:
      '<div class="space-y-4">' +
        '<div>' +
          '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Template</label>' +
          '<select id="f-msg-template" onchange="applyMessageTemplate()" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand transition-all">' +
            '<option value="blank">Write from scratch</option>' +
            '<option value="dispute">Scan dispute follow-up</option>' +
            '<option value="recall">Product recall notice</option>' +
          '</select>' +
        '</div>' +
        '<div>' +
          '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Subject <span class="text-danger">*</span></label>' +
          '<input id="f-msg-subject" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand transition-all" placeholder="e.g. About your recent scan">' +
        '</div>' +
        '<div>' +
          '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Message <span class="text-danger">*</span></label>' +
          '<textarea id="f-msg-body" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm h-36 resize-none focus:outline-none focus:border-brand transition-all" placeholder="Write your message..."></textarea>' +
        '</div>' +
        '<label class="flex items-center gap-2.5 p-3 rounded-xl bg-stone-100 border border-stone-200 cursor-pointer">' +
          '<input type="checkbox" id="f-msg-also-email" checked class="accent-brand w-4 h-4">' +
          '<span class="text-xs text-stone-600">Also send by email to <span class="font-bold text-dark">' + escapeHTML(email) + '</span></span>' +
        '</label>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button onclick="submitUserMessage(\'' + rowId + '\')" data-perm="manageUsers" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Send Message</button>'
  });
}

var MESSAGE_TEMPLATES = {
  blank: { subject: '', body: '' },
  dispute: {
    subject: 'About your recent scan dispute',
    body: "Hi,\n\nThanks for flagging a concern with one of your recent scans. Our team has reviewed the ingredient classification and wanted to follow up with you directly.\n\nIf you still have questions about this result, reply to this message and we'll take another look.\n\nKibbleGuard Safety Team"
  },
  recall: {
    subject: 'Important: product recall affecting a scanned item',
    body: 'Hi,\n\nA product you recently scanned has been included in a manufacturer recall. We recommend discontinuing use immediately and contacting your veterinarian if your pet has shown any symptoms.\n\nFull details are available in the Safety Feed in your app.\n\nKibbleGuard Safety Team'
  }
};

// fills in the subject/body when a template is picked from the dropdown -
// the recall template also force-checks the email box, since a recall is
// urgent enough that in-app alone isn't enough
function applyMessageTemplate() {
  var key = document.getElementById('f-msg-template').value;
  var tpl = MESSAGE_TEMPLATES[key] || MESSAGE_TEMPLATES.blank;
  document.getElementById('f-msg-subject').value = tpl.subject;
  document.getElementById('f-msg-body').value = tpl.body;
  if (key === 'recall') document.getElementById('f-msg-also-email').checked = true;
}

function submitUserMessage(rowId) {
  // in-app notification always goes out, email is optional via the checkbox
  var subject = document.getElementById('f-msg-subject').value.trim();
  var body = document.getElementById('f-msg-body').value.trim();
  if (!subject) {
    showToast('Add a subject before sending', 'danger');
    return;
  }
  if (!body) {
    showToast('Write a message before sending', 'danger');
    return;
  }
  var alsoEmail = document.getElementById('f-msg-also-email').checked;
  var row = document.getElementById(rowId);
  var name = row.dataset.name, email = row.dataset.email;
  saveMessageToHistory(email, { subject: subject, body: body, alsoEmail: alsoEmail, time: new Date().toISOString() });
  closeModal();
  showToast('Sending message to ' + name + '...', 'info');

  var deliveries = [
    queueInAppNotification({ type: 'admin-message', to: email, name: name, subject: subject, message: body })
  ];
  if (alsoEmail) {
    deliveries.push(sendSystemEmail({ type: 'admin-message', to: email, name: name, subject: subject, message: body }));
  }

  Promise.all(deliveries).then(function () {
    showToast('Message sent to ' + name + (alsoEmail ? ' (in-app and email)' : ' (in-app only)'), 'success');
    logAdminAction('Sent message to ' + name + (alsoEmail ? ' (in-app + email): ' : ' (in-app only): ') + subject, 'edit');
  }).catch(function () {
    showToast('Message could not be fully delivered to ' + name, 'danger');
    logAdminAction('Message to ' + name + ' failed to fully deliver: ' + subject, 'edit');
  });
}

// live-updates the "here's what the email will say" preview as an admin
// types a flag/ban reason - kind is 'flag' or 'ban'
function updateAccountEmailPreview(kind) {
  var input = document.getElementById(kind + '-reason-input');
  var preview = document.getElementById(kind + '-email-reason-preview');
  if (!input || !preview) return;
  var text = input.value.trim();
  preview.textContent = text || '[Your reason will appear here as you type]';
  preview.className = text ? 'text-stone-700' : 'italic text-stone-500';
}

// unflagging is instant (no reason needed), flagging opens a modal asking
// for one first - see confirmFlagUser below for the actual flag step
function toggleFlagUser(rowId) {
  closeAllMenus();
  var row = document.getElementById(rowId);
  if (row.dataset.status === 'flagged') {
    // triggered from a dropdown menu item that's already gone by the time this
    // runs (closeAllMenus just closed it), so there's no button left to show a
    // spinner on - still deferred and rollback-safe via withSavingState(null, ...)
    withSavingState(null, '', function () {
      var badge = row.querySelector('.status-badge');
      var kpi = document.getElementById('flagged-kpi');
      var current = parseInt(kpi.textContent.replace(/,/g, ''), 10) || 0;
      var originalRowHtml = row.outerHTML;
      row.dataset.status = 'active';
      row.dataset.flagReason = '';
      badge.className = 'status-badge px-3 py-1 rounded-full bg-safe/10 text-safe text-[9px] font-bold uppercase tracking-widest border border-safe/10';
      badge.textContent = 'Active';
      kpi.textContent = Math.max(0, current - 1);

      try {
        savePersistedRows('kibbleguard-users-rows', document.getElementById('user-table-body'));
      } catch (e) {
        var revertTemp = document.createElement('tbody');
        revertTemp.innerHTML = originalRowHtml;
        row.parentNode.replaceChild(revertTemp.firstElementChild, row);
        kpi.textContent = current;
        throw e;
      }

      showToast(row.dataset.name + '\'s account was unflagged', 'success');
      logAdminAction('Unflagged account: ' + row.dataset.name, 'security');
      refreshTopKpis();
      filterUsers();
    });
    return;
  }

  var firstName = row.dataset.name.split(' ')[0];
  openModal({
    title: 'Flag Account',
    subtitle: row.dataset.name,
    bodyHtml:
      '<p class="text-sm text-stone-600 leading-relaxed mb-4">This marks <span class="font-bold text-dark">' + escapeHTML(row.dataset.name) + '</span> for review. Their account still works normally, since flagging is a watch status, not a restriction.</p>' +
      '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Reason for flagging</label>' +
      '<textarea id="flag-reason-input" oninput="updateAccountEmailPreview(\'flag\')" rows="3" placeholder="What prompted this flag?" class="w-full mt-1.5 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand transition-all resize-none"></textarea>' +
      '<div class="mt-4">' +
        '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5"><i class="fa-solid fa-envelope mr-1"></i>Email preview, sent to ' + escapeHTML(row.dataset.email) + '</p>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark mb-2">Subject: Your KibbleGuard account has been flagged for review</p>' +
          '<p class="text-xs text-stone-600 leading-relaxed">Hi ' + escapeHTML(firstName) + ',<br><br>Your account has been flagged for review by our safety team. Here\'s why:<br><br><span id="flag-email-reason-preview" class="italic text-stone-500">[Your reason will appear here as you type]</span><br><br>Your account still works normally while it\'s under review. If you have questions, reply to this email.<br><br>-- The KibbleGuard Team</p>' +
        '</div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="confirm-flag-btn" onclick="confirmFlagUser(\'' + rowId + '\')" data-perm="manageUsers" class="press px-6 py-2.5 text-xs font-bold text-white bg-caution hover:bg-amber-600 rounded-xl shadow-lg shadow-caution/20 transition-all">Flag Account</button>'
  });
}

// the actual flag, after a reason was entered - flagging is just a watch
// status, the account keeps working normally
function confirmFlagUser(rowId) {
  var reasonEl = document.getElementById('flag-reason-input');
  var reason = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) {
    showToast('Enter a reason before flagging this account', 'danger');
    return;
  }
  var row = document.getElementById(rowId);
  var btn = document.getElementById('confirm-flag-btn');
  withSavingState(btn, 'Flagging...', function () {
    var badge = row.querySelector('.status-badge');
    var kpi = document.getElementById('flagged-kpi');
    var current = parseInt(kpi.textContent.replace(/,/g, ''), 10) || 0;
    var originalRowHtml = row.outerHTML;
    row.dataset.status = 'flagged';
    row.dataset.flagReason = reason;
    badge.className = 'status-badge px-3 py-1 rounded-full bg-caution/10 text-caution text-[9px] font-bold uppercase tracking-widest border border-caution/10';
    badge.textContent = 'Flagged';
    kpi.textContent = current + 1;

    try {
      savePersistedRows('kibbleguard-users-rows', document.getElementById('user-table-body'));
    } catch (e) {
      var revertTemp = document.createElement('tbody');
      revertTemp.innerHTML = originalRowHtml;
      row.parentNode.replaceChild(revertTemp.firstElementChild, row);
      kpi.textContent = current;
      throw e;
    }

    refreshTopKpis();
    closeModal();
    var name = row.dataset.name, email = row.dataset.email;
    showToast('Sending notification email to ' + name + '...', 'info');
    logAdminAction('Flagged account: ' + name + ': "' + reason + '"', 'security');
    sendSystemEmail({ type: 'account-flagged', to: email, name: name, reason: reason }).then(function () {
      showToast(name + '\'s account was flagged, notification email sent', 'danger');
    }).catch(function () {
      showToast(name + '\'s account was flagged, but the notification email failed to send', 'danger');
    });
    filterUsers();
  });
}

// confirmation step before sending a forced reset link
function forcePasswordReset(rowId) {
  closeAllMenus();
  var row = document.getElementById(rowId);
  closeModal();
  openModal({
    title: 'Force Password Reset',
    subtitle: row.dataset.name,
    bodyHtml: '<p class="text-sm text-stone-600 leading-relaxed">This immediately invalidates ' + escapeHTML(row.dataset.name) + '\'s current password and sends a reset link to <span class="font-bold text-dark">' + escapeHTML(row.dataset.email) + '</span>. They won\'t be able to sign in until they set a new one.</p>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button onclick="confirmForcePasswordReset(\'' + rowId + '\')" data-perm="manageUsers" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Send Reset Link</button>'
  });
}

// actually sends the reset email, after confirmation
function confirmForcePasswordReset(rowId) {
  var row = document.getElementById(rowId);
  var name = row.dataset.name, email = row.dataset.email;
  closeModal();
  showToast('Sending password reset link to ' + name + '...', 'info');
  logAdminAction('Force password reset issued to ' + name, 'security');
  sendSystemEmail({ type: 'password-reset', to: email, name: name }).then(function () {
    showToast('Password reset link sent to ' + email, 'success');
  }).catch(function () {
    showToast('Password reset could not be sent to ' + email, 'danger');
  });
}

// unbanning is instant, banning opens a modal asking for a reason first -
// same pattern as flag/unflag above, banning also blocks sign-in entirely
function toggleBanUser(rowId) {
  closeAllMenus();
  var row = document.getElementById(rowId);
  var badge = row.querySelector('.status-badge');
  var bannedKpi = document.getElementById('banned-kpi');
  var bannedCount = parseInt(bannedKpi.textContent.replace(/,/g, ''), 10) || 0;

  if (row.dataset.status === 'banned') {
    // triggered from a dropdown menu item, same reasoning as toggleFlagUser's
    // unflag branch above - no button survives closeAllMenus() to show a
    // spinner on, but the commit is still deferred and rollback-safe
    withSavingState(null, '', function () {
      var originalRowHtml = row.outerHTML;
      row.dataset.status = 'active';
      badge.className = 'status-badge px-3 py-1 rounded-full bg-safe/10 text-safe text-[9px] font-bold uppercase tracking-widest border border-safe/10';
      badge.textContent = 'Active';
      bannedKpi.textContent = Math.max(0, bannedCount - 1);

      try {
        savePersistedRows('kibbleguard-users-rows', document.getElementById('user-table-body'));
      } catch (e) {
        var revertTemp = document.createElement('tbody');
        revertTemp.innerHTML = originalRowHtml;
        row.parentNode.replaceChild(revertTemp.firstElementChild, row);
        bannedKpi.textContent = bannedCount;
        throw e;
      }

      closeModal();
      showToast(row.dataset.name + '\'s account access was restored', 'success');
      logAdminAction('Restored account access: ' + row.dataset.name, 'security');
      refreshTopKpis();
      filterUsers();
    });
    return;
  }

  closeModal();
  var firstName = row.dataset.name.split(' ')[0];
  openModal({
    title: 'Ban Account',
    subtitle: row.dataset.name,
    bodyHtml:
      '<p class="text-sm text-stone-600 leading-relaxed mb-4">This immediately blocks <span class="font-bold text-dark">' + escapeHTML(row.dataset.name) + '</span> from signing in or submitting new scans. Their existing scan history and pet profiles are kept and can be restored by unbanning later.</p>' +
      '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Reason for ban</label>' +
      '<textarea id="ban-reason-input" oninput="updateAccountEmailPreview(\'ban\')" rows="3" placeholder="Why is this account being banned?" class="w-full mt-1.5 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand transition-all resize-none"></textarea>' +
      '<div class="mt-4">' +
        '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5"><i class="fa-solid fa-envelope mr-1"></i>Email preview, sent to ' + escapeHTML(row.dataset.email) + '</p>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark mb-2">Subject: Your KibbleGuard account has been suspended</p>' +
          '<p class="text-xs text-stone-600 leading-relaxed">Hi ' + escapeHTML(firstName) + ',<br><br>Your account has been suspended and you will no longer be able to sign in or submit scans. Here\'s why:<br><br><span id="ban-email-reason-preview" class="italic text-stone-500">[Your reason will appear here as you type]</span><br><br>Your scan history and pet profiles have been kept and can be restored if your account is reinstated. If you believe this is a mistake, reply to this email.<br><br>-- The KibbleGuard Team</p>' +
        '</div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="confirm-ban-btn" onclick="confirmBanUser(\'' + rowId + '\')" data-perm="manageUsers" class="press px-6 py-2.5 text-xs font-bold text-white bg-danger hover:bg-red-600 rounded-xl shadow-lg shadow-danger/20 transition-all">Ban Account</button>'
  });
}

// the actual ban, after a reason was entered
function confirmBanUser(rowId) {
  var reasonEl = document.getElementById('ban-reason-input');
  var reason = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) {
    showToast('Enter a reason before banning this account', 'danger');
    return;
  }
  var row = document.getElementById(rowId);
  var btn = document.getElementById('confirm-ban-btn');
  withSavingState(btn, 'Banning...', function () {
    var badge = row.querySelector('.status-badge');
    var bannedKpi = document.getElementById('banned-kpi');
    var bannedCount = parseInt(bannedKpi.textContent.replace(/,/g, ''), 10) || 0;
    var originalRowHtml = row.outerHTML;
    row.dataset.status = 'banned';
    row.dataset.banReason = reason;
    badge.className = 'status-badge px-3 py-1 rounded-full bg-dark text-white text-[9px] font-bold uppercase tracking-widest border border-dark';
    badge.textContent = 'Banned';
    bannedKpi.textContent = bannedCount + 1;

    try {
      savePersistedRows('kibbleguard-users-rows', document.getElementById('user-table-body'));
    } catch (e) {
      var revertTemp = document.createElement('tbody');
      revertTemp.innerHTML = originalRowHtml;
      row.parentNode.replaceChild(revertTemp.firstElementChild, row);
      bannedKpi.textContent = bannedCount;
      throw e;
    }

    refreshTopKpis();
    closeModal();
    var name = row.dataset.name, email = row.dataset.email;
    showToast('Sending notification email to ' + name + '...', 'info');
    logAdminAction('Banned account: ' + name + ': "' + reason + '"', 'ban');
    sendSystemEmail({ type: 'account-banned', to: email, name: name, reason: reason }).then(function () {
      showToast(name + '\'s account was banned, notification email sent', 'danger');
    }).catch(function () {
      showToast(name + '\'s account was banned, but the notification email failed to send', 'danger');
    });
    filterUsers();
  });
}

// every barangay actually in use right now, used to build the export
// modal's location checkboxes. Region (NCR) and City (Las Piñas City) are
// constant across every seeded user now that the paper's scope is Las
// Piñas only, so filtering by either would be meaningless -- barangay is
// the level that actually varies, so that's the real filter dimension
function getDistinctBarangays() {
  var rows = document.querySelectorAll('#user-table-body tr[data-barangay]');
  var seen = {};
  var barangays = [];
  rows.forEach(function (row) {
    var b = row.dataset.barangay;
    if (b && !seen[b]) { seen[b] = true; barangays.push(b); }
  });
  return barangays;
}

// turns a barangay name into a safe html id
function barangayCheckboxId(barangay) {
  return 'export-barangay-' + barangay.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

// the export modal - date range, status, and barangay filters, all
// separate from the table's own search (though the live count does
// respect whatever's currently searched too). No Role filter here anymore --
// every account is a Pet Owner now, so a filter over a single constant value
// couldn't actually narrow anything down
function openExportOptions() {
  var barangays = getDistinctBarangays();
  var barangayCheckboxes = barangays.map(function (b) {
    return '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-100 border border-stone-200 cursor-pointer text-xs font-bold text-dark">' +
      '<input type="checkbox" id="' + barangayCheckboxId(b) + '" checked class="accent-brand export-filter-input" onchange="updateExportMatchCount()">' + b + '</label>';
  }).join('');

  openModal({
    title: 'Export User Report',
    subtitle: 'Narrow down who to include, then pick the columns',
    wide: true,
    bodyHtml:
      '<div class="space-y-6">' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-filter"></i></span> Step 1 &middot; Which users</p>' +

          '<div class="mb-4">' +
            '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Joined between</label>' +
            '<div class="flex items-center gap-2 mt-1.5">' +
              '<input type="date" id="export-date-from" onchange="updateExportMatchCount()" aria-label="Joined from date" class="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-dark focus:outline-none focus:border-brand transition-all">' +
              '<span class="text-[10px] font-bold text-stone-400">to</span>' +
              '<input type="date" id="export-date-to" onchange="updateExportMatchCount()" aria-label="Joined to date" class="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-dark focus:outline-none focus:border-brand transition-all">' +
            '</div>' +
            '<p class="text-[10px] text-stone-400 mt-1.5" id="export-date-hint">Leave blank to include all join dates.</p>' +
          '</div>' +

          '<div class="mb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Account status</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setExportGroup(\'export-status-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setExportGroup(\'export-status-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="export-status-active" checked class="accent-brand export-filter-input" onchange="updateExportMatchCount()">Active</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="export-status-flagged" checked class="accent-brand export-filter-input" onchange="updateExportMatchCount()">Flagged</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="export-status-banned" checked class="accent-brand export-filter-input" onchange="updateExportMatchCount()">Banned</label>' +
            '</div>' +
          '</div>' +

          (barangays.length > 0 ?
          '<div>' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Barangay (Las Pi&ntilde;as)</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setExportGroup(\'export-barangay-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setExportGroup(\'export-barangay-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' + barangayCheckboxes + '</div>' +
          '</div>' : '') +
        '</div>' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-table-columns"></i></span> Step 2 &middot; Which columns</p>' +
          '<div class="space-y-2">' +
            '<div class="p-3 rounded-xl bg-white border border-stone-200 flex items-center justify-between">' +
              '<div><p class="text-xs font-bold text-dark">Basic Info</p><p class="text-[10px] text-stone-400 mt-0.5">Name, email, account status</p></div>' +
              '<i class="fa-solid fa-lock text-stone-300 text-sm" title="Always included"></i>' +
            '</div>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">Demographics</p><p class="text-[10px] text-stone-400 mt-0.5">Location, feeding style</p></div>' +
              '<input id="export-demographics" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">Pet Records</p><p class="text-[10px] text-stone-400 mt-0.5">Registered pets per owner</p></div>' +
              '<input id="export-pets" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">Scan Activity</p><p class="text-[10px] text-stone-400 mt-0.5">Total scans and warnings</p></div>' +
              '<input id="export-scans" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="flex items-center justify-between p-4 rounded-2xl bg-brand-light border border-brand/10">' +
          '<p class="text-xs font-bold text-dark"><i class="fa-solid fa-users mr-2 text-brand"></i><span id="export-match-count">-</span> will be exported</p>' +
          '<p class="text-[10px] text-stone-500">Also respects the table search</p>' +
        '</div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button onclick="printUserReport()" data-perm="manageUsers" class="press px-5 py-2.5 text-xs font-bold text-dark bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-all"><i class="fa-solid fa-print mr-1.5"></i>Print / PDF</button>' +
      '<button onclick="exportReport()" data-perm="manageUsers" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Export CSV</button>'
  });

  updateExportMatchCount();
}

// the "All / None" shortcut links next to each checkbox group
function setExportGroup(prefix, checked) {
  document.querySelectorAll('.export-filter-input').forEach(function (el) {
    if (el.id.indexOf(prefix) === 0) el.checked = checked;
  });
  updateExportMatchCount();
}

// this is the ONE place that decides what counts as a match.
// both the live "X users match" counter and the actual CSV export call this,
// so they can't ever disagree with each other
function getMatchingUserRows() {
  var allowedStatus = {
    active: document.getElementById('export-status-active').checked,
    flagged: document.getElementById('export-status-flagged').checked,
    banned: document.getElementById('export-status-banned').checked
  };
  var barangays = getDistinctBarangays();
  var allowedBarangay = {};
  barangays.forEach(function (b) {
    var el = document.getElementById(barangayCheckboxId(b));
    allowedBarangay[b] = el ? el.checked : true;
  });

  var fromEl = document.getElementById('export-date-from');
  var toEl = document.getElementById('export-date-to');
  var fromTime = fromEl && fromEl.value ? new Date(fromEl.value + 'T00:00:00').getTime() : null;
  var toTime = toEl && toEl.value ? new Date(toEl.value + 'T23:59:59').getTime() : null;

  var rows = document.querySelectorAll('#user-table-body tr[data-search]');
  var matched = [];
  rows.forEach(function (row) {
    if (row.dataset.filterMatch === 'false') return;
    var d = row.dataset;
    if (!allowedStatus[d.status]) return;
    if (d.barangay && barangays.length > 0 && !allowedBarangay[d.barangay]) return;
    if (d.joinedDate) {
      var joined = new Date(d.joinedDate + 'T12:00:00').getTime();
      if (fromTime !== null && joined < fromTime) return;
      if (toTime !== null && joined > toTime) return;
    }
    matched.push(row);
  });
  return matched;
}

// catches a backwards date range and says so directly.
// instead of just showing "0 users match" and leaving you to guess why, you'd probably
// start unchecking status/role boxes before noticing the dates are swapped
function isExportDateRangeInvalid() {
  var fromEl = document.getElementById('export-date-from');
  var toEl = document.getElementById('export-date-to');
  if (!fromEl.value || !toEl.value) return false;
  return new Date(fromEl.value + 'T00:00:00').getTime() > new Date(toEl.value + 'T23:59:59').getTime();
}

// updates the live count in the export modal.
// also handles showing the "bad date range" message instead of a count when that happens
function updateExportMatchCount() {
  var total = document.querySelectorAll('#user-table-body tr[data-search]').length;
  var el = document.getElementById('export-match-count');
  var hint = document.getElementById('export-date-hint');

  if (isExportDateRangeInvalid()) {
    if (el) el.textContent = 'End date is before the start date';
    if (hint) { hint.textContent = 'Fix the date range above to see how many users match.'; hint.className = 'text-[10px] text-danger font-bold mt-1.5'; }
    return;
  }
  if (hint) { hint.textContent = 'Leave blank to include all join dates.'; hint.className = 'text-[10px] text-stone-400 mt-1.5'; }

  var matched = getMatchingUserRows().length;
  if (el) el.textContent = matched + ' of ' + total + ' users';
}

// shared validation for both the CSV export and the Print/PDF view --
// returns the matched rows, or null (after showing why) if there's
// nothing to export yet
function validateUserExportSelection() {
  if (isExportDateRangeInvalid()) {
    showToast('End date must be after the start date', 'danger');
    return null;
  }
  var statusChecked = document.getElementById('export-status-active').checked ||
    document.getElementById('export-status-flagged').checked || document.getElementById('export-status-banned').checked;
  var barangayChecked = getDistinctBarangays().length === 0 || Array.from(document.querySelectorAll('.export-filter-input')).some(function (el) {
    return el.id.indexOf('export-barangay-') === 0 && el.checked;
  });
  if (!statusChecked) {
    showToast('Select at least one account status to export', 'danger');
    return null;
  }
  if (!barangayChecked) {
    showToast('Select at least one barangay to export', 'danger');
    return null;
  }
  var matchedRows = getMatchingUserRows();
  if (matchedRows.length === 0) {
    showToast('No users match the selected filters', 'danger');
    return null;
  }
  return matchedRows;
}

// builds the exact same headers/rows for the CSV and the Print/PDF view,
// so they can never disagree about what got included
function buildUserExportTable(matchedRows) {
  var includeDemo = document.getElementById('export-demographics').checked;
  var includePets = document.getElementById('export-pets').checked;
  var includeScans = document.getElementById('export-scans').checked;

  var headers = ['Name', 'Email', 'Status'];
  if (includeDemo) headers = headers.concat(['Country', 'Region', 'City', 'Barangay', 'Feeding Style', 'Owned Animals']);
  if (includePets) headers.push('Pets');
  if (includeScans) headers.push('Scans');

  var rows = matchedRows.map(function (row) {
    var d = row.dataset;
    var fields = [d.name, d.email, d.status];
    if (includeDemo) {
      fields = fields.concat([d.country || '', d.region || '', d.city || '', d.barangay || '', d.feedingStyle || '', d.ownedAnimals || '']);
    }
    if (includePets) fields.push(d.pets.replace(/&middot;/g, '-'));
    if (includeScans) fields.push(d.scans.replace(/&middot;/g, '-'));
    return fields;
  });

  return { headers: headers, rows: rows };
}

// builds and downloads the actual CSV file from whatever matched
function exportReport() {
  var matchedRows = validateUserExportSelection();
  if (!matchedRows) return;

  closeModal();
  var table = buildUserExportTable(matchedRows);
  var lines = [table.headers.join(',')];
  table.rows.forEach(function (fields) {
    lines.push(fields.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(','));
  });

  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'kibbleguard-user-report.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('User report exported', 'success');
}

// same matched rows/columns as exportReport() above, just handed to the
// browser's print dialog (with "Save as PDF") instead of downloaded as a CSV
function printUserReport() {
  var matchedRows = validateUserExportSelection();
  if (!matchedRows) return;

  closeModal();
  var table = buildUserExportTable(matchedRows);
  var total = document.querySelectorAll('#user-table-body tr[data-search]').length;
  openPrintReport({
    title: 'User Report',
    subtitle: 'KibbleGuard · Users & Pets',
    filterSummary: [matchedRows.length + ' of ' + total + ' users'],
    headers: table.headers,
    rows: table.rows
  });
}

/* ---------- Pet Sensitivity & Risk Profile: computed live from the table ---------- */
// parses the raw pet data packed into each row's dataset (pipe and
// semicolon separated, one pet's fields per segment) rather than pulling
// from a separate source
// the Active / Flagged / Banned / Registered Pets KPI cards at the top of the page -
// active counts only rows with data-status="active" (excluding flagged/
// banned), while pet count sums data-owned-animals across every row
// regardless of the owner's status, since a flagged owner's pets are
// still genuinely registered
function refreshTopKpis() {
  var rows = document.querySelectorAll('#user-table-body tr[data-search]');
  var activeCount = 0, flaggedCount = 0, bannedCount = 0;
  var petCount = 0;
  rows.forEach(function (row) {
    if (row.dataset.status === 'active') activeCount++;
    if (row.dataset.status === 'flagged') flaggedCount++;
    if (row.dataset.status === 'banned') bannedCount++;
    petCount += parseInt(row.dataset.ownedAnimals, 10) || 0;
  });
  var activeEl = document.getElementById('active-users-kpi');
  var petEl = document.getElementById('registered-pets-kpi');
  var flaggedEl = document.getElementById('flagged-kpi');
  var bannedEl = document.getElementById('banned-kpi');
  if (activeEl) activeEl.textContent = activeCount.toLocaleString();
  if (petEl) petEl.textContent = petCount.toLocaleString();
  // all four cards are counted from the same rows, so none can contradict the table
  if (flaggedEl) flaggedEl.textContent = flaggedCount.toLocaleString();
  if (bannedEl) bannedEl.textContent = bannedCount.toLocaleString();
}
refreshTopKpis();

// this section used to be generic breed/weight demographics, which had no
// real connection to the thesis (nothing else in the system classifies
// risk by breed). Replaced with something that ties into the actual
// problem the system solves: each "sensitivity" a pet owner reports is a
// substance name, and the whole reason the Ingredient Database keeps
// separate Canine/Feline classifications is that species react
// differently to the same substance -- this applies that same lens to the
// pets actually registered, instead of guessing at breed trivia
function computePetDemographics() {
  var rows = document.querySelectorAll('#user-table-body tr[data-search]');
  var totalPets = 0;
  var petsWithSensitivity = 0;
  var sensitivityStats = {}; // name -> { count, canine, feline }

  rows.forEach(function (row) {
    row.dataset.pets.split(';').forEach(function (p) {
      var parts = p.split('|');
      var species = parts[1]; // 'dog' or 'cat'
      totalPets++;

      if (parts[3] && parts[3] !== 'None reported') {
        petsWithSensitivity++;
        parts[3].split(',').forEach(function (a) {
          var name = a.trim();
          if (!sensitivityStats[name]) sensitivityStats[name] = { count: 0, canine: false, feline: false };
          sensitivityStats[name].count++;
          if (species === 'dog') sensitivityStats[name].canine = true;
          if (species === 'cat') sensitivityStats[name].feline = true;
        });
      }
    });
  });

  var sensitivityNames = Object.keys(sensitivityStats);
  var topName = sensitivityNames.sort(function (a, b) { return sensitivityStats[b].count - sensitivityStats[a].count; })[0];

  document.getElementById('demo-pets-with-sensitivity').textContent = totalPets
    ? petsWithSensitivity + ' of ' + totalPets + ' (' + Math.round((petsWithSensitivity / totalPets) * 100) + '%)'
    : 'No data yet';
  document.getElementById('demo-distinct-sensitivities').textContent = sensitivityNames.length || 'None reported';
  document.getElementById('demo-top-allergen').textContent = topName
    ? topName + ' (' + sensitivityStats[topName].count + ' pet' + (sensitivityStats[topName].count === 1 ? '' : 's') + ')'
    : 'None flagged';

  renderSensitivityTable(sensitivityStats);
}

// the full breakdown behind the 3 tiles above -- every distinct
// sensitivity, most-reported first, with which species it actually
// showed up in (a sensitivity can affect both, and this says so honestly
// rather than picking one). Collapsed to the top few by default -- with
// real seed data this is a short list, but if enough owners report enough
// distinct sensitivities to make the table tall, a "Show all" toggle keeps
// the dashboard scannable instead of letting it grow forever.
var SENSITIVITY_TABLE_LIMIT = 5;
var sensitivityTableExpanded = false;
var lastSensitivityStats = null;

function renderSensitivityTable(sensitivityStats) {
  lastSensitivityStats = sensitivityStats;
  var tbody = document.getElementById('sensitivity-table-body');
  var emptyEl = document.getElementById('sensitivity-table-empty');
  var toggleWrap = document.getElementById('sensitivity-table-toggle-wrap');
  var toggleBtn = document.getElementById('sensitivity-table-toggle-btn');
  if (!tbody) return;

  var names = Object.keys(sensitivityStats).sort(function (a, b) { return sensitivityStats[b].count - sensitivityStats[a].count; });

  if (names.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (toggleWrap) toggleWrap.classList.add('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  var visibleNames = sensitivityTableExpanded ? names : names.slice(0, SENSITIVITY_TABLE_LIMIT);

  tbody.innerHTML = visibleNames.map(function (name) {
    var s = sensitivityStats[name];
    var speciesLabels = [];
    if (s.canine) speciesLabels.push('Canine');
    if (s.feline) speciesLabels.push('Feline');

    return '<tr class="hover:bg-stone-50/50">' +
      '<td class="px-4 py-3 font-bold text-dark">' + escapeHTML(name) + '</td>' +
      '<td class="px-4 py-3 text-stone-600">' + s.count + '</td>' +
      '<td class="px-4 py-3 text-stone-600">' + escapeHTML(speciesLabels.join(', ')) + '</td>' +
    '</tr>';
  }).join('');

  if (toggleWrap && toggleBtn) {
    if (names.length > SENSITIVITY_TABLE_LIMIT) {
      toggleWrap.classList.remove('hidden');
      toggleBtn.textContent = sensitivityTableExpanded
        ? 'Show top ' + SENSITIVITY_TABLE_LIMIT
        : 'Show all (' + names.length + ')';
    } else {
      toggleWrap.classList.add('hidden');
    }
  }
}

// flips the expand/collapse state and re-renders from the same stats the
// last computePetDemographics() pass produced -- never recomputes, so the
// toggle can never show different numbers than the tiles above it
function toggleSensitivityTableExpand() {
  sensitivityTableExpanded = !sensitivityTableExpanded;
  if (lastSensitivityStats) renderSensitivityTable(lastSensitivityStats);
}
computePetDemographics();

function refreshDisputeStatusFromScans() {
  // this page and OCR Scan Records don't talk to each other automatically -
  // resolving a dispute over there doesn't touch this page's "1 Dispute
  // Pending" text unless something explicitly checks, which is this
  document.querySelectorAll('#user-table-body tr[data-scans]').forEach(function (row) {
    var disputeLink = row.querySelector('a[href*="ocr-scans.html?inspect="]');
    if (!disputeLink) return;
    var scanIdMatch = disputeLink.getAttribute('href').match(/inspect=([^&]+)/);
    if (!scanIdMatch) return;
    var scanId = decodeURIComponent(scanIdMatch[1]);
    if (typeof isDisputeResolved !== 'function' || !isDisputeResolved(scanId)) return;
    row.dataset.scans = row.dataset.scans.replace(/\s*&middot;\s*\d+\s*Disputes?\s*Pending/i, '').replace(/\s*\u00b7\s*\d+\s*Disputes?\s*Pending/i, '').trim();
    disputeLink.remove();
  });
}
refreshDisputeStatusFromScans();

// Total Scans and Risk Warnings come from the real scan records now (same
// saved rows OCR Scan Records uses), so the counts match the list the
// profile's "Total Scans" / "Warnings" buttons open. Unchanged until OCR
// Scan Records has been opened once in this browser.
function refreshScanStatsFromRecords() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-scans-rows')); } catch (e) { saved = null; }
  if (!saved || !saved.length) return;
  var tmp = document.createElement('table');
  tmp.innerHTML = '<tbody>' + saved.join('') + '</tbody>';
  var stats = {};
  Array.prototype.forEach.call(tmp.querySelectorAll('tr[data-verdict]'), function (r) {
    var n = r.querySelector('td:nth-child(3) p.font-bold');
    if (!n) return;
    var k = n.textContent.trim();
    var s = stats[k] || (stats[k] = { n: 0, w: 0 });
    s.n++;
    if (r.dataset.verdict === 'toxic' || r.dataset.verdict === 'caution') s.w++;
  });
  document.querySelectorAll('#user-table-body tr[data-scans]').forEach(function (row) {
    var s = stats[row.dataset.name] || { n: 0, w: 0 };
    var cell = row.querySelector('td:nth-child(3) > div');
    if (!cell) return;
    var sc = s.n + ' Scan' + (s.n === 1 ? '' : 's');
    var wt = s.w + ' Risk Warning' + (s.w === 1 ? '' : 's') + ' triggered';
    row.dataset.scans = sc + ' \u00b7 ' + wt;
    cell.querySelector('p').textContent = sc;
    if (!cell.querySelector('a')) {
      var p = cell.querySelectorAll('p')[1];
      if (!p) { p = document.createElement('p'); p.className = 'text-[10px] text-stone-400 font-medium'; cell.appendChild(p); }
      p.textContent = wt;
    }
  });
}
refreshScanStatsFromRecords();

initScrollFadeIndicators();

renderNavBadges();
applyRoleState();
restrictPageToRoles(['chief', 'support']);
filterUsers();   // also refreshes the "Showing all N users" label from the real rows

// lets other pages (like the Inquiries admin page's Account Flag/Suspension
// Appeal shortcut) link straight to one user's profile instead of making
// the admin search for them by hand
var deepLinkOpenProfile = new URLSearchParams(window.location.search).get('openProfile');
if (deepLinkOpenProfile && document.getElementById(deepLinkOpenProfile)) {
  viewUserProfile(deepLinkOpenProfile);
}

/* ---------- Refresh ----------
   Re-reads the saved owner rows (so another admin's flag/ban shows up) and the scan
   records, then redraws the KPIs, sensitivity table and list in place, keeping the
   current search, filter and page. */
function refreshUsers() {
  closeAllMenus();
  var tbody = document.getElementById('user-table-body');
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-users-rows')); } catch (e) { saved = null; }
  if (tbody && saved && saved.length) { tbody.innerHTML = saved.join(''); markRowsLoaded('kibbleguard-users-rows'); }
  refreshDisputeStatusFromScans();
  refreshScanStatsFromRecords();
  refreshTopKpis();
  computePetDemographics();
  var page = PAGINATION_STATE['user-table-body'] || 1;
  filterUsers();
  if (page > 1) {
    PAGINATION_STATE['user-table-body'] = page;
    applyTablePagination('user-table-body', 'user-pagination-controls', 10, false);
  }
  applyPermissionGating();
  renderNavBadges();
}
initRefreshControl({ key: 'users-pets', label: 'Users & Pets', onRefresh: refreshUsers, auto: false });

/* ---------- Activity categories ---------- */
var ACTIVITY_CATEGORIES = {
  verify:   { icon: 'fa-check-double',   cls: 'bg-safe/10 text-safe' },
  merge:    { icon: 'fa-code-merge',     cls: 'bg-brand-light text-brand' },
  add:      { icon: 'fa-plus',           cls: 'bg-brand-light text-brand' },
  edit:     { icon: 'fa-pen',            cls: 'bg-stone-100 text-stone-500' },
  publish:  { icon: 'fa-bullhorn',       cls: 'bg-brand-light text-brand' },
  delete:   { icon: 'fa-trash',          cls: 'bg-danger/10 text-danger' },
  ban:      { icon: 'fa-user-slash',     cls: 'bg-danger/10 text-danger' },
  dispute:  { icon: 'fa-comment-dots',   cls: 'bg-amber-50 text-amber-500' },
  inquiry:  { icon: 'fa-headset',        cls: 'bg-brand-light text-brand' },
  security: { icon: 'fa-shield-halved',  cls: 'bg-caution/10 text-caution' },
  settings: { icon: 'fa-gear',           cls: 'bg-stone-100 text-stone-500' }
};

var CATEGORY_GROUPS = {
  verify: 'verify',
  merge: 'content', add: 'content', edit: 'content', publish: 'content', delete: 'content',
  ban: 'users', dispute: 'users', inquiry: 'users',
  security: 'security', settings: 'security'
};

var currentLogCategoryFilter = 'all';

// this page renders its list from scratch every time (a div of cards, not
// a <table>), so it can't reuse the shared applyTablePagination() that the
// other big tables use -- that one specifically looks for <tr data-search>
// rows in a <tbody>. Same idea, just done locally: slice the entries array
// to the current page before building the HTML.
var currentLogPage = 1;
// the entries currently on screen, in the same order as the rows - lets a
// row's onclick hand its index to openActivityEntryQuickView() instead of
// re-finding itself in the full (filtered, paginated) list
var currentLogPageEntries = [];
var LOG_ROWS_PER_PAGE = 10;

// example entries so this page isn't empty before anything real has
// happened yet. actual logged actions (from logAdminAction in app.js)
// get added on top of these when the page renders
var SEEDED_ACTIVITY = [];

// merges the real, logged entries with the seed examples, newest first
function getAllActivityEntries() {
  var live = [];
  try { live = JSON.parse(localStorage.getItem('kibbleguard-activity-log') || '[]'); } catch (e) { live = []; }
  return live.concat(SEEDED_ACTIVITY).sort(function (a, b) {
    return new Date(b.time) - new Date(a.time);
  });
}

// "5m ago" / "3h ago" / "2d ago" style, falls back to a plain date
// once it's been more than a week
function relativeTime(isoString) {
  var diffMs = Math.max(0, Date.now() - new Date(isoString).getTime());
  var mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  var d = new Date(isoString);
  var MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MONTH[d.getMonth()] + ' ' + d.getDate();
}

// keeps every filter control's "this one is active" green outline and the Clear
// filters button in step with the actual filter values
function syncLogFilterUI() {
  var cat = document.getElementById('log-filter-category');
  var admin = document.getElementById('log-admin-filter');
  var from = document.getElementById('log-date-from');
  var to = document.getElementById('log-date-to');
  if (cat) cat.value = currentLogCategoryFilter;
  var anyActive = false;
  [[cat, cat && cat.value !== 'all'], [admin, admin && admin.value !== 'all'], [from, from && from.value !== ''], [to, to && to.value !== '']].forEach(function (pair) {
    var el = pair[0], active = !!pair[1];
    if (!el) return;
    if (active) anyActive = true;
    el.classList.toggle('border-brand', active);
    el.classList.toggle('bg-brand-light', active);
    el.classList.toggle('text-brand', active);
    el.classList.toggle('border-stone-200', !active);
    el.classList.toggle('bg-stone-100', !active);
    el.classList.toggle('text-dark', !active);
  });
  var clearBtn = document.getElementById('log-clear-filters');
  if (clearBtn) clearBtn.classList.toggle('hidden', !anyActive);
}

// Category dropdown: all / verify / content / users / security -- "content" groups
// together merge/add/edit/publish/delete since those are all changes to
// what's actually in the database, not a single category of their own
function setLogCategoryFilter(group) {
  currentLogCategoryFilter = group;
  renderActivityLog();
}

// checks for the from/to dates being swapped so we can say that directly,
// instead of just silently showing 0 results and making you figure out why
function isLogDateRangeInvalid() {
  var fromVal = document.getElementById('log-date-from').value;
  var toVal = document.getElementById('log-date-to').value;
  if (!fromVal || !toVal) return false;
  return new Date(fromVal + 'T00:00:00').getTime() > new Date(toVal + 'T23:59:59').getTime();
}

// both the on-screen list and the CSV export pull from this same function,
// so the export can never show something different from what's on the page
function getFilteredActivityEntries() {
  var adminFilter = document.getElementById('log-admin-filter').value;
  var fromVal = document.getElementById('log-date-from').value;
  var toVal = document.getElementById('log-date-to').value;
  var fromTime = fromVal ? new Date(fromVal + 'T00:00:00').getTime() : null;
  var toTime = toVal ? new Date(toVal + 'T23:59:59').getTime() : null;

  return getAllActivityEntries().filter(function (e) {
    var groupMatch = currentLogCategoryFilter === 'all' || CATEGORY_GROUPS[e.category] === currentLogCategoryFilter;
    var adminMatch = adminFilter === 'all' || e.admin === adminFilter;
    var t = new Date(e.time).getTime();
    var fromMatch = fromTime === null || t >= fromTime;
    var toMatch = toTime === null || t <= toTime;
    return groupMatch && adminMatch && fromMatch && toMatch;
  });
}

// the "Clear filters" button - resets everything back to showing all entries
function clearLogFilters() {
  document.getElementById('log-admin-filter').value = 'all';
  document.getElementById('log-date-from').value = '';
  document.getElementById('log-date-to').value = '';
  setLogCategoryFilter('all');
}

// the main render.
// shows the "bad date range" message instead of the list when that's the
// problem, otherwise draws the current page of filtered entries.
// resetPage defaults to true (any filter/search change starts back at page
// 1); only the Previous/Next buttons themselves pass false so paging
// forward doesn't get immediately reset by its own re-render.
// the Admin dropdown used to be three hardcoded names, so anyone invited later never
// appeared in it. It's now built from the real admin team plus every name already in the log
// (that keeps people who were removed later, and "Unknown admin", filterable).
// Only rebuilt when the list actually changes, and the current choice is kept.
function populateLogAdminFilter() {
  var select = document.getElementById('log-admin-filter');
  if (!select) return;
  var names = [];
  function add(n) { if (n && names.indexOf(n) === -1) names.push(n); }
  getAdminAccounts().forEach(function (a) { if (a.status !== 'pending') add(a.name); });
  getAllActivityEntries().forEach(function (e) { add(e.admin); });
  names.sort(function (a, b) { return a.localeCompare(b); });

  var current = select.value || 'all';
  var signature = names.join('|');
  if (select.dataset.signature === signature) return;
  select.dataset.signature = signature;
  select.innerHTML = '<option value="all">All admins</option>' + names.map(function (n) {
    return '<option value="' + escapeHTML(n) + '">' + escapeHTML(n) + '</option>';
  }).join('');
  select.value = names.indexOf(current) !== -1 ? current : 'all';
}

// back-compat for every entry logged before logAdminAction() took a "link" --
// those rows have no link field and never will, so this reads a scan or
// ticket ID straight out of the free-form text instead, the same way an
// admin reading the sentence would. A name match (e.g. "Sent message to
// John Bartolata") isn't attempted here: unlike a scan or ticket ID there's
// no reliable, collision-free account identifier sitting in that text.
function inferActivityLogLink(text) {
  if (!text) return null;
  var ticketMatch = /ticket_\d+/.exec(text);
  if (ticketMatch) return 'inquiries.html?inspect=' + encodeURIComponent(ticketMatch[0]);
  var scanMatch = /#?(KB-\d+)/.exec(text);
  if (scanMatch) return 'ocr-scans.html?inspect=' + encodeURIComponent(scanMatch[1]);
  return null;
}

/* ---------- Quick-view popup ----------
   Clicking a row opens the record right here instead of leaving the Activity
   Log. A scan or inquiry mentioned in the text gets a real detail view, built
   straight from the same RECORD_TRACES / INQUIRY_RECORDS db-sync.js already
   loads on every admin page (including this one); anything else (an account,
   an alert, an ingredient, a settings change) falls back to showing the log
   line itself plus a link to the page that has the full record, since there's
   no shared structured data for those on this page to pull from. */
function openActivityEntryQuickView(i) {
  var e = currentLogPageEntries[i];
  if (!e) return;
  var scanMatch = /#?(KB-\d+)/.exec(e.text);
  if (scanMatch && typeof RECORD_TRACES !== 'undefined' && RECORD_TRACES[scanMatch[1]]) {
    openScanQuickView(scanMatch[1], e);
    return;
  }
  var ticketMatch = /ticket_\d+/.exec(e.text);
  if (ticketMatch && typeof INQUIRY_RECORDS !== 'undefined' && INQUIRY_RECORDS[ticketMatch[0]]) {
    openInquiryQuickView(ticketMatch[0], e);
    return;
  }
  openGenericQuickView(e, e.link || inferActivityLogLink(e.text));
}

function openScanQuickView(scanId, e) {
  var data = RECORD_TRACES[scanId];
  var scoreColor = data.rating === 'Safe' ? 'text-safe border-safe' : data.rating === 'Caution' ? 'text-caution border-caution' : data.rating === 'Toxic' ? 'text-danger border-danger' : 'text-stone-400 border-stone-300';
  var allergyMatches = (data.substances || []).filter(function (s) { return !!s.allergy; });
  var ingredientsHtml = (data.substances || []).map(function (s) {
    // app.js's riskBadgeHtml() only knows Safe/Caution/Toxic (the page-specific
    // overrides that handle "Unrated" too live in ocr-scans.js etc., which
    // aren't loaded here) -- fall back to the same "Not Rated" styling those
    // pages use instead of letting an unrecognized ingredient render green
    var badgeHtml = (s.level === 'Safe' || s.level === 'Caution' || s.level === 'Toxic')
      ? riskBadgeHtml(s.level)
      : '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 text-stone-400 border-stone-200 font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid fa-circle-question"></i> Not Rated</span>';
    return '<div class="flex items-start justify-between gap-3 p-3 rounded-xl border ' + (s.allergy ? 'border-danger/20 bg-danger/5' : 'border-stone-200 bg-stone-100/50') + '">' +
      '<div class="min-w-0 flex-1">' +
        '<p class="text-xs font-bold text-dark truncate">' + escapeHTML(s.name) + '</p>' +
        (s.allergy
          ? '<p class="text-[10px] font-bold text-danger mt-0.5 leading-snug"><i class="fa-solid fa-paw mr-1"></i>' + escapeHTML(s.allergy.message) + '</p>'
          : '<p class="text-[10px] text-stone-400">' + escapeHTML(s.category || '') + '</p>') +
      '</div>' +
      badgeHtml +
    '</div>';
  }).join('');
  var imageHtml = data.imageUrl
    ? '<img src="' + escapeHTML(data.imageUrl) + '" alt="Captured label" class="w-full max-h-56 object-contain rounded-2xl border border-stone-200 bg-stone-100 mb-4" onerror="this.style.display=\'none\'">'
    : '';
  openModal({
    title: data.product || 'Pet Food Scan',
    subtitle: '#' + scanId + (data.timestamp ? ' · ' + data.timestamp : ''),
    wide: true,
    bodyHtml:
      '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 mb-4">' +
        '<p class="text-xs font-bold text-dark leading-snug mb-1">' + escapeHTML(e.text) + '</p>' +
        '<p class="text-[11px] text-stone-400">' + escapeHTML(e.admin) + ' · ' + relativeTime(e.time) + '</p>' +
      '</div>' +
      '<div class="flex items-center gap-5 mb-4 p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
        '<div class="w-16 h-16 rounded-full border-4 ' + scoreColor + ' flex flex-col items-center justify-center shrink-0 bg-white">' +
          '<span class="text-lg font-display font-bold ' + scoreColor.split(' ')[0] + ' leading-none">' + (data.score == null ? '&mdash;' : data.score) + '</span>' +
        '</div>' +
        '<div>' +
          (data.rating ? verdictBadgeHtml(data.rating) : '') +
          '<p class="text-[11px] text-stone-500 mt-2">' + (data.species === 'feline' ? 'Feline' : 'Canine') + ' · OCR confidence ' + escapeHTML(data.confidence || 'Not measured') + '</p>' +
        '</div>' +
      '</div>' +
      (allergyMatches.length
        ? '<div class="flex items-start gap-3 p-4 rounded-2xl bg-danger/5 border border-danger/10 mb-4"><i class="fa-solid fa-paw text-danger mt-0.5"></i><p class="text-[11px] text-stone-600 leading-relaxed">' + allergyMatches.map(function (s) { return escapeHTML(s.allergy.message); }).join(' ') + '</p></div>'
        : '') +
      imageHtml +
      '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">Ingredients</p>' +
      '<div class="space-y-2">' + (ingredientsHtml || '<p class="text-xs text-stone-400">No ingredient data on this trace.</p>') + '</div>',
    footerHtml:
      '<a href="ocr-scans.html?inspect=' + encodeURIComponent(scanId) + '" class="px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Open Full Record</a>' +
      '<button onclick="closeModal()" class="px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close</button>'
  });
}

function openInquiryQuickView(inquiryId, e) {
  var d = INQUIRY_RECORDS[inquiryId];
  openModal({
    title: 'Inquiry ' + inquiryId,
    subtitle: (d.owner || 'Unknown owner') + (d.timestamp ? ' · ' + relativeTime(d.timestamp) : ''),
    wide: true,
    bodyHtml:
      '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 mb-4">' +
        '<p class="text-xs font-bold text-dark leading-snug mb-1">' + escapeHTML(e.text) + '</p>' +
        '<p class="text-[11px] text-stone-400">' + escapeHTML(e.admin) + ' · ' + relativeTime(e.time) + '</p>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-4 mb-4">' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">From</p><p class="text-sm font-bold text-dark">' + escapeHTML(d.owner || 'Unknown') + '</p>' + (d.ownerEmail ? '<p class="text-[11px] text-stone-400 truncate">' + escapeHTML(d.ownerEmail) + '</p>' : '') + '</div>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Category</p><p class="text-sm font-bold text-dark">' + escapeHTML(d.category || 'General') + '</p></div>' +
      '</div>' +
      '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">Original Message</p>' +
      '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200"><p class="text-sm text-dark leading-relaxed">' + escapeHTML(d.message || '') + '</p></div>',
    footerHtml:
      '<a href="inquiries.html?inspect=' + encodeURIComponent(inquiryId) + '" class="px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Open Full Record</a>' +
      '<button onclick="closeModal()" class="px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close</button>'
  });
}

// everything that isn't a scan or inquiry (an account, an alert, an
// ingredient, a settings change) - no shared structured data to pull from
// here, so this just surfaces the log line itself plus, when a target page
// is known, a way to get to the real record
function openGenericQuickView(e, link) {
  var cat = ACTIVITY_CATEGORIES[e.category] || ACTIVITY_CATEGORIES.settings;
  var label = e.category ? e.category.charAt(0).toUpperCase() + e.category.slice(1) : 'Admin';
  openModal({
    title: label + ' Action',
    subtitle: e.admin + ' · ' + relativeTime(e.time),
    bodyHtml:
      '<div class="flex items-start gap-4">' +
        '<div class="w-10 h-10 rounded-xl ' + cat.cls + ' flex items-center justify-center text-sm shrink-0"><i class="fa-solid ' + cat.icon + '"></i></div>' +
        '<p class="text-sm text-dark leading-relaxed">' + escapeHTML(e.text) + '</p>' +
      '</div>',
    footerHtml:
      (link ? '<a href="' + escapeHTML(link) + '" class="px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Open Full Record</a>' : '') +
      '<button onclick="closeModal()" class="px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close</button>'
  });
}

function renderActivityLog(resetPage) {
  var countEl = document.getElementById('log-visible-count');
  populateLogAdminFilter();
  syncLogFilterUI();
  computeLogKpis();
  if (resetPage !== false) currentLogPage = 1;

  if (isLogDateRangeInvalid()) {
    document.getElementById('activity-log-list').innerHTML = '';
    document.getElementById('activity-log-empty').classList.remove('hidden');
    document.getElementById('log-pagination-controls').innerHTML = '';
    if (countEl) countEl.textContent = 'End date is before the start date';
    return;
  }

  var entries = getFilteredActivityEntries();
  var total = getAllActivityEntries().length;

  var totalPages = Math.max(1, Math.ceil(entries.length / LOG_ROWS_PER_PAGE));
  if (currentLogPage > totalPages) currentLogPage = totalPages;
  var pageEntries = entries.slice((currentLogPage - 1) * LOG_ROWS_PER_PAGE, currentLogPage * LOG_ROWS_PER_PAGE);

  // kept so a row's onclick can look itself back up by position without
  // having to round-trip the whole entry through an HTML attribute
  currentLogPageEntries = pageEntries;

  var list = document.getElementById('activity-log-list');
  list.innerHTML = pageEntries.map(function (e, i) {
    var cat = ACTIVITY_CATEGORIES[e.category] || ACTIVITY_CATEGORIES.settings;
    // escaping matters a lot on this page specifically - almost every ban
    // reason, dispute reply, and message subject in the whole app ends up
    // logged here eventually, so this is the one place that has to be safe
    // no matter where the text originally came from.
    // every row opens a quick-view popup in place, instead of navigating off
    // the Activity Log entirely - see openActivityEntryQuickView() below
    return '<div class="p-5 flex items-center gap-4 hover:bg-stone-50 transition-colors cursor-pointer" onclick="openActivityEntryQuickView(' + i + ')">' +
      '<div class="w-9 h-9 rounded-xl ' + cat.cls + ' flex items-center justify-center text-sm shrink-0"><i class="fa-solid ' + cat.icon + '"></i></div>' +
      '<div class="flex-1 min-w-0">' +
        '<p class="text-sm font-bold text-dark leading-snug">' + escapeHTML(e.text) + '</p>' +
        '<p class="text-[11px] text-stone-400 mt-1">' + escapeHTML(e.admin) + '</p>' +
      '</div>' +
      '<span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest shrink-0">' + relativeTime(e.time) + '</span>' +
      '<i class="fa-solid fa-chevron-right text-stone-300 text-xs shrink-0"></i>' +
    '</div>';
  }).join('');

  if (countEl) countEl.textContent = entries.length + ' of ' + total + ' actions';

  document.getElementById('activity-log-empty').classList.toggle('hidden', entries.length !== 0);
  renderLogPaginationControls(entries.length, totalPages);
}

// same Previous/Next look as the shared table pagination, built locally
// since this list isn't a <table> the shared helper can hook into
function renderLogPaginationControls(matchingCount, totalPages) {
  var controls = document.getElementById('log-pagination-controls');
  if (!controls) return;
  if (matchingCount <= LOG_ROWS_PER_PAGE) {
    controls.innerHTML = '';
    return;
  }
  controls.innerHTML =
    '<button onclick="changeLogPage(-1)" ' + (currentLogPage <= 1 ? 'disabled' : '') +
      ' class="press px-3 py-1.5 rounded-lg text-xs font-bold border border-stone-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50">Previous</button>' +
    '<span class="text-xs font-bold text-stone-500 px-2">Page ' + currentLogPage + ' of ' + totalPages + '</span>' +
    '<button onclick="changeLogPage(1)" ' + (currentLogPage >= totalPages ? 'disabled' : '') +
      ' class="press px-3 py-1.5 rounded-lg text-xs font-bold border border-stone-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50">Next</button>';
}

// called by the Previous/Next buttons themselves
function changeLogPage(delta) {
  currentLogPage += delta;
  renderActivityLog(false);
}

// the 3 summary numbers at the top: actions today, actions this week,
// and whichever admin has logged the most actions overall
function computeLogKpis() {
  var entries = getAllActivityEntries();
  var now = Date.now();
  var oneDay = 86400000;
  var todayCount = entries.filter(function (e) { return now - new Date(e.time).getTime() < oneDay; }).length;
  var weekCount = entries.filter(function (e) { return now - new Date(e.time).getTime() < oneDay * 7; }).length;

  var adminCounts = {};
  entries.forEach(function (e) { adminCounts[e.admin] = (adminCounts[e.admin] || 0) + 1; });
  var topAdmin = '-';
  var topCount = 0;
  Object.keys(adminCounts).forEach(function (name) {
    if (adminCounts[name] > topCount) { topCount = adminCounts[name]; topAdmin = name; }
  });

  document.getElementById('log-kpi-today').textContent = todayCount;
  document.getElementById('log-kpi-week').textContent = weekCount;
  document.getElementById('log-kpi-top-admin').textContent = topAdmin;
}

/* ---------- Export Activity Log: click -> modal -> confirm ----------
   Same Step 1 (which actions) / Step 2 (which columns) pattern as the
   Users & Pets, OCR Scan Records and Ingredient Database export modals.
   This is deliberately independent of the page's own on-screen filter bar
   (category pills / admin dropdown / date range up top) -- like the other
   3 export modals, it has its own filters that only apply to the export */

// only admins who've actually logged at least one real or seeded action --
// same "no fake filter options" rule as the Barangay filter on Users & Pets.
// (the on-screen Admin dropdown above still lists "Alex Rivera" even though
// no entry ever uses that name -- left as-is here since that's the page's
// own filter bar, not part of this export rework)
function getDistinctLogAdmins() {
  var seen = {};
  var admins = [];
  getAllActivityEntries().forEach(function (e) {
    if (e.admin && !seen[e.admin]) { seen[e.admin] = true; admins.push(e.admin); }
  });
  return admins;
}

// turns an admin's name into a safe html id
function logAdminCheckboxId(admin) {
  return 'export-log-admin-' + admin.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

// the export modal - date range, category, and admin filters, plus which
// columns to include. Category groups are a fixed part of how the app
// classifies actions (not user-entered data that could go stale), so
// unlike Admin they're safe to hardcode here, same as Ingredient
// Database's Toxic/Caution/Safe classification checkboxes
function openActivityExportOptions() {
  var admins = getDistinctLogAdmins();
  var adminCheckboxes = admins.map(function (a) {
    return '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark">' +
      '<input type="checkbox" id="' + logAdminCheckboxId(a) + '" checked class="accent-brand export-log-filter-input" onchange="updateActivityExportMatchCount()">' + escapeHTML(a) + '</label>';
  }).join('');

  openModal({
    title: 'Export Activity Log',
    subtitle: 'Narrow down which actions to include, then pick the columns',
    wide: true,
    bodyHtml:
      '<div class="space-y-6">' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-filter"></i></span> Step 1 &middot; Which actions</p>' +

          '<div class="mb-4">' +
            '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Logged between</label>' +
            '<div class="flex items-center gap-2 mt-1.5">' +
              '<input type="date" id="export-log-date-from" onchange="updateActivityExportMatchCount()" aria-label="Logged from date" class="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-dark focus:outline-none focus:border-brand transition-all">' +
              '<span class="text-[10px] font-bold text-stone-400">to</span>' +
              '<input type="date" id="export-log-date-to" onchange="updateActivityExportMatchCount()" aria-label="Logged to date" class="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-dark focus:outline-none focus:border-brand transition-all">' +
            '</div>' +
            '<p class="text-[10px] text-stone-400 mt-1.5" id="export-log-date-hint">Leave blank to include all logged dates.</p>' +
          '</div>' +

          '<div class="mb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Category</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setLogExportGroup(\'export-log-cat-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setLogExportGroup(\'export-log-cat-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="export-log-cat-verify" checked class="accent-brand export-log-filter-input" onchange="updateActivityExportMatchCount()">Verification</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="export-log-cat-content" checked class="accent-brand export-log-filter-input" onchange="updateActivityExportMatchCount()">Content</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="export-log-cat-users" checked class="accent-brand export-log-filter-input" onchange="updateActivityExportMatchCount()">Users</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="export-log-cat-security" checked class="accent-brand export-log-filter-input" onchange="updateActivityExportMatchCount()">Security</label>' +
            '</div>' +
          '</div>' +

          (admins.length > 0 ?
          '<div>' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Admin</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setLogExportGroup(\'export-log-admin-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setLogExportGroup(\'export-log-admin-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' + adminCheckboxes + '</div>' +
          '</div>' : '') +
        '</div>' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-table-columns"></i></span> Step 2 &middot; Which columns</p>' +
          '<div class="space-y-2">' +
            '<div class="p-3 rounded-xl bg-white border border-stone-200 flex items-center justify-between">' +
              '<div><p class="text-xs font-bold text-dark">Basic Info</p><p class="text-[10px] text-stone-400 mt-0.5">Timestamp, admin, action</p></div>' +
              '<i class="fa-solid fa-lock text-stone-300 text-sm" title="Always included"></i>' +
            '</div>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">Category Classification</p><p class="text-[10px] text-stone-400 mt-0.5">Raw category and its group (e.g. Verification)</p></div>' +
              '<input id="export-log-category-col" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="flex items-center justify-between p-4 rounded-2xl bg-brand-light border border-brand/10">' +
          '<p class="text-xs font-bold text-dark"><i class="fa-solid fa-clock-rotate-left mr-2 text-brand"></i><span id="export-log-match-count">-</span> will be exported</p>' +
        '</div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button onclick="printActivityLogReport()" class="press px-5 py-2.5 text-xs font-bold text-dark bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-all"><i class="fa-solid fa-print mr-1.5"></i>Print / PDF</button>' +
      '<button onclick="exportActivityLog()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Export CSV</button>'
  });

  updateActivityExportMatchCount();
}

// the "All / None" shortcut links next to each checkbox group
function setLogExportGroup(prefix, checked) {
  document.querySelectorAll('.export-log-filter-input').forEach(function (el) {
    if (el.id.indexOf(prefix) === 0) el.checked = checked;
  });
  updateActivityExportMatchCount();
}

// this is the ONE place that decides what counts as a match, inside the
// export modal. both the live "X actions match" counter and the actual
// CSV export call this, so they can't ever disagree with each other.
// (independent of the page's own on-screen category/admin/date filters)
function getMatchingActivityEntries() {
  var allowedCategoryGroup = {
    verify: document.getElementById('export-log-cat-verify').checked,
    content: document.getElementById('export-log-cat-content').checked,
    users: document.getElementById('export-log-cat-users').checked,
    security: document.getElementById('export-log-cat-security').checked
  };
  var admins = getDistinctLogAdmins();
  var allowedAdmin = {};
  admins.forEach(function (a) {
    var el = document.getElementById(logAdminCheckboxId(a));
    allowedAdmin[a] = el ? el.checked : true;
  });

  var fromEl = document.getElementById('export-log-date-from');
  var toEl = document.getElementById('export-log-date-to');
  var fromTime = fromEl && fromEl.value ? new Date(fromEl.value + 'T00:00:00').getTime() : null;
  var toTime = toEl && toEl.value ? new Date(toEl.value + 'T23:59:59').getTime() : null;

  return getAllActivityEntries().filter(function (e) {
    var group = CATEGORY_GROUPS[e.category] || 'security';
    if (!allowedCategoryGroup[group]) return false;
    if (admins.length > 0 && !allowedAdmin[e.admin]) return false;
    var t = new Date(e.time).getTime();
    if (fromTime !== null && t < fromTime) return false;
    if (toTime !== null && t > toTime) return false;
    return true;
  });
}

// catches a backwards date range in the export modal and says so directly,
// same idea as isLogDateRangeInvalid() for the page's own filter bar
function isExportLogDateRangeInvalid() {
  var fromEl = document.getElementById('export-log-date-from');
  var toEl = document.getElementById('export-log-date-to');
  if (!fromEl.value || !toEl.value) return false;
  return new Date(fromEl.value + 'T00:00:00').getTime() > new Date(toEl.value + 'T23:59:59').getTime();
}

// updates the live count in the export modal.
// also handles showing the "bad date range" message instead of a count when that happens
function updateActivityExportMatchCount() {
  var total = getAllActivityEntries().length;
  var el = document.getElementById('export-log-match-count');
  var hint = document.getElementById('export-log-date-hint');

  if (isExportLogDateRangeInvalid()) {
    if (el) el.textContent = 'End date is before the start date';
    if (hint) { hint.textContent = 'Fix the date range above to see how many actions match.'; hint.className = 'text-[10px] text-danger font-bold mt-1.5'; }
    return;
  }
  if (hint) { hint.textContent = 'Leave blank to include all logged dates.'; hint.className = 'text-[10px] text-stone-400 mt-1.5'; }

  var matched = getMatchingActivityEntries().length;
  if (el) el.textContent = matched + ' of ' + total + ' actions';
}

// shared validation for both the CSV export and the Print/PDF view
function validateActivityExportSelection() {
  if (isExportLogDateRangeInvalid()) {
    showToast('End date must be after the start date', 'danger');
    return null;
  }
  var categoryChecked = ['verify', 'content', 'users', 'security'].some(function (g) {
    var el = document.getElementById('export-log-cat-' + g);
    return el && el.checked;
  });
  if (!categoryChecked) {
    showToast('Select at least one category to export', 'danger');
    return null;
  }
  var admins = getDistinctLogAdmins();
  var adminChecked = admins.length === 0 || admins.some(function (a) {
    var el = document.getElementById(logAdminCheckboxId(a));
    return el && el.checked;
  });
  if (!adminChecked) {
    showToast('Select at least one admin to export', 'danger');
    return null;
  }
  var entries = getMatchingActivityEntries();
  if (entries.length === 0) {
    showToast('No actions match the selected filters', 'danger');
    return null;
  }
  return entries;
}

// builds the exact same headers/rows for the CSV and the Print/PDF view.
// converts the html entities back to plain text first, since things like
// &rarr; only make sense on screen, not in a csv file or a print-out
function buildActivityExportTable(entries) {
  var includeCategoryCol = document.getElementById('export-log-category-col').checked;
  var headers = ['Timestamp', 'Admin', 'Action'];
  if (includeCategoryCol) headers = headers.concat(['Category', 'Category Group']);

  var rows = entries.map(function (e) {
    var plainText = e.text.replace(/&rarr;/g, '->').replace(/&middot;/g, '-').replace(/&amp;/g, '&');
    var fields = [e.time, e.admin, plainText];
    if (includeCategoryCol) fields = fields.concat([e.category, CATEGORY_GROUPS[e.category] || '']);
    return fields;
  });

  return { headers: headers, rows: rows };
}

// builds and downloads the CSV from whatever matched in the modal
function exportActivityLog() {
  var entries = validateActivityExportSelection();
  if (!entries) return;

  closeModal();
  var table = buildActivityExportTable(entries);
  var lines = [table.headers.join(',')];
  table.rows.forEach(function (fields) {
    lines.push(fields.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(','));
  });

  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'kibbleguard-activity-log.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Exported ' + entries.length + ' action' + (entries.length === 1 ? '' : 's'), 'success');
}

// same matched entries/columns as exportActivityLog() above, just handed
// to the browser's print dialog (with "Save as PDF") instead of downloaded
function printActivityLogReport() {
  var entries = validateActivityExportSelection();
  if (!entries) return;

  closeModal();
  var table = buildActivityExportTable(entries);
  openPrintReport({
    title: 'Activity Log',
    subtitle: 'KibbleGuard · Admin Action Audit Trail',
    filterSummary: [entries.length + ' action' + (entries.length === 1 ? '' : 's')],
    headers: table.headers,
    rows: table.rows
  });
}

renderActivityLog();

renderNavBadges();
applyRoleState();

/* ---------- Refresh ----------
   Read-only audit trail, so it's the safest page to auto-refresh: re-reads the log and
   redraws, keeping the filters and page. */
initRefreshControl({ key: 'activity-log', label: 'Activity log', onRefresh: function () { renderActivityLog(false); renderNavBadges(); }, auto: true });

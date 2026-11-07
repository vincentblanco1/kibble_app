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

  var list = document.getElementById('activity-log-list');
  list.innerHTML = pageEntries.map(function (e) {
    var cat = ACTIVITY_CATEGORIES[e.category] || ACTIVITY_CATEGORIES.settings;
    // escaping matters a lot on this page specifically - almost every ban
    // reason, dispute reply, and message subject in the whole app ends up
    // logged here eventually, so this is the one place that has to be safe
    // no matter where the text originally came from
    // entries logged with a "link" (the scan, ticket or account the action was
    // about) render as an actual <a> straight to that record; older entries
    // logged before this existed, or actions with nothing specific to jump to,
    // just render as a plain row like before
    var clickable = !!e.link;
    var openTag = clickable
      ? '<a href="' + escapeHTML(e.link) + '" class="p-5 flex items-center gap-4 hover:bg-stone-50 transition-colors">'
      : '<div class="p-5 flex items-center gap-4">';
    var closeTag = clickable ? '</a>' : '</div>';
    return openTag +
      '<div class="w-9 h-9 rounded-xl ' + cat.cls + ' flex items-center justify-center text-sm shrink-0"><i class="fa-solid ' + cat.icon + '"></i></div>' +
      '<div class="flex-1 min-w-0">' +
        '<p class="text-sm font-bold text-dark leading-snug">' + escapeHTML(e.text) + '</p>' +
        '<p class="text-[11px] text-stone-400 mt-1">' + escapeHTML(e.admin) + '</p>' +
      '</div>' +
      '<span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest shrink-0">' + relativeTime(e.time) + '</span>' +
      (clickable ? '<i class="fa-solid fa-chevron-right text-stone-300 text-xs shrink-0"></i>' : '') +
      closeTag;
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

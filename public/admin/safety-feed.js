// feed-empty-row is static markup baked into safety-feed.html, not one of the
// alert rows this page builds and caches -- but restorePersistedRows() below
// (and every later resync) replaces #feed-table-body's entire innerHTML with
// just the cached/synced alert rows, which silently deletes this row from the
// DOM for good the first time real data loads. From then on, every call to
// document.getElementById('feed-empty-row') came back null and crashed
// filterAlerts()/updateFeedKpis() on the very next line -- which is why the
// search box and the status/severity filters on this page looked like they
// simply did nothing (the same bug, same cause, as OCR Scan Records' search
// -- see the matching comment there). Saved here, before that first restore,
// so it can be put back.
var EMPTY_FEED_ROW_HTML = (function () {
  var el = document.getElementById('feed-empty-row');
  return el ? el.outerHTML : '';
})();
function ensureFeedEmptyRow() {
  var el = document.getElementById('feed-empty-row');
  if (!el && EMPTY_FEED_ROW_HTML) {
    var tbody = document.getElementById('feed-table-body');
    if (tbody) { tbody.insertAdjacentHTML('beforeend', EMPTY_FEED_ROW_HTML); el = document.getElementById('feed-empty-row'); }
  }
  return el;
}

restorePersistedRows('kibbleguard-alerts-rows', document.getElementById('feed-table-body'));

// "Registered Pet Owners" highlight card - same real count as Dashboard's
// own card, read from the same saved data (see the HTML comment on this
// card for why it's not called "Pet Owners Reached" anymore)
refreshKpiFromPersistedRows('kibbleguard-users-rows', 'pet-owners-reached-kpi', 4);

/* ---------- Shared badge helpers ---------- */
/* 5-tier per-species ingredient classification (Risk Library) */
var RISK_LEVELS = ['Safe', 'Caution', 'Toxic'];
var RISK_LEVEL_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-amber-50 text-amber-500 border-amber-100' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10' }
};
// not actually used on this page, kept for consistency with the other
// pages that share this same badge-helpers block
function riskBadgeHtml(level) {
  var m = RISK_LEVEL_STYLES[level] || RISK_LEVEL_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + level + '</span>';
}
function riskOptions(selected) {
  // also unused here, same reason as riskBadgeHtml above
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
// unused here too, since these badge helpers are shared across pages and not every page uses every one
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- Safety Feed-specific interactions ---------- */
// A counter reset to 0 on every page load would hand out the same row id ("alert-new-1") to
// two completely different alerts created in two different browser sessions -- and that id is
// also what the backend uses to decide whether an alert has already been broadcast, so a
// collision there could silently swallow a brand-new alert's notification. This is collision-safe
// across sessions instead.
function newAlertId() {
  return 'alert-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

var currentFeedStatusFilter = 'all';
var currentFeedSeverityFilter = 'all';

// keeps both dropdowns' "this one is active" green outline and the Clear
// filters button in step with the filter state
function syncFeedFilterUI() {
  [['feed-filter-status', currentFeedStatusFilter], ['feed-filter-severity', currentFeedSeverityFilter]].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    var active = pair[1] !== 'all';
    el.value = pair[1];
    el.classList.toggle('border-brand', active);
    el.classList.toggle('bg-brand-light', active);
    el.classList.toggle('text-brand', active);
    el.classList.toggle('border-stone-200', !active);
    el.classList.toggle('bg-stone-100', !active);
    el.classList.toggle('text-dark', !active);
  });
  var clearBtn = document.getElementById('feed-clear-filters');
  if (clearBtn) clearBtn.classList.toggle('hidden', currentFeedStatusFilter === 'all' && currentFeedSeverityFilter === 'all');
}

// Status dropdown: all / live / draft
function setFeedStatusFilter(status) {
  currentFeedStatusFilter = status;
  syncFeedFilterUI();
  filterAlerts();
}

// Severity dropdown: all / Urgent / Info
function setFeedSeverityFilter(severity) {
  currentFeedSeverityFilter = severity;
  syncFeedFilterUI();
  filterAlerts();
}

// the "Clear filters" button: both dropdowns back to "All"
function clearFeedFilters() {
  currentFeedStatusFilter = 'all';
  currentFeedSeverityFilter = 'all';
  syncFeedFilterUI();
  filterAlerts();
}

// combines the search box with the status/severity filters above.
// sets dataset.filterMatch instead of touching style.display directly --
// applyTablePagination() below needs sole control of display so it can
// correctly slice matching rows into pages of 10
function filterAlerts() {
  var q = document.getElementById('feed-search').value.toLowerCase().trim();
  var rows = document.querySelectorAll('#feed-table-body tr[data-search]');
  var visible = 0;
  rows.forEach(function (row) {
    var matchesSearch = row.dataset.search.indexOf(q) !== -1;
    var matchesStatus = currentFeedStatusFilter === 'all' || row.dataset.status === currentFeedStatusFilter;
    var badge = row.querySelector('[data-field="severity-badge"]');
    var matchesSeverity = currentFeedSeverityFilter === 'all' || (badge && badge.textContent.trim() === currentFeedSeverityFilter);
    var match = matchesSearch && matchesStatus && matchesSeverity;
    row.dataset.filterMatch = match ? 'true' : 'false';
    if (match) visible++;
  });
  var emptyRow = ensureFeedEmptyRow();
  if (emptyRow) emptyRow.classList.toggle('hidden', visible !== 0);
  var label = document.getElementById('feed-count-label');
  var isFiltered = q || currentFeedStatusFilter !== 'all' || currentFeedSeverityFilter !== 'all';
  label.textContent = isFiltered ? ('Showing ' + visible + ' matching result' + (visible === 1 ? '' : 's')) : 'Showing all ' + visible + ' alerts';
  applyTablePagination('feed-table-body', 'feed-pagination-controls', 10, true);
}

// the Live/Draft count cards at the top of the page.
// recalculated from the real rows every time something changes
function updateFeedKpis() {
  var rows = document.querySelectorAll('#feed-table-body tr[data-status]');
  var live = 0, draft = 0;
  rows.forEach(function (r) { if (r.dataset.status === 'live') live++; else draft++; });
  document.getElementById('live-alerts-kpi').textContent = live;
  document.getElementById('draft-alerts-kpi').textContent = draft;
  var emptyRow = ensureFeedEmptyRow();
  if (emptyRow) emptyRow.classList.toggle('hidden', rows.length !== 0);
}

// builds and opens the add/edit modal - mode is 'add' or 'edit'
function openAlertForm(mode, rowId) {
  var existing = null;
  if (mode === 'edit') {
    var row = document.getElementById(rowId);
    existing = {
      title: row.querySelector('[data-field="title"]').textContent,
      type: row.querySelector('[data-field="type"]').textContent,
      severity: row.querySelector('[data-field="severity-badge"]').textContent.trim(),
      species: row.querySelector('[data-field="species"]').textContent,
      body: row.dataset.body || ''
    };
  }
  var typeOptions = ['Recall', 'Study', 'Advisory'].map(function (t) {
    return '<option value="' + t + '"' + (existing && existing.type === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');
  var severityOptions = ['Urgent', 'Info'].map(function (s) {
    return '<option value="' + s + '"' + (existing && existing.severity === s ? ' selected' : '') + '>' + s + '</option>';
  }).join('');
  var speciesOptions = ['Both', 'Canine', 'Feline'].map(function (s) {
    return '<option value="' + s + '"' + (existing && existing.species === s ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  openModal({
    title: mode === 'edit' ? 'Edit Safety Alert' : 'Publish New Safety Alert',
    subtitle: mode === 'edit' ? "Live alerts appear instantly in the pet owner app's Safety Feed" : "Publish Live shows it to pet owners right away. Save as Draft keeps it hidden until you are ready",
    bodyHtml:
      '<div class="space-y-4">' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Alert Title</label>' +
          '<input id="f-alert-title" value="' + escapeHTML(existing ? existing.title : '') + '" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="e.g. Batch #123 Recalled for..."></div>' +
        '<div class="grid grid-cols-3 gap-4">' +
          '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Type</label>' +
            '<select id="f-alert-type" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand">' + typeOptions + '</select></div>' +
          '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Severity</label>' +
            '<select id="f-alert-severity" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand">' + severityOptions + '</select></div>' +
          '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Species</label>' +
            '<select id="f-alert-species" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand">' + speciesOptions + '</select></div>' +
        '</div>' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Details</label>' +
          '<textarea id="f-alert-body" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm h-24 resize-none focus:outline-none focus:border-brand" placeholder="What pet owners need to know...">' + escapeHTML(existing ? existing.body : '') + '</textarea></div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      (mode === 'edit' ? '' : '<button id="save-draft-btn" onclick="saveAlert(\'add\', \'\', \'draft\')" data-perm="manageSafetyFeed" class="press px-5 py-2.5 text-xs font-bold text-dark bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-all"><i class="fa-solid fa-file-pen mr-1.5"></i>Save as Draft</button>') +
      '<button id="save-alert-btn" onclick="saveAlert(\'' + mode + '\', \'' + (rowId || '') + '\', \'live\')" data-perm="manageSafetyFeed" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">' + (mode === 'edit' ? 'Save Changes' : 'Publish Live') + '</button>'
  });
}

// shortcut for openAlertForm('edit', rowId)
function editAlert(rowId) {
  openAlertForm('edit', rowId);
}

// handles both add and edit.
// a newly published alert always starts as Live, and gets inserted at the top of the table
function saveAlert(mode, rowId, status) {
  // status only matters for a NEW alert: 'draft' keeps it hidden from pet owners, 'live' publishes it
  var asDraft = mode !== 'edit' && status === 'draft';
  var title = document.getElementById('f-alert-title').value.trim();
  var type = document.getElementById('f-alert-type').value;
  var severity = document.getElementById('f-alert-severity').value;
  var species = document.getElementById('f-alert-species').value;
  var body = document.getElementById('f-alert-body').value.trim();

  if (!title) {
    showToast('Alert title is required', 'danger');
    return;
  }

  var typeIcons = { 'Recall': 'fa-triangle-exclamation', 'Study': 'fa-flask', 'Advisory': 'fa-circle-info' };
  var severityCls = severity === 'Urgent' ? 'bg-danger/10 text-danger border-danger/10' : 'bg-brand-light text-brand border-brand/20';
  var saveBtn = document.getElementById(asDraft ? 'save-draft-btn' : 'save-alert-btn');

  withSavingState(saveBtn, mode === 'edit' ? 'Saving...' : (asDraft ? 'Saving draft...' : 'Publishing...'), function () {
  if (mode === 'edit') {
    var row = document.getElementById(rowId);
    var originalRowHtml = row.outerHTML;
    row.querySelector('[data-field="title"]').textContent = title;
    row.querySelector('[data-field="type"]').textContent = type;
    row.querySelector('[data-field="species"]').textContent = species;
    var sevBadge = row.querySelector('[data-field="severity-badge"]');
    sevBadge.className = 'px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ' + severityCls;
    sevBadge.textContent = severity;
    row.dataset.search = (title + ' ' + type + ' ' + species).toLowerCase();
    row.dataset.body = body;

    try {
      savePersistedRows('kibbleguard-alerts-rows', document.getElementById('feed-table-body'));
    } catch (e) {
      var revertTemp = document.createElement('tbody');
      revertTemp.innerHTML = originalRowHtml;
      row.parentNode.replaceChild(revertTemp.firstElementChild, row);
      throw e;
    }

    closeModal();
    showToast('Alert updated', 'success');
    logAdminAction('Edited alert: ' + title, 'edit', 'safety-feed.html?edit=' + encodeURIComponent(rowId));
    filterAlerts();
  } else {
    var newId = newAlertId();
    var tbody = document.getElementById('feed-table-body');
    var tr = document.createElement('tr');
    tr.className = 'feed-row hover:bg-stone-50/50 group';
    tr.id = newId;
    tr.dataset.status = asDraft ? 'draft' : 'live';
    tr.dataset.search = (title + ' ' + type + ' ' + species).toLowerCase();
    tr.dataset.body = body;
    tr.innerHTML =
      '<td class="px-10 py-6 max-w-sm"><div class="flex items-start gap-3">' +
        '<div class="w-10 h-10 rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center text-sm shrink-0"><i class="fa-solid ' + (typeIcons[type] || 'fa-circle-info') + '"></i></div>' +
        '<p class="font-bold text-dark text-sm leading-snug whitespace-normal" data-field="title">' + escapeHTML(title) + '</p></div></td>' +
      '<td class="px-10 py-6 text-xs font-bold text-stone-600" data-field="type">' + type + '</td>' +
      '<td class="px-10 py-6"><span class="px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ' + severityCls + '" data-field="severity-badge">' + severity + '</span></td>' +
      '<td class="px-10 py-6 text-xs font-bold text-stone-600" data-field="species">' + species + '</td>' +
      '<td class="px-10 py-6"><span class="status-badge px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ' + (asDraft ? 'bg-stone-100 text-stone-500 border-stone-200' : 'bg-safe/10 text-safe border-safe/10') + '" data-field="status-badge">' + (asDraft ? 'Draft' : 'Live') + '</span></td>' +
      '<td class="px-10 py-6 text-right text-stone-400 font-mono text-xs" data-field="published">' + (asDraft ? 'Not published' : 'Just now') + '</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180"><div class="flex items-center justify-end gap-1">' +
        '<button onclick="previewAlert(\'' + newId + '\')" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Preview"><i class="fa-solid fa-eye text-xs"></i></button>' +
        '<button onclick="toggleAlertStatus(\'' + newId + '\')" data-perm="manageSafetyFeed" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Toggle Live/Draft"><i class="fa-solid fa-toggle-on text-xs"></i></button>' +
        '<button onclick="editAlert(\'' + newId + '\')" data-perm="manageSafetyFeed" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Edit"><i class="fa-solid fa-pen text-xs"></i></button>' +
        '<button onclick="deleteAlert(\'' + newId + '\')" data-perm="manageSafetyFeed" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-danger transition-all" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>' +
      '</div></td>';
    tbody.insertBefore(tr, tbody.firstChild);

    try {
      savePersistedRows('kibbleguard-alerts-rows', tbody);
    } catch (e) {
      tr.remove();
      throw e;
    }

    if (typeof applyPermissionGating === 'function') applyPermissionGating();
    closeModal();
    updateFeedKpis();
    if (asDraft) {
      showToast('Draft saved. Pet owners cannot see it until you set it Live', 'success');
      logAdminAction('Saved draft alert: ' + title, 'edit', 'safety-feed.html?edit=' + encodeURIComponent(newId));
    } else {
      showToast('Alert published, now live on the pet owner app', 'success');
      logAdminAction('Published alert: ' + title, 'publish', 'safety-feed.html?edit=' + encodeURIComponent(newId));
    }
    filterAlerts();
    tr.classList.add('flash-highlight');
    setTimeout(function () { tr.classList.remove('flash-highlight'); }, 800);
  }
  });
}

// switches an alert between Live (visible to pet owners) and Draft
// (hidden, still editable) - not a delete, just a visibility toggle
function toggleAlertStatus(rowId) {
  var row = document.getElementById(rowId);
  var badge = row.querySelector('[data-field="status-badge"]');
  var goingLive = row.dataset.status !== 'live';
  var title = row.querySelector('[data-field="title"]').textContent;
  var originalRowHtml = row.outerHTML;
  if (goingLive) {
    row.dataset.status = 'live';
    badge.className = 'status-badge px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border bg-safe/10 text-safe border-safe/10';
    badge.textContent = 'Live';
    var publishedCell = row.querySelector('[data-field="published"]');
    if (publishedCell && publishedCell.textContent.trim() === 'Not published') publishedCell.textContent = 'Just now';
  } else {
    row.dataset.status = 'draft';
    badge.className = 'status-badge px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border bg-stone-100 text-stone-500 border-stone-200';
    badge.textContent = 'Draft';
  }
  // saved BEFORE anything is announced: if another admin changed the list in the
  // meantime the save is refused, and nothing is shown or logged as if it worked
  try {
    savePersistedRows('kibbleguard-alerts-rows', document.getElementById('feed-table-body'));
  } catch (e) {
    var revertTemp = document.createElement('tbody');
    revertTemp.innerHTML = originalRowHtml;
    row.parentNode.replaceChild(revertTemp.firstElementChild, row);
    showToast('Could not change this alert: ' + e.message + '.', 'danger');
    return;
  }
  if (goingLive) {
    showToast('Alert published, now live on the pet owner app', 'success');
    logAdminAction('Set alert live: ' + title, 'publish', 'safety-feed.html?edit=' + encodeURIComponent(rowId));
  } else {
    showToast('Alert moved to Draft, hidden from the app', 'info');
  }
  updateFeedKpis();
  filterAlerts();
}

// who an alert can reach, counted from the real registered owners and pets saved by
// Users & Pets (same saved rows the Registered Pet Owners card reads). Banned accounts
// can't sign in, so they aren't counted. Returns null if that data hasn't been loaded yet
// (Users & Pets has to be opened once in this browser to save it)
function getAlertReach(species) {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-users-rows')); } catch (e) { saved = null; }
  if (!saved || !saved.length) return null;
  var temp = document.createElement('table');
  temp.innerHTML = '<tbody>' + saved.join('') + '</tbody>';
  var total = 0, targeted = 0;
  Array.prototype.forEach.call(temp.querySelectorAll('tr[data-pets]'), function (row) {
    if (row.dataset.status === 'banned') return;
    total++;
    var kinds = row.dataset.pets.split(';').map(function (p) { return p.split('|')[1]; });
    var hit = species === 'Canine' ? kinds.indexOf('dog') !== -1
            : species === 'Feline' ? kinds.indexOf('cat') !== -1
            : true;
    if (hit) targeted++;
  });
  return { targeted: targeted, total: total };
}

// shows the alert exactly as a pet owner would see it, plus how many
// registered owners it can reach based on its species targeting
function previewAlert(rowId) {
  var row = document.getElementById(rowId);
  if (!row) return;
  var title = row.querySelector('[data-field="title"]').textContent;
  var type = row.querySelector('[data-field="type"]').textContent;
  var severity = row.querySelector('[data-field="severity-badge"]').textContent.trim();
  var species = row.querySelector('[data-field="species"]').textContent;
  var status = row.querySelector('[data-field="status-badge"]').textContent.trim();
  var published = row.querySelector('[data-field="published"]').textContent;
  var body = row.dataset.body || '';
  var iconEl = row.querySelector('td:first-child i');
  var iconClass = iconEl ? iconEl.className : 'fa-solid fa-circle-info';

  var reach = getAlertReach(species);
  var reachLine = reach
    ? 'Can reach ' + reach.targeted + ' of ' + reach.total + ' registered pet owner' + (reach.total === 1 ? '' : 's')
    : 'Owner data unavailable';
  var reachNote = reach
    ? (species === 'Both'
        ? 'Every registered owner who is not banned. '
        : 'Owners with at least one ' + (species === 'Canine' ? 'dog' : 'cat') + ' registered, not banned. ') + 'This counts who the alert targets. The system does not track whether an owner has opened it.'
    : 'Owner and pet records could not be loaded right now.';

  openModal({
    title: title,
    wide: true,
    bodyHtml:
      '<div class="space-y-5">' +
        '<div class="flex items-center gap-3 flex-wrap">' +
          '<span class="px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border bg-stone-100 text-stone-600 border-stone-200">' + type + '</span>' +
          '<span class="px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ' + (severity === 'Urgent' ? 'bg-danger/10 text-danger border-danger/10' : 'bg-brand-light text-brand border-brand/20') + '">' + severity + '</span>' +
          '<span class="px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border bg-stone-100 text-stone-600 border-stone-200">' + species + '</span>' +
          '<span class="px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ' + (status === 'Live' ? 'bg-safe/10 text-safe border-safe/10' : 'bg-stone-100 text-stone-500 border-stone-200') + '">' + status + '</span>' +
        '</div>' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">What pet owners see</p>' +
          (body
            ? '<p class="text-sm text-stone-600 leading-relaxed">' + escapeHTML(body) + '</p>'
            : '<p class="text-sm text-stone-400 italic">No details were written for this alert.</p>') +
        '</div>' +

        '<div class="flex items-center justify-between p-4 rounded-2xl bg-brand-light border border-brand/10">' +
          '<div>' +
            '<p class="text-xs font-bold text-dark"><i class="fa-solid fa-users mr-2 text-brand"></i>' + reachLine + '</p>' +
            '<p class="text-[10px] text-stone-500 mt-1">' + reachNote + '</p>' +
          '</div>' +
        '</div>' +

        '<p class="text-[10px] text-stone-400"><i class="fa-solid fa-clock mr-1"></i>Published ' + published + '</p>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Close</button>' +
      '<button onclick="closeModal(); editAlert(\'' + rowId + '\')" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Edit Alert</button>'
  });
}

// permanently removes an alert (different from toggleAlertStatus's Draft,
// which just hides it) - no confirmation step before this one currently
function deleteAlert(rowId) {
  var row = document.getElementById(rowId);
  if (!row) return;
  var titleEl = row.querySelector('[data-field="title"]');
  var title = titleEl ? titleEl.textContent : rowId;
  var btn = row.querySelector('button[onclick*="deleteAlert"]');

  withSavingState(btn, '', function () {
  // persist "row gone" before the fade animation starts, not after - see the
  // same pattern in ingredient-database.js's performDeleteIngredient for why
  var parent = row.parentNode;
  var nextSibling = row.nextSibling;
  parent.removeChild(row);
  try {
    savePersistedRows('kibbleguard-alerts-rows', document.getElementById('feed-table-body'));
  } catch (e) {
    parent.insertBefore(row, nextSibling);
    throw e;
  }
  parent.insertBefore(row, nextSibling);

  row.style.transition = 'opacity 0.3s, transform 0.3s';
  row.style.opacity = '0';
  row.style.transform = 'translateX(12px)';
  setTimeout(function () {
    row.remove();
    updateFeedKpis();
    filterAlerts();
  }, 300);
  showToast('Alert deleted', 'danger');
  logAdminAction('Deleted alert: ' + title, 'delete');
  });
}

initScrollFadeIndicators();

renderNavBadges();
applyRoleState();
updateFeedKpis();   // Live / Draft counters and the count label come from the real rows, not the static HTML
filterAlerts();

if (new URLSearchParams(window.location.search).get('action') === 'publish' && hasPermission('manageSafetyFeed')) {
  openAlertForm('add');
}

// lets the Activity Log link straight back to the alert a log entry was about
// (edited/published/set live), instead of landing the admin on the bare list
var deepLinkEditAlert = new URLSearchParams(window.location.search).get('edit');
if (deepLinkEditAlert && document.getElementById(deepLinkEditAlert) && hasPermission('manageSafetyFeed')) {
  editAlert(deepLinkEditAlert);
}

/* ---------- Refresh ----------
   Re-reads the saved alert rows (so another admin's publish/draft/delete shows up),
   keeping the current search, filters and page. */
function refreshAlerts() {
  var tbody = document.getElementById('feed-table-body');
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-alerts-rows')); } catch (e) { saved = null; }
  if (tbody && saved && saved.length) { tbody.innerHTML = saved.join(''); markRowsLoaded('kibbleguard-alerts-rows'); }
  refreshKpiFromPersistedRows('kibbleguard-users-rows', 'pet-owners-reached-kpi', 4);
  updateFeedKpis();
  var page = PAGINATION_STATE['feed-table-body'] || 1;
  filterAlerts();
  if (page > 1) {
    PAGINATION_STATE['feed-table-body'] = page;
    applyTablePagination('feed-table-body', 'feed-pagination-controls', 10, false);
  }
  applyPermissionGating();
  renderNavBadges();
}
initRefreshControl({ key: 'safety-feed', label: 'Safety Feed', onRefresh: refreshAlerts, auto: false });

// the Refresh control is appended to the header by initRefreshControl; on pages that
// already have a button group on the right, tuck it into that group so the header
// layout stays two-sided instead of becoming three-way
(function () {
  var w = document.getElementById('refresh-control');
  var actions = document.querySelector('main header > div.gap-3');
  if (w && actions) actions.insertBefore(w, actions.firstChild);
})();

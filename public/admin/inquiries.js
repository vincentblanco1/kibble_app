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

/* ---------- Inquiries-specific ---------- */
// one style per Help, Support & Inquiries category -- same four options as
// the pet-owner-facing form's dropdown
var INQUIRY_CATEGORY_STYLES = {
  'Account Flag / Suspension Appeal':          { icon: 'fa-flag',            cls: 'bg-caution/10 text-caution border-caution/10',   short: 'Flag/Ban Appeal' },
  'Application Bug / OCR Issue':               { icon: 'fa-bug',             cls: 'bg-stone-200 text-stone-600 border-stone-200',    short: 'App Bug / OCR' },
  'Suggest Missing Ingredient for Encyclopedia': { icon: 'fa-flask',         cls: 'bg-brand-light text-brand border-brand/10',       short: 'Suggest Ingredient' },
  'General Complaint / Feedback':              { icon: 'fa-comment-dots',   cls: 'bg-stone-100 text-stone-500 border-stone-200',    short: 'General Feedback' }
};
function inquiryCategoryBadgeHtml(category) {
  var m = INQUIRY_CATEGORY_STYLES[category] || INQUIRY_CATEGORY_STYLES['General Complaint / Feedback'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.short + '</span>';
}
function inquiryStatusBadgeHtml(resolved) {
  return resolved
    ? '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-safe/10 text-safe border-safe/10 font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid fa-circle-check"></i> Resolved</span>'
    : '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-caution/10 text-caution border-caution/10 font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid fa-hourglass-half"></i> Pending</span>';
}

// how long a still-pending inquiry has been waiting, so an old unanswered one doesn't
// look the same as one that just arrived. Under a day is neutral, 1-2 days is amber,
// 3 days or more is red. Resolved inquiries show nothing (the clock stopped).
function inquiryAgeHtml(iso) {
  var ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return '';
  var hours = Math.floor(ms / 3600000);
  var days = Math.floor(hours / 24);
  var label = hours < 1 ? 'under 1h' : (hours < 24 ? hours + 'h' : days + 'd');
  var cls = days >= 3 ? 'text-danger' : (days >= 1 ? 'text-caution' : 'text-stone-400');
  var icon = days >= 3 ? 'fa-circle-exclamation' : 'fa-clock';
  return '<p class="text-[10px] font-bold mt-1.5 ' + cls + '"><i class="fa-solid ' + icon + ' mr-1"></i>Waiting ' + label + '</p>';
}

// same "2024-05-28 14:42" style already used for timestamps on OCR Scan
// Records, just computed here since these come from ISO strings, not
// hand-typed seed text
function formatInquiryTimestamp(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
}

// initials for the owner avatar circle, same "first two letters of first
// name" convention as OCR Scan Records' owner column
function ownerInitials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

// a reply that's actually been sent lives here, keyed by inquiry ID -- kept
// separate from INQUIRY_RECORDS (app.js) so that object can stay static
// seed data, same split as isDisputeResolved/markDisputeResolved use for
// disputes. INQ-1001 ships with a canned reply already in its seed record
// (see app.js) for a resolved demo example; this is only for replies sent
// for real, through the button below
function getInquiryReply(inquiryId) {
  var replies = {};
  try { replies = JSON.parse(localStorage.getItem('kibbleguard-inquiry-replies')) || {}; } catch (e) { replies = {}; }
  if (replies[inquiryId]) return replies[inquiryId];
  var seed = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS[inquiryId] : null;
  return (seed && seed.reply) ? { text: seed.reply, time: seed.timestamp } : null;
}
function saveInquiryReply(inquiryId, text) {
  var replies = {};
  try { replies = JSON.parse(localStorage.getItem('kibbleguard-inquiry-replies')) || {}; } catch (e) { replies = {}; }
  replies[inquiryId] = { text: text, time: new Date().toISOString() };
  localStorage.setItem('kibbleguard-inquiry-replies', JSON.stringify(replies));
}

var currentInquiryStatusFilter = 'all';

// keeps both dropdowns' "this one is active" green outline and the Clear
// filters button in step with the filter state
function syncInquiryFilterUI() {
  var statusEl = document.getElementById('inquiry-filter-status');
  var catEl = document.getElementById('inquiry-category-filter');
  [[statusEl, currentInquiryStatusFilter], [catEl, catEl ? catEl.value : 'all']].forEach(function (pair) {
    var el = pair[0];
    if (!el) return;
    var active = pair[1] !== 'all';
    if (el === statusEl) el.value = pair[1];
    el.classList.toggle('border-brand', active);
    el.classList.toggle('bg-brand-light', active);
    el.classList.toggle('text-brand', active);
    el.classList.toggle('border-stone-200', !active);
    el.classList.toggle('bg-stone-100', !active);
    el.classList.toggle('text-dark', !active);
  });
  var clearBtn = document.getElementById('inquiry-clear-filters');
  if (clearBtn) clearBtn.classList.toggle('hidden', currentInquiryStatusFilter === 'all' && (!catEl || catEl.value === 'all'));
}

// Status dropdown: all / pending / resolved
function setInquiryStatusFilter(status) {
  currentInquiryStatusFilter = status;
  syncInquiryFilterUI();
  filterInquiries();
}

// Category dropdown
function setInquiryCategoryFilter() {
  syncInquiryFilterUI();
  filterInquiries();
}

// the "Clear filters" button: both dropdowns back to "All"
function clearInquiryFilters() {
  currentInquiryStatusFilter = 'all';
  document.getElementById('inquiry-category-filter').value = 'all';
  syncInquiryFilterUI();
  filterInquiries();
}

// builds every row fresh from INQUIRY_RECORDS (app.js) + live resolved/reply
// state -- unlike the other tables in this app, there's no static seed
// markup here for this to ever drift out of sync with, since the table IS
// the read of the data, not a second copy of it
function renderInquiriesTable() {
  var tbody = document.getElementById('inquiry-table-body');
  var traces = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS : {};
  var ids = Object.keys(traces).sort(function (a, b) { return b.localeCompare(a); }); // newest ID first
  tbody.innerHTML = ids.map(function (id) {
    var d = traces[id];
    var resolved = isInquiryResolved(id);
    var excerpt = d.message.length > 90 ? d.message.slice(0, 90) + '…' : d.message;
    var searchBlob = [id, d.owner, d.ownerEmail, d.category, d.message].join(' ').toLowerCase();
    return '<tr class="feed-row hover:bg-stone-50/50 group" id="row-' + id + '" data-category="' + escapeHTML(d.category) + '" data-status="' + (resolved ? 'resolved' : 'pending') + '" data-search="' + escapeHTML(searchBlob) + '">' +
      '<td class="px-10 py-6">' +
        '<div class="flex items-center gap-4">' +
          '<div class="w-11 h-11 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center text-sm shrink-0"><i class="fa-solid ' + (INQUIRY_CATEGORY_STYLES[d.category] || INQUIRY_CATEGORY_STYLES['General Complaint / Feedback']).icon + '"></i></div>' +
          '<div class="max-w-xs">' +
            '<p class="font-mono text-xs text-stone-400 font-bold">#' + id + '</p>' +
            '<p class="text-xs text-dark italic mt-0.5 truncate" title="' + escapeHTML(d.message) + '">&ldquo;' + escapeHTML(excerpt) + '&rdquo;</p>' +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td class="px-10 py-6">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-8 h-8 rounded-full bg-brand-light text-brand flex items-center justify-center text-[10px] font-bold">' + escapeHTML(ownerInitials(d.owner)) + '</div>' +
          '<div><p class="text-xs font-bold text-dark">' + escapeHTML(d.owner) + '</p><p class="text-[10px] text-stone-500">' + escapeHTML(d.ownerEmail) + '</p></div>' +
        '</div>' +
      '</td>' +
      '<td class="px-10 py-6">' + inquiryCategoryBadgeHtml(d.category) + '</td>' +
      '<td class="px-10 py-6">' + inquiryStatusBadgeHtml(resolved) + (resolved ? '' : inquiryAgeHtml(d.timestamp)) + '</td>' +
      '<td class="px-10 py-6 text-right text-stone-400 font-mono text-xs">' + formatInquiryTimestamp(d.timestamp) + '</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180">' +
        '<button onclick="openInquiryDetail(\'' + id + '\')" class="press px-4 py-2 text-xs font-bold text-stone-400 hover:text-dark transition-all">Review</button>' +
      '</td>' +
    '</tr>';
  }).join('') +
    '<tr id="inquiry-empty-row" class="hidden" data-empty-row="true"><td colspan="6" class="px-10 py-16 text-center">' +
      '<p class="text-sm font-bold text-dark">No inquiries match your search</p>' +
      '<p class="text-[11px] text-stone-400 mt-1">Try a different name, category or status.</p>' +
    '</td></tr>';
}

function filterInquiries() {
  var q = document.getElementById('inquiry-search').value.toLowerCase().trim();
  var qWords = q ? q.split(/\s+/) : [];
  var categoryFilter = document.getElementById('inquiry-category-filter').value;
  var rows = document.querySelectorAll('#inquiry-table-body tr[data-search]');
  var visible = 0;
  rows.forEach(function (row) {
    var matchesSearch = qWords.every(function (word) { return row.dataset.search.indexOf(word) !== -1; });
    var matchesCategory = categoryFilter === 'all' || row.dataset.category === categoryFilter;
    var matchesStatus = currentInquiryStatusFilter === 'all' || row.dataset.status === currentInquiryStatusFilter;
    var match = matchesSearch && matchesCategory && matchesStatus;
    row.dataset.filterMatch = match ? 'true' : 'false';
    if (match) visible++;
  });
  document.getElementById('inquiry-empty-row').classList.toggle('hidden', visible !== 0);
  var label = document.getElementById('inquiry-count-label');
  var isFiltered = q || categoryFilter !== 'all' || currentInquiryStatusFilter !== 'all';
  label.textContent = isFiltered ? ('Showing ' + visible + ' matching result' + (visible === 1 ? '' : 's')) : 'Showing all ' + visible + ' inquiries';
  applyTablePagination('inquiry-table-body', 'inquiry-pagination-controls', 10, true);
}

function computeInquiryKpis() {
  var traces = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS : {};
  var ids = Object.keys(traces);
  var resolvedCount = ids.filter(function (id) { return isInquiryResolved(id); }).length;
  document.getElementById('inquiries-total-kpi').textContent = ids.length;
  document.getElementById('inquiries-pending-kpi').textContent = ids.length - resolvedCount;
  document.getElementById('inquiries-resolved-kpi').textContent = resolvedCount;
}

// the big detail modal - full message, category-specific shortcut, and
// either the reply box (pending) or the reply that was actually sent
// (resolved) - never a fabricated one
function openInquiryDetail(inquiryId) {
  var d = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS[inquiryId] : null;
  if (!d) return;
  var resolved = isInquiryResolved(inquiryId);
  var reply = getInquiryReply(inquiryId);

  var shortcutHtml = '';
  if (d.category === 'Account Flag / Suspension Appeal' && d.usersPetsRowId) {
    shortcutHtml =
      '<div class="p-5 rounded-2xl bg-caution/5 border border-caution/10 mb-6">' +
        '<div class="flex items-center gap-2 mb-2"><i class="fa-solid fa-flag text-caution"></i><span class="text-xs font-bold text-caution uppercase tracking-widest">Flag / Ban Appeal</span></div>' +
        '<p class="text-[11px] text-stone-500 mb-3">This account’s actual flag/ban status and reason live on Users &amp; Pets, not duplicated here, so you’re always seeing the real current state.</p>' +
        '<button onclick="window.location.href=\'users-pets.html?openProfile=' + encodeURIComponent(d.usersPetsRowId) + '\'" data-perm="manageUsers" class="px-4 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl transition-all">View ' + escapeHTML(d.owner) + '’s Account Status</button>' +
      '</div>';
  } else if (d.category === 'Suggest Missing Ingredient for Encyclopedia' && d.suggestedIngredient) {
    shortcutHtml =
      '<div class="p-5 rounded-2xl bg-brand-light/40 border border-brand/10 mb-6">' +
        '<div class="flex items-center gap-2 mb-2"><i class="fa-solid fa-flask text-brand"></i><span class="text-xs font-bold text-brand uppercase tracking-widest">Suggested Ingredient</span></div>' +
        '<p class="text-sm font-bold text-dark mb-3">&ldquo;' + escapeHTML(d.suggestedIngredient) + '&rdquo;</p>' +
        '<button onclick="window.location.href=\'ingredient-database.html?new=' + encodeURIComponent(d.suggestedIngredient).replace(/'/g, '%27') + '\'" data-perm="manageIngredients" class="px-4 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl transition-all">Add to Ingredient Database</button>' +
      '</div>';
  }

  var replyOrFormHtml;
  if (resolved) {
    replyOrFormHtml =
      '<div class="p-5 rounded-2xl bg-safe/5 border border-safe/10">' +
        '<p class="text-[10px] font-bold text-safe uppercase tracking-widest mb-2"><i class="fa-solid fa-circle-check mr-1"></i>Reply Sent' + (reply && reply.time ? ' · ' + formatInquiryTimestamp(reply.time) : '') + '</p>' +
        '<p class="text-sm text-dark leading-relaxed">' + escapeHTML(reply ? reply.text : '') + '</p>' +
      '</div>';
  } else {
    replyOrFormHtml =
      '<div>' +
        '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Response to ' + escapeHTML(d.owner) + '</label>' +
        '<textarea id="inquiry-response-' + inquiryId + '" rows="3" placeholder="Explain what you found or what happens next..." class="w-full mt-1.5 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand transition-all resize-none"></textarea>' +
        '<div class="mt-4">' +
          '<button id="resolve-inquiry-btn" onclick="resolveInquiry(\'' + inquiryId + '\')" data-perm="manageInquiries" class="px-4 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl transition-all">Send Reply &amp; Resolve</button>' +
        '</div>' +
      '</div>';
  }

  openModal({
    title: '#' + inquiryId,
    subtitle: d.category + ' · ' + formatInquiryTimestamp(d.timestamp),
    wide: true,
    bodyHtml:
      '<div class="flex items-center gap-4 mb-6">' +
        '<div class="w-11 h-11 rounded-full bg-brand-light text-brand flex items-center justify-center text-xs font-bold shrink-0">' + escapeHTML(ownerInitials(d.owner)) + '</div>' +
        '<div><p class="text-sm font-bold text-dark">' + escapeHTML(d.owner) + '</p><p class="text-xs text-stone-500">' + escapeHTML(d.ownerEmail) + '</p></div>' +
      '</div>' +
      '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200 mb-6">' +
        '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">Message</p>' +
        '<p class="text-sm text-dark leading-relaxed italic">&ldquo;' + escapeHTML(d.message) + '&rdquo;</p>' +
      '</div>' +
      shortcutHtml +
      replyOrFormHtml,
    footerHtml:
      '<button onclick="closeModal()" class="px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close</button>'
  });
}

// sends the reply (in-app + email) and marks the inquiry resolved -- same
// deliver-then-log-then-toast shape as upholdDispute() on OCR Scan Records
function resolveInquiry(inquiryId) {
  var responseEl = document.getElementById('inquiry-response-' + inquiryId);
  var response = responseEl ? responseEl.value.trim() : '';
  if (!response) {
    showToast('Write a reply before resolving this inquiry', 'danger');
    return;
  }
  var d = (typeof INQUIRY_RECORDS !== 'undefined') ? INQUIRY_RECORDS[inquiryId] : null;
  var ownerName = (d && d.owner) || 'the pet owner';
  var ownerEmail = (d && d.ownerEmail) || '';
  var ownerId = (d && d.ownerId) || null;
  var btn = document.getElementById('resolve-inquiry-btn');

  withSavingState(btn, 'Sending...', function () {
    if (isInquiryResolved(inquiryId)) { closeModal(); refreshInquiries(); showToast('Another admin already replied to this inquiry, so no second reply was sent', 'danger'); return; }
    saveInquiryReply(inquiryId, response);
    if (ownerEmail) appendMessageHistory(ownerEmail, { subject: 'Re: your inquiry ' + inquiryId + ' (' + d.category + ')', body: response, alsoEmail: true, time: new Date().toISOString() });
    markInquiryResolved(inquiryId);
    closeModal();
    renderInquiriesTable();
    filterInquiries();
    computeInquiryKpis();
    showToast('Sending reply to ' + ownerName + '...', 'info');

    // Sending the real account id (resolved once, server-side, when /api/admin/data built this
    // ticket's owner) instead of re-matching by email here. That second email lookup was a
    // separate point of failure -- this skips it entirely and goes straight to the account we
    // already know is correct (it's the same one whose name is showing on this very page).
    var deliveries = [
      queueInAppNotification({ type: 'inquiry-reply', inquiry: inquiryId, user_id: ownerId, to: ownerEmail, name: ownerName, message: response })
    ];
    if (ownerEmail) {
      deliveries.push(sendSystemEmail({ type: 'inquiry-reply', inquiry: inquiryId, to: ownerEmail, name: ownerName, message: response }));
    }

    Promise.all(deliveries).then(function (results) {
      // queueInAppNotification resolves successfully (HTTP 200) even when the server couldn't
      // match this to a real pet-owner account -- it just comes back with delivered:false. That
      // used to be swallowed (only a console.warn), so the admin saw "Reply sent" even though
      // nobody actually got it. Surface that honestly instead.
      var inAppResult = results[0];
      if (inAppResult && inAppResult.delivered === false) {
        logAdminAction('Reply to inquiry ' + inquiryId + ' saved, but could not be delivered in-app: "' + response + '"', 'inquiry');
        showToast('Reply saved, but ' + ownerName + ' has no matching account to notify in-app' + (ownerEmail ? ' (email reply was still sent)' : ''), 'danger');
        renderNavBadges();
        return;
      }
      logAdminAction('Replied to inquiry ' + inquiryId + ' (in-app + email): "' + response + '"', 'inquiry');
      showToast('Reply sent to ' + ownerName, 'success');
      renderNavBadges();
    }).catch(function () {
      logAdminAction('Reply to inquiry ' + inquiryId + ' failed to fully deliver: "' + response + '"', 'inquiry');
      showToast('Reply could not be fully delivered to ' + ownerName, 'danger');
    });
  });
}

renderInquiriesTable();
computeInquiryKpis();
filterInquiries();
renderNavBadges();
applyRoleState();
restrictPageToRoles(['chief', 'support']);


/* ---------- Refresh ----------
   Rebuilds the table and numbers from the current inquiry state, keeping the
   search, filters and page. */
function refreshInquiries() {
  var page = PAGINATION_STATE['inquiry-table-body'] || 1;
  renderInquiriesTable();
  computeInquiryKpis();
  filterInquiries();
  if (page > 1) {
    PAGINATION_STATE['inquiry-table-body'] = page;
    applyTablePagination('inquiry-table-body', 'inquiry-pagination-controls', 10, false);
  }
  renderNavBadges();
}
initRefreshControl({ key: 'inquiries', label: 'Inquiries', onRefresh: refreshInquiries, auto: false });

restorePersistedRows('kibbleguard-scans-rows', document.getElementById('records-table-body'));

// adds the sample "Canine Joint Support Chews" scan (see KB-902145 in app.js) to
// the table ONE time, whether this browser is brand new or already holds saved
// rows from earlier. The flag means it never comes back after being removed.
function ensureSampleNotRatedScanRow() {
  var FLAG = 'kibbleguard-sample-notrated-scan';
  var tbody = document.getElementById('records-table-body');
  if (!tbody || localStorage.getItem(FLAG) === '1') return;
  if (!document.getElementById('row-902145')) {
    var tr = document.createElement('tr');
    tr.className = 'feed-row hover:bg-stone-50/50 group';
    tr.id = 'row-902145';
    tr.dataset.date = '2024-05-29';
    tr.dataset.verdict = 'safe';
    tr.dataset.species = 'feline';
    tr.dataset.confidence = '93';
    tr.dataset.search = 'kb-902145 canine joint support chews sarah jenkins luna feline not rated glucosamine chondroitin';
    tr.innerHTML =
      '<td class="px-10 py-6 font-mono text-xs text-stone-400 font-bold">#KB-902145</td>' +
      '<td class="px-10 py-6"><div class="flex items-center gap-4"><div class="w-11 h-11 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center text-sm shrink-0"><i class="fa-solid fa-image"></i></div><div><p class="font-bold text-dark italic">Canine Joint Support Chews</p></div></div></td>' +
      '<td class="px-10 py-6"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-brand-light text-brand flex items-center justify-center text-[10px] font-bold">SA</div><div><p class="text-xs font-bold text-dark">Sarah Jenkins</p><p class="text-[10px] text-stone-500 italic">Pet: Luna (Persian)</p></div></div></td>' +
      '<td class="px-10 py-6"><span class="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600"><i class="fa-solid fa-cat text-[#B57EDC]"></i> Feline</span></td>' +
      '<td class="px-10 py-6 text-xs font-bold text-stone-600 tabular-nums">93%</td>' +
      '<td class="px-10 py-6"><span class="text-sm font-display font-bold text-safe tabular-nums">100</span><span class="text-[10px] text-stone-400">/100</span></td>' +
      '<td class="px-10 py-6"><span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-safe/10 text-safe border-safe/10 font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid fa-circle-check"></i> Safe</span></td>' +
      '<td class="px-10 py-6 text-right text-stone-400 font-mono text-xs">2024-05-29 11:20</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180"><button onclick="inspectRecord(\'KB-902145\')" class="press px-4 py-2 text-xs font-bold text-stone-400 hover:text-dark transition-all">Inspect</button></td>';
    tbody.insertBefore(tr, tbody.firstChild);   // newest scan goes first
    try { savePersistedRows('kibbleguard-scans-rows', tbody); } catch (e) { /* storage full: the row still shows this session */ }
  }
  localStorage.setItem(FLAG, '1');
}
ensureSampleNotRatedScanRow();

/* ---------- Shared badge helpers ---------- */
/* 5-tier per-species ingredient classification (Risk Library) */
var RISK_LEVELS = ['Safe', 'Caution', 'Toxic'];
var RISK_LEVEL_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-amber-50 text-amber-500 border-amber-100' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10' }
};
// per-ingredient Safe/Caution/Toxic pill, shown in the substance breakdown
// inside a scan's detail view
// an ingredient the database has no rating for, for the species that was scanned.
// grey on purpose, never the green Safe look: "not assessed" is not "safe"
RISK_LEVEL_STYLES['Unrated'] = { icon: 'fa-circle-question', cls: 'bg-stone-100 text-stone-500 border-stone-200' };
function riskBadgeHtml(level) {
  level = normalizeLevel(level);
  var m = RISK_LEVEL_STYLES[level] || RISK_LEVEL_STYLES['Unrated'];
  var text = level === 'Unrated' ? 'Not Rated' : level;
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + text + '</span>';
}
// not actually used on this page, kept for consistency with the other
// pages that share this same badge-helpers block
function riskOptions(selected) {
  return RISK_LEVELS.map(function (l) {
    return '<option value="' + l + '"' + (l === selected ? ' selected' : '') + '>' + l + '</option>';
  }).join('');
}

/* 3-tier overall scan verdict (Safe / Caution / Toxic), plus Unable to Assess for a scan
   where none of the ingredients had a rating for the scanned species */
var VERDICT_STYLES = {
  'Unrated': { icon: 'fa-circle-question', cls: 'bg-stone-100 text-stone-500 border-stone-200', label: 'Unable to Assess' },
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10',       label: 'Safe' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-caution/10 text-caution border-caution/10', label: 'Caution' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10', label: 'Toxic' }
};
// the overall verdict badge for a whole scan (based on computeScanScore
// below), different from riskBadgeHtml which is per-ingredient
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Unrated'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- OCR Scan Records-specific interactions ---------- */
var currentScanFilter = 'all';
var currentSpeciesFilter = 'all';
var currentFlagFilter = 'all';   // 'all' | 'disputed' | 'unassessed' -- scan flags, kept separate from the verdict

// keeps both dropdowns, their "this one is active" green outline, and the
// Clear filters button in step with the filter state, whichever way it was
// changed (a dropdown, the Clear button, or the Users & Pets "Warnings" deep link)
function syncScanFilterUI() {
  [['scan-filter-verdict', currentScanFilter], ['scan-filter-species', currentSpeciesFilter], ['scan-filter-flag', currentFlagFilter]].forEach(function (pair) {
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
  var clearBtn = document.getElementById('scan-clear-filters');
  if (clearBtn) clearBtn.classList.toggle('hidden', currentScanFilter === 'all' && currentSpeciesFilter === 'all' && currentFlagFilter === 'all');
}

// Verdict dropdown: all / safe / caution / toxic / risk (Toxic+Caution).
// 'risk' is also what the "Warnings" deep link from a Users & Pets profile uses
function setScanFilter(mode) {
  currentScanFilter = mode;
  syncScanFilterUI();
  filterRecords();
}

// Flags dropdown: all / disputed / unassessed. These aren't verdicts -- a scan can be
// Toxic AND disputed, or Safe AND contain a Not-rated ingredient -- so they combine
// with the verdict filter instead of replacing it
function setFlagFilter(flag) {
  currentFlagFilter = flag;
  syncScanFilterUI();
  filterRecords();
}

// Species dropdown: all / canine / feline
function setSpeciesFilter(species) {
  currentSpeciesFilter = species;
  syncScanFilterUI();
  filterRecords();
}

// the "Clear filters" button: dropdowns back to "All" (search box has its own way to clear)
function clearScanFilters() {
  currentScanFilter = 'all';
  currentSpeciesFilter = 'all';
  currentFlagFilter = 'all';
  syncScanFilterUI();
  filterRecords();
}

// combines the search box with whichever verdict/species filters are active
function filterRecords() {
  var q = document.getElementById('records-search').value.toLowerCase().trim();
  // split into words rather than matching the whole typed string as one
  // block -- otherwise searching a full name like "Sarah Jenkins" finds
  // nothing, since a row's data-search has "sarah" and "buster" as
  // separate words, never that exact two-word phrase together
  var qWords = q ? q.split(/\s+/) : [];
  var rows = document.querySelectorAll('#records-table-body tr[data-search]');
  var visible = 0;
  rows.forEach(function (row) {
    var matchesSearch = qWords.every(function (word) { return row.dataset.search.indexOf(word) !== -1; });
    var matchesFilter = true;
    if (currentScanFilter === 'safe') matchesFilter = row.dataset.verdict === 'safe';
    if (currentScanFilter === 'toxic') matchesFilter = row.dataset.verdict === 'toxic';
    if (currentScanFilter === 'caution') matchesFilter = row.dataset.verdict === 'caution';
    var matchesFlag = currentFlagFilter === 'all' ||
      (currentFlagFilter === 'disputed' && row.dataset.disputed === 'true') ||
      (currentFlagFilter === 'unassessed' && row.dataset.unassessed === 'true');
    // 'risk' isn't one of the pill buttons -- it's a combined Toxic+Caution
    // view, only ever reached via the "Warnings" link on a Users & Pets
    // profile (see the ?verdict= deep link below), since "Warnings" means
    // anything that wasn't a clean Safe result, not one specific verdict
    if (currentScanFilter === 'risk') matchesFilter = row.dataset.verdict === 'toxic' || row.dataset.verdict === 'caution';
    var matchesSpecies = currentSpeciesFilter === 'all' || row.dataset.species === currentSpeciesFilter;
    var show = matchesSearch && matchesFilter && matchesFlag && matchesSpecies;
    row.dataset.filterMatch = show ? 'true' : 'false';
    if (show) visible++;
  });
  document.getElementById('records-empty-row').classList.toggle('hidden', visible !== 0);
  var label = document.getElementById('records-count-label');
  var scope = currentScanFilter === 'safe' ? 'safe scan' : currentScanFilter === 'toxic' ? 'toxic scan' : currentScanFilter === 'caution' ? 'caution scan' : currentFlagFilter === 'disputed' ? 'disputed scan' : currentFlagFilter === 'unassessed' ? 'not-rated scan' : currentScanFilter === 'risk' ? 'at-risk scan' : 'historical scan';
  var isFiltered = q || currentScanFilter !== 'all' || currentSpeciesFilter !== 'all' || currentFlagFilter !== 'all';
  label.textContent = isFiltered
    ? ('Displaying ' + visible + ' matching ' + scope + (visible === 1 ? '' : 's'))
    : 'Displaying all ' + visible + ' historical scans';
  applyTablePagination('records-table-body', 'records-pagination-controls', 10, true);
}

/* RECORD_TRACES now lives in app.js as shared data -- see there for the full scan trace details. */

// the only three real ratings. ANYTHING else (a species the ingredient is "Not
// rated" for, a blank, a typo, a missing value) is treated as Not Rated, so a
// gap in the data can never quietly turn into a Safe result
function normalizeLevel(level) {
  return (level === 'Safe' || level === 'Caution' || level === 'Toxic') ? level : 'Unrated';
}

// caution knocks off 18 points, toxic knocks off 55, starting from 100
// same 3-tier verdict as everywhere else: safe 85+, caution 55-84, toxic under 55
// Safe costs nothing. Not Rated also costs nothing: there is no rating to score,
// so it is neither penalised nor rewarded. What it CAN'T do is count as evidence
// that the product is safe, which is handled in computeScanOutcome below
function pointsForLevel(level) {
  level = normalizeLevel(level);
  if (level === 'Caution') return -18;
  if (level === 'Toxic') return -55;
  return 0;
}

// starts at 100, subtracts points per ingredient (see pointsForLevel above) -
// this is why one bad ingredient doesn't automatically mean Toxic, but
// several Caution ones stacked up can still drag the score down that far
function computeScanScore(substances) {
  var score = 100;
  substances.forEach(function (s) {
    score += pointsForLevel(s.level);
  });
  return Math.max(0, score);
}

// turns the numeric score into the actual Safe/Caution/Toxic label
function scoreToVerdict(score) {
  if (score >= 85) return 'Safe';
  if (score >= 55) return 'Caution';
  return 'Toxic';
}

// the one place a scan's score, verdict and "not assessed" list are worked out,
// so the table, the detail view and anything added later can't disagree.
// - the Safe / Caution / Toxic verdict comes ONLY from ingredients that have a
//   rating for the scanned species (Not Rated ones are skipped, not penalised,
//   and never turned into "Caution", which would wrongly suggest a known risk)
// - any Not Rated ingredients are returned separately so they can be shown next
//   to the verdict as "not assessed"
// - if NOTHING on the label has a rating, there is no verdict to give: the
//   result is 'Unrated' (shown as "Unable to Assess"), never Safe
function computeScanOutcome(substances) {
  var unratedNames = [];
  var ratedCount = 0;
  substances.forEach(function (s) {
    if (normalizeLevel(s.level) === 'Unrated') unratedNames.push(s.name);
    else ratedCount++;
  });
  if (ratedCount === 0) {
    return { score: null, verdict: 'Unrated', unratedNames: unratedNames, ratedCount: 0 };
  }
  var score = computeScanScore(substances);
  return { score: score, verdict: scoreToVerdict(score), unratedNames: unratedNames, ratedCount: ratedCount };
}

// the big detail modal for one scan - score breakdown, raw OCR text vs
// what got matched, and the dispute panel if there's an open one
function inspectRecord(scanId) {
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  var data = traces[scanId];
  if (!data) return;
  var rowEl = null;
  document.querySelectorAll('#records-table-body tr[data-search]').forEach(function (r) {
    if (r.querySelector('td:first-child').textContent.indexOf(scanId) !== -1) rowEl = r;
  });
  var productName = scanId;
  if (rowEl) {
    var nameEl = rowEl.querySelector('.italic').cloneNode(true);
    nameEl.querySelectorAll('span').forEach(function (b) { b.remove(); });   // drop the Disputed / Not Rated badges
    productName = nameEl.textContent.trim();
  }

  var outcome = computeScanOutcome(data.substances);
  var score = outcome.score;
  var verdict = outcome.verdict;
  var speciesWord = data.species === 'feline' ? 'cats' : 'dogs';
  var scoreColor = verdict === 'Unrated' ? 'text-stone-400 border-stone-300' : verdict === 'Safe' ? 'text-safe border-safe' : verdict === 'Caution' ? 'text-caution border-caution' : 'text-danger border-danger';

  var substancesHtml = data.substances.map(function (s) {
    var pts = pointsForLevel(s.level);
    var isUnrated = normalizeLevel(s.level) === 'Unrated';
    var ptsLabel = isUnrated ? 'Not scored' : (pts === 0 ? 'No deduction' : (pts + ' pts'));
    var ptsColor = pts <= -55 ? 'text-danger' : (pts < 0 ? 'text-caution' : 'text-stone-400');
    return '<div class="flex items-start gap-4 p-4 rounded-2xl border border-stone-200 bg-stone-100/50">' +
      '<div class="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-stone-400 shrink-0"><i class="fa-solid fa-flask"></i></div>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="flex items-center justify-between gap-3 mb-1">' +
          '<p class="text-sm font-bold text-dark truncate">' + escapeHTML(s.name) + '</p>' +
          '<div class="flex items-center gap-2 shrink-0">' +
            '<span class="text-[10px] font-bold tabular-nums ' + ptsColor + '">' + ptsLabel + '</span>' +
            riskBadgeHtml(s.level) +
          '</div>' +
        '</div>' +
        '<p class="text-[10px] text-stone-400 uppercase tracking-widest font-bold mb-1">' + escapeHTML(s.category) + '</p>' +
        '<p class="text-xs text-stone-500 leading-relaxed">' + escapeHTML(s.note) + '</p>' +
      '</div>' +
    '</div>';
  }).join('');

  var unratedBannerHtml = outcome.unratedNames.length
    ? '<div class="flex items-start gap-3 p-4 rounded-2xl bg-stone-100 border border-stone-200 mb-6">' +
        '<i class="fa-solid fa-circle-question text-stone-400 mt-0.5"></i>' +
        '<div>' +
          '<p class="text-xs font-bold text-dark">' + outcome.unratedNames.length + ' ingredient' + (outcome.unratedNames.length === 1 ? '' : 's') + ' not assessed for ' + speciesWord + ': ' + outcome.unratedNames.map(escapeHTML).join(', ') + '</p>' +
          '<p class="text-[11px] text-stone-500 leading-relaxed mt-1">' +
            (outcome.ratedCount === 0
              ? 'None of the ingredients on this label have a rating for ' + speciesWord + ', so no verdict can be given. This scan is shown as Unable to Assess, not as Safe.'
              : 'The verdict above covers only the ingredients that do have a rating. These ones are shown as Not Rated, which means no data yet, not a known risk.') +
          '</p>' +
          '<a href="ingredient-database.html" class="inline-block mt-2 text-[11px] font-bold text-brand hover:underline">Open Ingredient Database to rate or add them</a>' +
        '</div>' +
      '</div>'
    : '';

  var jsonLines = data.substances.map(function (s, i) {
    return '{"token": "' + s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '", "map_node": "' + escapeHTML(s.name) + '", "risk": "' + s.level + '"}' + (i < data.substances.length - 1 ? ',' : '');
  }).join('\n  ');

  openModal({
    title: productName,
    subtitle: '#' + scanId + ' \u00b7 ' + data.timestamp,
    wide: true,
    bodyHtml:
      '<div class="flex items-center gap-6 mb-6 p-6 rounded-2xl bg-stone-100 border border-stone-200">' +
        '<div class="w-20 h-20 rounded-full border-4 ' + scoreColor + ' flex flex-col items-center justify-center shrink-0 bg-white">' +
          '<span class="text-2xl font-display font-bold ' + scoreColor.split(' ')[0] + ' leading-none">' + (outcome.score === null ? '&mdash;' : score) + '</span>' +
          '<span class="text-[8px] text-stone-400 font-bold text-center leading-tight">' + (outcome.score === null ? 'no rating' : (outcome.unratedNames.length ? 'rated only' : '/ 100')) + '</span>' +
        '</div>' +
        '<div class="flex-1">' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Safety Score and Final Verdict</p>' +
          verdictBadgeHtml(verdict) +
          '<p class="text-[11px] text-stone-500 mt-2 leading-relaxed">Scored from every detected ingredient\u2019s classification, not just whether one Toxic match exists. Caution ingredients cost points too, and any Toxic match caps the score below the Safe range.</p>' +
        '</div>' +
      '</div>' +
      unratedBannerHtml +
      '<div class="grid grid-cols-3 gap-4 mb-6">' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 text-center"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Image Clarity</p><p class="text-sm font-bold text-dark">' + escapeHTML(data.clarity) + '</p></div>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 text-center"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">OCR Confidence</p><p class="text-sm font-bold text-dark">' + escapeHTML(data.confidence) + '</p></div>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 text-center"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Species</p><p class="text-sm font-bold text-dark capitalize">' + escapeHTML(data.species) + '</p></div>' +
      '</div>' +
      labelPhotoHtml(data.imageUrl) +
      '<details class="mb-6" open><summary class="cursor-pointer text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3"><i class="fa-solid fa-magnifying-glass mr-1"></i>OCR Audit: Raw Text vs. Parsed Output</summary>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">' +
          '<div class="p-4 rounded-2xl bg-dark">' +
            '<p class="text-[9px] font-bold text-stone-500 uppercase tracking-widest mb-2">Raw OCR Extraction</p>' +
            '<p class="text-[11px] text-stone-300 font-mono leading-relaxed">' + escapeHTML(data.rawOcrText) + '</p>' +
          '</div>' +
          '<div class="p-4 rounded-2xl bg-brand-light border border-brand/10">' +
            '<p class="text-[9px] font-bold text-brand uppercase tracking-widest mb-2">Parsed & Matched Ingredients</p>' +
            '<p class="text-[11px] text-dark leading-relaxed">' + data.substances.map(function (s) { return escapeHTML(s.name); }).join(', ') + '</p>' +
          '</div>' +
        '</div>' +
      '</details>' +
      '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3">Score Breakdown: 100 Base, Minus Each Match Below</p>' +
      '<div class="space-y-3 mb-6">' + substancesHtml + '</div>' +
      (data.dispute && !isDisputeResolved(scanId) ? disputePanelHtml(scanId, data.dispute, data.substances) : '') +
      '<details class="text-xs"><summary class="cursor-pointer font-bold text-stone-400 hover:text-dark uppercase tracking-widest text-[10px]">View Raw Extraction Payload</summary>' +
        '<div class="mt-3 bg-dark rounded-2xl p-5 font-mono text-[11px] leading-relaxed text-stone-300 overflow-x-auto" id="trace-raw-body">' +
          '"metadata": { "user_id": "' + data.user_id + '", "pet_species": "' + data.species + '", "timestamp": "' + data.timestamp + '" },<br>' +
          '"ocr_results": [<br>&nbsp;&nbsp;' + jsonLines.replace(/\n/g, '<br>') + '<br>],<br>' +
          '"safety_score": ' + score + ',<br>' +
          '"not_assessed": ' + outcome.unratedNames.length + ',<br>' +
          '"final_verdict": "' + verdict + '"' +
        '</div>' +
      '</details>',
    footerHtml:
      '<button onclick="copyPayload()" class="px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Copy Payload</button>' +
      '<button onclick="closeModal()" class="px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close</button>'
  });
}

function disputePanelHtml(scanId, dispute, substances) {
  // the "Review Ingredient Entry" button needs to point at whatever ingredient the dispute is actually about.
  // picks the worst-case one in the scan (toxic beats caution beats safe), since that's almost always
  // what a pet owner is disputing, not the safe stuff in the label
  var severityRank = { 'Toxic': 3, 'Caution': 2, 'Safe': 1 };
  var disputedIngredient = (substances || []).reduce(function (worst, s) {
    if (!worst || (severityRank[s.level] || 0) > (severityRank[worst.level] || 0)) return s;
    return worst;
  }, null);
  var ingredientName = disputedIngredient ? disputedIngredient.name : '';
  var reviewButton = ingredientName
    ? '<button onclick="window.location.href=\'ingredient-database.html?edit-name=' + encodeURIComponent(ingredientName).replace(/'/g, '%27') + '\'" data-perm="manageIngredients" class="px-4 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl transition-all">Review "' + escapeHTML(ingredientName) + '" Entry</button>'
    : '';
  return '<div class="p-5 rounded-2xl bg-amber-50/50 border border-amber-100 mb-6" id="dispute-panel-' + scanId + '">' +
    '<div class="flex items-center gap-2 mb-3"><i class="fa-solid fa-comment-dots text-amber-500"></i><span class="text-xs font-bold text-amber-700 uppercase tracking-widest">Pet Owner Dispute: ' + escapeHTML(dispute.owner) + '</span></div>' +
    '<p class="text-sm text-dark leading-relaxed italic mb-4">' + escapeHTML(dispute.note) + '</p>' +
    '<p class="text-[11px] text-stone-500 mb-4">Review the classification, then either confirm it stands or update the ingredient database. Your response below is sent to ' + escapeHTML(dispute.owner) + ' and appears in their app.</p>' +
    '<div class="mb-4">' +
      '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Response to ' + escapeHTML(dispute.owner) + '</label>' +
      '<textarea id="dispute-response-' + scanId + '" rows="3" placeholder="Explain your decision in a way the pet owner will understand..." class="w-full mt-1.5 px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand transition-all resize-none"></textarea>' +
    '</div>' +
    '<div class="flex items-center gap-3">' +
      '<button id="uphold-dispute-btn-' + scanId + '" onclick="upholdDispute(\'' + scanId + '\')" data-perm="resolveDisputes" class="px-4 py-2 text-xs font-bold text-stone-600 border-2 border-stone-200 rounded-xl hover:bg-stone-50 transition-all">Uphold Classification &amp; Reply</button>' +
      '<button id="overturn-dispute-btn-' + scanId + '" onclick="overturnDispute(\'' + scanId + '\')" data-perm="resolveDisputes" class="px-4 py-2 text-xs font-bold text-danger border-2 border-danger/30 rounded-xl hover:bg-danger/5 transition-all">Overturn &amp; Correct Verdict</button>' +
      reviewButton +
    '</div>' +
  '</div>';
}

// marks every scan that contains at least one ingredient with no rating for the
// scanned species: a data attribute (so the "Not Rated" filter and exports can
// use it) and a small grey badge by the product name. Worked out fresh from the
// scan traces every time the page loads, so it can't go stale in the saved rows

/* ---------- Captured label photo ----------
   A scan can carry a label photo in its trace as `imageUrl` (RECORD_TRACES[scanId].imageUrl;
   with the backend this is the URL the user app's upload returns). Nothing is stored
   in the browser and nothing is made up: a scan without a photo says so. Only http(s),
   data:image and relative URLs are accepted, so a bad value can't run script. */
function safeLabelImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  url = url.trim();
  if (/^(https?:\/\/|data:image\/)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';   // any other scheme (javascript:, etc.)
  return url;                                          // relative path
}
function labelPhotoHtml(rawUrl) {
  var url = safeLabelImageUrl(rawUrl);
  var placeholder = '<div class="h-24 rounded-2xl bg-stone-100 border border-dashed border-stone-200 flex flex-col items-center justify-center text-stone-400 gap-1"' + (url ? ' style="display:none"' : '') + '>' +
      '<i class="fa-solid fa-image text-xl"></i>' +
      '<p class="text-[11px] font-medium px-6 text-center">' + (url ? 'The label photo could not be loaded' : 'Label photo unavailable (it may have been removed under the retention policy)') + '</p>' +
    '</div>';
  var photo = url
    ? '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener" title="Open full size" class="block rounded-2xl bg-stone-100 border border-stone-200 overflow-hidden">' +
        '<img src="' + escapeHTML(url) + '" alt="Captured label" class="w-full max-h-72 object-contain" onerror="this.parentNode.style.display=\'none\';this.parentNode.nextElementSibling.style.display=\'flex\'">' +
      '</a>'
    : '';
  return '<div class="mb-6"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3"><i class="fa-solid fa-image mr-1"></i>Captured Label</p>' + photo + placeholder + '</div>';
}

// the small thumbnail in the table's Captured Label column: the photo when the scan has
// one, the generic image icon when it doesn't. Rebuilt from the trace every time, so it
// never goes stale in the saved rows
function refreshLabelThumbnails() {
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  document.querySelectorAll('#records-table-body tr[data-search]').forEach(function (row) {
    var box = row.querySelector('td:nth-child(2) .w-11');
    if (!box) return;
    var trace = traces['KB-' + row.id.replace('row-', '')];
    var url = safeLabelImageUrl(trace && trace.imageUrl);
    if (url) {
      if (box.dataset.src === url) return;
      box.dataset.src = url;
      box.classList.add('overflow-hidden');
      box.innerHTML = '<img src="' + escapeHTML(url) + '" alt="" class="w-full h-full object-cover" onerror="this.remove()">';
    } else if (box.dataset.src) {
      delete box.dataset.src;
      box.classList.remove('overflow-hidden');
      box.innerHTML = '<i class="fa-solid fa-image"></i>';
    }
  });
}

function refreshUnassessedMarkers() {
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  document.querySelectorAll('#records-table-body tr[data-search]').forEach(function (row) {
    var trace = traces['KB-' + row.id.replace('row-', '')];
    var names = trace ? computeScanOutcome(trace.substances).unratedNames : [];
    var nameP = row.querySelector('td:nth-child(2) p');
    if (nameP) nameP.querySelectorAll('.unassessed-badge').forEach(function (b) { b.remove(); });
    if (names.length) {
      row.dataset.unassessed = 'true';
      if (nameP) nameP.insertAdjacentHTML('beforeend', '<span class="unassessed-badge ml-2 px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[8px] font-bold uppercase tracking-widest border border-stone-200 not-italic" title="' + escapeHTML(names.length + ' ingredient(s) not rated for this pet: ' + names.join(', ')) + '">Not Rated</span>');
    } else {
      delete row.dataset.unassessed;
    }
  });
}

/* ---------- Audit Trail Health: computed live from the table ---------- */
function computeOcrKpis() {
  var rows = document.querySelectorAll('#records-table-body tr[data-verdict]');
  var total = rows.length;
  var confidenceSum = 0;
  var flagged = 0;
  var disputed = 0;
  rows.forEach(function (row) {
    var c = parseInt(row.dataset.confidence, 10);
    if (!isNaN(c)) confidenceSum += c;
    if (row.dataset.verdict === 'caution' || row.dataset.verdict === 'toxic') flagged++;
    if (row.dataset.disputed === 'true') disputed++;
  });
  var avgConfidence = total > 0 ? Math.round(confidenceSum / total) : 0;

  document.getElementById('ocr-kpi-total').textContent = total.toLocaleString();
  document.getElementById('ocr-kpi-confidence').textContent = avgConfidence + '%';
  document.getElementById('ocr-kpi-flagged').textContent = flagged.toLocaleString();
  document.getElementById('ocr-kpi-disputed').textContent = disputed.toLocaleString();
}

/* ---------- Pipeline accuracy (ISO/IEC 9126 evaluation) ----------
   Computed from real scan data, not a stored number. Extraction = confidence
   at/above the auto-approve threshold; detection = tokens that matched a
   database entry; classification = verdicts never overturned by a dispute. */
function getAutoApproveThreshold() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-safety-rules')); } catch (e) { saved = null; }
  var value = saved && saved.autoApprove ? parseInt(saved.autoApprove, 10) : NaN;
  return isNaN(value) ? 92 : value;
}
var AUTO_APPROVE_THRESHOLD = getAutoApproveThreshold();

// picks an axis maximum and tick count for a chart of whole-number counts, with
// breathing room above the tallest bar so its value label never gets squeezed
// against the edge of the plot. works for 4 scans or 40,000: steps are always
// a "nice" whole number (1, 2, 5, 10, 20, 50, ...) and there are never more
// than about 6 ticks, instead of one tick per count
function niceCountAxis(maxCount) {
  var target = Math.max(1, maxCount) * 1.2;   // 20% headroom for the value label
  var rough = target / 5;                     // aim for roughly 5 ticks
  var magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  var step = magnitude;
  [1, 2, 5, 10].some(function (m) { step = m * magnitude; return step >= rough; });
  step = Math.max(1, step);
  var ticks = Math.max(2, Math.ceil(target / step));
  return { max: step * ticks, tickAmount: ticks };
}

// top 8 ingredients (or top 8 within a filter), all bars scaled against one
// shared max rather than each column scaling to its own top item, so bar
// length actually reflects real magnitude, not just rank within its own column
var currentIngredientFrequencyFilter = 'all';
var INGREDIENT_FREQUENCY_LIMIT = 8;

/* tallyIngredientFrequency now lives in app.js as a shared function. */

// the Toxic/Caution/Safe/All filter on the "most detected ingredients"
// panel further down the page
function setIngredientFrequencyFilter(level) {
  currentIngredientFrequencyFilter = level;
  var ids = { all: 'ingfreq-filter-all', Toxic: 'ingfreq-filter-toxic', Caution: 'ingfreq-filter-caution', Safe: 'ingfreq-filter-safe' };
  Object.keys(ids).forEach(function (key) {
    document.getElementById(ids[key]).className = key === level
      ? 'press px-3 py-1.5 rounded-lg bg-brand text-white text-[10px] font-bold shadow-sm transition-all'
      : 'press px-3 py-1.5 rounded-lg text-stone-500 hover:text-dark text-[10px] font-bold transition-all';
  });
  renderIngredientFrequency();
}

// the bar-chart-style list of most-scanned ingredients, capped to the top
// few so it doesn't turn into an endless list once there's real scan volume
var ingredientFrequencyChartInstance = null;

function renderIngredientFrequency() {
  var data = tallyIngredientFrequency();
  var filtered = currentIngredientFrequencyFilter === 'all'
    ? data.list
    : data.list.filter(function (item) { return item.level === currentIngredientFrequencyFilter; });

  var container = document.getElementById('ingredient-frequency-list');
  var truncationNote = document.getElementById('ingfreq-truncation-note');
  document.getElementById('ingfreq-scan-count').textContent = data.scanCount;

  if (ingredientFrequencyChartInstance) {
    ingredientFrequencyChartInstance.destroy();
    ingredientFrequencyChartInstance = null;
  }
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-xs text-stone-400 text-center py-6">No ' + currentIngredientFrequencyFilter.toLowerCase() + ' ingredients detected in the current scan history.</p>';
    truncationNote.textContent = '';
    return;
  }

  var totalMatching = filtered.length;
  var visible = filtered.slice(0, INGREDIENT_FREQUENCY_LIMIT);
  truncationNote.textContent = totalMatching > INGREDIENT_FREQUENCY_LIMIT
    ? ' (top ' + INGREDIENT_FREQUENCY_LIMIT + ' of ' + totalMatching + ' detected)'
    : '';

  if (typeof ApexCharts === 'undefined') return;
  var isDark = document.documentElement.classList.contains('dark-theme');
  var riskHex = { 'Safe': '#15803D', 'Caution': '#C17817', 'Toxic': '#B91C1C', 'Unrated': '#a8a29e' };
  // visible is already sorted most-frequent first (tallyIngredientFrequency),
  // and this chart renders its categories array top-to-bottom in that same
  // order -- so keep it as-is; a .reverse() here would put the #1 ingredient
  // at the bottom instead of the top
  var ordered = visible;

  // counts are small whole numbers (1, 2, 3...), so the value axis needs to
  // tick in whole steps too -- left on auto, ApexCharts spaces ticks like
  // 0.0/0.2/0.4 which reads as fractional detections and looks wrong
  var freqAxis = niceCountAxis(Math.max.apply(null, ordered.map(function (item) { return item.count; })));
  ingredientFrequencyChartInstance = new ApexCharts(container, {
    series: [{ name: 'Detections', data: ordered.map(function (item) { return item.count; }) }],
    chart: { type: 'bar', height: Math.max(180, ordered.length * 38), toolbar: { show: false }, fontFamily: 'Inter' },
    plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 4, distributed: true } },
    colors: ordered.map(function (item) { return riskHex[item.level] || '#a8a29e'; }),
    xaxis: {
      categories: ordered.map(function (item) { return item.name; }),
      min: 0,
      max: freqAxis.max,
      tickAmount: freqAxis.tickAmount,
      labels: { style: { colors: '#94a3b8' }, formatter: function (val) { return Math.round(val); } }
    },
    yaxis: { labels: { style: { colors: isDark ? '#B8B0A0' : '#6B6558', fontWeight: 600 }, maxWidth: 160 } },
    grid: { borderColor: isDark ? '#2f3034' : '#f1f5f9', strokeDashArray: 4 },
    legend: { show: false },
    dataLabels: { enabled: true, formatter: function (val) { return val + ' of ' + data.scanCount; }, style: { fontSize: '10px', fontWeight: 700 }, offsetX: 4 },
    tooltip: { enabled: false }
  });
  ingredientFrequencyChartInstance.render();
}

// the 3 accuracy numbers for the ISO/IEC 9126 section: extraction rate
// (% of scans confident enough to auto-approve), detection rate (% of OCR
// tokens that actually matched something in the database), and
// classification rate (% of scans that never got disputed)
function computeAccuracyMetrics() {
  var rows = document.querySelectorAll('#records-table-body tr[data-verdict]');
  var total = rows.length;
  if (total === 0) return;
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};

  var aboveThreshold = 0;
  var disputedOpen = 0;
  var overturned = 0;
  var overrides = getScanOverrides();
  var clarityCounts = {};

  rows.forEach(function (row) {
    var conf = parseInt(row.dataset.confidence, 10);
    if (!isNaN(conf) && conf >= AUTO_APPROVE_THRESHOLD) aboveThreshold++;
    if (row.dataset.disputed === 'true') disputedOpen++;

    var scanId = 'KB-' + row.id.replace('row-', '');
    if (overrides[scanId]) overturned++;
    var trace = traces[scanId];
    var clarity = trace ? trace.clarity : 'Unknown';
    clarityCounts[clarity] = (clarityCounts[clarity] || 0) + 1;
  });

  var matchedTokens = 0;
  var totalTokens = 0;
  Object.keys(traces).forEach(function (id) {
    var trace = traces[id];
    totalTokens += trace.substances.length + (trace.unresolvedTokens || 0);
    matchedTokens += trace.substances.length;
  });

  var extraction = Math.round((aboveThreshold / total) * 100);
  var detection = totalTokens > 0 ? Math.round((matchedTokens / totalTokens) * 100) : 0;
  // a verdict only counts as standing if it is neither under dispute nor was overturned after one
  var classification = Math.round(((total - disputedOpen - overturned) / total) * 100);

  renderAccuracyGauge('acc-gauge-extraction', 'Extraction', extraction);
  renderAccuracyGauge('acc-gauge-detection', 'Detection', detection);
  renderAccuracyGauge('acc-gauge-classification', 'Classification', classification);

  var sampleEl = document.getElementById('acc-sample-size');
  if (sampleEl) sampleEl.textContent = total;

  renderCaptureQuality(clarityCounts, total);
}

// each accuracy metric gets its own radial gauge on the same 0-100% scale.
// these are three independent rates (not parts of one whole), so separate
// gauges read more honestly than one stacked or concentric chart -- and the
// ring colour keeps the same green/amber/red thresholds the old bars used
var accuracyGaugeInstances = {};

function accuracyGaugeColor(value, isDark) {
  if (value >= 90) return isDark ? '#4ade80' : '#15803D';
  if (value >= 70) return isDark ? '#f0a942' : '#C17817';
  return isDark ? '#ef4444' : '#B91C1C';
}

function renderAccuracyGauge(elId, label, value) {
  var el = document.getElementById(elId);
  if (!el || typeof ApexCharts === 'undefined') return;
  if (accuracyGaugeInstances[elId]) {
    accuracyGaugeInstances[elId].destroy();
    accuracyGaugeInstances[elId] = null;
  }
  el.innerHTML = '';
  el.setAttribute('aria-label', label + ' accuracy: ' + value + ' percent');
  var isDark = document.documentElement.classList.contains('dark-theme');
  accuracyGaugeInstances[elId] = new ApexCharts(el, {
    series: [value],
    chart: { type: 'radialBar', height: 210, sparkline: { enabled: true }, fontFamily: 'Inter' },
    plotOptions: {
      radialBar: {
        startAngle: -120,
        endAngle: 120,
        hollow: { size: '62%' },
        track: { background: isDark ? '#35363b' : '#ece9e1', strokeWidth: '100%' },
        dataLabels: {
          name: { show: false },
          value: {
            offsetY: 8,
            fontSize: '34px',
            fontWeight: 700,
            fontFamily: 'DM Sans',
            color: isDark ? '#f5f5f6' : '#2A241C',
            formatter: function (v) { return Math.round(v) + '%'; }
          }
        }
      }
    },
    colors: [accuracyGaugeColor(value, isDark)],
    stroke: { lineCap: 'round' },
    tooltip: { enabled: false }
  });
  accuracyGaugeInstances[elId].render();
}

// the Excellent/Good/Fair/Poor photo-quality breakdown.
// called from computeAccuracyMetrics above, since it needs the same per-scan data.
// clarity has a natural best-to-worst order, so a vertical bar chart keeps that
// order left to right, and a rating with zero scans still shows as an empty
// slot instead of silently disappearing (useful for seeing "no Poor captures")
var captureQualityChartInstance = null;

function renderCaptureQuality(clarityCounts, total) {
  var colorMap = { 'Excellent': '#15803D', 'Good': '#8DA65F', 'Fair': '#C17817', 'Poor': '#B91C1C', 'Unknown': '#a8a29e' };
  var chartEl = document.querySelector('#capture-quality-breakdown');
  if (!chartEl || typeof ApexCharts === 'undefined') return;
  if (captureQualityChartInstance) {
    captureQualityChartInstance.destroy();
    captureQualityChartInstance = null;
  }
  chartEl.innerHTML = '';

  if (!total) {
    chartEl.innerHTML = '<p class="text-xs text-stone-400 text-center py-10">No scans to break down yet.</p>';
    return;
  }
  // the four real ratings always get a slot, Unknown only appears if some scan has it
  var order = ['Excellent', 'Good', 'Fair', 'Poor'];
  if (clarityCounts['Unknown']) order.push('Unknown');
  var counts = order.map(function (k) { return clarityCounts[k] || 0; });
  var axis = niceCountAxis(Math.max.apply(null, counts));

  var isDark = document.documentElement.classList.contains('dark-theme');
  captureQualityChartInstance = new ApexCharts(chartEl, {
    series: [{ name: 'Scans', data: counts }],
    chart: { type: 'bar', height: 240, toolbar: { show: false }, fontFamily: 'Inter' },
    plotOptions: { bar: { horizontal: false, columnWidth: '45%', borderRadius: 6, distributed: true, dataLabels: { position: 'top' } } },
    colors: order.map(function (k) { return colorMap[k]; }),
    xaxis: {
      categories: order,
      labels: { style: { colors: isDark ? '#B8B0A0' : '#6B6558', fontWeight: 700, fontSize: '11px' } },
      axisTicks: { show: false },
      axisBorder: { show: false }
    },
    // counts are small whole numbers, so tick in whole steps (see the same note on the ingredient chart)
    yaxis: {
      min: 0,
      max: axis.max,
      tickAmount: axis.tickAmount,
      labels: { style: { colors: '#94a3b8' }, formatter: function (val) { return Math.round(val); } }
    },
    grid: { borderColor: isDark ? '#2f3034' : '#f1f5f9', strokeDashArray: 4 },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      formatter: function (val) { return val > 0 ? val + ' (' + Math.round((val / total) * 100) + '%)' : ''; },
      offsetY: -22,
      style: { fontSize: '11px', fontWeight: 700, colors: [isDark ? '#f5f5f6' : '#2A241C'] }
    },
    tooltip: {
      enabled: true,
      theme: isDark ? 'dark' : 'light',
      y: { formatter: function (val) { return val + ' scan' + (val === 1 ? '' : 's') + ' (' + Math.round((val / total) * 100) + '%)'; } }
    }
  });
  captureQualityChartInstance.render();
}

function upholdDispute(scanId) {
  // actually sends the reply now (in-app + email) instead of just logging
  // it - the panel text always said it would get sent, this makes that true
  var responseEl = document.getElementById('dispute-response-' + scanId);
  var response = responseEl ? responseEl.value.trim() : '';
  if (!response) {
    showToast('Write a response to the pet owner before closing this dispute', 'danger');
    return;
  }
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  var dispute = (traces[scanId] && traces[scanId].dispute) ? traces[scanId].dispute : {};
  var ownerName = dispute.owner || 'the pet owner';
  var ownerEmail = dispute.ownerEmail || '';
  var btn = document.getElementById('uphold-dispute-btn-' + scanId);

  withSavingState(btn, 'Sending...', function () {
    if (isDisputeResolved(scanId)) { closeModal(); refreshScanRecords(); showToast('Another admin already closed this dispute, so no second reply was sent', 'danger'); return; }
    var row = document.getElementById('row-' + scanId.replace('KB-', ''));
    var originalRowHtml = row ? row.outerHTML : null; // badge lives inside the row, so this snapshot covers both
    if (row) {
      row.dataset.disputed = 'false';
      var badge = document.getElementById('dispute-badge-' + scanId.replace('KB-', ''));
      if (badge) badge.remove();
    }
    var panel = document.getElementById('dispute-panel-' + scanId);
    var panelParent = panel ? panel.parentNode : null;
    var panelNextSibling = panel ? panel.nextSibling : null;
    if (panel) panel.remove();

    // persist both the row's cleared dispute flag and the resolved-disputes
    // list before any of the "it worked" UI below - on failure, put the row
    // and panel back exactly as they were and re-throw. savePersistedRows
    // (the table itself) goes first and markDisputeResolved (a second,
    // separate localStorage key) only after it succeeds, so a failure never
    // leaves the resolved-disputes list out of sync with the table
    try {
      savePersistedRows('kibbleguard-scans-rows', document.getElementById('records-table-body'));
      markDisputeResolved(scanId);
    } catch (e) {
      if (row && originalRowHtml) {
        var revertTemp = document.createElement('tbody');
        revertTemp.innerHTML = originalRowHtml;
        row.parentNode.replaceChild(revertTemp.firstElementChild, row);
      }
      if (panel && panelParent) panelParent.insertBefore(panel, panelNextSibling);
      throw e;
    }

    if (ownerEmail) appendMessageHistory(ownerEmail, { subject: 'Re: your dispute on ' + scanId + ' (classification upheld)', body: response, alsoEmail: true, time: new Date().toISOString() });
    showToast('Sending reply to ' + ownerName + '...', 'info');

    var deliveries = [
      queueInAppNotification({ type: 'dispute-reply', scan: scanId, to: ownerEmail, name: ownerName, message: response })
    ];
    if (ownerEmail) {
      deliveries.push(sendSystemEmail({ type: 'dispute-reply', scan: scanId, to: ownerEmail, name: ownerName, message: response }));
    }

    Promise.all(deliveries).then(function () {
      logAdminAction('Replied to dispute on ' + scanId + ' (in-app + email): "' + response + '"', 'dispute');
      showToast('Classification upheld, reply sent to ' + ownerName, 'success');
    }).catch(function () {
      logAdminAction('Reply to dispute on ' + scanId + ' failed to fully deliver: "' + response + '"', 'dispute');
      showToast('Reply could not be fully delivered to ' + ownerName, 'danger');
    });
    computeOcrKpis();
    computeAccuracyMetrics();
  });
}

// the "Copy Payload" button in the scan detail modal, copies the raw
// extraction data to the clipboard for pasting elsewhere
function copyPayload() {
  var el = document.getElementById('trace-raw-body');
  var text = el ? el.innerText : '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showToast('Payload copied to clipboard', 'success');
    }).catch(function () {
      showToast('Could not copy, copy manually instead', 'danger');
    });
  } else {
    showToast('Clipboard access is unavailable in this browser', 'danger');
  }
}

refreshUnassessedMarkers(); refreshLabelThumbnails();
computeOcrKpis();

// the charts are drawn on window "load" instead of immediately, the same way
// Dashboard does it. ApexCharts sizes itself to its container at the moment it
// renders -- and this script runs before Tailwind (loaded from a CDN) has
// finished styling the page, so drawing straight away measured an unstyled,
// full-window-wide container and made every chart wider than its card. That
// pushed the page past the screen edge and made it look zoomed out compared
// to the other pages. Waiting for load means the layout is final first.
// (computeAccuracyMetrics() is also called later, from upholdDispute(), which
// is fine because the page is long since styled by then.)
window.addEventListener('load', function () {
  computeAccuracyMetrics();
  renderIngredientFrequency();
});

initScrollFadeIndicators();

renderNavBadges();
applyRoleState();
filterRecords();   // also refreshes the "Displaying all N historical scans" label, which otherwise stays at the static number in the HTML

var deepLinkParams = new URLSearchParams(window.location.search);
var deepLinkScanId = deepLinkParams.get('inspect');
if (deepLinkScanId && document.getElementById('row-' + deepLinkScanId.replace('KB-', ''))) {
  inspectRecord(deepLinkScanId);
}

// arriving from Users & Pets' "Total Scans" / "Warnings" stat on a profile --
// pre-fills the search box with that owner's name so their scans show up.
// "Warnings" additionally passes ?verdict=risk, narrowing to just that
// owner's Toxic/Caution scans (via setScanFilter's 'risk' mode above)
// instead of showing the exact same list "Total Scans" already does
var deepLinkOwnerSearch = deepLinkParams.get('ownerSearch');
if (deepLinkOwnerSearch) {
  document.getElementById('records-search').value = deepLinkOwnerSearch;
  if (deepLinkParams.get('verdict') === 'risk') {
    setScanFilter('risk'); // also calls filterRecords()
  } else {
    filterRecords();
  }
  // both stat buttons land here to see the actual rows, not just the top of
  // the page with the search box scrolled out of view below the charts
  var recordsCard = document.getElementById('scan-records-table-card');
  if (recordsCard) recordsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Export OCR Scan Records ---------- */
// the export modal - date range, verdict, species and disputed-only filters,
// all separate from the table's own search (though the live count below
// does respect whatever's currently searched too)
function openScanExportOptions() {
  openModal({
    title: 'Export Scan Report',
    subtitle: 'Narrow down which scans to include, then pick the columns',
    wide: true,
    bodyHtml:
      '<div class="space-y-6">' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-filter"></i></span> Step 1 &middot; Which scans</p>' +

          '<div class="mb-4">' +
            '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Scanned between</label>' +
            '<div class="flex items-center gap-2 mt-1.5">' +
              '<input type="date" id="scan-export-date-from" onchange="updateScanExportMatchCount()" aria-label="Scanned from date" class="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-dark focus:outline-none focus:border-brand transition-all">' +
              '<span class="text-[10px] font-bold text-stone-400">to</span>' +
              '<input type="date" id="scan-export-date-to" onchange="updateScanExportMatchCount()" aria-label="Scanned to date" class="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-dark focus:outline-none focus:border-brand transition-all">' +
            '</div>' +
            '<p class="text-[10px] text-stone-400 mt-1.5" id="scan-export-date-hint">Leave blank to include all scan dates.</p>' +
          '</div>' +

          '<div class="mb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Verdict</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setScanExportGroup(\'scan-export-verdict-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setScanExportGroup(\'scan-export-verdict-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="scan-export-verdict-safe" checked class="accent-brand scan-export-filter-input" onchange="updateScanExportMatchCount()">Safe</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="scan-export-verdict-caution" checked class="accent-brand scan-export-filter-input" onchange="updateScanExportMatchCount()">Caution</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="scan-export-verdict-toxic" checked class="accent-brand scan-export-filter-input" onchange="updateScanExportMatchCount()">Toxic</label>' +
            '</div>' +
          '</div>' +

          '<div class="mb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Species</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setScanExportGroup(\'scan-export-species-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setScanExportGroup(\'scan-export-species-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="scan-export-species-canine" checked class="accent-brand scan-export-filter-input" onchange="updateScanExportMatchCount()">Canine</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="scan-export-species-feline" checked class="accent-brand scan-export-filter-input" onchange="updateScanExportMatchCount()">Feline</label>' +
            '</div>' +
          '</div>' +

          '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark w-fit"><input type="checkbox" id="scan-export-disputed-only" class="accent-brand" onchange="updateScanExportMatchCount()">Disputed scans only</label>' +
        '</div>' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-table-columns"></i></span> Step 2 &middot; Which columns</p>' +
          '<div class="space-y-2">' +
            '<div class="p-3 rounded-xl bg-white border border-stone-200 flex items-center justify-between">' +
              '<div><p class="text-xs font-bold text-dark">Basic Info</p><p class="text-[10px] text-stone-400 mt-0.5">Scan ID, product, verdict</p></div>' +
              '<i class="fa-solid fa-lock text-stone-300 text-sm" title="Always included"></i>' +
            '</div>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">Owner &amp; Pet</p><p class="text-[10px] text-stone-400 mt-0.5">Owner name, pet name, species</p></div>' +
              '<input id="scan-export-owner" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">OCR Details</p><p class="text-[10px] text-stone-400 mt-0.5">Confidence, score, timestamp</p></div>' +
              '<input id="scan-export-ocr" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="flex items-center justify-between p-4 rounded-2xl bg-brand-light border border-brand/10">' +
          '<p class="text-xs font-bold text-dark"><i class="fa-solid fa-file-lines mr-2 text-brand"></i><span id="scan-export-match-count">-</span> will be exported</p>' +
          '<p class="text-[10px] text-stone-500">Also respects the table search</p>' +
        '</div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button onclick="printScanReport()" data-perm="verifyTriage" class="press px-5 py-2.5 text-xs font-bold text-dark bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-all"><i class="fa-solid fa-print mr-1.5"></i>Print / PDF</button>' +
      '<button onclick="exportScanReport()" data-perm="verifyTriage" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Export CSV</button>'
  });

  updateScanExportMatchCount();
}

// the "All / None" shortcut links next to each checkbox group in the export modal
function setScanExportGroup(prefix, checked) {
  document.querySelectorAll('.scan-export-filter-input').forEach(function (el) {
    if (el.id.indexOf(prefix) === 0) el.checked = checked;
  });
  updateScanExportMatchCount();
}

// true if someone picked an end date before the start date
function isScanExportDateRangeInvalid() {
  var fromEl = document.getElementById('scan-export-date-from');
  var toEl = document.getElementById('scan-export-date-to');
  if (!fromEl.value || !toEl.value) return false;
  return new Date(fromEl.value + 'T00:00:00').getTime() > new Date(toEl.value + 'T23:59:59').getTime();
}

// the one place that decides what actually gets exported - both the live
// "X of Y" counter and the real CSV export call this, so they can't disagree
function getMatchingScanRows() {
  var allowedVerdict = {
    safe: document.getElementById('scan-export-verdict-safe').checked,
    caution: document.getElementById('scan-export-verdict-caution').checked,
    toxic: document.getElementById('scan-export-verdict-toxic').checked
  };
  var allowedSpecies = {
    canine: document.getElementById('scan-export-species-canine').checked,
    feline: document.getElementById('scan-export-species-feline').checked
  };
  var disputedOnly = document.getElementById('scan-export-disputed-only').checked;

  var fromEl = document.getElementById('scan-export-date-from');
  var toEl = document.getElementById('scan-export-date-to');
  var fromTime = fromEl && fromEl.value ? new Date(fromEl.value + 'T00:00:00').getTime() : null;
  var toTime = toEl && toEl.value ? new Date(toEl.value + 'T23:59:59').getTime() : null;

  var rows = document.querySelectorAll('#records-table-body tr[data-search]');
  var matched = [];
  rows.forEach(function (row) {
    if (row.dataset.filterMatch === 'false') return;
    var d = row.dataset;
    if (!allowedVerdict[d.verdict]) return;
    if (!allowedSpecies[d.species]) return;
    if (disputedOnly && d.disputed !== 'true') return;
    if (d.date) {
      var scanned = new Date(d.date + 'T12:00:00').getTime();
      if (fromTime !== null && scanned < fromTime) return;
      if (toTime !== null && scanned > toTime) return;
    }
    matched.push(row);
  });
  return matched;
}

// updates the live count in the export modal.
// also handles showing the "bad date range" message instead of a count when that happens
function updateScanExportMatchCount() {
  var total = document.querySelectorAll('#records-table-body tr[data-search]').length;
  var el = document.getElementById('scan-export-match-count');
  var hint = document.getElementById('scan-export-date-hint');

  if (isScanExportDateRangeInvalid()) {
    if (el) el.textContent = 'End date is before the start date';
    if (hint) { hint.textContent = 'Fix the date range above to see how many scans match.'; hint.className = 'text-[10px] text-danger font-bold mt-1.5'; }
    return;
  }
  if (hint) { hint.textContent = 'Leave blank to include all scan dates.'; hint.className = 'text-[10px] text-stone-400 mt-1.5'; }

  var matched = getMatchingScanRows().length;
  if (el) el.textContent = matched + ' of ' + total + ' scans';
}

// shared validation for both the CSV export and the Print/PDF view
function validateScanExportSelection() {
  if (isScanExportDateRangeInvalid()) {
    showToast('End date must be after the start date', 'danger');
    return null;
  }
  var verdictChecked = document.getElementById('scan-export-verdict-safe').checked ||
    document.getElementById('scan-export-verdict-caution').checked || document.getElementById('scan-export-verdict-toxic').checked;
  var speciesChecked = document.getElementById('scan-export-species-canine').checked ||
    document.getElementById('scan-export-species-feline').checked;
  if (!verdictChecked) {
    showToast('Select at least one verdict to export', 'danger');
    return null;
  }
  if (!speciesChecked) {
    showToast('Select at least one species to export', 'danger');
    return null;
  }
  var matchedRows = getMatchingScanRows();
  if (matchedRows.length === 0) {
    showToast('No scans match the selected filters', 'danger');
    return null;
  }
  return matchedRows;
}

// builds the exact same headers/rows for the CSV and the Print/PDF view
function buildScanExportTable(matchedRows) {
  var includeOwner = document.getElementById('scan-export-owner').checked;
  var includeOcr = document.getElementById('scan-export-ocr').checked;

  var headers = ['Scan ID', 'Product', 'Verdict'];
  if (includeOwner) headers = headers.concat(['Owner', 'Pet', 'Species']);
  if (includeOcr) headers = headers.concat(['OCR Confidence', 'Score', 'Timestamp']);

  var rows = matchedRows.map(function (row) {
    var d = row.dataset;
    var scanId = '#KB-' + row.id.replace('row-', '');
    var productEl = row.querySelector('td:nth-child(2) p');
    var productClone = productEl ? productEl.cloneNode(true) : null;
    if (productClone) { productClone.querySelectorAll('span').forEach(function (b) { b.remove(); }); }
    var product = productClone ? productClone.textContent.trim() : '';
    var fields = [scanId, product, d.verdict];
    if (includeOwner) {
      var ownerCell = row.querySelector('td:nth-child(3)');
      var ownerNameEl = ownerCell ? ownerCell.querySelector('p.font-bold') : null;
      var petLineEl = ownerCell ? ownerCell.querySelector('p.italic') : null;
      var ownerName = ownerNameEl ? ownerNameEl.textContent.trim() : '';
      var petMatch = petLineEl ? petLineEl.textContent.match(/Pet:\s*(.+)/) : null;
      fields = fields.concat([ownerName, (petMatch ? petMatch[1].trim() : ''), d.species]);
    }
    if (includeOcr) {
      var confCell = row.querySelector('td:nth-child(5)');
      var scoreCell = row.querySelector('td:nth-child(6)');
      var tsCell = row.querySelector('td:nth-child(8)');
      fields = fields.concat([
        confCell ? confCell.textContent.trim() : '',
        scoreCell ? scoreCell.textContent.trim() : '',
        tsCell ? tsCell.textContent.trim() : ''
      ]);
    }
    return fields;
  });

  return { headers: headers, rows: rows };
}

// builds and downloads the actual CSV file from whatever matched
function exportScanReport() {
  var matchedRows = validateScanExportSelection();
  if (!matchedRows) return;

  closeModal();
  var table = buildScanExportTable(matchedRows);
  var lines = [table.headers.join(',')];
  table.rows.forEach(function (fields) {
    lines.push(fields.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(','));
  });

  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'kibbleguard-scan-report.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Scan report exported', 'success');
}

// same matched rows/columns as exportScanReport() above, just handed to
// the browser's print dialog (with "Save as PDF") instead of downloaded
function printScanReport() {
  var matchedRows = validateScanExportSelection();
  if (!matchedRows) return;

  closeModal();
  var table = buildScanExportTable(matchedRows);
  var total = document.querySelectorAll('#records-table-body tr[data-search]').length;
  openPrintReport({
    title: 'Scan Report',
    subtitle: 'KibbleGuard · OCR Scan Records',
    filterSummary: [matchedRows.length + ' of ' + total + ' scans'],
    headers: table.headers,
    rows: table.rows
  });
}

// the second possible outcome of a dispute: the owner is right. Marks the
// worst-rated ingredient as Safe for THIS scan, recomputes score and verdict,
// updates the table row, stores before/after + reason for audit, tells the owner
function overturnDispute(scanId) {
  var responseEl = document.getElementById('dispute-response-' + scanId);
  var response = responseEl ? responseEl.value.trim() : '';
  if (!response) { showToast('Explain the correction to the pet owner before overturning', 'danger'); return; }
  var data = RECORD_TRACES[scanId];
  if (!data) return;
  var rank = { Toxic: 2, Caution: 1 };
  var target = data.substances.reduce(function (w, s) { return (rank[s.level] || 0) > (w ? (rank[w.level] || 0) : 0) ? s : w; }, null);
  if (!target) { showToast('No Toxic or Caution ingredient on this scan to correct', 'danger'); return; }
  var dispute = data.dispute || {};
  var ownerName = dispute.owner || 'the pet owner', ownerEmail = dispute.ownerEmail || '';
  var btn = document.getElementById('overturn-dispute-btn-' + scanId);

  withSavingState(btn, 'Overturning...', function () {
    if (isDisputeResolved(scanId)) { closeModal(); refreshScanRecords(); showToast('Another admin already closed this dispute, so nothing was changed', 'danger'); return; }
    var before = computeScanOutcome(data.substances);
    var oldLevel = target.level, oldNote = target.note;
    target.level = 'Safe';
    var after = computeScanOutcome(data.substances);
    var row = document.getElementById('row-' + scanId.replace('KB-', ''));
    var originalRowHtml = row ? row.outerHTML : null;
    try {
      if (row) {
        row.dataset.verdict = after.verdict.toLowerCase();
        row.dataset.disputed = 'false';
        var badge = document.getElementById('dispute-badge-' + scanId.replace('KB-', ''));
        if (badge) badge.remove();
        var color = after.verdict === 'Safe' ? 'text-safe' : after.verdict === 'Caution' ? 'text-caution' : 'text-danger';
        row.querySelector('td:nth-child(6)').innerHTML = '<span class="text-sm font-display font-bold ' + color + ' tabular-nums">' + after.score + '</span><span class="text-[10px] text-stone-400">/100</span>';
        row.querySelector('td:nth-child(7)').innerHTML = verdictBadgeHtml(after.verdict);
      }
      savePersistedRows('kibbleguard-scans-rows', document.getElementById('records-table-body'));
      var overrides = getScanOverrides();
      var actor = getLoggedInAdmin();
      overrides[scanId] = { ingredient: target.name, level: 'Safe', reason: response, from: before.verdict, to: after.verdict, by: actor ? actor.name : 'Unknown admin', time: new Date().toISOString() };
      localStorage.setItem('kibbleguard-scan-overrides', JSON.stringify(overrides));
      markDisputeResolved(scanId);
    } catch (e) {
      target.level = oldLevel; target.note = oldNote;
      if (row && originalRowHtml) {
        var tmp = document.createElement('tbody');
        tmp.innerHTML = originalRowHtml;
        row.parentNode.replaceChild(tmp.firstElementChild, row);
      }
      throw e;
    }
    target.note = 'Corrected after owner dispute: ' + response;
    closeModal();
    showToast('Verdict corrected: ' + before.verdict + ' -> ' + after.verdict + '. Sending reply to ' + ownerName + '...', 'info');
    if (ownerEmail) appendMessageHistory(ownerEmail, { subject: 'Re: your dispute on ' + scanId + ' (verdict corrected to ' + after.verdict + ')', body: response, alsoEmail: true, time: new Date().toISOString() });
    var deliveries = [queueInAppNotification({ type: 'dispute-overturned', scan: scanId, to: ownerEmail, name: ownerName, message: response, newVerdict: after.verdict })];
    if (ownerEmail) deliveries.push(sendSystemEmail({ type: 'dispute-overturned', scan: scanId, to: ownerEmail, name: ownerName, message: response, newVerdict: after.verdict }));
    var logText = 'Overturned dispute on ' + scanId + ': ' + target.name + ' ' + oldLevel + ' -> Safe for this scan, verdict ' + before.verdict + ' -> ' + after.verdict + '. Reason: "' + response + '"';
    Promise.all(deliveries).then(function () {
      logAdminAction(logText + ' (owner notified)', 'dispute');
      showToast('Dispute overturned, ' + ownerName + ' notified', 'success');
    }).catch(function () {
      logAdminAction(logText + ' (owner notification failed)', 'dispute');
      showToast('Verdict corrected, but notifying ' + ownerName + ' failed', 'danger');
    });
    computeOcrKpis();
    computeAccuracyMetrics();
    refreshUnassessedMarkers(); refreshLabelThumbnails();
    renderNavBadges();
  });
}


/* ---------- Refresh ----------
   Re-reads the saved scan rows and redraws the numbers, charts and table in
   place, keeping the current search, filters and page. */
function refreshScanRecords() {
  var tbody = document.getElementById('records-table-body');
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-scans-rows')); } catch (e) { saved = null; }
  if (tbody && saved && saved.length) { tbody.innerHTML = saved.join(''); markRowsLoaded('kibbleguard-scans-rows'); }
  AUTO_APPROVE_THRESHOLD = getAutoApproveThreshold();
  refreshUnassessedMarkers(); refreshLabelThumbnails();
  computeOcrKpis();
  computeAccuracyMetrics();
  renderIngredientFrequency();
  var page = PAGINATION_STATE['records-table-body'] || 1;
  filterRecords();
  if (page > 1) {
    PAGINATION_STATE['records-table-body'] = page;
    applyTablePagination('records-table-body', 'records-pagination-controls', 10, false);
  }
  renderNavBadges();
}
initRefreshControl({ key: 'ocr-scans', label: 'Scan records', onRefresh: refreshScanRecords, auto: false });

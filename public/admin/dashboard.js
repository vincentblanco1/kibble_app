restorePersistedRows('kibbleguard-triage-rows', document.getElementById('triage-list'));

/* ---------- Shared badge helpers ---------- */
var RISK_LEVELS = ['Safe', 'Caution', 'Toxic'];
var RISK_LEVEL_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-amber-50 text-amber-500 border-amber-100' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10' }
};
// same Safe/Caution/Toxic pill as Ingredient Database, duplicated here
// since each page loads independently
function riskBadgeHtml(level) {
  var m = RISK_LEVEL_STYLES[level] || RISK_LEVEL_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + level + '</span>';
}
function riskOptions(selected) {
  // not actually used on this page, kept for consistency since other
  // pages share this same badge-helpers block
  return RISK_LEVELS.map(function (l) {
    return '<option value="' + l + '"' + (l === selected ? ' selected' : '') + '>' + l + '</option>';
  }).join('');
}

var VERDICT_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10',       label: 'Safe' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-caution/10 text-caution border-caution/10', label: 'Caution' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10', label: 'Toxic' }
};
// the Safe/Caution/Toxic badge for a finished scan's overall result
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- Dashboard: charts ---------- */
// reads OCR Scan Records' own saved rows and turns them into plain
// {date, verdict, species} objects - each row already carries data-date,
// data-verdict, and data-species, so this is a straight read, not a guess.
// an empty array (nothing saved, or a fresh browser) means the chart below
// will honestly show zeros rather than inventing a trend to fill it -
// a real backend would swap this one function for a fetch() call and
// nothing else here would need to change
//
// one real limitation worth knowing: restorePersistedRows (app.js) only
// seeds this data into localStorage once OCR Scan Records has actually
// been opened in this browser - so on a brand new session, if Dashboard
// is the very first page visited, this chart honestly shows zeros even
// for dates that DO have real seed scans, until OCR Scan Records gets
// opened at least once. that's the same limitation Safety Rules' taxonomy
// counts already have with Ingredient Database, documented there too
//
// Species Exposure and Weekly Safety Verdict Split (below) share this same
// function rather than each keeping their own read of the scan data, so
// all three charts on this page always agree with each other and with
// whatever's actually in OCR Scan Records - a new scan moves all three,
// not just this one
function getStoredScanRecords() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-scans-rows')); } catch (e) { saved = null; }
  if (!saved || !saved.length) return [];
  var temp = document.createElement('table');
  temp.innerHTML = '<tbody>' + saved.join('') + '</tbody>';
  var records = [];
  Array.prototype.forEach.call(temp.querySelectorAll('tr[data-date]'), function (row) {
    if (row.dataset.emptyRow === 'true') return;
    var d = new Date(row.dataset.date + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    records.push({ date: d, verdict: (row.dataset.verdict || '').toLowerCase(), species: (row.dataset.species || '').toLowerCase() });
  });
  return records;
}

// tallies the real scan records that fall on one calendar day
function tallyScansForDay(records, date) {
  var safe = 0, caution = 0, toxic = 0;
  records.forEach(function (r) {
    if (r.date.getFullYear() === date.getFullYear() && r.date.getMonth() === date.getMonth() && r.date.getDate() === date.getDate()) {
      if (r.verdict === 'safe') safe++;
      else if (r.verdict === 'caution') caution++;
      else if (r.verdict === 'toxic') toxic++;
    }
  });
  return { total: safe + caution + toxic, safe: safe, caution: caution, toxic: toxic };
}

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// formats a date like "Mar 4"
function formatShortDate(d) { return MONTH_NAMES[d.getMonth()] + ' ' + d.getDate(); }
// formats a Date as yyyy-mm-dd, what an <input type="date"> field expects
function toInputDateString(d) {
  var mm = String(d.getMonth() + 1); if (mm.length < 2) mm = '0' + mm;
  var dd = String(d.getDate()); if (dd.length < 2) dd = '0' + dd;
  return d.getFullYear() + '-' + mm + '-' + dd;
}

// groups by day/week/month depending on how wide the range is.
// otherwise, a multi-year range would try to plot thousands of daily points
//
// returns, for the Assessment Activity chart:
//   categories - what's printed under each column. for a week or less each one
//                is two lines (weekday, then the date) because "Thu" alone
//                doesn't say WHICH Thursday
//   fullLabels - the long form of the same label, used by the hover tooltip
//   safe/caution/toxic - the count per column, and totals - their sum
function buildRangeData(fromDate, toDate) {
  var from = new Date(fromDate); from.setHours(0, 0, 0, 0);
  var to = new Date(toDate); to.setHours(0, 0, 0, 0);
  var msPerDay = 86400000;
  var totalDays = Math.round((to - from) / msPerDay) + 1;
  var records = getStoredScanRecords();

  var categories = [], fullLabels = [], safe = [], caution = [], toxic = [];

  if (totalDays <= 31) {
    for (var i = 0; i < totalDays; i++) {
      var d = new Date(from); d.setDate(d.getDate() + i);
      var s = tallyScansForDay(records, d);
      categories.push(totalDays <= 7 ? [WEEKDAY_NAMES[d.getDay()], formatShortDate(d)] : formatShortDate(d));
      fullLabels.push(WEEKDAY_NAMES[d.getDay()] + ', ' + formatShortDate(d) + ', ' + d.getFullYear());
      safe.push(s.safe);
      caution.push(s.caution);
      toxic.push(s.toxic);
    }
  } else if (totalDays <= 365) {
    var cursor = new Date(from);
    while (cursor <= to) {
      var weekEnd = new Date(cursor); weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > to) weekEnd = new Date(to);
      var sumSafe = 0, sumCaution = 0, sumToxic = 0;
      var dw = new Date(cursor);
      while (dw <= weekEnd) {
        var sw = tallyScansForDay(records, dw);
        sumSafe += sw.safe;
        sumCaution += sw.caution;
        sumToxic += sw.toxic;
        dw.setDate(dw.getDate() + 1);
      }
      categories.push(formatShortDate(cursor));
      fullLabels.push(formatShortDate(cursor) + ' - ' + formatShortDate(weekEnd) + ', ' + weekEnd.getFullYear());
      safe.push(sumSafe);
      caution.push(sumCaution);
      toxic.push(sumToxic);
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    var mCursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (mCursor <= to) {
      var monthStart = mCursor.getTime() > from.getTime() ? mCursor : from;
      var monthEndCandidate = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 0);
      var monthEnd = monthEndCandidate < to ? monthEndCandidate : to;
      var sumSafe2 = 0, sumCaution2 = 0, sumToxic2 = 0;
      var dm = new Date(monthStart);
      while (dm <= monthEnd) {
        var sm = tallyScansForDay(records, dm);
        sumSafe2 += sm.safe;
        sumCaution2 += sm.caution;
        sumToxic2 += sm.toxic;
        dm.setDate(dm.getDate() + 1);
      }
      categories.push(MONTH_NAMES[mCursor.getMonth()] + ' ’' + String(mCursor.getFullYear()).slice(2));
      fullLabels.push(MONTH_NAMES[mCursor.getMonth()] + ' ' + mCursor.getFullYear());
      safe.push(sumSafe2);
      caution.push(sumCaution2);
      toxic.push(sumToxic2);
      mCursor.setMonth(mCursor.getMonth() + 1);
    }
  }

  var totals = safe.map(function (v, idx) { return v + caution[idx] + toxic[idx]; });

  var granularity = totalDays <= 31 ? 'daily' : (totalDays <= 365 ? 'weekly' : 'monthly');
  var caption = 'Scan verdicts by classification · ' +
    formatShortDate(from) + ' - ' + formatShortDate(to) + ', ' + to.getFullYear() + ' (' + granularity + ')';

  return { categories: categories, fullLabels: fullLabels, safe: safe, caution: caution, toxic: toxic, totals: totals, caption: caption };
}

// y-axis for a chart of scan COUNTS: whole numbers only (0, 1, 2, 3...) with a
// little room above the tallest point, never 0.2 / 0.4 / 0.6. works for 5 scans
// or 5,000 -- steps are a "nice" whole number and there are about 5 ticks.
// the Assessment Activity chart plots each verdict as its own line, so what has
// to fit is the tallest single point -- callers pass [data.safe, data.caution,
// data.toxic]
function countAxisOptions(seriesList) {
  var maxCount = 0;
  seriesList.forEach(function (s) { s.forEach(function (v) { if (v > maxCount) maxCount = v; }); });
  var target = Math.max(1, maxCount) * 1.2;
  var rough = target / 5;
  var magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  var step = magnitude;
  [1, 2, 5, 10].some(function (m) { step = m * magnitude; return step >= rough; });
  step = Math.max(1, step);
  var ticks = Math.max(2, Math.ceil(target / step));
  return {
    min: 0,
    max: step * ticks,
    tickAmount: ticks,
    labels: { style: { colors: '#94a3b8' }, formatter: function (val) { return Math.round(val); } }
  };
}

var mainChart = null;
var pieChartInstance = null;

/* ---------- Species Exposure donut ----------
   Thick ring with small gaps between the slices, the total scan count in the middle (hover a
   slice and the middle shows that species' count), and a legend beside it with each species'
   share. Uses the same real scan counts as before; with no scans it shows an empty grey ring
   and 0% instead of nothing. */
function speciesDonutConfig(counts) {
  var dark = document.documentElement.classList.contains('dark-theme');
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var total = counts.canine + counts.feline;
  var colors = dark ? ['#3DD9DD', '#D4A8F0'] : ['#03C4C9', '#B57EDC'];
  return {
    series: total > 0 ? [counts.canine, counts.feline] : [1],
    labels: total > 0 ? ['Canine', 'Feline'] : ['No scans'],
    colors: total > 0 ? colors : [dark ? '#35363b' : '#ece9e1'],
    chart: {
      type: 'donut', height: 160, fontFamily: 'Inter',
      animations: { enabled: !reduceMotion, easing: 'easeinout', speed: 800, animateGradually: { enabled: true, delay: 150 }, dynamicAnimation: { enabled: true, speed: 450 } }
    },
    stroke: { show: true, width: 4, colors: [dark ? '#232428' : '#ffffff'] },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: { show: true, fontSize: '11px', fontWeight: 600, offsetY: 18, color: dark ? '#bcbcc2' : '#78716c' },
            value: { show: true, fontSize: '26px', fontWeight: 700, fontFamily: 'DM Sans', offsetY: -8, color: dark ? '#f5f5f6' : '#2A241C', formatter: function (v) { return total > 0 ? v : 0; } },
            total: { show: true, showAlways: true, label: 'Scans', fontSize: '11px', fontWeight: 600, color: dark ? '#bcbcc2' : '#78716c', formatter: function () { return total; } }
          }
        }
      }
    },
    states: { hover: { filter: { type: 'lighten', value: 0.06 } }, active: { filter: { type: 'none' } } },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { enabled: total > 0, fillSeriesColor: false, theme: dark ? 'dark' : 'light', y: { formatter: function (v) { return v + ' scan' + (v === 1 ? '' : 's'); } } }
  };
}

function renderSpeciesLegend(counts) {
  var el = document.getElementById('pie-legend');
  if (!el) return;
  var dark = document.documentElement.classList.contains('dark-theme');
  var colors = dark ? ['#3DD9DD', '#D4A8F0'] : ['#03C4C9', '#B57EDC'];
  var total = counts.canine + counts.feline;
  el.innerHTML = [['Canine', counts.canine, colors[0]], ['Feline', counts.feline, colors[1]]].map(function (r) {
    var pct = total > 0 ? Math.round((r[1] / total) * 100) : 0;
    return '<div class="flex items-center justify-between gap-3" title="' + r[1] + ' scan' + (r[1] === 1 ? '' : 's') + '">' +
      '<span class="flex items-center gap-2.5 text-sm font-medium text-stone-500"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + r[2] + '"></span>' + r[0] + '</span>' +
      '<span class="text-sm font-bold text-dark tabular-nums">' + pct + '%</span>' +
    '</div>';
  }).join('') + (total === 0 ? '<p class="text-[10px] text-stone-400 leading-relaxed pt-1">No scans in the latest week yet.</p>' : '');
}

function updateSpeciesDonut(counts) {
  renderSpeciesLegend(counts);
  if (pieChartInstance) pieChartInstance.updateOptions(speciesDonutConfig(counts), true, true);
}
// the long-form label for each column of the Assessment Activity chart
// ("Mon, May 27, 2024"), kept here so the hover tooltip can read it
var mainChartFullLabels = [];
// the counts behind the chart's lines, kept so the hover tooltip can always read
// every verdict, even one switched off in the legend
var mainChartData = null;
// set once the admin picks their own dates, so a refresh keeps that range
// instead of moving it back to the latest week
var chartRangeCustom = false;
var verdictRangeCustom = false;

// the three lines, in the order they're drawn (a later line paints over an
// earlier one) -- same order as the legend above the chart
var MAIN_CHART_ORDER = ['Safe', 'Caution', 'Toxic'];

// every color the Assessment Activity chart uses, in one place so the chart
// and its tooltip always agree, light or dark. colors follow MAIN_CHART_ORDER
function mainChartPalette() {
  var dark = document.documentElement.classList.contains('dark-theme');
  return {
    dark: dark,
    colors: dark ? ['#4ade80', '#f0a942', '#ef4444'] : ['#15803D', '#C17817', '#B91C1C'],
    surface: dark ? '#232428' : '#ffffff',
    grid: dark ? '#2f3034' : '#f1f5f9'
  };
}

function mainChartSeries(data) {
  return [
    { name: 'Safe', data: data.safe },
    { name: 'Caution', data: data.caution },
    { name: 'Toxic', data: data.toxic }
  ];
}

// names of the lines the admin has switched off by clicking the legend. kept
// here so a date change or Refresh redraws the chart without turning them
// back on
var mainChartHidden = [];

// makes the legend row above the chart clickable: click Toxic and only the
// Toxic line stays visible-or-hidden, click again to bring it back. the counts
// are small whole numbers, so lines often share points (every day with no scans
// puts all three at 0) -- switching one off is the way to see the other clearly
function initMainChartLegendToggles() {
  var chartEl = document.getElementById('main-chart');
  if (!chartEl) return;
  var card = chartEl.closest('.stagger-in') || document;
  MAIN_CHART_ORDER.forEach(function (name) {
    var dot = card.querySelector('.chart-legend-dot-' + name.toLowerCase());
    var item = dot && dot.parentNode;
    if (!item || item.dataset.legendToggle) return;
    item.dataset.legendToggle = '1';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-pressed', 'true');
    item.setAttribute('title', 'Click to hide or show the ' + name + ' line');
    item.style.cursor = 'pointer';
    item.style.userSelect = 'none';
    item.style.transition = 'opacity 150ms ease';
    function toggle() {
      var i = mainChartHidden.indexOf(name);
      if (i === -1) mainChartHidden.push(name); else mainChartHidden.splice(i, 1);
      syncMainChartHidden();
    }
    item.addEventListener('click', toggle);
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
  syncMainChartHidden();
}

// applies mainChartHidden to both the chart and the legend (dimmed = off)
function syncMainChartHidden() {
  var chartEl = document.getElementById('main-chart');
  var card = (chartEl && chartEl.closest('.stagger-in')) || document;
  MAIN_CHART_ORDER.forEach(function (name) {
    var off = mainChartHidden.indexOf(name) !== -1;
    var dot = card.querySelector('.chart-legend-dot-' + name.toLowerCase());
    var item = dot && dot.parentNode;
    if (item) {
      item.style.opacity = off ? '0.4' : '1';
      item.setAttribute('aria-pressed', off ? 'false' : 'true');
    }
    if (mainChart) {
      // hideSeries/showSeries only act when the line isn't already in that state
      if (off) mainChart.hideSeries(name); else mainChart.showSeries(name);
    }
  });
}

// the legend row above the chart is static markup in dashboard.html (a dot and
// a word per verdict). this adds the range's running total beside each word,
// and shows a plain "no scans" message over the chart when the range is empty --
// a flat, empty-looking chart otherwise reads as "broken", not "quiet"
function updateMainChartSummary(data) {
  var chartEl = document.getElementById('main-chart');
  if (!chartEl) return;
  var card = chartEl.closest('.stagger-in') || document;
  var sums = {
    safe: data.safe.reduce(function (a, b) { return a + b; }, 0),
    caution: data.caution.reduce(function (a, b) { return a + b; }, 0),
    toxic: data.toxic.reduce(function (a, b) { return a + b; }, 0)
  };
  ['safe', 'caution', 'toxic'].forEach(function (key) {
    var dot = card.querySelector('.chart-legend-dot-' + key);
    if (!dot || !dot.parentNode) return;
    var count = dot.parentNode.querySelector('.legend-count');
    if (!count) {
      count = document.createElement('span');
      count.className = 'legend-count tabular-nums text-stone-400 font-bold';
      dot.parentNode.appendChild(count);
    }
    var rangeTotal = sums.safe + sums.caution + sums.toxic;
    count.textContent = sums[key] + (rangeTotal > 0 ? ' (' + Math.round((sums[key] / rangeTotal) * 100) + '%)' : '');
  });

  var empty = document.getElementById('main-chart-empty');
  if (empty) empty.style.display = (sums.safe + sums.caution + sums.toxic) === 0 ? 'flex' : 'none';
}

// wraps the chart in a positioned box (must happen BEFORE ApexCharts renders
// into it) and adds the hidden "no scans" message that updateMainChartSummary
// shows when a range has nothing in it
function ensureMainChartEmptyState() {
  var chartEl = document.getElementById('main-chart');
  if (!chartEl || document.getElementById('main-chart-empty')) return;
  var wrap = document.createElement('div');
  wrap.style.position = 'relative';
  chartEl.parentNode.insertBefore(wrap, chartEl);
  wrap.appendChild(chartEl);
  var empty = document.createElement('div');
  empty.id = 'main-chart-empty';
  empty.style.cssText = 'display:none;position:absolute;left:0;right:0;top:0;bottom:36px;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;';
  empty.innerHTML =
    '<p class="text-sm font-bold text-dark">No scans in this range</p>' +
    '<p class="text-[11px] text-stone-400 mt-1">Pick a different range, or check back once new labels are scanned.</p>';
  wrap.appendChild(empty);
}

// redraws Assessment Activity for new data -- one place for the date picker's
// Apply button and for Refresh, so they can't drift apart
function updateMainChart(data) {
  mainChartFullLabels = data.fullLabels;
  mainChartData = data;
  document.getElementById('chart-range-caption').textContent = data.caption;
  updateMainChartSummary(data);
  if (!mainChart) return;
  mainChart.updateOptions({
    series: mainChartSeries(data),
    xaxis: { categories: data.categories },
    yaxis: countAxisOptions([data.safe, data.caution, data.toxic])
  });
  // a redraw would otherwise bring back any line switched off in the legend
  if (mainChartHidden.length) syncMainChartHidden();
}

// runs when you pick a custom date range on the main chart.
// checks the dates make sense first: both filled in, start before end, not in the future
function applyChartDateRange() {
  var fromVal = document.getElementById('chart-date-from').value;
  var toVal = document.getElementById('chart-date-to').value;
  if (!fromVal || !toVal) {
    showToast('Choose both a start and end date', 'danger');
    return;
  }
  var fromDate = new Date(fromVal + 'T00:00:00');
  var toDate = new Date(toVal + 'T00:00:00');
  if (fromDate > toDate) {
    showToast('Start date must be before the end date', 'danger');
    return;
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  if (toDate > today) {
    showToast("End date can't be in the future", 'danger');
    return;
  }

  chartRangeCustom = true;
  updateMainChart(buildRangeData(fromDate, toDate));
}

window.addEventListener('load', function() {
  try {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    // opens on the 7 days ending at the most recent scan (never later than today),
    // the same anchoring the Species Exposure card uses, so a quiet week or older
    // data doesn't leave the chart flat at zero. with no scans at all it falls
    // back to the last 7 days from today
    var scanRecords = getStoredScanRecords();
    var anchor = new Date(today);
    if (scanRecords.length) {
      var latest = new Date(Math.max.apply(null, scanRecords.map(function (r) { return r.date.getTime(); })));
      latest.setHours(0, 0, 0, 0);
      if (latest < anchor) anchor = latest;
    }
    var weekAgo = new Date(anchor); weekAgo.setDate(weekAgo.getDate() - 6);
    var initialData = buildRangeData(weekAgo, anchor);

    var fromInput = document.getElementById('chart-date-from');
    var toInput = document.getElementById('chart-date-to');
    fromInput.value = toInputDateString(weekAgo);
    toInput.value = toInputDateString(anchor);
    fromInput.max = toInputDateString(today);
    toInput.max = toInputDateString(today);

    // Assessment Activity stays a LINE chart: one line per verdict across the
    // days (or weeks/months for long ranges). all three lines share one simple
    // style so the chart is easy to read at a glance; the legend above is
    // clickable to switch a line off when verdicts share the same values
    ensureMainChartEmptyState();
    var p = mainChartPalette();
    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    mainChartFullLabels = initialData.fullLabels;
    mainChartData = initialData;
    mainChart = new ApexCharts(document.querySelector("#main-chart"), {
      series: mainChartSeries(initialData),
      chart: {
        height: 320, type: 'area', toolbar: { show: false }, fontFamily: 'Inter',
        animations: { enabled: !reduceMotion, speed: 450 }
      },
      // smooth curves + a soft vertical gradient under each line (strong at the
      // line, fading to almost nothing at the axis), like the reference design
      stroke: { curve: 'smooth', width: 2, lineCap: 'round' },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          type: 'vertical',
          opacityFrom: p.dark ? 0.38 : 0.32,
          opacityTo: 0.02,
          stops: [0, 95, 100]
        }
      },
      markers: { size: 3.5, strokeWidth: 2, strokeColors: p.dark ? '#232428' : '#ffffff', hover: { size: 6 } },
      dataLabels: { enabled: false },
      colors: p.colors,
      xaxis: {
        categories: initialData.categories,
        labels: { rotate: 0, hideOverlappingLabels: true, style: { colors: '#94a3b8', fontSize: '11px', fontWeight: 600 } },
        axisBorder: { show: false },
        axisTicks: { show: false },
        crosshairs: { show: true, stroke: { color: p.dark ? '#45464b' : '#e7e5e4', width: 1, dashArray: 4 } },
        tooltip: { enabled: false }
      },
      yaxis: countAxisOptions([initialData.safe, initialData.caution, initialData.toxic]),
      grid: { borderColor: p.grid, strokeDashArray: 4, xaxis: { lines: { show: false } } },
      legend: { show: false },
      tooltip: {
        theme: p.dark ? 'dark' : 'light',
        shared: true,
        intersect: false,
        // hovering a day lists every verdict's count for it (highest risk
        // first) plus the day's total -- so even when two lines sit on the
        // same point, nothing is ever hidden. series[k] follows MAIN_CHART_ORDER (listed here highest risk first)
        custom: function (o) {
          var i = o.dataPointIndex, pal = mainChartPalette();
          var s = mainChartData ? [mainChartData.safe, mainChartData.caution, mainChartData.toxic] : o.series;
          var total = s[0][i] + s[1][i] + s[2][i];
          var rows = MAIN_CHART_ORDER.map(function (name, k) { return k; }).reverse().map(function (k) {
            var name = MAIN_CHART_ORDER[k];
            return '<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:6px;opacity:' + (mainChartHidden.indexOf(name) !== -1 ? '0.45' : '1') + '">' +
              '<span style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:' + pal.colors[k] + '"></span>' + name + '</span>' +
              '<span style="font-variant-numeric:tabular-nums"><b>' + s[k][i] + '</b>' +
              '<span style="color:#78716c;margin-left:8px;display:inline-block;min-width:38px;text-align:right">' + (total > 0 ? Math.round((s[k][i] / total) * 100) + '%' : '-') + '</span></span></div>';
          }).join('');
          return '<div style="padding:10px 14px;min-width:160px;font-family:Inter,sans-serif;font-size:12px;color:' + (pal.dark ? '#d7d7da' : '#2A241C') + '">' +
            '<div style="font-weight:700">' + escapeHTML(mainChartFullLabels[i] || '') + '</div>' + rows +
            '<div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;color:#78716c;border-top:1px solid ' + (pal.dark ? '#3a3b40' : '#e7e5e4') + '"><span>Total scans</span><b>' + total + '</b></div>' +
          '</div>';
        }
      }
    });
    mainChart.render();
    document.getElementById('chart-range-caption').textContent = initialData.caption;
    updateMainChartSummary(initialData);
    initMainChartLegendToggles();

    var speciesSplit = computeSpeciesSplit();

    // Weekly Safety Verdict Split starts on the same 7-day-anchored window
    // as before (kept separate from Species Exposure's own window above so
    // changing one card's date filter never silently changes the other),
    // and pre-fills its date inputs with that same range so Apply has a
    // sensible starting point instead of empty fields
    if (speciesSplit.latestTime !== null) {
      renderVerdictSplitForRange(speciesSplit.windowStart, speciesSplit.latestTime);
      var vFromInput = document.getElementById('verdict-date-from');
      var vToInput = document.getElementById('verdict-date-to');
      if (vFromInput && vToInput) {
        vFromInput.value = toInputDateString(new Date(speciesSplit.windowStart));
        vToInput.value = toInputDateString(new Date(speciesSplit.latestTime));
        clampVerdictDateRange();
      }
    } else {
      // no records at all -- reuses renderVerdictSplitForRange's own empty
      // state (an honest "No scans in this range" inside the chart area)
      // rather than a separate message, since there's no caption line left
      // to put one in
      renderVerdictSplitForRange(0, 0);
    }

    pieChartInstance = new ApexCharts(document.querySelector("#pie-chart"), speciesDonutConfig(speciesSplit.species));
    pieChartInstance.render();
    renderSpeciesLegend(speciesSplit.species);
  } catch(e) {}


  animateAllCountUps();
});




/* ---------- Dashboard-specific interactions ---------- */

// canine/feline species split from OCR Scan Records' own saved rows,
// scoped to the most recent 7 days of scans rather than all-time.
// anchored to the latest scan's own timestamp rather than the real-world
// "today", so this keeps
// working correctly on a quiet day (or a demo running on old seed data)
// instead of going empty just because nothing happened to be scanned in
// the last calendar week. the verdict split used to be computed here too,
// but it got its own date filter below and moved out, since forcing both
// cards to always share one window stopped making sense once only one of
// them could be re-ranged by the admin
function computeSpeciesSplit() {
  var allRecords = getStoredScanRecords();
  var speciesCounts = { canine: 0, feline: 0 };

  if (allRecords.length === 0) return { species: speciesCounts, latestTime: null, windowStart: null };

  var latestTime = Math.max.apply(null, allRecords.map(function (r) { return r.date.getTime(); }));
  // calendar-day aligned: the 7 full days ending on the latest scan's own
  // date, not a raw 7*24h subtraction back from its exact time. those two
  // aren't the same thing -- 7*24h back from 2:42pm still lands on 2:42pm
  // 7 days ago, which spans 8 different calendar dates, not 7 -- and this
  // window also seeds the Weekly Safety Verdict Split card's default date
  // filter, whose own picker is capped at a real 7-calendar-day range, so
  // the two need to agree on what "a week" means
  var latestDay = new Date(latestTime); latestDay.setHours(0, 0, 0, 0);
  var windowStartDay = new Date(latestDay); windowStartDay.setDate(windowStartDay.getDate() - 6);
  var windowEnd = new Date(latestDay); windowEnd.setHours(23, 59, 59, 999);

  allRecords.filter(function (r) {
    var t = r.date.getTime();
    return t >= windowStartDay.getTime() && t <= windowEnd.getTime();
  }).forEach(function (record) {
    if (record.species === 'canine' || record.species === 'feline') speciesCounts[record.species]++;
  });

  return { species: speciesCounts, latestTime: windowEnd.getTime(), windowStart: windowStartDay.getTime() };
}

// Top Risk Ingredients card: which ingredients are behind the Caution and Toxic
// verdicts in [fromTime, toTime]. Dates and verdicts come from the same saved
// scan rows the charts use; each scan's ingredient breakdown comes from
// RECORD_TRACES (shared in app.js). A scan with no recorded breakdown is
// counted separately and said so on the card, never guessed at.
function tallyRiskDriversInRange(fromTime, toTime) {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-scans-rows')); } catch (e) { saved = null; }
  var result = { list: [], flaggedScans: 0, noDetail: 0 };
  if (!saved || !saved.length) return result;
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  var temp = document.createElement('table');
  temp.innerHTML = '<tbody>' + saved.join('') + '</tbody>';
  var drivers = {};
  Array.prototype.forEach.call(temp.querySelectorAll('tr[data-date]'), function (row) {
    if (row.dataset.emptyRow === 'true') return;
    var t = new Date(row.dataset.date + 'T12:00:00').getTime();
    if (isNaN(t) || t < fromTime || t > toTime) return;
    var verdict = (row.dataset.verdict || '').toLowerCase();
    if (verdict !== 'caution' && verdict !== 'toxic') return;
    result.flaggedScans++;
    var trace = traces['KB-' + row.id.replace('row-', '')];
    if (!trace) { result.noDetail++; return; }
    var seen = {};
    trace.substances.forEach(function (s) {
      if ((s.level !== 'Caution' && s.level !== 'Toxic') || seen[s.name]) return;
      seen[s.name] = true;
      var d = drivers[s.name] || (drivers[s.name] = { name: s.name, scans: 0, toxic: 0, caution: 0, canine: false, feline: false });
      d.scans++;
      if (s.level === 'Toxic') d.toxic++; else d.caution++;
      if (trace.species === 'canine') d.canine = true;
      if (trace.species === 'feline') d.feline = true;
    });
  });
  result.list = Object.keys(drivers).map(function (k) { return drivers[k]; }).sort(function (a, b) {
    return (b.scans - a.scans) || (b.toxic - a.toxic) || a.name.localeCompare(b.name);
  });
  return result;
}

var RISK_DRIVER_LIMIT = 5;

// draws the Top Risk Ingredients list for a [fromTime, toTime] range. called on
// page load with the default 7-day window, again on every Apply, and on Refresh.
// plain bars sized by a whole number of scans (no chart library needed), so the
// numbers can never be fractional and an empty range says so honestly
function renderVerdictSplitForRange(fromTime, toTime) {
  var el = document.querySelector('#verdict-split-chart');
  if (!el) return;
  var r = tallyRiskDriversInRange(fromTime, toTime);

  if (!r.flaggedScans) {
    el.innerHTML = '<p class="text-xs text-stone-400 text-center py-10">No Caution or Toxic scans in this range.</p>';
    return;
  }
  if (!r.list.length) {
    el.innerHTML = '<p class="text-xs text-stone-400 text-center py-10">' + r.flaggedScans + ' Caution/Toxic scan' + (r.flaggedScans === 1 ? '' : 's') + ' in this range, but none have an ingredient breakdown recorded.</p>';
    return;
  }

  var isDark = document.documentElement.classList.contains('dark-theme');
  var colors = { Toxic: isDark ? '#ef4444' : '#B91C1C', Caution: isDark ? '#f0a942' : '#C17817' };
  var top = r.list.slice(0, RISK_DRIVER_LIMIT);
  var max = top[0].scans;

  var rowsHtml = top.map(function (d) {
    var level = d.toxic > 0 ? 'Toxic' : 'Caution';
    var pct = Math.max(8, Math.round((d.scans / max) * 100));
    var tip = d.toxic + ' Toxic, ' + d.caution + ' Caution';
    return '<div class="mb-3" title="' + escapeHTML(tip) + '">' +
      '<div class="flex items-center justify-between gap-2 mb-1">' +
        '<p class="text-xs font-bold text-dark truncate">' + escapeHTML(d.name) + '</p>' +
        '<span class="text-[10px] font-bold tabular-nums text-stone-500 shrink-0">' + d.scans + ' scan' + (d.scans === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        '<div class="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden"><div class="h-full rounded-full" style="width:' + pct + '%;background:' + colors[level] + '"></div></div>' +
        '<span class="flex items-center gap-1 w-8 justify-end shrink-0">' +
          (d.canine ? '<i class="fa-solid fa-dog text-[10px] text-[#03C4C9]"></i>' : '') +
          (d.feline ? '<i class="fa-solid fa-cat text-[10px] text-[#B57EDC]"></i>' : '') +
        '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  var note = 'From ' + r.flaggedScans + ' Caution/Toxic scan' + (r.flaggedScans === 1 ? '' : 's') + '. Bar length is how many of those scans contain the ingredient.';
  if (r.list.length > RISK_DRIVER_LIMIT) note += ' Showing top ' + RISK_DRIVER_LIMIT + ' of ' + r.list.length + '.';
  if (r.noDetail) note += ' ' + r.noDetail + ' scan' + (r.noDetail === 1 ? ' has' : 's have') + ' no ingredient breakdown recorded.';

  el.innerHTML =
    '<div class="flex items-center gap-4 mb-4">' +
      '<span class="flex items-center gap-1.5 text-[10px] font-bold text-stone-500"><span class="w-2 h-2 rounded-full chart-legend-dot-toxic"></span>Toxic</span>' +
      '<span class="flex items-center gap-1.5 text-[10px] font-bold text-stone-500"><span class="w-2 h-2 rounded-full chart-legend-dot-caution"></span>Caution</span>' +
    '</div>' + rowsHtml +
    '<p class="text-[10px] text-stone-400 leading-relaxed mt-1">' + escapeHTML(note) + '</p>';
}

// the Apply button for this card's own date filter. real scan history in
// this build only spans May 27-29, 2024, so ranges outside that honestly show
// "No Caution or Toxic scans in this range" rather than made-up numbers
function applyVerdictSplitDateRange() {
  var fromVal = document.getElementById('verdict-date-from').value;
  var toVal = document.getElementById('verdict-date-to').value;
  if (!fromVal || !toVal) {
    showToast('Choose both a start and end date', 'danger');
    return;
  }
  var fromDate = new Date(fromVal + 'T00:00:00');
  var toDate = new Date(toVal + 'T23:59:59');
  if (fromDate > toDate) {
    showToast('Start date must be before the end date', 'danger');
    return;
  }
  verdictRangeCustom = true;
  renderVerdictSplitForRange(fromDate.getTime(), toDate.getTime());
}

// keeps the "to" date from sitting before the "from" date or in the future.
// runs every time "from" changes. (no 7-day cap anymore: this card is a ranked
// list of ingredients, not a weekly chart, so longer ranges are useful here)
function clampVerdictDateRange() {
  var fromInput = document.getElementById('verdict-date-from');
  var toInput = document.getElementById('verdict-date-to');
  if (!fromInput.value) return;
  var fromDate = new Date(fromInput.value + 'T00:00:00');
  var today = new Date(); today.setHours(0, 0, 0, 0);

  toInput.min = toInputDateString(fromDate);
  toInput.max = toInputDateString(today);

  if (toInput.value) {
    var toDate = new Date(toInput.value + 'T00:00:00');
    if (toDate < fromDate) toInput.value = toInputDateString(fromDate);
    else if (toDate > today) toInput.value = toInputDateString(today);
  }
}
function updateTriageCount(delta) {
  var el = document.getElementById('triage-kpi');
  if (!el) return;
  var current = parseInt(el.dataset.target, 10);
  if (isNaN(current)) current = parseInt(el.textContent.replace(/,/g, ''), 10) || 0;
  var next = Math.max(0, current + delta);
  el.dataset.target = next;
  el.textContent = next.toLocaleString();
  if (next <= 0) {
    var list = document.getElementById('triage-list');
    var empty = document.getElementById('triage-empty');
    if (list) list.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
  }
}

// opens the manual review modal for one triage row: shows the photo,
// what OCR read, and what it thinks the ingredient is, then waits for
// the admin to confirm the match or flag it as unrecognized
// a triage row can carry its label photo in an optional data-image attribute (set from the
// scan's image URL once the backend supplies it); without one the box says so honestly
function triageLabelPhotoHtml(rawUrl) {
  var url = (typeof rawUrl === 'string') ? rawUrl.trim() : '';
  if (url && !/^(https?:\/\/|data:image\/)/i.test(url) && /^[a-z][a-z0-9+.-]*:/i.test(url)) url = '';
  var placeholder = '<div class="mt-1.5 h-72 rounded-2xl bg-stone-100 border border-dashed border-stone-200 flex flex-col items-center justify-center text-stone-400 gap-2"' + (url ? ' style="display:none"' : '') + '>' +
      '<i class="fa-solid fa-image text-3xl"></i>' +
      '<p class="text-xs font-medium px-6 text-center">' + (url ? 'The label photo could not be loaded' : 'Label photo unavailable (it may have been removed under the retention policy)') + '</p>' +
    '</div>';
  if (!url) return placeholder;
  return '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener" title="Open full size" class="mt-1.5 block h-72 rounded-2xl bg-stone-100 border border-stone-200 overflow-hidden">' +
      '<img src="' + escapeHTML(url) + '" alt="Captured label" class="w-full h-full object-contain" onerror="this.parentNode.style.display=\'none\';this.parentNode.nextElementSibling.style.display=\'flex\'">' +
    '</a>' + placeholder;
}

function verifyTriage(rowId) {
  var row = document.getElementById(rowId);
  if (!row) return;
  var name = row.dataset.name;
  var suggestedMatch = row.dataset.suggestedMatch;
  var confidence = row.dataset.confidence ? row.dataset.confidence + '%' : '?';
  var scan = row.dataset.scan;
  var isToxic = row.dataset.severity === 'Toxic';
  var priorityBanner = isToxic
    ? '<div class="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 mb-4"><i class="fa-solid fa-triangle-exclamation text-danger"></i><p class="text-xs font-bold text-danger">Possible Toxic Match: review before lower-priority scans in the queue.</p></div>'
    : '';
  var explainHtml = '<p class="text-sm text-stone-600 leading-relaxed mb-4">The matching engine read <span class="font-bold text-dark">' + escapeHTML(name) + '</span> on this label. Its closest candidate in the database is below, but the match confidence (' + escapeHTML(confidence) + ') fell short of the Auto-Approve threshold, so it needs a human to confirm it before the pet owner sees a final result.</p>';
  var matchBoxHtml = suggestedMatch
    ? '<div class="flex items-center gap-3 p-4 rounded-2xl ' + (isToxic ? 'bg-danger/5 border border-danger/20' : 'bg-stone-100 border border-stone-200') + ' mb-4">' +
        '<div class="w-9 h-9 rounded-xl bg-white ' + (isToxic ? 'text-danger' : 'text-brand') + ' flex items-center justify-center text-sm shrink-0 shadow-sm"><i class="fa-solid ' + (isToxic ? 'fa-skull' : 'fa-flask') + '"></i></div>' +
        '<div><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">' + (isToxic ? 'Possible Toxic Match' : 'Closest Existing Entry') + '</p><p class="text-sm font-bold text-dark">' + escapeHTML(suggestedMatch) + ' <span class="text-stone-400 font-medium">(' + escapeHTML(confidence) + ')</span></p></div>' +
      '</div>'
    : '';
  var confirmSubtitle = suggestedMatch ? 'Accept ' + escapeHTML(suggestedMatch) + ' as the correct ingredient' : 'Treat this as already covered by an existing database entry';
  openModal({
    title: 'Manual Verification',
    subtitle: scan + (isToxic ? ' · Possible Toxic Match' : ' · Low-confidence OCR match'),
    wide: true,
    bodyHtml:
      '<div class="grid grid-cols-2 gap-6">' +
        '<div>' +
          '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Captured Label</label>' +
          triageLabelPhotoHtml(row.dataset.image) +
        '</div>' +
        '<div>' +
          priorityBanner +
          explainHtml +
          matchBoxHtml +
          '<p class="text-xs text-stone-500 leading-relaxed mb-4">This case needs your confirmation before it\'s cleared from the queue and the pet owner is told the result is final.</p>' +
          '<div class="space-y-3">' +
            '<label id="mapping-confirm-label" onclick="updateMappingChoiceStyle(\'confirm\')" class="flex items-center gap-3 p-4 rounded-2xl border-2 border-brand bg-brand-light cursor-pointer">' +
              '<input type="radio" name="mapping" id="mapping-confirm" value="confirm" checked class="accent-brand w-4 h-4">' +
              '<div><p class="text-xs font-bold text-dark">Confirm</p><p class="text-[10px] text-stone-400">' + confirmSubtitle + '</p></div>' +
            '</label>' +
            '<label id="mapping-unrecognized-label" onclick="updateMappingChoiceStyle(\'unrecognized\')" class="flex items-center gap-3 p-4 rounded-2xl border border-stone-100 hover:border-stone-200 cursor-pointer">' +
              '<input type="radio" name="mapping" id="mapping-unrecognized" value="unrecognized" class="accent-brand w-4 h-4">' +
              '<div><p class="text-xs font-bold text-dark">Not a match</p><p class="text-[10px] text-stone-400">Open the Ingredient Database with a new entry pre-filled from this ingredient</p></div>' +
            '</label>' +
          '</div>' +
        '</div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="submit-triage-btn" onclick="submitTriageResolution(\'' + rowId + '\')" data-perm="verifyTriage" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Continue</button>'
  });
}

// just the visual highlight on whichever radio option is picked in the verify modal above
function updateMappingChoiceStyle(choice) {
  var confirmLabel = document.getElementById('mapping-confirm-label');
  var unrecognizedLabel = document.getElementById('mapping-unrecognized-label');
  var selectedClass = 'flex items-center gap-3 p-4 rounded-2xl border-2 border-brand bg-brand-light cursor-pointer';
  var unselectedClass = 'flex items-center gap-3 p-4 rounded-2xl border border-stone-100 hover:border-stone-200 cursor-pointer';
  confirmLabel.className = choice === 'confirm' ? selectedClass : unselectedClass;
  unrecognizedLabel.className = choice === 'unrecognized' ? selectedClass : unselectedClass;
}

// reads which radio option got picked - "confirm" goes to resolveTriage,
// "unrecognized" sends the admin to Ingredient Database with a new entry
// pre-filled, and lets the pet owner know their scan needs more time
// true unless another admin has already resolved this triage case: the saved queue
// is the source of truth, not what this page happened to load
function isTriageRowStillQueued(rowId) {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-triage-rows')); } catch (e) { saved = null; }
  if (!Array.isArray(saved)) return true;
  return saved.some(function (html) { return html.indexOf('id="' + rowId + '"') !== -1; });
}

function submitTriageResolution(rowId) {
  if (!isTriageRowStillQueued(rowId)) {
    closeModal();
    refreshDashboard();
    showToast('Another admin already handled this scan, so nothing was sent twice', 'danger');
    return;
  }
  var choice = document.querySelector('input[name="mapping"]:checked').value;
  var btn = document.getElementById('submit-triage-btn');
  if (choice === 'unrecognized') {
    withSavingState(btn, 'Continuing...', function () {
      closeModal();
      var row = document.getElementById(rowId);
      var rawName = row ? row.dataset.name : '';
      var scanRef = row ? row.dataset.scan : rowId;
      var cleanName = rawName.replace(/"/g, '').replace(/\s*Mapping$/, '').trim();
      showToast('Notifying pet owner their scan needs more time...', 'info');
      queueInAppNotification({
        type: 'scan-still-reviewing',
        scan: scanRef,
        message: "We're double-checking one of the ingredients on your scan before finalizing the result. This may take a bit longer than usual."
      }).then(function () {
        logAdminAction('Flagged OCR mapping as unrecognized for scan ' + scanRef + ': "' + cleanName + '" (pet owner notified, scan remains pending)', 'verify');
      }).catch(function () {
        logAdminAction('Flagged OCR mapping as unrecognized for scan ' + scanRef + ': "' + cleanName + '" (pet owner notification failed to queue)', 'verify');
      });
      setTimeout(function () {
        window.location.href = 'ingredient-database.html?new=' + encodeURIComponent(cleanName) + '&forScan=' + encodeURIComponent(scanRef);
      }, 700);
    });
    return;
  }
  withSavingState(btn, 'Verifying...', function () {
    resolveTriage(rowId);
  });
}

// the "confirm this match is correct" path.
// removes the row, updates the count, and notifies the pet owner their result is final
function resolveTriage(rowId) {
  var row = document.getElementById(rowId);
  // every card reaching this queue now carries a real suggested match (that's what
  // qualifies it for Triage at all -- see the hydrate() rewrite in db-sync.js), but
  // fall back to the scanned name itself just in case a row is ever missing one
  var suggestedMatch = row ? (row.dataset.suggestedMatch || row.dataset.name.replace(/^"|"$/g, '')) : '';
  var severity = row ? row.dataset.severity : '';
  var scanRef = row ? row.dataset.scan : rowId;

  // persist "row resolved" before the fade animation (and before closing the
  // modal) instead of after - same detach/attempt/rollback pattern as the
  // delete flows elsewhere, so a failed save never visibly resolves the row
  var parent = null, nextSibling = null;
  if (row) {
    parent = row.parentNode;
    nextSibling = row.nextSibling;
    parent.removeChild(row);
    try {
      savePersistedRows('kibbleguard-triage-rows', document.getElementById('triage-list'));
    } catch (e) {
      parent.insertBefore(row, nextSibling);
      throw e;
    }
    parent.insertBefore(row, nextSibling);
  }

  closeModal();
  if (row) {
    row.style.transition = 'opacity 0.3s var(--ease-out), transform 0.3s var(--ease-out)';
    row.style.opacity = '0';
    row.style.transform = 'translateX(12px)';
    setTimeout(function () {
      row.remove();
    }, 300);
  }
  updateTriageCount(-1);
  showToast('Verifying mapping, notifying pet owner...', 'info');

  queueInAppNotification({
    type: 'scan-final-result',
    scan: scanRef,
    message: 'Your scan result is ready: ' + suggestedMatch + ' was identified and classified as ' + severity + '.'
  }).then(function () {
    showToast('Mapping verified, pet owner notified of the finalized result', 'success');
    logAdminAction('Verified OCR mapping for scan ' + scanRef + ' as ' + suggestedMatch + ' (' + severity + '), pet owner notified', 'verify');
  }).catch(function () {
    showToast('Mapping verified, but notifying the pet owner failed', 'danger');
    logAdminAction('Verified OCR mapping for scan ' + scanRef + ' as ' + suggestedMatch + ' (' + severity + '), pet owner notification failed', 'verify');
  });
}

// the "Registered Pet Owners" KPI card links to Users & Pets -- but that
// page is restricted to Support/Chief Admins (restrictPageToRoles in
// users-pets.js) and silently bounces anyone else straight back here with
// no explanation, which just looks like the page is broken. This checks
// the same permission first, so an Ingredient Reviewer gets a clear reason
// instead of an unexplained round trip.
function goToUsersPets() {
  if (!hasPermission('manageUsers')) {
    showToast('Users & Pets requires ' + (PERMISSION_REQUIRES_LABEL.manageUsers || 'a different role') + '.', 'danger');
    return;
  }
  window.location.href = 'users-pets.html';
}

// quick preview modal when you click a scan in the Live Assessment Stream,
// links out to the full record on OCR Scan Records
function viewStreamDetail(product, owner, pet, time, verdict, tone, scanId) {
  var toneMap = { safe: 'text-safe bg-safe/10 border-safe/10', danger: 'text-danger bg-danger/10 border-danger/10', caution: 'text-caution bg-caution/10 border-caution/10' };
  openModal({
    title: product,
    subtitle: owner + ' · ' + pet + ' · ' + time,
    bodyHtml:
      '<div class="flex items-center justify-between mb-6">' +
        '<span class="text-xs font-bold text-stone-400 uppercase tracking-widest">Safety Verdict</span>' +
        '<span class="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ' + (toneMap[tone] || toneMap.safe) + '">' + verdict + '</span>' +
      '</div>' +
      '<p class="text-sm text-stone-600 leading-relaxed">This scan was processed by the OCR pipeline and matched against the ingredient safety database. Open OCR Scan Records for the full extraction trace, detected substances, and audit history.</p>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Close</button>' +
      '<a href="ocr-scans.html?inspect=' + encodeURIComponent(scanId || '') + '" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Open in OCR Scan Records</a>'
  });
}

// sorts the triage queue so Toxic cases always float to the top, above
// Caution/Safe ones, regardless of when each scan actually came in
function prioritizeTriageQueue() {
  var list = document.getElementById('triage-list');
  if (!list) return;
  var rows = Array.prototype.slice.call(list.children);
  rows.sort(function (a, b) {
    var aToxic = a.dataset.severity === 'Toxic' ? 0 : 1;
    var bToxic = b.dataset.severity === 'Toxic' ? 0 : 1;
    return aToxic - bToxic;
  });
  rows.forEach(function (row) { list.appendChild(row); });
}

// cleans up any triage card resolved from a different page instead of here
// (like the ingredient database's "review from triage" flow finishing
// there) by checking a shared "resolved" list on load
function removeResolvedTriageCards() {
  var resolved = [];
  try { resolved = JSON.parse(localStorage.getItem('kibbleguard-resolved-scans')) || []; } catch (e) { resolved = []; }
  if (!resolved.length) return;
  var stillUnprocessed = [];
  var anyRemoved = false;
  resolved.forEach(function (scanRef) {
    var row = Array.prototype.find.call(document.querySelectorAll('#triage-list [data-scan]'), function (r) {
      return r.dataset.scan === scanRef;
    });
    if (row) {
      row.remove();
      updateTriageCount(-1);
      anyRemoved = true;
    } else {
      stillUnprocessed.push(scanRef);
    }
  });
  localStorage.setItem('kibbleguard-resolved-scans', JSON.stringify(stillUnprocessed));
  if (anyRemoved) savePersistedRows('kibbleguard-triage-rows', document.getElementById('triage-list'));
}

// refreshKpiFromPersistedRows itself now lives in app.js since Safety Feed
// needs the exact same "count real saved rows, fall back to seed count" logic
// fallbacks are what each page really starts with when nothing is saved yet: 5 seed ingredients
// + the sample Glucosamine entry, and 4 seed scans + the sample Joint Support scan
refreshKpiFromPersistedRows('kibbleguard-ingredients-rows', 'kpi-ingredients', 6);
refreshKpiFromPersistedRows('kibbleguard-users-rows', 'kpi-owners', 4);
// "Label Scans Processed" - was a hardcoded 184,930 with nothing updating it,
// now the real count of scans actually saved in OCR Scan Records
refreshKpiFromPersistedRows('kibbleguard-scans-rows', 'kpi-scans', 5);

(function () {
  var triageEl = document.getElementById('triage-kpi');
  var triageList = document.getElementById('triage-list');
  if (triageEl && triageList) {
    var realCount = triageList.children.length;
    triageEl.dataset.target = realCount;
    triageEl.textContent = realCount.toLocaleString();
  }
})();

// logs the real triage count on every visit, so the trend arrow is based
// on actual history rather than made-up numbers. capped at 20 entries
// so the history doesn't just keep growing forever
function recordTriageTrendAndDisplay() {
  var indicator = document.getElementById('triage-trend-indicator');
  var currentCount = document.getElementById('triage-list') ? document.getElementById('triage-list').children.length : 0;
  var history = [];
  try { history = JSON.parse(localStorage.getItem('kibbleguard-triage-history')) || []; } catch (e) { history = []; }

  if (history.length > 0 && indicator) {
    var previous = history[history.length - 1];
    var diff = currentCount - previous.count;
    indicator.classList.remove('hidden');
    if (diff > 0) {
      indicator.className = 'text-[10px] font-bold text-danger';
      indicator.innerHTML = '<i class="fa-solid fa-arrow-up"></i> +' + diff + ' since last visit';
    } else if (diff < 0) {
      indicator.className = 'text-[10px] font-bold text-safe';
      indicator.innerHTML = '<i class="fa-solid fa-arrow-down"></i> ' + diff + ' since last visit';
    } else {
      indicator.className = 'text-[10px] font-bold text-stone-400';
      indicator.innerHTML = '<i class="fa-solid fa-minus"></i> No change since last visit';
    }
  }

  history.push({ timestamp: Date.now(), count: currentCount });
  if (history.length > 20) history = history.slice(history.length - 20);
  localStorage.setItem('kibbleguard-triage-history', JSON.stringify(history));
}
recordTriageTrendAndDisplay();

// pulls whichever alerts are genuinely live on Safety Feed right now.
// this preview always matches what's actually been published there
function refreshActiveAlertsFromSafetyFeed() {
  var container = document.getElementById('dashboard-alerts-preview');
  if (!container) return;
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-alerts-rows')); } catch (e) { saved = null; }
  if (!saved || !saved.length) return;

  var liveAlerts = [];
  saved.forEach(function (rowHtml) {
    var temp = document.createElement('table');
    temp.innerHTML = '<tbody>' + rowHtml + '</tbody>';
    var row = temp.querySelector('tr');
    if (!row || row.dataset.status !== 'live') return;
    var getField = function (name) { var el = row.querySelector('[data-field="' + name + '"]'); return el ? el.textContent.trim() : ''; };
    liveAlerts.push({
      title: getField('title'),
      type: getField('type'),
      species: getField('species'),
      published: getField('published'),
      icon: row.querySelector('td i.fa-solid') ? row.querySelector('td i.fa-solid').className : 'fa-solid fa-bell',
      severe: row.querySelector('[data-field="severity-badge"]') && row.querySelector('[data-field="severity-badge"]').textContent.trim() === 'Urgent'
    });
  });

  if (!liveAlerts.length) {
    container.innerHTML = '<div class="p-8 text-center text-xs text-stone-400 font-bold">No active alerts right now</div>';
    return;
  }
  container.innerHTML = liveAlerts.slice(0, 2).map(function (a) {
    var iconWrap = a.severe ? 'bg-danger/10 text-danger' : 'bg-brand-light text-brand';
    return '<div class="p-5"><div class="flex items-start gap-3">' +
      '<div class="w-9 h-9 rounded-xl ' + iconWrap + ' flex items-center justify-center text-sm shrink-0"><i class="' + escapeHTML(a.icon) + '"></i></div>' +
      '<div><p class="text-xs font-bold text-dark leading-snug">' + escapeHTML(a.title) + '</p>' +
      '<p class="text-[10px] text-stone-400 mt-1">' + escapeHTML(a.type) + ' &middot; ' + escapeHTML(a.species) + ' &middot; ' + escapeHTML(a.published) + '</p></div>' +
    '</div></div>';
  }).join('');
}
refreshActiveAlertsFromSafetyFeed();

// reads the saved Safety Rules thresholds (same key safety-rules.js writes)
// so the triage queue below reflects them. defaults match the Safety Rules page
function getSafetyRuleThresholds() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-safety-rules')); } catch (e) { saved = null; }
  var floor = saved && saved.hazardFloor !== undefined ? parseInt(saved.hazardFloor, 10) : NaN;
  var approve = saved && saved.autoApprove !== undefined ? parseInt(saved.autoApprove, 10) : NaN;
  return { hazardFloor: isNaN(floor) ? 15 : floor, autoApprove: isNaN(approve) ? 92 : approve };
}

// puts a small rule badge on every Toxic triage case showing what the Critical
// Hazard Floor does to it. nothing is hidden: a weak match stays in the queue,
// it's just labelled so the reviewer knows the match itself may be unreliable
function applyHazardFloorBadges() {
  var floor = getSafetyRuleThresholds().hazardFloor;
  document.querySelectorAll('#triage-list [data-severity="Toxic"]').forEach(function (row) {
    var old = row.querySelector('.rule-badge');
    if (old) old.remove();
    var conf = parseInt(row.dataset.confidence, 10);
    if (isNaN(conf)) return;
    var forced = conf >= floor;
    var badge = document.createElement('p');
    badge.className = 'rule-badge text-[10px] font-bold mt-1 ' + (forced ? 'text-danger' : 'text-caution');
    badge.innerHTML = forced
      ? '<i class="fa-solid fa-shield-halved mr-1"></i>Hazard floor (' + floor + '%): confidence is above it, so manual review is required'
      : '<i class="fa-solid fa-circle-question mr-1"></i>Below hazard floor (' + floor + '%): match is too weak to trust, consider asking for a rescan';
    var info = row.querySelector('.flex.items-center.gap-5 > div:last-child');
    if (info) info.appendChild(badge);
  });
}

// demo data doesn't come with real arrival timestamps, so this fakes
// realistic ones for the seed rows -- a real backend would just have this
// as an actual field per scan instead
function assignDemoArrivalTimes() {
  var now = Date.now();
  var demoOffsets = { 'triage-83391': 22 * 60 * 1000, 'triage-83382': 7 * 60 * 60 * 1000, 'triage-83407': 9 * 60 * 1000 };
  document.querySelectorAll('#triage-list [data-severity]').forEach(function (row) {
    if (row.dataset.arrivedAt) return;
    var offset = demoOffsets[row.id] !== undefined ? demoOffsets[row.id] : 15 * 60 * 1000;
    row.dataset.arrivedAt = String(now - offset);
  });
}

// flags a Toxic case that's been sitting for too long - both on the row
// itself and as a banner up top. only checks while this page is actually
// open though (on load + every min after), a real alert that fires even
// with the tab closed would need to live on the backend side
var OVERDUE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours -- roughly a full admin shift
var OVERDUE_THRESHOLD_HOURS = OVERDUE_THRESHOLD_MS / (60 * 60 * 1000); // banner text below reads this instead of a second hardcoded number, so the two can't drift out of sync again if this ever changes
function checkOverdueToxicCases() {
  var now = Date.now();
  var overdueNames = [];
  document.querySelectorAll('#triage-list [data-severity="Toxic"]').forEach(function (row) {
    var arrivedAt = parseInt(row.dataset.arrivedAt, 10);
    var isOverdue = !isNaN(arrivedAt) && (now - arrivedAt) > OVERDUE_THRESHOLD_MS;
    row.classList.toggle('overdue-toxic-case', isOverdue);
    var existingBadge = row.querySelector('.overdue-badge');
    if (isOverdue && !existingBadge) {
      var nameEl = row.querySelector('[data-field="triage-name"]') || row.querySelector('.font-bold');
      var badge = document.createElement('span');
      badge.className = 'overdue-badge ml-2 px-2 py-0.5 rounded-full bg-danger text-white text-[9px] font-bold uppercase tracking-widest align-middle';
      badge.textContent = 'Overdue';
      if (nameEl) nameEl.appendChild(badge);
    } else if (!isOverdue && existingBadge) {
      existingBadge.remove();
    }
    if (isOverdue) overdueNames.push(row.dataset.suggestedMatch || row.dataset.name);
  });

  var banner = document.getElementById('overdue-toxic-banner');
  var bannerText = document.getElementById('overdue-toxic-banner-text');
  if (banner && bannerText) {
    if (overdueNames.length > 0) {
      banner.classList.remove('hidden');
      bannerText.textContent = overdueNames.length + ' possible toxic case' + (overdueNames.length === 1 ? '' : 's') +
        ' (' + overdueNames.join(', ') + ') has been waiting over ' + OVERDUE_THRESHOLD_HOURS + ' hours without review.';
    } else {
      banner.classList.add('hidden');
    }
  }
}
applyHazardFloorBadges();
assignDemoArrivalTimes();
checkOverdueToxicCases();
setInterval(checkOverdueToxicCases, 60 * 1000);

renderNavBadges();
applyRoleState();
prioritizeTriageQueue();
removeResolvedTriageCards();

// the icon uses the species color (dog teal, cat purple, same as everywhere else); the verdict stays in the colored word on the right
// Live Assessment Stream: the 3 most recent real scans from OCR Scan Records'
// saved rows. If nothing is saved yet (OCR Scan Records not opened in this
// browser), the static sample markup stays.
var liveStreamItems = [];
function refreshLiveStreamFromScans() {
  var list = document.getElementById('live-stream-list');
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-scans-rows')); } catch (e) { saved = null; }
  if (!list || !saved || !saved.length) return;
  var tmp = document.createElement('table');
  tmp.innerHTML = '<tbody>' + saved.join('') + '</tbody>';
  var items = [];
  Array.prototype.forEach.call(tmp.querySelectorAll('tr[data-verdict]'), function (r) {
    var v = r.dataset.verdict;
    if (['safe', 'caution', 'toxic'].indexOf(v) === -1) return;
    var prod = r.querySelector('td:nth-child(2) p.italic');
    var owner = r.querySelector('td:nth-child(3) p.font-bold');
    var pet = r.querySelector('td:nth-child(3) p.italic');
    var ts = r.querySelector('td:nth-child(8)');
    if (!prod || !owner) return;
    var pc = prod.cloneNode(true);
    Array.prototype.forEach.call(pc.querySelectorAll('span'), function (b) { b.remove(); });
    items.push({ product: pc.textContent.trim(), owner: owner.textContent.trim(), pet: pet ? pet.textContent.replace(/^Pet:\s*/, '').trim() : '',
      time: ts ? ts.textContent.trim() : '', verdict: v.charAt(0).toUpperCase() + v.slice(1), species: r.dataset.species, scanId: 'KB-' + r.id.replace('row-', '') });
  });
  items.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
  liveStreamItems = items.slice(0, 3);
  if (!liveStreamItems.length) return;
  var tone = { Safe: ['safe', 'safe'], Caution: ['caution', 'caution'], Toxic: ['danger', 'danger'] };
  list.innerHTML = liveStreamItems.map(function (it, i) {
    var t = tone[it.verdict][0];
    return '<div class="feed-row p-6 flex items-center justify-between cursor-pointer" onclick="openLiveStreamItem(' + i + ')">' +
      '<div class="flex items-center gap-4"><div class="w-9 h-9 rounded-xl ' + (it.species === 'feline' ? 'bg-[#B57EDC]/10 text-[#B57EDC]' : 'bg-[#03C4C9]/10 text-[#03C4C9]') + ' flex items-center justify-center text-sm shrink-0"><i class="fa-solid ' + (it.species === 'feline' ? 'fa-cat' : 'fa-dog') + '"></i></div>' +
      '<div><p class="text-sm font-bold text-dark leading-none">' + escapeHTML(it.product) + '</p><p class="text-[11px] text-stone-400 mt-1">' + escapeHTML(it.owner) + (it.pet ? ' (' + escapeHTML(it.pet) + ')' : '') + ' &middot; ' + escapeHTML(it.time) + '</p></div></div>' +
      '<div class="flex items-center gap-3"><span class="text-[10px] font-bold text-' + t + ' uppercase tracking-widest">' + it.verdict + '</span><i class="chevron-reveal fa-solid fa-chevron-right text-[10px] text-stone-300"></i></div></div>';
  }).join('');
}
function openLiveStreamItem(i) {
  var it = liveStreamItems[i];
  if (it) viewStreamDetail(it.product, it.owner, it.pet, it.time, it.verdict, tone_for(it.verdict), it.scanId);
}
function tone_for(v) { return v === 'Toxic' ? 'danger' : v.toLowerCase(); }
refreshLiveStreamFromScans();


/* ---------- Refresh ----------
   Re-reads everything this page shows from saved data and redraws it in place
   (no page reload). Not re-run here: the "since last visit" triage arrow,
   which only records once per visit, and the count-up animation. */
function syncTriageKpi() {
  var el = document.getElementById('triage-kpi');
  var list = document.getElementById('triage-list');
  var empty = document.getElementById('triage-empty');
  if (!el || !list) return;
  var n = list.children.length;
  el.dataset.target = n;
  el.textContent = n.toLocaleString();
  list.classList.toggle('hidden', n === 0);
  if (empty) empty.classList.toggle('hidden', n !== 0);
}

/* ---------- Welcome line ----------
   "Welcome back, Dr. Sarah": the signed-in admin's real name (a leading title such as Dr.
   is kept with the first name), then today's date. Redrawn on Refresh so a name change
   shows up. Pending items are deliberately not repeated here: the bell in the header
   already lists them. */
function greetingNameFor(fullName) {
  var parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  var isTitle = /^(dr|mr|mrs|ms|mx|prof|engr|atty)\.?$/i.test(parts[0]);
  return (isTitle && parts.length > 1) ? parts[0] + ' ' + parts[1] : parts[0];
}
function renderDashboardGreeting() {
  var title = document.getElementById('greeting-title');
  var sub = document.getElementById('greeting-sub');
  if (!title || !sub) return;
  var account = (typeof getLoggedInAdmin === 'function') ? getLoggedInAdmin() : null;
  var name = account ? greetingNameFor(account.name) : '';
  title.innerHTML = name ? 'Welcome back, <span class="kg-wordmark-guard">' + escapeHTML(name) + '</span>' : 'Welcome back';
  var today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  sub.innerHTML = '<i class="fa-regular fa-calendar mr-1.5"></i>' + escapeHTML(today);
}
renderDashboardGreeting();

function refreshDashboardCharts() {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var records = getStoredScanRecords();
  var anchor = new Date(today);
  if (records.length) {
    var latest = new Date(Math.max.apply(null, records.map(function (r) { return r.date.getTime(); })));
    latest.setHours(0, 0, 0, 0);
    if (latest < anchor) anchor = latest;
  }

  // Assessment Activity
  if (mainChart) {
    var fromInput = document.getElementById('chart-date-from');
    var toInput = document.getElementById('chart-date-to');
    if (!chartRangeCustom) {
      var weekAgo = new Date(anchor); weekAgo.setDate(weekAgo.getDate() - 6);
      fromInput.value = toInputDateString(weekAgo);
      toInput.value = toInputDateString(anchor);
    }
    if (fromInput.value && toInput.value) {
      var fd = new Date(fromInput.value + 'T00:00:00'), td = new Date(toInput.value + 'T00:00:00');
      if (fd <= td) updateMainChart(buildRangeData(fd, td));
    }
  }

  // Species Exposure + Weekly Safety Verdict Split
  var split = computeSpeciesSplit();
  updateSpeciesDonut(split.species);
  var vFrom = document.getElementById('verdict-date-from');
  var vTo = document.getElementById('verdict-date-to');
  if (verdictRangeCustom && vFrom.value && vTo.value) {
    renderVerdictSplitForRange(new Date(vFrom.value + 'T00:00:00').getTime(), new Date(vTo.value + 'T23:59:59').getTime());
  } else if (split.latestTime !== null) {
    renderVerdictSplitForRange(split.windowStart, split.latestTime);
    vFrom.value = toInputDateString(new Date(split.windowStart));
    vTo.value = toInputDateString(new Date(split.latestTime));
    clampVerdictDateRange();
  } else {
    renderVerdictSplitForRange(0, 0);
  }
}

function refreshDashboard() {
  renderDashboardGreeting();
  // triage queue: read straight from saved rows (an empty saved list is real, it means everything was resolved)
  var triageList = document.getElementById('triage-list');
  var savedTriage = null;
  try { savedTriage = JSON.parse(localStorage.getItem('kibbleguard-triage-rows')); } catch (e) { savedTriage = null; }
  if (triageList && Array.isArray(savedTriage)) { triageList.innerHTML = savedTriage.join(''); markRowsLoaded('kibbleguard-triage-rows'); }
  prioritizeTriageQueue();
  removeResolvedTriageCards();
  assignDemoArrivalTimes();
  applyHazardFloorBadges();
  checkOverdueToxicCases();
  syncTriageKpi();

  refreshKpiFromPersistedRows('kibbleguard-ingredients-rows', 'kpi-ingredients', 6);
  refreshKpiFromPersistedRows('kibbleguard-users-rows', 'kpi-owners', 4);
  refreshKpiFromPersistedRows('kibbleguard-scans-rows', 'kpi-scans', 5);

  refreshDashboardCharts();
  refreshActiveAlertsFromSafetyFeed();
  refreshLiveStreamFromScans();
  renderNavBadges();
  reapplyLiveDashboardStats();
}
initRefreshControl({ key: 'dashboard', label: 'Dashboard', onRefresh: refreshDashboard, auto: true });

/* ---------- Jump to High-Risk Triage from the notification bell ----------
   The bell links to dashboard.html#high-risk-triage-section. The browser's own hash scroll
   fires before the charts and the scrolling pane have settled, so it can land in the wrong
   place. Scrolling again once the page has loaded (and on later hash changes, for when you
   are already on the Dashboard) puts the Triage card at the top reliably. */
(function () {
  var TARGET = '#high-risk-triage-section';
  function go() {
    if (window.location.hash !== TARGET) return;
    var el = document.getElementById('high-risk-triage-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (document.readyState === 'complete') setTimeout(go, 300);
  else window.addEventListener('load', function () { setTimeout(go, 500); });
  window.addEventListener('hashchange', go);
})();


// --- LIVE BACKEND CONNECTOR (from the Oct 22 build) ---
// Pulls the real totals from /api/admin/dashboard-stats and fills the KPI cards.
// If the request fails, the numbers worked out from the saved lists stay on screen.
var liveDashboardData = null;

function applyLiveDashboardStats(data) {
  if (!data) return;
  [['kpi-scans', data.total_scans], ['kpi-owners', data.total_users], ['kpi-ingredients', data.total_ingredients]].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (el && pair[1] != null) {
      el.dataset.target = pair[1];
      el.textContent = Number(pair[1]).toLocaleString();
    }
  });
}

// put the last database values back straight away (nothing flickers), then ask the server for fresh ones
function reapplyLiveDashboardStats() {
  applyLiveDashboardStats(liveDashboardData);
  fetchLiveDashboardStats();
}

async function fetchLiveDashboardStats() {
  try {
    var res = await fetch('/api/admin/dashboard-stats');
    if (!res.ok) return;
    liveDashboardData = await res.json();
    applyLiveDashboardStats(liveDashboardData);
  } catch (err) {
    console.error('Failed to load live dashboard stats:', err);
  }
}
fetchLiveDashboardStats();

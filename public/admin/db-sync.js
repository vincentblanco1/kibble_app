/* db-sync.js - connects the admin panel to the database.
   Loaded before app.js on every admin page. It does three things:
   1. before the page runs, loads everything the admin pages save (safety rules, alerts, activity log,
      replies, settings...) from the server, and builds the Users & Pets, OCR Scans, Ingredient Database,
      Triage and Inquiries data from the real tables
   2. every time a page saves one of those lists/settings, sends it to the server
   3. sends changes that belong in the main tables (ingredient ratings, bans) to those tables
   The pages themselves keep using localStorage as before; this file is what makes it the database. */
(function () {
  'use strict';
  var w = window;
  var TOKEN_KEY = 'kibbleguard-session-token';
  var origSet = Storage.prototype.setItem;
  var origRemove = Storage.prototype.removeItem;
  var origFetch = w.fetch ? w.fetch.bind(w) : null;

  // per-browser / per-session values that must NOT be shared between admins
  var LOCAL_ONLY = {
    'kibbleguard-admin-email': 1, 'kibbleguard-session-token': 1, 'kibbleguard-theme': 1,
    'kibbleguard-table-density': 1, 'kibbleguard-sidebar-collapsed': 1, 'kibbleguard-sidebar-scroll': 1,
    'kibbleguard-sample-notrated-scan': 1, 'kibbleguard-sample-glucosamine': 1, 'kibbleguard-login-attempts': 1,
    'kibbleguard-last-activity': 1, 'kibbleguard-idle-timeout': 1, 'kibbleguard-admin-chat-read': 1,
    'kibbleguard-notify-triage': 1, 'kibbleguard-notify-dispute': 1, 'kibbleguard-notify-inquiries': 1,
    'kibbleguard-users-seed-version': 1
  };
  var K_USERS = 'kibbleguard-users-rows', K_SCANS = 'kibbleguard-scans-rows', K_INGS = 'kibbleguard-ingredients-rows',
      K_TRIAGE = 'kibbleguard-triage-rows', K_SEEN = 'kibbleguard-triage-seen', K_ALERTS = 'kibbleguard-alerts-rows';

  // Postgres' `pg` driver returns a bigint (int8) column as a JS STRING, not a number, to avoid
  // silently losing precision -- so a `0`/`1` flag column can come back as the string "0" / "1"
  // instead of the number 0 / 1. Plain `!!v` treats the string "0" as truthy (any non-empty
  // string is), which would show every unbanned user as banned. This checks the real meaning of
  // the value instead of its JS type.
  function isFlagTrue(v) {
    return v === true || v === 1 || v === '1' || v === 'true';
  }

  function isSynced(key) {
    key = String(key);
    if (key.indexOf('kibbleguard-') !== 0) return false;
    if (/^kibbleguard-auto-refresh-/.test(key)) return false;
    return !(LOCAL_ONLY[key] || LOCAL_ONLY[key.replace(/-v$/, '')]);
  }
  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function parse(text, fallback) { try { var v = JSON.parse(text); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clean(s) { return String(s == null ? '' : s).replace(/[|;]/g, ' ').trim(); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'; }

  var KGDB = w.KGDB = { recordTraces: {}, inquiryRecords: {}, loaded: false, offline: false };

  // every call to /api/admin/... carries the login token
  if (origFetch) {
    w.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var t = getToken();
        if (url.indexOf('/api/admin/') === 0 && t && url.indexOf('/api/admin/login') !== 0) {
          init = init || {};
          init.headers = Object.assign({}, init.headers || {}, { Authorization: 'Bearer ' + t });
        }
      } catch (e) { /* send it as it was */ }
      return origFetch(input, init);
    };
  }

  function xhr(url) {
    var x = new XMLHttpRequest();
    x.open('GET', url, false);                               // synchronous on purpose: the pages read storage the moment they load
    x.setRequestHeader('Authorization', 'Bearer ' + getToken());
    try { x.send(); } catch (e) { return { status: 0 }; }
    // a non-2xx response here used to fail silently (the page just stayed on
    // its empty/demo state with nothing in the console explaining why) --
    // this logs the server's own error message so the real cause shows up
    // right in devtools instead of needing a trip to the Render logs
    if (x.status < 200 || x.status >= 300) {
      console.error('[db-sync] ' + url + ' -> HTTP ' + x.status + ': ' + x.responseText);
    }
    return { status: x.status, json: parse(x.responseText, null) };
  }

  /* ------------------------------ row builders ------------------------------ */
  var LEVEL = {
    Safe: { icon: 'fa-circle-check', cls: 'bg-safe/10 text-safe border-safe/10', text: 'Safe' },
    Caution: { icon: 'fa-triangle-exclamation', cls: 'bg-amber-50 text-amber-500 border-amber-100', text: 'Caution' },
    Toxic: { icon: 'fa-skull', cls: 'bg-danger/10 text-danger border-danger/10', text: 'Toxic' },
    Unrated: { icon: 'fa-circle-question', cls: 'bg-stone-100 text-stone-500 border-stone-200', text: 'Not Rated' }
  };
  function badge(level) {
    var m = LEVEL[level] || LEVEL.Safe;
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.text + '</span>';
  }
  function ageText(birth) {
    if (!birth) return '';
    var y = Math.floor((Date.now() - new Date(birth).getTime()) / (365.25 * 24 * 3600 * 1000));
    return isNaN(y) ? '' : (y > 0 ? y + ' yrs old' : 'Under 1 yr');
  }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(s)) return 'Never';
    if (s < 90) return 'Just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }
  function initials(name) { return String(name || '?').split(/\s+/).map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase(); }

  function userRow(u, pets, st) {
    var banned = isFlagTrue(u.is_banned);
    var joined = new Date(u.created_at);
    var petData = pets.map(function (p) {
      var sp = /fel|cat/i.test(p.species || '') ? 'cat' : 'dog';
      return [clean(p.name), sp, clean((p.breed || '') + (p.gender ? ' · ' + p.gender : '')), clean(p.allergies || 'None reported'),
        ageText(p.birthdate), p.weight ? p.weight + ' kg' : '', clean(p.vaccine_status || ''), clean(p.deworming_date || '')].join('|');
    }).join(';');
    var petCell = pets.length ? pets.map(function (p) {
      var cat = /fel|cat/i.test(p.species || '');
      var due = /due|overdue/i.test(p.vaccine_status || '');
      var title = (p.breed || '') + (p.allergies ? ' · Allergen: ' + p.allergies : '');
      return '<span class="inline-flex items-center gap-1.5 text-xs font-bold text-dark" title="' + esc(title) + '"><i class="fa-solid ' +
        (cat ? 'fa-cat text-[#B57EDC]' : 'fa-dog text-[#03C4C9]') + ' w-3.5"></i> ' + esc(p.name) +
        (due ? ' <span class="w-1.5 h-1.5 rounded-full bg-caution" title="Vaccination due for booster"></span>' : '') + '</span>';
    }).join('') : '<span class="text-[11px] text-stone-400">No pets added</span>';
    var statusCls = banned ? 'bg-danger/10 text-danger border-danger/10' : 'bg-safe/10 text-safe border-safe/10';
    var id = 'row-u' + u.id;
    var scanText = st.n + (st.n === 1 ? ' Scan' : ' Scans') + ' &middot; ' + st.warn + (st.warn === 1 ? ' Risk Warning' : ' Risk Warnings') + ' triggered';
    var search = [u.name, u.email, pets.map(function (p) { return p.name; }).join(' '), 'pet owner'].join(' ').toLowerCase();
    return '<tr class="feed-row hover:bg-stone-50/50 group" id="' + id + '" data-name="' + esc(u.name) + '" data-email="' + esc(u.email) +
      '" data-role="Pet Owner" data-country="" data-region="" data-city="" data-barangay="' + esc(u.barangay || '') + '" data-feeding-style="" data-owned-animals="' + pets.length +
      '" data-pets="' + esc(petData) + '" data-scans="' + scanText + '" data-status="' + (banned ? 'banned' : 'active') +
      '" data-joined="' + esc(isNaN(joined) ? '' : joined.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })) +
      '" data-joined-date="' + esc(isNaN(joined) ? '' : u.created_at.slice(0, 10)) + '" data-last-active="' + esc(st.last ? ago(st.last) : 'Never') + '"' +
      (banned ? ' data-ban-reason="' + esc(u.ban_reason || '') + '"' : '') + ' data-search="' + esc(search) + '">' +
      '<td class="px-10 py-6"><div class="flex items-center gap-4"><div class="w-10 h-10 rounded-xl bg-brand-light text-brand flex items-center justify-center text-xs font-bold shrink-0">' + esc(initials(u.name)) + '</div>' +
      '<div><p class="font-bold text-dark">' + esc(u.name) + '</p><p class="text-[11px] text-stone-500">' + esc(u.email) + '</p>' +
      '<p class="text-[9px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">Pet Owner</p></div></div></td>' +
      '<td class="px-10 py-6"><div class="flex flex-col gap-1.5">' + petCell + '</div></td>' +
      '<td class="px-10 py-6"><div><p class="text-xs font-bold text-dark">' + st.n + (st.n === 1 ? ' Scan' : ' Scans') + '</p><p class="text-[10px] text-stone-400 font-medium">' +
        st.warn + (st.warn === 1 ? ' Risk Warning' : ' Risk Warnings') + ' triggered</p></div></td>' +
      '<td class="px-10 py-6"><span class="status-badge px-3 py-1 rounded-full ' + statusCls + ' text-[9px] font-bold uppercase tracking-widest border">' + (banned ? 'Banned' : 'Active') + '</span></td>' +
      '<td class="px-10 py-6 text-right text-stone-500 font-mono text-xs">' + esc(st.last ? ago(st.last) : 'Never') + '</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180">' +
      '<button onclick="openRowMenu(event,\'' + id + '\')" class="press w-10 h-10 rounded-xl hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 transition-all"><i class="fa-solid fa-ellipsis-vertical"></i></button></td></tr>';
  }

  function scanRow(s) {
    var verdict = String(s.rating || 'Safe').toLowerCase();
    if (['safe', 'caution', 'toxic'].indexOf(verdict) === -1) verdict = 'safe';
    var tone = verdict === 'toxic' ? 'danger' : verdict;
    var vName = verdict.charAt(0).toUpperCase() + verdict.slice(1);
    var feline = s.species === 'feline';
    var idTxt = 'KB-' + s.id;
    var search = [idTxt, s.product, s.owner, s.pet, s.species].join(' ').toLowerCase();
    return '<tr class="feed-row hover:bg-stone-50/50 group" id="row-' + s.id + '" data-date="' + esc(s.timestamp.slice(0, 10)) + '" data-verdict="' + verdict +
      '" data-species="' + s.species + '" data-search="' + esc(search) + '">' +
      '<td class="px-10 py-6 font-mono text-xs text-stone-400 font-bold">#' + idTxt + '</td>' +
      '<td class="px-10 py-6"><div class="flex items-center gap-4"><div class="w-11 h-11 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center text-sm shrink-0"><i class="fa-solid fa-image"></i></div>' +
      '<div><p class="font-bold text-dark italic">' + esc(s.product) + '</p></div></div></td>' +
      '<td class="px-10 py-6"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-brand-light text-brand flex items-center justify-center text-[10px] font-bold">' + esc(initials(s.owner)) + '</div>' +
      '<div><p class="text-xs font-bold text-dark">' + esc(s.owner) + '</p><p class="text-[10px] text-stone-500 italic">Pet: ' + esc(s.pet || 'Not recorded') + (s.petBreed ? ' (' + esc(s.petBreed) + ')' : '') + '</p></div></div></td>' +
      '<td class="px-10 py-6"><span class="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600"><i class="fa-solid ' + (feline ? 'fa-cat text-[#B57EDC]' : 'fa-dog text-[#03C4C9]') + '"></i> ' + (feline ? 'Feline' : 'Canine') + '</span></td>' +
      '<td class="px-10 py-6 text-xs font-bold text-stone-600 tabular-nums">&mdash;</td>' +
      '<td class="px-10 py-6"><span class="text-sm font-display font-bold text-' + tone + ' tabular-nums">' + (s.score == null ? '&mdash;' : esc(s.score)) + '</span><span class="text-[10px] text-stone-400">/100</span></td>' +
      '<td class="px-10 py-6">' + badge(vName) + '</td>' +
      '<td class="px-10 py-6 text-right text-stone-400 font-mono text-xs">' + esc(s.timestamp.slice(0, 10) + ' ' + s.timestamp.slice(11, 16)) + '</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180">' +
      '<button onclick="inspectRecord(\'' + idTxt + '\')" class="press px-4 py-2 text-xs font-bold text-stone-400 hover:text-dark transition-all">Inspect</button></td></tr>';
  }

  var INDEX_DEFAULT = { Safe: 1.0, Caution: 2.5, Toxic: 4.0 };
  function ingRow(i) {
    var canine = i.canine || 'Unrated', feline = i.feline || 'Unrated';
    var worst = [canine, feline].reduce(function (a, b) { return (INDEX_DEFAULT[b] || 0) > (INDEX_DEFAULT[a] || 0) ? b : a; }, 'Unrated');
    var idx = INDEX_DEFAULT[worst] ? INDEX_DEFAULT[worst].toFixed(1) : '';
    var id = 'row-' + slug(i.name);
    var search = [i.name, i.category].join(' ').toLowerCase();
    var btn = 'press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all';
    // Vet review status is a separate concept from the existing "Regulatory Compliance
    // Verified" citation toggle (data-reg-verified below) -- this is about whether a vet
    // has signed off on the entry at all. data-ingredient-id carries the REAL database id
    // (the row's own "id" attribute is a name-based slug, which the approve endpoint can't
    // use), so the Approve button and the future scan-matching flow both have something to call.
    var vetStatus = i.reviewStatus === 'pending' ? 'pending' : 'approved';
    var vetBadge = vetStatus === 'pending'
      ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-caution/10 text-caution text-[9px] font-bold uppercase tracking-widest mt-1" data-field="vet-badge"><i class="fa-solid fa-clock-rotate-left"></i> Pending Vet Review</span>'
      : '';
    var approveBtn = vetStatus === 'pending'
      ? '<button onclick="approveIngredient(\'' + id + '\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-safe transition-all" title="Approve (vet-reviewed)" data-field="approve-btn"><i class="fa-solid fa-stamp text-xs"></i></button>'
      : '';
    // Per-species Clinical Details, hydrated straight from the real database so the row
    // (and the edit form it feeds) is correct right after a page load, not only after an
    // edit-and-save round trip. clinicalV2 marks this row as already in the new per-species
    // shape, matching what applyClinicalToDataset (ingredient-database.js) writes on save.
    var clinicalAttrs =
      ' data-canine-metabolic="' + esc(i.canineNotes || '') + '" data-canine-symptoms="' + esc(i.canineSymptoms || '') +
      '" data-canine-guidance="' + esc(i.canineDosage || '') + '" data-canine-emergency="' + esc(i.canineEmergency || '') +
      '" data-canine-breed="' + esc(i.canineBreed || '') + '" data-canine-weight="' + esc(i.canineWeight || '') +
      '" data-feline-metabolic="' + esc(i.felineNotes || '') + '" data-feline-symptoms="' + esc(i.felineSymptoms || '') +
      '" data-feline-guidance="' + esc(i.felineDosage || '') + '" data-feline-emergency="' + esc(i.felineEmergency || '') +
      '" data-feline-breed="' + esc(i.felineBreed || '') + '" data-feline-weight="' + esc(i.felineWeight || '') + '" data-clinical-v2="2"';
    return '<tr class="feed-row hover:bg-stone-50/50 group" id="' + id + '" data-canine="' + canine + '" data-feline="' + feline + '" data-risk-index="' + idx +
      '" data-alternatives="" data-source="" data-reg-verified="false" data-reg-body="" data-aliases="' + esc(i.aliases || '') + '" data-vet-status="' + vetStatus +
      '" data-ingredient-id="' + esc(i.id || '') + '"' + clinicalAttrs + ' data-search="' + esc(search) + '">' +
      '<td class="px-10 py-6"><div><p class="font-bold text-dark text-base" data-field="name">' + esc(i.name) + '</p>' +
      '<p class="text-[11px] text-stone-400 font-medium italic" data-field="subtitle"></p>' +
      '<p class="text-[10px] text-stone-400 mt-1 hidden" data-field="aliases-line"></p>' + vetBadge + '</div></td>' +
      '<td class="px-10 py-6"><span class="px-3 py-1 bg-stone-100 rounded-lg text-[10px] font-bold text-stone-600" data-field="category">' + esc(i.category || 'Uncategorized') + '</span></td>' +
      '<td class="px-10 py-6" data-field="canine">' + badge(canine) + '</td>' +
      '<td class="px-10 py-6" data-field="feline">' + badge(feline) + '</td>' +
      '<td class="px-10 py-6 text-stone-600 font-bold text-xs tabular-nums" data-field="risk-index-cell">' + (idx ? idx + ' / 5.0' : '&mdash;') + '</td>' +
      '<td class="px-10 py-6 text-stone-500 text-xs tabular-nums" data-field="scan-count">-</td>' +
      '<td class="px-10 py-6 text-right text-stone-400 font-mono text-xs" data-field="modified">&mdash;</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180"><div class="flex items-center justify-end gap-1">' +
      approveBtn +
      '<button onclick="previewIngredient(\'' + id + '\')" class="' + btn + '" title="Preview in Risk Library"><i class="fa-solid fa-eye text-xs"></i></button>' +
      '<button onclick="openMergeForm(\'' + id + '\')" data-perm="manageIngredients" class="' + btn + '" title="Merge with another ingredient"><i class="fa-solid fa-code-merge text-xs"></i></button>' +
      '<button onclick="editIngredient(\'' + id + '\')" data-perm="manageIngredients" class="' + btn + '" title="Edit"><i class="fa-solid fa-pen text-xs"></i></button>' +
      '<button onclick="confirmDeleteIngredient(\'' + id + '\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-danger transition-all" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>' +
      '</div></td></tr>';
  }

  function triageCard(t) {
    var id = 'triage-' + t.scan + '-' + slug(t.name);
    // was always hardcoded to data-severity="Safe", so a Toxic case could never sort to
    // the top of the queue, get a hazard-floor badge, or trip the overdue-case banner --
    // this now carries the card's real severity instead
    var severity = t.severity || 'Caution';
    var toxic = severity === 'Toxic';
    var reasonLine = t.reason === 'toxic-verdict'
      ? 'Toxic verdict &middot; Scan ID: <span class="font-mono text-stone-500">#KB-' + t.scan + '</span>'
      : 'Scan ID: <span class="font-mono text-stone-500">#KB-' + t.scan + '</span> &middot; Not in the ingredient database yet';
    return '<div class="feed-row p-6 flex items-center justify-between group" id="' + id + '" data-name="&quot;' + esc(t.name) + '&quot;" data-suggested-match="' + esc(t.match) +
      '" data-severity="' + severity + '" data-scan="#KB-' + t.scan + '" data-confidence="not measured" data-reason="' + esc(t.reason || 'unrecognized') + '"' + (t.image ? ' data-image="' + esc(t.image) + '"' : '') + '>' +
      '<div class="flex items-center gap-5"><div class="w-12 h-12 rounded-xl ' + (toxic ? 'bg-danger/10 text-danger' : 'bg-amber-50 text-amber-500') + ' flex items-center justify-center text-xl group-hover:scale-110 transition-transform duration-200"><i class="fa-solid ' + (toxic ? 'fa-skull' : 'fa-flask') + '"></i></div>' +
      '<div><p class="text-sm font-bold text-dark italic">&quot;' + esc(t.name) + '&quot;</p>' +
      '<p class="text-[11px] text-stone-400">' + reasonLine + '</p></div></div>' +
      '<button class="press px-5 py-2 text-xs font-bold text-brand border-2 border-brand rounded-xl hover:bg-brand hover:text-white transition-colors duration-200" data-perm="verifyTriage" onclick="verifyTriage(\'' + id + '\')">Verify</button></div>';
  }

  /* ------------------------------ row helpers ------------------------------ */
  function rowId(html) { var m = /^\s*<tr[^>]*?\sid="([^"]+)"/.exec(html); return m ? m[1] : null; }
  function parseRows(list) {
    var t = document.createElement('table');
    t.innerHTML = '<tbody>' + list.join('') + '</tbody>';
    return [].slice.call(t.querySelectorAll('tr[data-search]'));
  }
  // ds.metabolic / ds.symptoms (the old shared, not-per-species fields) get deleted by
  // applyClinicalToDataset the moment the ingredient form is saved -- they were replaced with
  // canineMetabolic/felineMetabolic etc. so each species keeps its own text. Reading the old
  // deleted keys here meant every save synced EMPTY notes/symptoms to the real database, and
  // both species always got the exact same text even when they differed. This reads the real,
  // current, per-species fields instead -- including the Breed/Weight-Specific Risk and
  // Emergency Action fields, which were captured in the form but never sent to the server at all.
  function ingFromRow(tr) {
    var ds = tr.dataset;
    var f = function (n) { var e = tr.querySelector('[data-field="' + n + '"]'); return e ? e.textContent.trim() : ''; };
    return {
      name: f('name'), category: f('category'), canine: ds.canine || 'Unrated', feline: ds.feline || 'Unrated',
      canineNotes: ds.canineMetabolic || '', canineSymptoms: ds.canineSymptoms || '', canineDosage: ds.canineGuidance || '',
      canineEmergency: ds.canineEmergency || '', canineBreed: ds.canineBreed || '', canineWeight: ds.canineWeight || '',
      felineNotes: ds.felineMetabolic || '', felineSymptoms: ds.felineSymptoms || '', felineDosage: ds.felineGuidance || '',
      felineEmergency: ds.felineEmergency || '', felineBreed: ds.felineBreed || '', felineWeight: ds.felineWeight || ''
    };
  }
  function ingSig(i) {
    return [
      i.canine || 'Unrated', i.feline || 'Unrated', i.category || '',
      i.canineNotes || '', i.canineSymptoms || '', i.canineDosage || '', i.canineEmergency || '', i.canineBreed || '', i.canineWeight || '',
      i.felineNotes || '', i.felineSymptoms || '', i.felineDosage || '', i.felineEmergency || '', i.felineBreed || '', i.felineWeight || ''
    ].join('|');
  }
  function alertFromRow(tr) {
    var ds = tr.dataset;
    var f = function (n) { var e = tr.querySelector('[data-field="' + n + '"]'); return e ? e.textContent.trim() : ''; };
    return { id: tr.id, title: f('title'), type: f('type'), severity: f('severity-badge'), species: f('species'), body: ds.body || '', status: ds.status || 'draft' };
  }

  /* ------------------------------ load everything ------------------------------ */
  var baseline = { ings: {}, users: {}, alerts: {} };

  function hydrate() {
    if (!getToken()) return;                                   // login page / invite page: nothing to load yet
    var st = xhr('/api/admin/state');
    if (st.status === 401) { origRemove.call(localStorage, 'kibbleguard-admin-email'); origRemove.call(localStorage, TOKEN_KEY); return; }
    if (st.status !== 200 || !st.json) { KGDB.offline = true; return; }
    var state = st.json.state || {};

    // Which Safety Feed alerts have already been broadcast to pet owners -- grounded from the
    // real backend log, not an in-memory flag, so a page refresh (which starts this whole script
    // over) can never re-send an alert that already went out, and an alert whose broadcast
    // somehow never landed can still be retried.
    var pub = xhr('/api/admin/safety-alerts/published-ids');
    if (pub.status === 200 && pub.json && pub.json.ids) {
      pub.json.ids.forEach(function (id) { baseline.alerts[id] = true; });
    }

    var i, k, local = [];
    for (i = 0; i < localStorage.length; i++) local.push(localStorage.key(i));
    local.forEach(function (key) { if (isSynced(key) && !(key in state)) origRemove.call(localStorage, key); });
    Object.keys(state).forEach(function (key) { if (isSynced(key)) origSet.call(localStorage, key, state[key]); });
    // these stop the pages inserting their built-in demo sample rows
    origSet.call(localStorage, 'kibbleguard-sample-notrated-scan', '1');
    origSet.call(localStorage, 'kibbleguard-sample-glucosamine', '1');

    var d = xhr('/api/admin/data');
    if (d.status !== 200 || !d.json) { KGDB.offline = true; return; }
    var data = d.json, t = getToken();

    // ---- Users & Pets ----
    var petsByUser = {}, stats = {};
    (data.pets || []).forEach(function (p) { (petsByUser[p.user_id] = petsByUser[p.user_id] || []).push(p); });
    (data.scans || []).forEach(function (s) {
      var x = stats[s.user_id] = stats[s.user_id] || { n: 0, warn: 0, last: null };
      x.n++; if (s.rating && s.rating !== 'Safe') x.warn++;
      if (!x.last || s.timestamp > x.last) x.last = s.timestamp;
    });
    var builtUsers = (data.users || []).slice().reverse().map(function (u) {
      baseline.users[u.id] = { banned: isFlagTrue(u.is_banned), reason: u.ban_reason || '' };
      return { id: 'row-u' + u.id, banned: isFlagTrue(u.is_banned), html: userRow(u, petsByUser[u.id] || [], stats[u.id] || { n: 0, warn: 0, last: null }) };
    });
    var savedUsers = {};
    parse(state[K_USERS], []).forEach(function (h) { var id = rowId(h); if (id) savedUsers[id] = h; });
    origSet.call(localStorage, K_USERS, JSON.stringify(builtUsers.map(function (b) {
      var s = savedUsers[b.id];
      return s && (/data-status="banned"/.test(s) === b.banned) ? s : b.html;     // keep the admin's flag/notes unless the database disagrees about a ban
    })));

    // ---- OCR Scans (+ the per-scan breakdown the Inspect window shows) ----
    var builtScans = (data.scans || []).map(function (s) {
      KGDB.recordTraces['KB-' + s.id] = {
        user_id: String(s.user_id), owner: s.owner, ownerEmail: s.ownerEmail, species: s.species, timestamp: s.timestamp,
        confidence: 'Not measured', clarity: 'Unknown', rawOcrText: s.rawOcrText,
        imageUrl: s.hasImage ? '/api/admin/scan-image/' + s.id + '?t=' + encodeURIComponent(t) : '',
        substances: (s.substances || []).map(function (x) { return { name: x.name, category: x.category, level: x.unrated ? 'Unrated' : x.level, note: x.note }; })
      };
      return { id: 'row-' + s.id, html: scanRow(s) };
    });
    var savedScans = {};
    parse(state[K_SCANS], []).forEach(function (h) { var id = rowId(h); if (id) savedScans[id] = h; });
    origSet.call(localStorage, K_SCANS, JSON.stringify(builtScans.map(function (b) { return savedScans[b.id] || b.html; })));

    // ---- Ingredient Database ----
    var savedIngs = {};
    parse(state[K_INGS], []).forEach(function (h) {
      parseRows([h]).forEach(function (tr) { var r = ingFromRow(tr); if (r.name) savedIngs[r.name.toLowerCase()] = { html: h, rec: r }; });
    });
    var ingRows = (data.ingredients || []).map(function (i) {
      var rec = { name: i.name, category: i.category || '', canine: i.canine || 'Unrated', feline: i.feline || 'Unrated', description: i.description || '', risks: i.risks || '' };
      baseline.ings[i.name.toLowerCase()] = { name: i.name, sig: ingSig(rec) };
      var s = savedIngs[i.name.toLowerCase()];
      return (s && ingSig(s.rec) === ingSig(rec)) ? s.html : ingRow(i);              // keep the admin's detailed clinical notes while the ratings still match the database
    });
    origSet.call(localStorage, K_INGS, JSON.stringify(ingRows));

    // ---- Triage: ingredients the database does not know yet, AND any scan
    // whose overall verdict came back Toxic (worth a second set of eyes even
    // when every ingredient in it matched the database just fine) ----
    var known = {};
    (data.ingredients || []).forEach(function (i) { known[i.name.toLowerCase()] = true; });
    var seenTokens = {}, cards = [];
    (data.scans || []).forEach(function (s) {
      (s.substances || []).forEach(function (x) {
        var key = String(x.name || '').toLowerCase();
        if (!x.unrated || !key || seenTokens[key] || cards.length >= 15) return;
        seenTokens[key] = true;
        var match = '';
        Object.keys(known).some(function (n) { if (key.indexOf(n) !== -1 || n.indexOf(key) !== -1) { match = (data.ingredients.filter(function (i) { return i.name.toLowerCase() === n; })[0] || {}).name || ''; return true; } });
        cards.push({ name: x.name, scan: s.id, match: match, severity: 'Caution', image: s.hasImage ? '/api/admin/scan-image/' + s.id + '?t=' + encodeURIComponent(t) : '' });
      });
    });
    (data.scans || []).forEach(function (s) {
      if (s.rating !== 'Toxic' || cards.length >= 15) return;
      var toxicSubstance = (s.substances || []).filter(function (x) { return x.level === 'Toxic'; })[0];
      var name = toxicSubstance ? toxicSubstance.name : (s.product || ('Scan #KB-' + s.id));
      var key = 'toxic-verdict:' + String(name).toLowerCase();
      if (seenTokens[key]) return;
      seenTokens[key] = true;
      cards.push({ name: name, scan: s.id, match: '', severity: 'Toxic', reason: 'toxic-verdict', image: s.hasImage ? '/api/admin/scan-image/' + s.id + '?t=' + encodeURIComponent(t) : '' });
    });
    var seen = parse(state[K_SEEN], []), savedTriage = parse(state[K_TRIAGE], []), fresh = [];
    cards.forEach(function (c) {
      var id = 'triage-' + c.scan + '-' + slug(c.name);
      if (seen.indexOf(id) === -1) { seen.push(id); fresh.push(triageCard(c)); }
    });
    if (fresh.length || !(K_TRIAGE in state)) {
      var merged = savedTriage.concat(fresh);
      origSet.call(localStorage, K_TRIAGE, JSON.stringify(merged));
      origSet.call(localStorage, K_SEEN, JSON.stringify(seen));
      queue(K_TRIAGE, JSON.stringify(merged));
      queue(K_SEEN, JSON.stringify(seen));
    }

    // ---- Inquiries (support tickets from pet owners) ----
    (data.tickets || []).forEach(function (tk) {
      var q = /["“]([^"”]{2,60})["”]/.exec(tk.message || '');
      var rec = { ownerId: tk.ownerId || null, owner: tk.owner, ownerEmail: tk.ownerEmail, category: tk.category, timestamp: tk.timestamp, message: tk.message };
      if (/^Suggest/i.test(tk.category || '')) rec.suggestedIngredient = q ? q[1] : '';
      KGDB.inquiryRecords[tk.id] = rec;
    });
    KGDB.loaded = true;
  }

  /* ------------------------------ saving ------------------------------ */
  var pending = {}, timer = null, inflight = 0;
  function queue(key, value) { pending[key] = value; clearTimeout(timer); timer = setTimeout(flush, 250); }
  function send(key, value) {
    var t = getToken();
    if (!t || !origFetch) return;
    var body = JSON.stringify({ key: key, value: value });
    inflight++;
    origFetch('/api/admin/state', { method: 'PUT', keepalive: body.length < 60000, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: body })
      .then(function (r) { if (!r.ok) console.warn('Could not save ' + key + ' to the database (' + r.status + ')'); })
      .catch(function (e) { console.warn('Could not save ' + key + ' to the database:', e); })
      .then(function () { inflight--; });
  }
  function flush() { var batch = pending; pending = {}; Object.keys(batch).forEach(function (k) { send(k, batch[k]); }); }
  w.addEventListener('pagehide', function () { clearTimeout(timer); flush(); });

  function post(url, body) {
    var t = getToken();
    if (!t || !origFetch) return Promise.resolve(false);
    return origFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  var ingTimer = null, userTimer = null, alertTimer = null;
  function syncIngredients() {
    var rows = parseRows(parse(localStorage.getItem(K_INGS), [])), cur = {}, upsert = [], remove = [];
    rows.forEach(function (tr) { var r = ingFromRow(tr); if (r.name) cur[r.name.toLowerCase()] = r; });
    Object.keys(cur).forEach(function (k) { var b = baseline.ings[k]; if (!b || b.sig !== ingSig(cur[k])) upsert.push(cur[k]); });
    Object.keys(baseline.ings).forEach(function (k) { if (!cur[k]) remove.push(baseline.ings[k].name); });
    if (!upsert.length && !remove.length) return;
    post('/api/admin/ingredients/sync', { upsert: upsert, remove: remove }).then(function (ok) {
      if (!ok) return;
      upsert.forEach(function (r) { baseline.ings[r.name.toLowerCase()] = { name: r.name, sig: ingSig(r) }; });
      remove.forEach(function (n) { delete baseline.ings[n.toLowerCase()]; });
    });
  }
  function syncUsers() {
    parseRows(parse(localStorage.getItem(K_USERS), [])).forEach(function (tr) {
      var m = /^row-u(\d+)$/.exec(tr.id);
      if (!m) return;
      var banned = tr.dataset.status === 'banned', reason = tr.dataset.banReason || '';
      var b = baseline.users[m[1]];
      if (b && b.banned === banned && (!banned || b.reason === reason)) return;
      post('/api/admin/users/status', { id: Number(m[1]), is_banned: banned, ban_reason: reason }).then(function (ok) {
        if (ok) baseline.users[m[1]] = { banned: banned, reason: reason };
      });
    });
  }
  // Publishing used to only save the alert row into the admin's own synced state -- nothing
  // ever told a real pet owner it existed. This watches for a row transitioning to Live (either
  // a brand-new alert saved as Live, or an existing draft flipped Live) and broadcasts it as a
  // real notification to every matching pet owner. baseline.alerts is grounded from the backend
  // at hydrate() time (see above), so this can't double-send on a page refresh, and an alert
  // that failed to broadcast the first time (e.g. the request dropped) will retry next edit.
  function syncAlerts() {
    parseRows(parse(localStorage.getItem(K_ALERTS), [])).forEach(function (tr) {
      var a = alertFromRow(tr);
      if (!a.id || a.status !== 'live' || baseline.alerts[a.id]) return;
      post('/api/admin/safety-alerts/publish', a).then(function (ok) {
        if (ok) baseline.alerts[a.id] = true;
      });
    });
  }

  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this !== w.localStorage) return;
    k = String(k);
    if (!isSynced(k)) return;
    queue(k, String(v));
    if (k === K_INGS) { clearTimeout(ingTimer); ingTimer = setTimeout(syncIngredients, 500); }
    if (k === K_USERS) { clearTimeout(userTimer); userTimer = setTimeout(syncUsers, 500); }
    if (k === K_ALERTS) { clearTimeout(alertTimer); alertTimer = setTimeout(syncAlerts, 500); }
  };
  Storage.prototype.removeItem = function (k) {
    origRemove.call(this, k);
    if (this === w.localStorage && isSynced(String(k))) queue(String(k), null);
  };

  /* pick up other admins' changes every 30 seconds (the pages' own "another admin changed this" checks then apply) */
  setInterval(function () {
    if (document.hidden || !getToken() || !origFetch || inflight || Object.keys(pending).length) return;
    origFetch('/api/admin/state', { headers: { Authorization: 'Bearer ' + getToken() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.state || inflight || Object.keys(pending).length) return;
        Object.keys(j.state).forEach(function (key) {
          if (!isSynced(key) || key === K_USERS || key === K_SCANS || key === K_INGS) return;
          if (localStorage.getItem(key) !== j.state[key]) origSet.call(localStorage, key, j.state[key]);
        });
      }).catch(function () {});
  }, 30000);

  hydrate();
})();

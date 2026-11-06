restorePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body'));

/* ---------- Shared badge helpers ---------- */
/* 5-tier per-species ingredient classification (Risk Library) */
var RISK_LEVELS = ['Safe', 'Caution', 'Toxic'];
var RISK_LEVEL_STYLES = {
  'Safe':    { icon: 'fa-circle-check',        cls: 'bg-safe/10 text-safe border-safe/10' },
  'Caution': { icon: 'fa-triangle-exclamation', cls: 'bg-amber-50 text-amber-500 border-amber-100' },
  'Toxic':   { icon: 'fa-skull',                cls: 'bg-danger/10 text-danger border-danger/10' }
};
// the Safe/Caution/Toxic pill, used all over this page's table and forms
// a species an ingredient simply isn't assessed for (say a canine-only supplement) gets
// its own neutral grey badge -- never the green Safe one, because "no data" is not "safe"
RISK_LEVEL_STYLES['Unrated'] = { icon: 'fa-circle-question', cls: 'bg-stone-100 text-stone-500 border-stone-200' };
function riskBadgeHtml(level) {
  var m = RISK_LEVEL_STYLES[level] || RISK_LEVEL_STYLES['Safe'];
  var text = level === 'Unrated' ? 'Not Rated' : level;
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + text + '</span>';
}
// same 3 levels as a dropdown's <option> list, for the canine/feline
// classification fields on the add/edit form
function riskOptions(selected) {
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
// not actually used on this page, kept for consistency with the other
// pages that share this same badge-helpers block
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- Ingredient Database-specific interactions ---------- */
var CATEGORY_OPTIONS = ['Acidifiers & pH Modifiers','Alcohols & Fermented Products','Amino Acids','Animal Proteins','Antioxidants','Artificial Colors','Artificial Flavor Enhancers','Artificial Preservatives','Artificial Sweeteners','Enzymes','Fats & Oils','Fiber','Fish Proteins','Flavorings & Palatants','Fruits','Functional & Specialty Ingredients','Grains & Carbohydrates','High Sodium & Mineral Additives','Minerals','Natural & Marine Toxins / Miscellaneous Toxins','Plant Ingredients Requiring Moderation','Prebiotics','Preservatives','Probiotics','Sweeteners & Sugars','Toxic Chemicals & Household Contaminants','Toxic Food Ingredients','Toxic Plants & Fruits','Vegetables','Vitamins'];

// the base category list plus anything an admin added through Safety
// Rules' taxonomy manager, so a category made there shows up here too
function getMergedCategoryOptions() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-taxonomy-rows')); } catch (e) { saved = null; }
  if (!saved || !saved.length) return CATEGORY_OPTIONS;
  var merged = CATEGORY_OPTIONS.slice();
  saved.forEach(function (rowHtml) {
    var temp = document.createElement('div');
    temp.innerHTML = rowHtml;
    // reads the row's own data-category-name attribute (set when Safety
    // Rules creates the row) rather than picking a span out by its styling
    // classes - picking it out by styling classes would silently stop new
    // categories from ever showing up here the moment a redesign changed
    // those classes, with no error to catch it
    var row = temp.firstElementChild;
    var name = row ? (row.dataset.categoryName || '') : '';
    if (name && merged.indexOf(name) === -1) merged.push(name);
  });
  return merged;
}

function categoryOptionsHtml(selected) {
  // the merged list above as a dropdown's <option> list
  return getMergedCategoryOptions().map(function (c) {
    return '<option value="' + escapeHTML(c) + '"' + (c === selected ? ' selected' : '') + '>' + escapeHTML(c) + '</option>';
  }).join('');
}

/* ---------- Per-species clinical details ----------
   Dogs and cats react differently, so every ingredient keeps a separate set of
   clinical details for each species -- stored as data-canine-metabolic /
   -symptoms / -guidance / -emergency (and the same for feline).
   What the three main fields MEAN depends on that species' classification:
   "Symptoms" makes no sense for a Safe ingredient, so for Safe it becomes
   "Benefits / Role in Diet", and so on. */
var CLINICAL_LABELS = {
  'Safe': {
    metabolic: 'Why It Is Well Tolerated',
    symptoms: 'Benefits / Role in Diet',
    guidance: 'Safe Serving Guidance',
    emergency: null
  },
  'Caution': {
    metabolic: 'Why It Needs Moderation',
    symptoms: 'Possible Signs of Overuse',
    guidance: 'Moderation Guidance & Safer Swaps',
    emergency: null
  },
  'Toxic': {
    metabolic: 'Why It Is Harmful',
    symptoms: 'Common Symptoms',
    guidance: 'Vet-Safe Alternatives',
    emergency: 'What To Do If Eaten'
  }
};

// generic placeholder / starter wording per classification. This is only a
// starting point, not reviewed clinical text -- an admin should edit it, and
// the Regulatory Compliance Verified switch is what marks an entry as checked
function clinicalStarter(level, species) {
  var word = species === 'canine' ? 'dogs' : 'cats';
  if (level === 'Toxic') {
    return {
      metabolic: 'Known to be harmful to ' + word + ' even in small amounts.',
      symptoms: 'Vomiting, Lethargy, Loss of appetite',
      guidance: 'Do not feed. Ask your veterinarian for a safe replacement.',
      emergency: 'Stop feeding immediately and contact your veterinarian or an animal poison control service right away. Do not wait for symptoms to appear.',
      breed: 'No breed-specific variation documented yet -- treat as harmful across all breeds until reviewed.',
      weight: 'No weight-specific threshold documented yet -- smaller ' + word + ' are generally at greater risk from the same amount.'
    };
  }
  if (level === 'Caution') {
    return {
      metabolic: 'May cause mild digestive upset or sensitivity in some ' + word + ', so it is best given in moderation.',
      symptoms: 'Mild digestive upset, Loose stools, Reduced appetite',
      guidance: 'Offer only in small amounts and monitor your pet. Ask your veterinarian before regular use.',
      emergency: '',
      breed: 'No breed-specific variation documented yet.',
      weight: 'No weight-specific guidance documented yet -- scale any serving to your pet\'s size.'
    };
  }
  return {
    metabolic: 'Generally well tolerated by ' + word + ' in appropriate amounts.',
    symptoms: 'Common ingredient with no known concerns for ' + word + ' at normal serving sizes',
    guidance: "Safe to include in a balanced diet. Follow the product's feeding guidelines.",
    emergency: '',
    breed: 'No breed-specific concerns documented.',
    weight: 'No weight-specific concerns documented.'
  };
}

// reads one row's per-species clinical details back out of its dataset
function getClinicalFromRow(row) {
  var d = row.dataset;
  function one(sp) {
    return {
      metabolic: d[sp + 'Metabolic'] || '',
      symptoms: d[sp + 'Symptoms'] || '',
      guidance: d[sp + 'Guidance'] || '',
      emergency: d[sp + 'Emergency'] || '',
      breed: d[sp + 'Breed'] || '',
      weight: d[sp + 'Weight'] || ''
    };
  }
  return { canine: one('canine'), feline: one('feline') };
}

// writes the per-species details onto a row's dataset. emergency guidance only
// applies to Toxic, so it's cleared for anything else. also removes the old
// shared fields so nothing can drift out of sync with the new ones
function applyClinicalToDataset(ds, clinical, canineLevel, felineLevel) {
  [['canine', canineLevel], ['feline', felineLevel]].forEach(function (pair) {
    var sp = pair[0], level = pair[1], c = clinical[sp];
    ds[sp + 'Metabolic'] = c.metabolic;
    ds[sp + 'Symptoms'] = c.symptoms;
    ds[sp + 'Guidance'] = c.guidance;
    ds[sp + 'Emergency'] = level === 'Toxic' ? c.emergency : '';
    ds[sp + 'Breed'] = c.breed || '';
    ds[sp + 'Weight'] = c.weight || '';
    if (level === 'Unrated') { ds[sp + 'Metabolic'] = ''; ds[sp + 'Symptoms'] = ''; ds[sp + 'Guidance'] = ''; ds[sp + 'Breed'] = ''; ds[sp + 'Weight'] = ''; }
    delete ds[sp + 'Draft'];   // older builds flagged starter text as a draft; verification now covers that
  });
  delete ds.metabolic;
  delete ds.symptoms;
  delete ds.alternatives;
  ds.clinicalV2 = '2';
}

function clinicalPanelHtml(sp, vals, level) {
  vals = vals || { metabolic: '', symptoms: '', guidance: '', emergency: '', breed: '', weight: '' };
  var inputCls = 'w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all';
  var labelCls = 'text-[10px] font-bold text-stone-500 uppercase tracking-widest';
  return '<div id="clin-panel-' + sp + '" class="hidden">' +
    '<div class="flex items-center justify-between mb-3 flex-wrap gap-2">' +
      '<span id="clin-badge-' + sp + '" class="flex items-center gap-2"></span>' +
      '<button type="button" onclick="fillClinicalStarters(\'' + sp + '\')" class="press text-[10px] font-bold text-brand hover:underline">Fill empty fields with starter text</button>' +
    '</div>' +
    '<p id="clin-note-' + sp + '" class="hidden p-4 rounded-2xl bg-white border border-stone-200 text-xs text-stone-500 leading-relaxed"></p>' +
    '<div id="clin-fields-' + sp + '" class="grid grid-cols-2 gap-4">' +
      '<div class="col-span-2"><label id="lbl-' + sp + '-metabolic" class="' + labelCls + '"></label>' +
        '<textarea id="f-' + sp + '-metabolic" class="' + inputCls + ' h-20 resize-none">' + escapeHTML(vals.metabolic) + '</textarea></div>' +
      '<div class="col-span-2"><label id="lbl-' + sp + '-symptoms" class="' + labelCls + '"></label>' +
        '<input id="f-' + sp + '-symptoms" value="' + escapeHTML(vals.symptoms) + '" class="' + inputCls + '"></div>' +
      '<div class="col-span-2"><label id="lbl-' + sp + '-guidance" class="' + labelCls + '"></label>' +
        '<textarea id="f-' + sp + '-guidance" class="' + inputCls + ' h-16 resize-none">' + escapeHTML(vals.guidance) + '</textarea></div>' +
      '<div><label class="' + labelCls + '">Breed-Specific Risk</label>' +
        '<textarea id="f-' + sp + '-breed" class="' + inputCls + ' h-16 resize-none" placeholder="e.g. Brachycephalic breeds are more sensitive...">' + escapeHTML(vals.breed) + '</textarea></div>' +
      '<div><label class="' + labelCls + '">Weight-Specific Risk</label>' +
        '<textarea id="f-' + sp + '-weight" class="' + inputCls + ' h-16 resize-none" placeholder="e.g. Toy/small breeds are at higher risk per kg...">' + escapeHTML(vals.weight) + '</textarea></div>' +
      '<div class="col-span-2 hidden" id="wrap-' + sp + '-emergency"><label id="lbl-' + sp + '-emergency" class="' + labelCls + '"></label>' +
        '<textarea id="f-' + sp + '-emergency" class="' + inputCls + ' h-16 resize-none">' + escapeHTML(vals.emergency) + '</textarea></div>' +
    '</div>' +
  '</div>';
}

// relabels one species' panel to match whatever classification is currently
// picked for it above (Safe / Caution / Toxic), also swaps the placeholders
// and shows the emergency field only for Toxic
function updateClinicalLabels(sp) {
  var levelEl = document.getElementById('f-' + sp);
  var level = levelEl ? levelEl.value : '';
  var word = sp === 'canine' ? 'dogs' : 'cats';
  var fieldsEl = document.getElementById('clin-fields-' + sp);
  var noteEl = document.getElementById('clin-note-' + sp);
  var starterBtn = document.querySelector('#clin-panel-' + sp + ' button[onclick^="fillClinicalStarters"]');
  var needsDetails = level === 'Safe' || level === 'Caution' || level === 'Toxic';
  if (fieldsEl) fieldsEl.classList.toggle('hidden', !needsDetails);
  if (starterBtn) starterBtn.classList.toggle('hidden', !needsDetails);
  if (noteEl) {
    noteEl.classList.toggle('hidden', needsDetails);
    noteEl.textContent = level === 'Unrated'
      ? 'Not rated for ' + word + '. No clinical details are needed. Pet owners with a ' + (sp === 'canine' ? 'dog' : 'cat') + ' will see that this ingredient has not been assessed for them (it is never shown as Safe).'
      : 'Choose a classification for ' + word + ' above to fill in these details.';
  }
  var badgeEl = document.getElementById('clin-badge-' + sp);
  if (!needsDetails) {
    if (badgeEl) badgeEl.innerHTML = level ? riskBadgeHtml(level) + '<span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest">for ' + word + '</span>' : '';
    return;
  }
  var L = CLINICAL_LABELS[level] || CLINICAL_LABELS['Safe'];
  var s = clinicalStarter(level, sp);
  var setText = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text; };
  var setPlaceholder = function (id, text) { var el = document.getElementById(id); if (el) el.placeholder = text; };
  setText('lbl-' + sp + '-metabolic', L.metabolic);
  setText('lbl-' + sp + '-symptoms', L.symptoms + ' (comma separated)');
  setText('lbl-' + sp + '-guidance', L.guidance);
  setPlaceholder('f-' + sp + '-metabolic', s.metabolic);
  setPlaceholder('f-' + sp + '-symptoms', s.symptoms);
  setPlaceholder('f-' + sp + '-guidance', s.guidance);
  var wrap = document.getElementById('wrap-' + sp + '-emergency');
  if (wrap) wrap.classList.toggle('hidden', !L.emergency);
  if (L.emergency) {
    setText('lbl-' + sp + '-emergency', L.emergency);
    setPlaceholder('f-' + sp + '-emergency', s.emergency);
  }
  var badge = document.getElementById('clin-badge-' + sp);
  if (badge) badge.innerHTML = riskBadgeHtml(level) + '<span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest">for ' + (sp === 'canine' ? 'dogs' : 'cats') + '</span>';
}

// Canine / Feline tabs inside the Clinical Details box. both panels stay in
// the page (just hidden) so nothing typed is lost when switching
function switchClinicalTab(sp) {
  ['canine', 'feline'].forEach(function (other) {
    var panel = document.getElementById('clin-panel-' + other);
    var tab = document.getElementById('clin-tab-' + other);
    var active = other === sp;
    if (panel) panel.classList.toggle('hidden', !active);
    if (tab) {
      var activeBg = other === 'canine' ? 'bg-[#03C4C9]' : 'bg-[#B57EDC]';
      tab.className = active
        ? 'press px-4 py-1.5 rounded-lg ' + activeBg + (other === 'canine' ? ' text-[#06343A]' : ' text-[#2B1240]') + ' text-[10px] font-bold shadow-sm transition-all'
        : 'press px-4 py-1.5 rounded-lg text-stone-500 hover:text-dark text-[10px] font-bold transition-all';
      var ico = tab.querySelector('.clin-tab-ico');
      if (ico) {
        ico.classList.toggle('text-[#03C4C9]', other === 'canine' && !active);
        ico.classList.toggle('text-[#B57EDC]', other === 'feline' && !active);
      }
    }
  });
}

// fills ONLY the empty fields for this species with generic starter wording.
// `silent` skips the toast -- used when this runs automatically (template auto-fill
// on a new ingredient) rather than from the admin clicking the button themselves.
function fillClinicalStarters(sp, silent) {
  var level = document.getElementById('f-' + sp).value;
  if (level !== 'Safe' && level !== 'Caution' && level !== 'Toxic') return;
  var s = clinicalStarter(level, sp);
  var filledAny = false;
  ['metabolic', 'symptoms', 'guidance', 'breed', 'weight'].concat(level === 'Toxic' ? ['emergency'] : []).forEach(function (key) {
    var el = document.getElementById('f-' + sp + '-' + key);
    if (el && !el.value.trim()) { el.value = s[key]; filledAny = true; }
  });
  if (!silent) {
    showToast('Starter text added for ' + (sp === 'canine' ? 'dogs' : 'cats') + '. Edit it to match your sources before saving', 'info');
  } else if (filledAny) {
    showToast('Template details filled in for ' + (sp === 'canine' ? 'dogs' : 'cats') + ' -- review and edit before saving', 'info');
  }
}

function readClinicalForm(sp) {
  var get = function (key) { var el = document.getElementById('f-' + sp + '-' + key); return el ? el.value.trim() : ''; };
  return { metabolic: get('metabolic'), symptoms: get('symptoms'), guidance: get('guidance'), emergency: get('emergency'), breed: get('breed'), weight: get('weight') };
}

// every species needs real text in every field that applies to its
// classification -- returns true if all good, otherwise jumps to the
// species tab that's missing something and says exactly what
function validateClinical(clinical, canineLevel, felineLevel) {
  var ok = true;
  [['canine', canineLevel], ['feline', felineLevel]].some(function (pair) {
    var sp = pair[0], level = pair[1], c = clinical[sp], L = CLINICAL_LABELS[level];
    if (!L) return false;   // Not rated: nothing to fill in for this species
    var missing = [];
    if (!c.metabolic) missing.push(L.metabolic);
    if (!c.symptoms) missing.push(L.symptoms);
    if (!c.guidance) missing.push(L.guidance);
    if (L.emergency && !c.emergency) missing.push(L.emergency);
    if (missing.length) {
      switchClinicalTab(sp);
      showToast('Fill in the ' + (sp === 'canine' ? 'canine' : 'feline') + ' details: ' + missing.join(', ') + '. "Fill empty fields with starter text" can help.', 'danger');
      ok = false;
      return true;
    }
    return false;
  });
  return ok;
}

/* ---------- Independent per-species classification + risk index ----------
   Dogs and cats metabolise things differently (for example cats' limited
   glucuronidation), so a single shared score can't describe both. Each species
   has its own classification AND its own 0-5 risk index. A species can also be
   marked "Not rated" when the ingredient isn't assessed for it -- an explicit
   choice, deliberately NOT a default and NOT silently treated as Safe. */
var RISK_INDEX_DEFAULTS = { 'Safe': '1.0', 'Caution': '2.5', 'Toxic': '4.0' };

function speciesLevelOptions(selected) {
  var opts = '<option value=""' + (!selected ? ' selected' : '') + ' disabled>Select a classification...</option>';
  RISK_LEVELS.forEach(function (l) {
    opts += '<option value="' + l + '"' + (l === selected ? ' selected' : '') + '>' + l + '</option>';
  });
  opts += '<option value="Unrated"' + (selected === 'Unrated' ? ' selected' : '') + '>Not rated (not assessed)</option>';
  return opts;
}

// the table's Risk Index cell: one small line per species, a dash if unrated
function riskIndexCellHtml(ds) {
  function line(icon, color, level, value) {
    if (level === 'Unrated' || !value) {
      return '<span class="flex items-center gap-1.5 text-stone-300" title="Not rated for this species"><i class="fa-solid ' + icon + ' w-3 text-[10px]"></i>&mdash;</span>';
    }
    return '<span class="flex items-center gap-1.5"><i class="fa-solid ' + icon + ' w-3 text-[10px] ' + color + '"></i>' + value + ' / 5.0</span>';
  }
  return '<div class="flex flex-col gap-1">' +
    line('fa-dog', 'text-[#03C4C9]', ds.canine, ds.canineRiskIndex) +
    line('fa-cat', 'text-[#B57EDC]', ds.feline, ds.felineRiskIndex) +
  '</div>';
}

// reads one species' risk index from the form: '' when the species is Not rated,
// otherwise a number clamped to 0-5 (blank falls back to the classification's default)
function readSpeciesRiskIndex(sp, level) {
  if (level === 'Unrated' || !level) return '';
  var el = document.getElementById('f-' + sp + '-risk');
  var raw = el ? parseFloat(el.value) : NaN;
  if (isNaN(raw)) raw = parseFloat(RISK_INDEX_DEFAULTS[level]);
  return Math.max(0, Math.min(5, raw)).toFixed(1);
}

// called whenever a species' classification dropdown changes: relabels its
// clinical fields, and enables / fills / clears its risk index to match
// Template auto-fill: once Risk Level is picked for a brand-new ingredient (not when
// editing an existing one -- that would stomp real data with placeholder text), the
// Breed/Weight-Specific Risk, Emergency Action and other clinical fields fill themselves
// in from the same starter templates "Fill empty fields with starter text" already uses.
// Only empty fields are touched, so anything the admin already typed is left alone, and
// everything stays editable afterward. Applies the same way whether this form was opened
// from a label scan or from the regular manual Add Ingredient button.
function onSpeciesLevelChange(sp) {
  updateClinicalLabels(sp);
  syncSpeciesRiskField(sp, false);
  if (ingredientFormMode === 'add') fillClinicalStarters(sp, true);
}

function syncSpeciesRiskField(sp, preserveExisting) {
  var level = document.getElementById('f-' + sp).value;
  var input = document.getElementById('f-' + sp + '-risk');
  var hint = document.getElementById('f-' + sp + '-risk-hint');
  if (!input) return;
  if (!level || level === 'Unrated') {
    input.value = '';
    input.disabled = true;
    input.dataset.auto = '0';
    if (hint) hint.textContent = level === 'Unrated' ? 'Not rated, so no risk index applies.' : 'Choose a classification first.';
    return;
  }
  input.disabled = false;
  if (hint) hint.textContent = 'Blank uses the default for ' + level + ' (' + RISK_INDEX_DEFAULTS[level] + '). Edit it to match your sources.';
  if (!preserveExisting && (!input.value || input.dataset.auto === '1')) {
    input.value = RISK_INDEX_DEFAULTS[level];
    input.dataset.auto = '1';
  }
}

// both species must be an explicit choice (so nobody ends up "Safe" by default
// for a species that was never assessed), and at least one has to be a real rating
function validateSpeciesClassification(canine, feline) {
  if (!canine || !feline) {
    showToast('Choose a classification for ' + (!canine ? 'dogs' : 'cats') + ', or pick "Not rated" if this ingredient is not assessed for them', 'danger');
    return false;
  }
  if (canine === 'Unrated' && feline === 'Unrated') {
    showToast('Rate at least one species. An ingredient cannot be "Not rated" for both dogs and cats', 'danger');
    return false;
  }
  return true;
}

// builds and opens the add/edit modal - mode is 'add' or 'edit', rowId
// only matters for edit (pulls the row's current values to pre-fill the form)
var ingredientFormMode = null;   // 'add' | 'edit' -- gates the template auto-fill above
// prefillName: used by the Scan Results screen to carry the OCR'd label text straight
// into Primary Name, so the admin isn't retyping what the scan already read.
function openIngredientForm(mode, rowId, prefillName) {
  ingredientFormMode = mode;
  var existing = null;
  if (mode === 'edit') {
    var row = document.getElementById(rowId);
    existing = {
      name: row.querySelector('[data-field="name"]').textContent,
      subtitle: row.querySelector('[data-field="subtitle"]').textContent,
      category: row.querySelector('[data-field="category"]').textContent,
      canine: row.dataset.canine,
      feline: row.dataset.feline,
      canineRisk: row.dataset.canineRiskIndex || '',
      felineRisk: row.dataset.felineRiskIndex || '',
      clinical: getClinicalFromRow(row),
      source: row.dataset.source,
      regVerified: row.dataset.regVerified === 'true',
      regBody: row.dataset.regBody || '',
      aliases: row.dataset.aliases || ''
    };
  }
  openModal({
    title: mode === 'edit' ? 'Edit Ingredient Node' : 'Add New Ingredient',
    subtitle: mode === 'edit' ? 'Updates apply to the Risk Library and future scan classifications' : 'This entry becomes available to the OCR matching and classification engine immediately',
    wide: true,
    bodyHtml:
      '<div class="space-y-6">' +

        '<div class="bg-brand-light/40 rounded-2xl p-5 border border-brand/10">' +
          '<p class="text-xs font-bold text-brand uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-brand text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-tag"></i></span> Identification</p>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="col-span-2"><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Ingredient Name <span class="text-danger">*</span></label>' +
              '<input id="f-name" value="' + escapeHTML(existing ? existing.name : (prefillName || '')) + '" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all" placeholder="e.g. Ethoxyquin"></div>' +
            '<div class="col-span-2"><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Subtitle / Common Name</label>' +
              '<input id="f-subtitle" value="' + escapeHTML(existing ? existing.subtitle : '') + '" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all" placeholder="e.g. Synthetic antioxidant">' +
              '<p class="text-[10px] text-stone-400 mt-1.5 leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i>Shown under the name in the table. Not used for OCR matching, use Also Known As below for that.</p></div>' +
            '<div class="col-span-2"><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Also Known As (comma separated)</label>' +
              '<input id="f-aliases" value="' + escapeHTML(existing ? existing.aliases : '') + '" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all" placeholder="e.g. E967, Birch Sugar Alcohol, Wood Sugar">' +
              '<p class="text-[10px] text-stone-400 mt-1.5 leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i>If OCR extracts any of these names, they resolve to this same ingredient instead of creating a duplicate.</p></div>' +
            '<div class="col-span-2"><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Category <span class="text-danger">*</span></label>' +
              '<select id="f-category" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all">' + categoryOptionsHtml(existing ? existing.category : 'Preservatives') + '</select></div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-stone-100 rounded-2xl p-5 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-1 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-shield-dog"></i></span> Species Risk Classification</p>' +
          '<p class="text-[10px] text-stone-400 mb-4 leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i>Dogs and cats metabolise ingredients differently, so each species gets its own classification and its own risk index. If this ingredient is not assessed for one species (for example a canine-only supplement), choose &ldquo;Not rated&rdquo; for it.</p>' +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest"><i class="fa-solid fa-dog mr-1 text-[#03C4C9]"></i>Canine <span class="text-danger">*</span></label>' +
              '<select id="f-canine" onchange="onSpeciesLevelChange(\'canine\')" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all">' + speciesLevelOptions(existing ? existing.canine : '') + '</select>' +
              '<label class="block mt-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">Canine Risk Index (0.0 &ndash; 5.0)</label>' +
              '<input id="f-canine-risk" type="number" min="0" max="5" step="0.1" value="' + (existing ? existing.canineRisk : '') + '" oninput="this.dataset.auto=\'0\'" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed">' +
              '<p id="f-canine-risk-hint" class="text-[10px] text-stone-400 mt-1.5 leading-relaxed"></p></div>' +
            '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest"><i class="fa-solid fa-cat mr-1 text-[#B57EDC]"></i>Feline <span class="text-danger">*</span></label>' +
              '<select id="f-feline" onchange="onSpeciesLevelChange(\'feline\')" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all">' + speciesLevelOptions(existing ? existing.feline : '') + '</select>' +
              '<label class="block mt-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">Feline Risk Index (0.0 &ndash; 5.0)</label>' +
              '<input id="f-feline-risk" type="number" min="0" max="5" step="0.1" value="' + (existing ? existing.felineRisk : '') + '" oninput="this.dataset.auto=\'0\'" class="w-full mt-1.5 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed">' +
              '<p id="f-feline-risk-hint" class="text-[10px] text-stone-400 mt-1.5 leading-relaxed"></p></div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-stone-100 rounded-2xl p-5 border border-stone-200">' +
          '<div class="flex items-center justify-between mb-4 flex-wrap gap-3">' +
            '<p class="text-xs font-bold text-dark uppercase tracking-widest flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-notes-medical"></i></span> Clinical Details</p>' +
            '<div class="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200">' +
              '<button type="button" id="clin-tab-canine" onclick="switchClinicalTab(\'canine\')" class="press px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all"><span class="clin-tab-ico text-[#03C4C9]"><i class="fa-solid fa-dog mr-1"></i></span>Canine</button>' +
              '<button type="button" id="clin-tab-feline" onclick="switchClinicalTab(\'feline\')" class="press px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all"><span class="clin-tab-ico text-[#B57EDC]"><i class="fa-solid fa-cat mr-1"></i></span>Feline</button>' +
            '</div>' +
          '</div>' +
          '<p class="text-[10px] text-stone-400 mb-4 leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i>Dogs and cats react differently, so each species has its own details. The field names change to match that species&rsquo; classification above.</p>' +
          clinicalPanelHtml('canine', existing ? existing.clinical.canine : null, existing ? existing.canine : 'Safe') +
          clinicalPanelHtml('feline', existing ? existing.clinical.feline : null, existing ? existing.feline : 'Safe') +
        '</div>' +

      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="save-ingredient-btn" onclick="saveIngredient(\'' + mode + '\', \'' + (rowId || '') + '\')" data-perm="manageIngredients" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">' + (mode === 'edit' ? 'Save Changes' : 'Add Ingredient') + '</button>'
  });
  updateClinicalLabels('canine');
  updateClinicalLabels('feline');
  syncSpeciesRiskField('canine', true);
  syncSpeciesRiskField('feline', true);
  switchClinicalTab('canine');
}

// just a shortcut for openIngredientForm('edit', rowId)
function editIngredient(rowId) {
  openIngredientForm('edit', rowId);
}

var ingredientCounter = 0; // used to make a unique id for each new row added this session
// handles both add and edit: edit updates the existing row's fields in place,
// while add builds a whole new row and inserts it at the top of the table
function saveIngredient(mode, rowId) {
  var name = document.getElementById('f-name').value.trim();
  var subtitle = document.getElementById('f-subtitle').value.trim();
  var category = document.getElementById('f-category').value;
  var canine = document.getElementById('f-canine').value;
  var feline = document.getElementById('f-feline').value;
  // the input has min/max in the html but that's only enforced on a real
  // form submit, which this isn't - clamping here so someone can't type
  // 999 and have it actually save
  var canineRisk = readSpeciesRiskIndex('canine', canine);
  var felineRisk = readSpeciesRiskIndex('feline', feline);
  var clinical = { canine: readClinicalForm('canine'), feline: readClinicalForm('feline') };
  var aliases = document.getElementById('f-aliases').value.trim();
  // Verification (Scientific Source / Regulatory Compliance Verified) no longer has
  // fields on this form -- editing an ingredient keeps whatever it already had, and a
  // brand-new one simply starts unverified, same as leaving the old toggle off.
  var existingRow = mode === 'edit' ? document.getElementById(rowId) : null;
  var source = existingRow ? (existingRow.dataset.source || '') : '';
  var regVerified = existingRow ? existingRow.dataset.regVerified === 'true' : false;
  var regBody = regVerified ? 'Regulatory Compliance' : '';

  if (!name) {
    showToast('Ingredient name is required', 'danger');
    return;
  }
  if (!validateSpeciesClassification(canine, feline)) return;
  if (!validateClinical(clinical, canine, feline)) return;

  var today = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  var searchStr = (name + ' ' + subtitle + ' ' + category + ' ' + aliases).toLowerCase();
  var akaHtml = aliases ? '<p class="text-[10px] text-stone-400 mt-1" data-field="aliases-line"><span class="font-bold">aka</span> ' + escapeHTML(aliases) + '</p>' : '';
  var regBadgeHtml = regVerified
    ? '<span class="inline-flex items-center gap-1 text-[9px] font-bold text-safe ml-1" title="' + regBody + ' Verified"><i class="fa-solid fa-circle-check"></i></span>'
    : '<span data-field="reg-badge" class="inline-flex items-center gap-1 text-[9px] font-bold text-stone-300 ml-1" title="Not yet regulatory-verified"><i class="fa-regular fa-circle"></i></span>';

  var saveBtn = document.getElementById('save-ingredient-btn');
  withSavingState(saveBtn, mode === 'edit' ? 'Saving...' : 'Adding...', function () {
  if (mode === 'edit') {
    var row = document.getElementById(rowId);
    // snapshotted before any field on the row changes, so a failed save can
    // put the row back exactly as it was instead of leaving half-applied edits
    var originalRowHtml = row.outerHTML;
    var historyBefore = { name: row.querySelector('[data-field="name"]').textContent.trim(), canine: row.dataset.canine, feline: row.dataset.feline, canineRisk: row.dataset.canineRiskIndex || '', felineRisk: row.dataset.felineRiskIndex || '' };
    row.querySelector('[data-field="name"]').textContent = name;
    row.querySelector('[data-field="subtitle"]').textContent = subtitle;
    row.querySelector('[data-field="category"]').textContent = category;
    var existingRegBadge = row.querySelector('[data-field="reg-badge"]');
    if (existingRegBadge) existingRegBadge.remove();
    row.querySelector('[data-field="category"]').insertAdjacentHTML('afterend', regBadgeHtml.replace('<span class=', '<span data-field="reg-badge" class='));
    row.querySelector('[data-field="canine"]').innerHTML = riskBadgeHtml(canine);
    row.querySelector('[data-field="feline"]').innerHTML = riskBadgeHtml(feline);
    row.querySelector('[data-field="modified"]').textContent = today;
    var existingAkaLine = row.querySelector('[data-field="aliases-line"]');
    if (existingAkaLine) existingAkaLine.remove();
    if (akaHtml) row.querySelector('[data-field="subtitle"]').insertAdjacentHTML('afterend', akaHtml);
    row.dataset.canine = canine;
    row.dataset.feline = feline;
    row.dataset.canineRiskIndex = canineRisk;
    row.dataset.felineRiskIndex = felineRisk;
    delete row.dataset.riskIndex;
    applyClinicalToDataset(row.dataset, clinical, canine, feline);
    row.querySelector('[data-field="risk-index-cell"]').innerHTML = riskIndexCellHtml(row.dataset);
    row.dataset.source = source;
    row.dataset.regVerified = regVerified ? 'true' : 'false';
    row.dataset.regBody = regBody;
    row.dataset.aliases = aliases;
    row.dataset.search = searchStr;

    // the persist attempt sits right after the mutation and before any of the
    // "it worked" UI below (toast, modal close, log entry) - if it throws, this
    // puts the row back the way it was and re-throws so the outer catch in
    // withSavingState shows the error toast instead of a false success
    try {
      savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body'));
    } catch (e) {
      var revertTemp = document.createElement('tbody');
      revertTemp.innerHTML = originalRowHtml;
      row.parentNode.replaceChild(revertTemp.firstElementChild, row);
      throw e;
    }

    closeModal();
    renameIngredientHistory(historyBefore.name, name);
    recordIngredientChange(name, historyBefore, { canine: canine, feline: feline, canineRisk: canineRisk, felineRisk: felineRisk });
    showToast('Ingredient node updated, changes are now live in the Risk Library', 'success');
    logAdminAction('Edited ingredient: ' + name, 'edit');
    renderIngredientScanCounts();
    filterIngredients();
  } else {
    ingredientCounter++;
    var newId = 'row-new-' + ingredientCounter;
    var tbody = document.getElementById('ingredient-table-body');
    var tr = document.createElement('tr');
    tr.className = 'feed-row hover:bg-stone-50/50 group';
    tr.id = newId;
    tr.dataset.canine = canine;
    tr.dataset.feline = feline;
    tr.dataset.canineRiskIndex = canineRisk;
    tr.dataset.felineRiskIndex = felineRisk;
    applyClinicalToDataset(tr.dataset, clinical, canine, feline);
    tr.dataset.source = source;
    tr.dataset.aliases = aliases;
    tr.dataset.regVerified = regVerified ? 'true' : 'false';
    tr.dataset.regBody = regBody;
    tr.dataset.search = searchStr;
    // New ingredients always start Pending Verification (see server.js upsertSpeciesIngredient)
    // -- shown here immediately rather than waiting for the next background sync/refresh. No
    // Approve button yet, since this row has no real database id until that sync completes.
    tr.dataset.vetStatus = 'pending';
    var newVetBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-caution/10 text-caution text-[9px] font-bold uppercase tracking-widest mt-1" data-field="vet-badge"><i class="fa-solid fa-clock-rotate-left"></i> Pending Vet Review</span>';
    tr.innerHTML =
      '<td class="px-10 py-6"><div><p class="font-bold text-dark text-base" data-field="name">' + escapeHTML(name) + '</p><p class="text-[11px] text-stone-400 font-medium italic" data-field="subtitle">' + escapeHTML(subtitle) + '</p>' + akaHtml + newVetBadge + '</div></td>' +
      '<td class="px-10 py-6"><span class="px-3 py-1 bg-stone-100 rounded-lg text-[10px] font-bold text-stone-600" data-field="category">' + escapeHTML(category) + '</span>' + regBadgeHtml.replace('<span class=', '<span data-field="reg-badge" class=') + '</td>' +
      '<td class="px-10 py-6" data-field="canine">' + riskBadgeHtml(canine) + '</td>' +
      '<td class="px-10 py-6" data-field="feline">' + riskBadgeHtml(feline) + '</td>' +
      '<td class="px-10 py-6 text-stone-600 font-bold text-xs tabular-nums" data-field="risk-index-cell">' + riskIndexCellHtml(tr.dataset) + '</td>' +
      '<td class="px-10 py-6 text-stone-500 text-xs tabular-nums" data-field="scan-count">Not yet scanned</td>' +
      '<td class="px-10 py-6 text-right text-stone-400 font-mono text-xs" data-field="modified">' + today + '</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180"><div class="flex items-center justify-end gap-1">' +
        '<button onclick="previewIngredient(\'' + newId + '\')" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Preview in Risk Library"><i class="fa-solid fa-eye text-xs"></i></button>' +
        '<button onclick="openMergeForm(\'' + newId + '\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Merge with another ingredient"><i class="fa-solid fa-code-merge text-xs"></i></button>' +
        '<button onclick="editIngredient(\'' + newId + '\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Edit"><i class="fa-solid fa-pen text-xs"></i></button>' +
        '<button onclick="confirmDeleteIngredient(\'' + newId + '\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-danger transition-all" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>' +
      '</div></td>';
    tbody.insertBefore(tr, tbody.firstChild);
    upgradeActionCells();

    // same reasoning as the edit branch above: try to persist right after the
    // insert, before any success UI, and undo the insert if it fails
    try {
      savePersistedRows('kibbleguard-ingredients-rows', tbody);
    } catch (e) {
      tr.remove();
      throw e;
    }

    if (typeof applyPermissionGating === 'function') applyPermissionGating();
    closeModal();
    filterIngredients();
    showToast('New ingredient added as Pending Verification -- a vet needs to approve it before pet owners see it', 'success');
    logAdminAction('Added new ingredient: ' + name, 'add');
    recordIngredientChange(name, null, { canine: canine, feline: feline, canineRisk: canineRisk, felineRisk: felineRisk });
    if (typeof onIngredientAddedFromScan === 'function') onIngredientAddedFromScan(name);
    finalizeScanIfPending(name, canine, feline);
    tr.classList.add('flash-highlight');
    setTimeout(function () { tr.classList.remove('flash-highlight'); }, 800);
  }
  });
}

// shows the ingredient the way a pet owner would see it in their app's Risk
// Library: one section per species, each with the wording that matches that
// species' classification (Safe / Caution / Toxic)
function previewIngredient(rowId) {
  var row = document.getElementById(rowId);
  var d = row.dataset;
  var name = row.querySelector('[data-field="name"]').textContent;
  var subtitle = row.querySelector('[data-field="subtitle"]').textContent;
  var category = row.querySelector('[data-field="category"]').textContent;
  var clinical = getClinicalFromRow(row);

  function speciesSection(sp, icon, title) {
    var level = d[sp];
    var indexValue = sp === 'canine' ? d.canineRiskIndex : d.felineRiskIndex;
    var iconCls = sp === 'canine' ? 'text-[#03C4C9]' : 'text-[#B57EDC]';
    if (level === 'Unrated') {
      return '<div class="mb-6">' +
        '<div class="bg-dark rounded-2xl p-5 flex items-center gap-4 mb-3">' +
          '<div class="flex-1 flex items-center gap-3"><i class="fa-solid ' + icon + ' ' + iconCls + '"></i><span class="text-xs font-bold text-white">' + title + '</span></div>' +
          riskBadgeHtml(level) +
        '</div>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200"><p class="text-xs text-stone-500 leading-relaxed">This ingredient has not been assessed for ' + (sp === 'canine' ? 'dogs' : 'cats') + ', so there is no safety information to show. Do not assume it is safe.</p></div>' +
      '</div>';
    }
    var L = CLINICAL_LABELS[level] || CLINICAL_LABELS['Safe'];
    var c = clinical[sp];
    var items = (c.symptoms || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return '<div class="mb-6">' +
      '<div class="bg-dark rounded-2xl p-5 flex items-center gap-4 mb-3">' +
        '<div class="flex-1 flex items-center gap-3"><i class="fa-solid ' + icon + ' ' + iconCls + '"></i><span class="text-xs font-bold text-white">' + title + '</span></div>' +
        '<span class="text-xs font-bold text-stone-300 tabular-nums mr-2">Risk Index <span class="text-white">' + escapeHTML(indexValue || '-') + '</span><span class="text-stone-500">/5</span></span>' +
        riskBadgeHtml(level) +
      '</div>' +
      '<div class="grid grid-cols-2 gap-4 mb-3">' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">' + escapeHTML(L.metabolic) + '</p><p class="text-xs text-dark leading-relaxed">' + escapeHTML(c.metabolic || 'Not documented') + '</p></div>' +
        '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">' + escapeHTML(L.symptoms) + '</p><ul class="text-xs text-dark space-y-1">' +
          (items.length ? items.map(function (s) { return '<li class="flex items-center gap-2"><i class="fa-solid fa-circle text-[4px] text-stone-400"></i>' + escapeHTML(s) + '</li>'; }).join('') : '<li class="text-stone-400">Not documented</li>') +
        '</ul></div>' +
      '</div>' +
      '<div class="p-4 rounded-2xl bg-brand-light border border-brand/10"><p class="text-[10px] font-bold text-brand uppercase tracking-widest mb-1">' + escapeHTML(L.guidance) + '</p><p class="text-xs text-dark font-medium leading-relaxed">' + escapeHTML(c.guidance || 'Not documented') + '</p></div>' +
      (level === 'Toxic' && c.emergency
        ? '<div class="p-4 rounded-2xl bg-danger/5 border border-danger/10 mt-3"><p class="text-[10px] font-bold text-danger uppercase tracking-widest mb-1"><i class="fa-solid fa-kit-medical mr-1"></i>' + escapeHTML(L.emergency) + '</p><p class="text-xs text-dark font-medium leading-relaxed">' + escapeHTML(c.emergency) + '</p></div>'
        : '') +
    '</div>';
  }

  openModal({
    title: name,
    subtitle: 'Exactly as shown to pet owners in the Risk Library',
    wide: true,
    bodyHtml:
      '<div class="mb-6">' +
        '<div class="flex items-center gap-2 flex-wrap mb-3">' +
          '<span class="px-3 py-1 bg-stone-100 rounded-lg text-[10px] font-bold text-stone-600 uppercase tracking-widest">' + escapeHTML(category) + '</span>' +
          (d.regVerified === 'true'
            ? '<span class="px-3 py-1 rounded-lg bg-safe/10 text-safe text-[10px] font-bold uppercase tracking-widest border border-safe/10"><i class="fa-solid fa-circle-check mr-1"></i>Regulatory Compliance Verified</span>'
            : '<span class="px-3 py-1 rounded-lg bg-stone-100 text-stone-400 text-[10px] font-bold uppercase tracking-widest"><i class="fa-regular fa-circle mr-1"></i>Not Yet Regulatory-Verified</span>') +
        '</div>' +
        '<p class="text-xs text-stone-500 font-medium">' + escapeHTML(subtitle) + '</p>' +
        (d.aliases ? '<p class="text-[11px] text-stone-400 mt-2"><span class="font-bold">Also recognized as:</span> ' + escapeHTML(d.aliases) + '</p>' : '') +
      '</div>' +
      speciesSection('canine', 'fa-dog', 'Dogs') +
      speciesSection('feline', 'fa-cat', 'Cats') +
      (d.source ? '<p class="text-[10px] text-stone-400 mt-4">Source: ' + escapeHTML(d.source) + '</p>' : '') +
      ingredientHistoryHtml(name),
    footerHtml: '<button onclick="closeModal()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close Preview</button>'
  });
}

var currentIngredientClassFilter = 'all';
var currentIngredientSpeciesFilter = 'all';
var currentIngredientVerificationFilter = 'all';
var currentIngredientAgeFilter = 'all';   // 'all' | 'stale6' | 'stale12' -- by the Modified date
// Separate from currentIngredientVerificationFilter above, which is the existing Regulatory
// Compliance citation toggle. This is whether a vet has actually reviewed the entry.
var currentIngredientVetFilter = 'all';   // 'all' | 'pending' | 'approved'

// keeps the three dropdowns, their "this one is active" outline, the Clear filters
// button and the Registry Health tile highlight all in step with the filter state,
// whichever way the state was changed (a dropdown, a tile, or Clear filters)
function syncIngredientFilterUI() {
  var fields = [
    ['ingredient-filter-species', currentIngredientSpeciesFilter],
    ['ingredient-filter-class', currentIngredientClassFilter],
    ['ingredient-filter-verification', currentIngredientVerificationFilter],
    ['ingredient-filter-vet', currentIngredientVetFilter],
    ['ingredient-filter-age', currentIngredientAgeFilter]
  ];
  var anyActive = false;
  fields.forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    var active = pair[1] !== 'all';
    if (active) anyActive = true;
    el.value = pair[1];
    el.classList.toggle('border-brand', active);
    el.classList.toggle('bg-brand-light', active);
    el.classList.toggle('text-brand', active);
    el.classList.toggle('border-stone-200', !active);
    el.classList.toggle('bg-stone-100', !active);
    el.classList.toggle('text-dark', !active);
  });
  var clearBtn = document.getElementById('ingredient-clear-filters');
  if (clearBtn) clearBtn.classList.toggle('hidden', !anyActive);
  ['all', 'verified', 'pending'].forEach(function (key) {
    var tile = document.getElementById('health-tile-' + key);
    var on = key === currentIngredientVerificationFilter && currentIngredientVerificationFilter !== 'all';
    if (tile) { tile.classList.toggle('ring-2', on); tile.classList.toggle('ring-brand', on); }
  });
}

// Species dropdown: all / canine / feline
function setIngredientSpeciesFilter(species) {
  currentIngredientSpeciesFilter = species;
  syncIngredientFilterUI();
  filterIngredients();
}

// Classification dropdown: all / Toxic / Caution / Safe / Unrated (Not rated).
// With a species picked it checks that species' column only; with "all species"
// either column can match
function setIngredientClassFilter(level) {
  currentIngredientClassFilter = level;
  syncIngredientFilterUI();
  filterIngredients();
}

// Verification dropdown, and the three Registry Health tiles (which call this too,
// with scrollToTable so the filtered list comes into view).
// "Verified" = the Regulatory Compliance Verified switch is on; "Pending" = it isn't
function setIngredientVerificationFilter(mode, scrollToTable) {
  currentIngredientVerificationFilter = mode;
  syncIngredientFilterUI();
  filterIngredients();
  if (scrollToTable) {
    var card = document.getElementById('ingredient-table-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Vet Review dropdown: all / pending / approved -- distinct from the Regulatory
// Compliance "Verification" dropdown above
function setIngredientVetFilter(mode) {
  currentIngredientVetFilter = mode;
  syncIngredientFilterUI();
  filterIngredients();
}

// Last updated dropdown: finds entries nobody has touched for a while, so old safety
// data gets a second look. Uses the Modified column that every row already has
function setIngredientAgeFilter(mode) {
  currentIngredientAgeFilter = mode;
  syncIngredientFilterUI();
  filterIngredients();
}

// true when the row's Modified date is older than the chosen window. A date that can't be
// read counts as stale, since "unknown" is exactly what a reviewer should look at
function isIngredientStale(row, months) {
  var cell = row.querySelector('[data-field="modified"]');
  var d = new Date(normalizeModifiedDate(cell ? cell.textContent : ''));
  if (isNaN(d.getTime())) return true;
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return d < cutoff;
}

// the "Clear filters" button: puts the dropdowns back to "All" (the search
// box is left alone, it has its own way to clear)
function clearIngredientFilters() {
  currentIngredientSpeciesFilter = 'all';
  currentIngredientClassFilter = 'all';
  currentIngredientVerificationFilter = 'all';
  currentIngredientVetFilter = 'all';
  currentIngredientAgeFilter = 'all';
  syncIngredientFilterUI();
  filterIngredients();
}

// the actual filter logic, combining the search box with whichever species/classification/verification dropdowns are set.
// when species is picked, class filters only that species' column; when it's "all", either column can match
function filterIngredients() {
  var q = document.getElementById('ingredient-search').value.toLowerCase().trim();
  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  rows.forEach(function (row) {
    var matchesSearch = row.dataset.search.indexOf(q) !== -1;
    var matchesClass;
    if (currentIngredientClassFilter === 'all') {
      matchesClass = true;
    } else if (currentIngredientSpeciesFilter === 'canine') {
      matchesClass = row.dataset.canine === currentIngredientClassFilter;
    } else if (currentIngredientSpeciesFilter === 'feline') {
      matchesClass = row.dataset.feline === currentIngredientClassFilter;
    } else {
      matchesClass = row.dataset.canine === currentIngredientClassFilter || row.dataset.feline === currentIngredientClassFilter;
    }
    var isVerified = row.dataset.regVerified === 'true';
    var matchesVerification = currentIngredientVerificationFilter === 'all' ||
      (currentIngredientVerificationFilter === 'verified' ? isVerified : !isVerified);
    var matchesVet = currentIngredientVetFilter === 'all' || row.dataset.vetStatus === currentIngredientVetFilter;
    var matchesAge = currentIngredientAgeFilter === 'all' ||
      isIngredientStale(row, currentIngredientAgeFilter === 'stale6' ? 6 : 12);
    row.dataset.filterMatch = (matchesSearch && matchesClass && matchesVerification && matchesVet && matchesAge) ? 'true' : 'false';
  });
  updateIngredientCountLabel();
  applyTablePagination('ingredient-table-body', 'ingredient-pagination-controls', 10, true);
}

// updates the "Showing X of Y" text and the empty-state message, called
// after every filter change
function updateIngredientCountLabel() {
  var q = document.getElementById('ingredient-search').value.trim();
  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  var total = rows.length;
  var visible = 0;
  rows.forEach(function (r) { if (r.dataset.filterMatch !== 'false') visible++; });
  document.getElementById('ingredient-empty-row').classList.toggle('hidden', visible !== 0);

  // an empty list gets an explanation that matches WHY it's empty
  var titleEl = document.getElementById('ingredient-empty-title');
  var subEl = document.getElementById('ingredient-empty-sub');
  if (titleEl && subEl) {
    var onlyPendingFilter = currentIngredientVerificationFilter === 'pending' && !q &&
      currentIngredientClassFilter === 'all' && currentIngredientSpeciesFilter === 'all' && currentIngredientAgeFilter === 'all';
    var anyFilter = currentIngredientVerificationFilter !== 'all' || currentIngredientClassFilter !== 'all' || currentIngredientSpeciesFilter !== 'all' || currentIngredientAgeFilter !== 'all';
    if (onlyPendingFilter) {
      titleEl.textContent = 'Nothing is pending verification';
      subEl.textContent = 'Every ingredient in the database is already regulatory-verified.';
    } else if (anyFilter && !q) {
      titleEl.textContent = 'No ingredients match these filters';
      subEl.textContent = 'Try turning off one of the filters above.';
    } else {
      titleEl.textContent = 'No ingredients match your search';
      subEl.textContent = 'Try a different name or category.';
    }
  }

  var label = document.getElementById('ingredient-count-label');
  var isFiltered = q || currentIngredientClassFilter !== 'all' || currentIngredientSpeciesFilter !== 'all' || currentIngredientVerificationFilter !== 'all' || currentIngredientAgeFilter !== 'all';
  if (isFiltered) {
    label.textContent = 'Showing ' + visible + ' matching result' + (visible === 1 ? '' : 's') + ' of ' + total + ' loaded';
  } else {
    label.textContent = 'Showing all ' + total + ' ingredients';
  }
  computeRegistryHealth();
}

/* ---------- Waiting for a Rating ----------
   Looks through the real scans for ingredients that had NO rating for the species
   that was scanned (a Not Rated species, or an ingredient that isn't in the
   database under that name). It checks the current table too, so the moment an
   admin gives that species a real rating, the item drops off this list. */
var needsRatingItems = [];
var NEEDS_RATING_PER_PAGE = 5;
var needsRatingPage = 1;

function findIngredientRowByName(name) {
  var target = String(name).trim().toLowerCase();
  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  return Array.prototype.find.call(rows, function (r) {
    var el = r.querySelector('[data-field="name"]');
    return el && el.textContent.trim().toLowerCase() === target;
  }) || null;
}

function isRealRating(level) {
  return level === 'Safe' || level === 'Caution' || level === 'Toxic';
}

function getNotRatedDemand() {
  var traces = (typeof RECORD_TRACES !== 'undefined') ? RECORD_TRACES : {};
  var items = {};
  Object.keys(traces).forEach(function (scanId) {
    var trace = traces[scanId];
    var sp = trace.species === 'feline' ? 'feline' : 'canine';
    trace.substances.forEach(function (s) {
      if (isRealRating(s.level)) return;
      var row = findIngredientRowByName(s.name);
      if (row && isRealRating(row.dataset[sp])) return;   // rated since that scan, nothing left to do
      var key = s.name + '|' + sp;
      if (!items[key]) items[key] = { name: s.name, species: sp, rowId: row ? row.id : null, scans: [] };
      items[key].scans.push({ scanId: scanId, owner: trace.owner || 'Unknown owner' });
    });
  });
  return Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.scans.length - a.scans.length; });
}

function renderNeedsRatingPanel() {
  var list = document.getElementById('needs-rating-list');
  if (!list) return;
  needsRatingItems = getNotRatedDemand();
  var count = needsRatingItems.length;
  var countEl = document.getElementById('needs-rating-count');
  var tileEl = document.getElementById('health-waiting');
  if (tileEl) tileEl.textContent = count;
  if (countEl) {
    countEl.textContent = count + ' waiting';
    countEl.className = count
      ? 'px-3 py-1.5 rounded-full bg-caution/10 text-caution text-[10px] font-bold uppercase tracking-widest border border-caution/10'
      : 'px-3 py-1.5 rounded-full bg-stone-100 text-stone-500 text-[10px] font-bold uppercase tracking-widest border border-stone-200';
  }
  if (!count) {
    renderNeedsRatingPagination(0, 1, 0, 0);
    list.innerHTML = '<div class="p-8 text-center"><p class="text-sm font-bold text-dark">Nothing is waiting for a rating</p><p class="text-[11px] text-stone-400 mt-1">When a scan contains an ingredient with no rating for that pet\u2019s species, it will show up here.</p></div>';
    return;
  }
  // 5 per page, then Previous / Next. A rating that empties the last page pulls
  // the view back to the new last page instead of leaving it blank
  var totalPages = Math.max(1, Math.ceil(count / NEEDS_RATING_PER_PAGE));
  if (needsRatingPage > totalPages) needsRatingPage = totalPages;
  if (needsRatingPage < 1) needsRatingPage = 1;
  var pageStart = (needsRatingPage - 1) * NEEDS_RATING_PER_PAGE;
  var pageItems = needsRatingItems.slice(pageStart, pageStart + NEEDS_RATING_PER_PAGE);
  renderNeedsRatingPagination(count, totalPages, pageStart, pageItems.length);
  list.innerHTML = pageItems.map(function (item, pageIndex) {
    var i = pageStart + pageIndex;   // position in the full list, which is what the button needs
    var isDog = item.species === 'canine';
    var word = isDog ? 'dogs' : 'cats';
    var owners = item.scans.map(function (s) { return s.owner; }).filter(function (o, idx, arr) { return arr.indexOf(o) === idx; });
    var ownerText = owners.slice(0, 2).join(', ') + (owners.length > 2 ? ' +' + (owners.length - 2) + ' more' : '');
    var why = item.rowId ? 'In the database, but not rated for ' + word : 'Not in the database yet';
    return '<div class="p-5 flex items-center justify-between gap-4 flex-wrap">' +
        '<div class="flex items-center gap-4 min-w-0">' +
          '<div class="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-sm shrink-0 ' + (isDog ? 'text-[#03C4C9]' : 'text-[#B57EDC]') + '"><i class="fa-solid ' + (isDog ? 'fa-dog' : 'fa-cat') + '"></i></div>' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-bold text-dark">' + escapeHTML(item.name) + ' <span class="ml-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[9px] font-bold uppercase tracking-widest border border-stone-200 align-middle">Not rated for ' + word + '</span></p>' +
            '<p class="text-[11px] text-stone-500 mt-0.5">' + why + ' &middot; ' + item.scans.length + ' scan' + (item.scans.length === 1 ? '' : 's') + ' from ' + escapeHTML(ownerText) +
              ' &middot; <a href="ocr-scans.html?inspect=' + encodeURIComponent(item.scans[0].scanId) + '" class="text-brand font-bold hover:underline">View scan</a></p>' +
          '</div>' +
        '</div>' +
        '<button onclick="rateFromWaitingList(' + i + ')" data-perm="manageIngredients" class="press px-5 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all shrink-0">' + (item.rowId ? 'Rate for ' + word : 'Add to database') + '</button>' +
      '</div>';
  }).join('');
  if (typeof applyPermissionGating === 'function') applyPermissionGating();
}

// the "Showing 1-5 of 12" line and Previous / Next buttons under the list.
// hidden entirely while everything fits on one page
function renderNeedsRatingPagination(count, totalPages, pageStart, shownCount) {
  var bar = document.getElementById('needs-rating-pagination');
  if (!bar) return;
  if (count <= NEEDS_RATING_PER_PAGE) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML =
    '<span class="text-xs font-bold text-stone-400 uppercase tracking-widest">Showing ' + (pageStart + 1) + '-' + (pageStart + shownCount) + ' of ' + count + '</span>' +
    '<div class="flex items-center gap-2">' +
      '<button onclick="changeNeedsRatingPage(-1)" ' + (needsRatingPage <= 1 ? 'disabled' : '') + ' class="press px-3 py-1.5 rounded-lg text-xs font-bold border border-stone-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50">Previous</button>' +
      '<span class="text-xs font-bold text-stone-500 px-2">Page ' + needsRatingPage + ' of ' + totalPages + '</span>' +
      '<button onclick="changeNeedsRatingPage(1)" ' + (needsRatingPage >= totalPages ? 'disabled' : '') + ' class="press px-3 py-1.5 rounded-lg text-xs font-bold border border-stone-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50">Next</button>' +
    '</div>';
}

function changeNeedsRatingPage(delta) {
  needsRatingPage += delta;
  renderNeedsRatingPanel();
}

// opens the existing entry on the right species (or a new entry with the name
// filled in) so the admin can give it a real rating
function rateFromWaitingList(index) {
  var item = needsRatingItems[index];
  if (!item) return;
  var word = item.species === 'canine' ? 'dogs' : 'cats';
  if (item.rowId) {
    editIngredient(item.rowId);
    switchClinicalTab(item.species);
    var select = document.getElementById('f-' + item.species);
    if (select) { select.scrollIntoView({ block: 'center' }); select.focus(); }
    showToast('Choose a classification for ' + word + ' to rate ' + item.name, 'info');
  } else {
    openIngredientForm('add');
    var nameField = document.getElementById('f-name');
    if (nameField) nameField.value = item.name;
    showToast(item.name + ' is not in the database yet. Fill in its classification below', 'info');
  }
}

/* ---------- Registry Health: computed live from the table ---------- */
function computeRegistryHealth() {
  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  var total = rows.length;
  var verified = 0;
  rows.forEach(function (r) { if (r.dataset.regVerified === 'true') verified++; });
  document.getElementById('health-total').textContent = total;
  document.getElementById('health-verified').textContent = verified;
  document.getElementById('health-pending').textContent = total - verified;
  renderNeedsRatingPanel();
}

// merges a duplicate into the real entry: the source row gets deleted,
// and its name gets added to the survivor's aliases so it stays searchable
function openMergeForm(rowId) {
  var sourceRow = document.getElementById(rowId);
  var sourceName = sourceRow.querySelector('[data-field="name"]').textContent;
  var otherRows = Array.from(document.querySelectorAll('#ingredient-table-body tr[data-search]')).filter(function (r) { return r.id !== rowId; });

  if (otherRows.length === 0) {
    showToast('There are no other ingredients to merge with yet', 'info');
    return;
  }

  var options = otherRows.map(function (r) {
    var n = r.querySelector('[data-field="name"]').textContent;
    return '<option value="' + r.id + '">' + escapeHTML(n) + '</option>';
  }).join('');

  openModal({
    title: 'Merge Duplicate Ingredient',
    subtitle: 'For when OCR or an admin created two entries for the same real ingredient',
    bodyHtml:
      '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 mb-5">' +
        '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Merging</p>' +
        '<p class="text-sm font-bold text-dark">' + escapeHTML(sourceName) + '</p>' +
      '</div>' +
      '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Into which existing ingredient?</label>' +
      '<select id="f-merge-target" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand">' + options + '</select>' +
      '<p class="text-[11px] text-stone-500 mt-4 leading-relaxed">&ldquo;' + escapeHTML(sourceName) + '&rdquo; will be removed from the table and added as an alias on the ingredient you choose. Its species classifications, risk index, and notes will <strong>not</strong> be copied over. Review the surviving entry afterward to make sure its details are complete.</p>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="confirm-merge-btn" onclick="performMerge(\'' + rowId + '\')" data-perm="manageIngredients" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Merge</button>'
  });
}

// the confirmation step before actually deleting.
// warns specifically if the ingredient has aliases, since those would stop being recognized too
// Marks a Pending Verification ingredient as vet-approved. Calls straight through to
// the server (not the usual localStorage-then-sync pattern the rest of this file uses)
// so the status change is immediate and doesn't wait for the next background sync --
// this is the action that makes an ingredient visible to pet owners, so it shouldn't
// be left in limbo if the tab closes before the next sync tick.
function approveIngredient(rowId) {
  var row = document.getElementById(rowId);
  if (!row) return;
  var ingredientId = row.dataset.ingredientId;
  var name = row.querySelector('[data-field="name"]').textContent;
  if (!ingredientId) {
    showToast('Could not approve ' + name + ' -- missing database id. Try refreshing the page.', 'danger');
    return;
  }
  fetch('/api/admin/ingredients/' + encodeURIComponent(ingredientId) + '/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(function (r) { return r.ok; }).then(function (ok) {
    if (!ok) { showToast('Could not approve ' + name + '. Try again.', 'danger'); return; }
    row.dataset.vetStatus = 'approved';
    var badge = row.querySelector('[data-field="vet-badge"]');
    if (badge) badge.remove();
    var btn = row.querySelector('[data-field="approve-btn"]');
    if (btn) btn.remove();
    filterIngredients();
    showToast(name + ' approved -- now visible to pet owners', 'success');
  }).catch(function () {
    showToast('Could not approve ' + name + '. Check your connection and try again.', 'danger');
  });
}

function confirmDeleteIngredient(rowId) {
  var row = document.getElementById(rowId);
  if (!row) return;
  var name = row.querySelector('[data-field="name"]').textContent;
  var aliases = (row.dataset.aliases || '').split(',').map(function (a) { return a.trim(); }).filter(Boolean);

  var aliasWarning = aliases.length
    ? '<div class="mt-4 p-4 rounded-2xl bg-caution/10 border border-caution/20">' +
        '<p class="text-xs font-bold text-dark mb-1"><i class="fa-solid fa-triangle-exclamation text-caution mr-1.5"></i>This entry also covers ' + aliases.length + ' alternate name' + (aliases.length === 1 ? '' : 's') + '</p>' +
        '<p class="text-[11px] text-stone-500 leading-relaxed">' + escapeHTML(aliases.join(', ')) + '</p>' +
        '<p class="text-[11px] text-stone-500 leading-relaxed mt-2">OCR will stop recognising these names once the entry is removed. If this is a duplicate of another ingredient, use Merge instead so the alternate names are preserved.</p>' +
      '</div>'
    : '';

  openModal({
    title: 'Delete ' + name,
    subtitle: 'This removes the entry from the Risk Library',
    bodyHtml:
      '<p class="text-sm text-stone-600 leading-relaxed">Pet owners will no longer see a classification for <strong>' + escapeHTML(name) + '</strong>. Any future scan that extracts this ingredient will fall through to manual triage instead of returning a verdict.</p>' +
      aliasWarning,
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="confirm-delete-ingredient-btn" onclick="performDeleteIngredient(\'' + rowId + '\')" data-perm="manageIngredients" class="press px-6 py-2.5 text-xs font-bold text-white bg-danger hover:bg-red-600 rounded-xl shadow-lg shadow-danger/20 transition-all">Delete Entry</button>'
  });
}

// the actual delete, after confirmation
function performDeleteIngredient(rowId) {
  var row = document.getElementById(rowId);
  if (!row) { closeModal(); return; }
  var name = row.querySelector('[data-field="name"]').textContent;
  var btn = document.getElementById('confirm-delete-ingredient-btn');

  withSavingState(btn, 'Deleting...', function () {
    // persist "row gone" before the fade animation even starts, not after -
    // detach the row, try to save the table without it, and put it right
    // back (synchronously, before any repaint) if that fails, so a failed
    // delete never visibly animates away in the first place
    var parent = row.parentNode;
    var nextSibling = row.nextSibling;
    parent.removeChild(row);
    try {
      savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body'));
    } catch (e) {
      parent.insertBefore(row, nextSibling);
      throw e;
    }
    parent.insertBefore(row, nextSibling);

    closeModal();
    row.style.transition = 'opacity 0.3s var(--ease-out), transform 0.3s var(--ease-out)';
    row.style.opacity = '0';
    row.style.transform = 'translateX(12px)';
    setTimeout(function () {
      row.remove();
      updateIngredientCountLabel();
      computeRegistryHealth();
    }, 300);

    showToast(name + ' removed from the Risk Library', 'danger');
    logAdminAction('Deleted ingredient: ' + name, 'delete');
    recordIngredientEvent(name, 'Deleted from the database');
  });
}

// the actual merge: folds the source's name and existing aliases into the target's alias list,
// then removes the source row entirely. doesn't copy over risk index/notes/classifications,
// only the name itself
function performMerge(sourceRowId) {
  var targetRowId = document.getElementById('f-merge-target').value;
  var sourceRow = document.getElementById(sourceRowId);
  var targetRow = document.getElementById(targetRowId);
  if (!sourceRow || !targetRow) { closeModal(); return; }
  var btn = document.getElementById('confirm-merge-btn');

  withSavingState(btn, 'Merging...', function () {
  var originalTargetHtml = targetRow.outerHTML;
  var sourceName = sourceRow.querySelector('[data-field="name"]').textContent;
  var sourceAliases = sourceRow.dataset.aliases ? sourceRow.dataset.aliases.split(',').map(function (a) { return a.trim(); }) : [];
  var newAliasEntries = [sourceName].concat(sourceAliases);

  var targetAliases = targetRow.dataset.aliases ? targetRow.dataset.aliases.split(',').map(function (a) { return a.trim(); }) : [];
  newAliasEntries.forEach(function (a) {
    if (a && targetAliases.indexOf(a) === -1) targetAliases.push(a);
  });
  var mergedAliasStr = targetAliases.join(', ');

  var targetName = targetRow.querySelector('[data-field="name"]').textContent;
  var targetSubtitle = targetRow.querySelector('[data-field="subtitle"]').textContent;
  var targetCategory = targetRow.querySelector('[data-field="category"]').textContent;
  targetRow.dataset.aliases = mergedAliasStr;
  targetRow.dataset.search = (targetName + ' ' + targetSubtitle + ' ' + targetCategory + ' ' + mergedAliasStr).toLowerCase();

  var existingAkaLine = targetRow.querySelector('[data-field="aliases-line"]');
  if (existingAkaLine) existingAkaLine.remove();
  var akaHtml = '<p class="text-[10px] text-stone-400 mt-1" data-field="aliases-line"><span class="font-bold">aka</span> ' + escapeHTML(mergedAliasStr) + '</p>';
  targetRow.querySelector('[data-field="subtitle"]').insertAdjacentHTML('afterend', akaHtml);

  // persist the merge (target updated, source gone) before either row visibly
  // changes any further - detach the source row and try to save; on failure,
  // put the source row back and restore the target row's original fields
  // before re-throwing, so a failed merge leaves both rows exactly as they were
  var sourceParent = sourceRow.parentNode;
  var sourceNextSibling = sourceRow.nextSibling;
  sourceParent.removeChild(sourceRow);
  try {
    savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body'));
  } catch (e) {
    sourceParent.insertBefore(sourceRow, sourceNextSibling);
    var revertTemp = document.createElement('tbody');
    revertTemp.innerHTML = originalTargetHtml;
    targetRow.parentNode.replaceChild(revertTemp.firstElementChild, targetRow);
    throw e;
  }
  sourceParent.insertBefore(sourceRow, sourceNextSibling);

  sourceRow.style.transition = 'opacity 0.3s, transform 0.3s';
  sourceRow.style.opacity = '0';
  sourceRow.style.transform = 'translateX(12px)';
  setTimeout(function () {
    sourceRow.remove();
    updateIngredientCountLabel();
  }, 300);

  closeModal();
  showToast('&ldquo;' + sourceName + '&rdquo; merged into &ldquo;' + targetName + '&rdquo; as an alias', 'success');
  logAdminAction('Merged duplicate entry "' + sourceName + '" into ' + targetName, 'merge');
  recordIngredientEvent(targetName, 'Merged in duplicate entry "' + sourceName + '". Names now recognized: ' + newAliasEntries.join(', '));
  recordIngredientEvent(sourceName, 'Merged into "' + targetName + '" and removed');
  });
}

// after adding a brand-new ingredient that came from an unrecognized OCR
// token, this closes the loop - tells the pet owner their scan is done and
// marks that scan as resolved so Dashboard's triage list drops it
function finalizeScanIfPending(ingredientName, canine, feline) {
  var scanRef = new URLSearchParams(window.location.search).get('forScan');
  if (!scanRef) return;

  var resultText;
  if (canine === 'Unrated') resultText = ingredientName + ' is classified as ' + feline + ' for cats. It has not been assessed for dogs.';
  else if (feline === 'Unrated') resultText = ingredientName + ' is classified as ' + canine + ' for dogs. It has not been assessed for cats.';
  else resultText = (canine === feline)
    ? ingredientName + ' is classified as ' + canine + ' for pets.'
    : ingredientName + ' is classified as ' + canine + ' for dogs and ' + feline + ' for cats.';

  queueInAppNotification({
    type: 'scan-result-ready',
    scan: scanRef,
    message: 'Your scan is complete. ' + resultText
  }).then(function () {
    logAdminAction('Finalized scan ' + scanRef + ' using new entry "' + ingredientName + '", pet owner notified of the result', 'verify');
  }).catch(function () {
    logAdminAction('Finalized scan ' + scanRef + ' using new entry "' + ingredientName + '", but pet owner notification failed to queue', 'verify');
  });

  var resolved = [];
  try { resolved = JSON.parse(localStorage.getItem('kibbleguard-resolved-scans')) || []; } catch (e) { resolved = []; }
  if (resolved.indexOf(scanRef) === -1) resolved.push(scanRef);
  localStorage.setItem('kibbleguard-resolved-scans', JSON.stringify(resolved));

  showToast('Scan ' + scanRef + ' finalized, pet owner notified of the result', 'success');
}

// hand-split wording for the seed entries whose old single paragraph
// described both species at once (the other seed entries cover both species
// with one honest sentence, so they carry over unchanged)
var SEED_CLINICAL_OVERRIDES = {
  'row-xylitol': {
    canine: 'Triggers rapid, massive insulin release in dogs, leading to life-threatening hypoglycemia and potential liver failure.',
    feline: 'Feline-specific research is limited, so it is treated as a caution pending further study.'
  },
  'row-grapes': {
    canine: 'Exact toxic compound is unknown; associated with acute kidney injury in dogs even in small amounts.',
    feline: 'Feline cases are rarely documented, so treated as a caution pending further research.'
  },
  'row-macadamia': {
    canine: 'Affects nerve and muscle function through a mechanism specific to dogs that is not yet fully understood.',
    feline: 'No confirmed feline cases exist, so treated as a caution pending further research.'
  }
};

// rows saved before the wording change still carry the old "AAFCO / FEDIAF" label
// in their data and in the little check-mark's tooltip. Brings them in line.
function migrateRegulatoryLabel() {
  var changed = false;
  document.querySelectorAll('#ingredient-table-body tr[data-search]').forEach(function (row) {
    if (row.dataset.regVerified !== 'true') return;
    var badge = row.querySelector('[data-field="reg-badge"]');
    if (row.dataset.regBody !== 'Regulatory Compliance') { row.dataset.regBody = 'Regulatory Compliance'; changed = true; }
    if (badge && badge.getAttribute('title') !== 'Regulatory Compliance Verified') { badge.setAttribute('title', 'Regulatory Compliance Verified'); changed = true; }
  });
  if (changed) savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body'));
}

// one-time split of the old single shared Risk Index into one per species.
// The old number is kept for whichever species carries the higher-risk
// classification (or for both when they match). The other species gets a
// default for its classification, which is only a placeholder until an admin
// enters a real value.
function migrateRiskIndexFields() {
  var rank = { 'Unrated': -1, 'Safe': 0, 'Caution': 1, 'Toxic': 2 };
  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  var changed = false;
  rows.forEach(function (row) {
    var d = row.dataset;
    if (d.canineRiskIndex === undefined && d.felineRiskIndex === undefined) {
      var oldIdx = d.riskIndex || '';
      function pick(level, otherLevel) {
        if (level === 'Unrated') return '';
        if (oldIdx && rank[level] >= rank[otherLevel]) return oldIdx;
        return RISK_INDEX_DEFAULTS[level] || oldIdx;
      }
      d.canineRiskIndex = pick(d.canine, d.feline);
      d.felineRiskIndex = pick(d.feline, d.canine);
      delete d.riskIndex;
      changed = true;
    }
    var cell = row.querySelector('[data-field="risk-index-cell"]');
    if (cell && !cell.querySelector('.flex-col')) { cell.innerHTML = riskIndexCellHtml(d); changed = true; }
  });
  if (changed) savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body'));
}

// one-time upgrade of rows saved in the old format (one shared Metabolic
// Impact / Symptoms / Alternatives set) to per-species details. Wording that
// had to come from the generic starter text is simply filled in -- whether an
// entry has actually been checked is what the Regulatory Compliance Verified switch
// is for. Also tidies rows saved by an earlier build that tagged starter text
// as a "draft". Runs on every load but only touches rows that need it.
function migrateClinicalFields() {
  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  var changed = false;
  rows.forEach(function (row) {
    var d = row.dataset;

    // clean-up of the earlier "draft" tagging
    if (d.canineDraft !== undefined || d.felineDraft !== undefined) {
      delete d.canineDraft;
      delete d.felineDraft;
      var cCell = row.querySelector('[data-field="canine"]');
      var fCell = row.querySelector('[data-field="feline"]');
      if (cCell) cCell.innerHTML = riskBadgeHtml(d.canine);
      if (fCell) fCell.innerHTML = riskBadgeHtml(d.feline);
      changed = true;
    }

    if (d.clinicalV2 === '2') return;
    var old = { metabolic: d.metabolic || '', symptoms: d.symptoms || '', alternatives: d.alternatives || '' };
    var mixed = d.canine !== d.feline;           // old text was written once for two different classifications
    var override = SEED_CLINICAL_OVERRIDES[row.id] || {};
    var clinical = {};
    ['canine', 'feline'].forEach(function (sp) {
      var level = d[sp];
      var s = clinicalStarter(level, sp);
      var sharedMetabolic = override[sp] || (mixed ? '' : old.metabolic);
      var c = {};
      if (level === 'Toxic') {
        c.metabolic = override[sp] || old.metabolic || s.metabolic;
        c.symptoms = old.symptoms || s.symptoms;
        c.guidance = old.alternatives || s.guidance;
        c.emergency = s.emergency;
      } else if (level === 'Caution') {
        c.metabolic = sharedMetabolic || s.metabolic;
        c.symptoms = (!mixed && old.symptoms) ? old.symptoms : s.symptoms;
        c.guidance = old.alternatives ? 'Safer swaps: ' + old.alternatives : s.guidance;
        c.emergency = '';
      } else {
        c.metabolic = sharedMetabolic || s.metabolic;
        c.symptoms = s.symptoms;
        c.guidance = s.guidance;
        c.emergency = '';
      }
      clinical[sp] = c;
    });
    applyClinicalToDataset(d, clinical, d.canine, d.feline);
    changed = true;
  });
  if (changed) savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body'));
}
migrateRiskIndexFields();
// adds the sample "Glucosamine Hydrochloride" entry ONE time: a joint supplement
// that is Safe for dogs and Not rated for cats, which is exactly the case the
// Not Rated option exists for (and the sample scan KB-902145 contains it).
// The wording is placeholder text for you to edit or replace.
function ensureSampleGlucosamineRow() {
  var FLAG = 'kibbleguard-sample-glucosamine';
  var tbody = document.getElementById('ingredient-table-body');
  if (!tbody || localStorage.getItem(FLAG) === '1') return;
  if (!document.getElementById('row-glucosamine')) {
    var today = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    var tr = document.createElement('tr');
    tr.className = 'feed-row hover:bg-stone-50/50 group';
    tr.id = 'row-glucosamine';
    var ds = tr.dataset;
    ds.canine = 'Safe';
    ds.feline = 'Unrated';
    ds.canineRiskIndex = '1.0';
    ds.felineRiskIndex = '';
    ds.canineMetabolic = 'Commonly used to support joint health in dogs and generally well tolerated at label doses.';
    ds.canineSymptoms = 'Supports joint comfort, Supports mobility in older dogs';
    ds.canineGuidance = 'Safe to include at the amounts on the product label. Check with your veterinarian for dogs on other joint medication.';
    ds.canineEmergency = '';
    ds.felineMetabolic = ''; ds.felineSymptoms = ''; ds.felineGuidance = ''; ds.felineEmergency = '';
    ds.clinicalV2 = '2';
    ds.source = '';
    ds.regVerified = 'false';
    ds.regBody = '';
    ds.aliases = 'Glucosamine HCl';
    ds.search = 'glucosamine hydrochloride joint support supplement functional & specialty ingredients glucosamine hcl';
    tr.innerHTML =
      '<td class="px-10 py-6"><div><p class="font-bold text-dark text-base" data-field="name">Glucosamine Hydrochloride</p><p class="text-[11px] text-stone-400 font-medium italic" data-field="subtitle">Joint support supplement</p><p class="text-[10px] text-stone-400 mt-1" data-field="aliases-line"><span class="font-bold">aka</span> Glucosamine HCl</p></div></td>' +
      '<td class="px-10 py-6"><span class="px-3 py-1 bg-stone-100 rounded-lg text-[10px] font-bold text-stone-600" data-field="category">Functional &amp; Specialty Ingredients</span><span data-field="reg-badge" class="inline-flex items-center gap-1 text-[9px] font-bold text-stone-300 ml-1" title="Not yet regulatory-verified"><i class="fa-regular fa-circle"></i></span></td>' +
      '<td class="px-10 py-6" data-field="canine">' + riskBadgeHtml('Safe') + '</td>' +
      '<td class="px-10 py-6" data-field="feline">' + riskBadgeHtml('Unrated') + '</td>' +
      '<td class="px-10 py-6 text-stone-600 font-bold text-xs tabular-nums" data-field="risk-index-cell">' + riskIndexCellHtml(ds) + '</td>' +
      '<td class="px-10 py-6 text-stone-500 text-xs tabular-nums" data-field="scan-count">Not yet scanned</td>' +
      '<td class="px-10 py-6 text-right text-stone-400 font-mono text-xs" data-field="modified">' + today + '</td>' +
      '<td class="px-10 py-6 text-right sticky right-0 bg-white sticky-col-shadow group-hover:bg-stone-50/50 transition-colors duration-180"><div class="flex items-center justify-end gap-1">' +
        '<button onclick="previewIngredient(\'row-glucosamine\')" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Preview in Risk Library"><i class="fa-solid fa-eye text-xs"></i></button>' +
        '<button onclick="openMergeForm(\'row-glucosamine\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Merge with another ingredient"><i class="fa-solid fa-code-merge text-xs"></i></button>' +
        '<button onclick="editIngredient(\'row-glucosamine\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-brand transition-all" title="Edit"><i class="fa-solid fa-pen text-xs"></i></button>' +
        '<button onclick="confirmDeleteIngredient(\'row-glucosamine\')" data-perm="manageIngredients" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-danger transition-all" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>' +
      '</div></td>';
    var emptyRow = document.getElementById('ingredient-empty-row');
    tbody.insertBefore(tr, emptyRow || null);
    upgradeActionCells();
    try { savePersistedRows('kibbleguard-ingredients-rows', tbody); } catch (e) { /* storage full: the row still shows this session */ }
  }
  localStorage.setItem(FLAG, '1');
}
ensureSampleGlucosamineRow();
migrateRegulatoryLabel();
migrateRiskIndexFields();
migrateClinicalFields();

// the Modified column used to mix two date styles ("28 May, 2024" on the original entries,
// "Oct 04, 2026" on anything added or edited later). This turns every one into the same
// style the app uses when it stamps a new edit, and saves the tidied rows once
function normalizeModifiedDate(text) {
  var t = String(text).trim();
  var m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);   // "28 May, 2024"
  var d = m ? new Date(m[2] + ' ' + m[1] + ', ' + m[3]) : new Date(t);
  if (isNaN(d.getTime())) return t;
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}
function migrateModifiedDates() {
  var changed = false;
  document.querySelectorAll('#ingredient-table-body [data-field="modified"]').forEach(function (cell) {
    var fixed = normalizeModifiedDate(cell.textContent);
    if (fixed !== cell.textContent.trim()) { cell.textContent = fixed; changed = true; }
  });
  if (changed) {
    try { savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body')); } catch (e) { /* the dates still show tidy this session */ }
  }
}
migrateModifiedDates();

/* ---------- Row actions: one "..." menu instead of four icon buttons ----------
   The Actions column used to hold View, Merge, Edit and Delete as four separate icons, which
   crowded every row. They now live in a single "..." menu, the same pattern Users & Pets uses.
   upgradeActionCells() swaps the old icons for the menu button on every row, including rows
   saved in the browser earlier, so nothing has to be re-entered. */
function closeIngredientMenus() {
  document.querySelectorAll('.kg-ing-menu').forEach(function (m) { m.remove(); });
  document.removeEventListener('click', closeIngredientMenus);
  document.removeEventListener('scroll', closeIngredientMenus, true);
  window.removeEventListener('resize', closeIngredientMenus);
}

function openIngredientRowMenu(event, rowId) {
  event.stopPropagation();
  var wasOpenForThisRow = document.querySelector('.kg-ing-menu[data-row="' + rowId + '"]');
  closeIngredientMenus();
  if (wasOpenForThisRow) return;   // clicking the same "..." again just closes it
  var rect = event.currentTarget.getBoundingClientRect();
  var item = 'w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-3 ';
  var menu = document.createElement('div');
  menu.className = 'kg-ing-menu fixed z-[120] w-52 bg-white rounded-2xl shadow-2xl border border-stone-100 py-2 text-left';
  menu.dataset.row = rowId;
  menu.innerHTML =
    '<button onclick="closeIngredientMenus();previewIngredient(\'' + rowId + '\')" class="' + item + 'text-stone-600 hover:bg-stone-50"><i class="fa-solid fa-eye w-4 text-stone-400"></i>View</button>' +
    '<button onclick="closeIngredientMenus();editIngredient(\'' + rowId + '\')" data-perm="manageIngredients" class="' + item + 'text-stone-600 hover:bg-stone-50"><i class="fa-solid fa-pen w-4 text-stone-400"></i>Edit</button>' +
    '<button onclick="closeIngredientMenus();openMergeForm(\'' + rowId + '\')" data-perm="manageIngredients" class="' + item + 'text-stone-600 hover:bg-stone-50"><i class="fa-solid fa-code-merge w-4 text-stone-400"></i>Merge</button>' +
    '<div class="my-2 border-t border-stone-50"></div>' +
    '<button onclick="closeIngredientMenus();confirmDeleteIngredient(\'' + rowId + '\')" data-perm="manageIngredients" class="' + item + 'text-danger hover:bg-danger/5"><i class="fa-solid fa-trash w-4"></i>Delete</button>';
  document.body.appendChild(menu);
  // opens downward, or upward when there is no room below the button
  var h = menu.offsetHeight;
  var top = rect.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 8);
  menu.style.top = top + 'px';
  menu.style.left = Math.max(8, rect.right - menu.offsetWidth) + 'px';
  if (typeof applyPermissionGating === 'function') applyPermissionGating();
  setTimeout(function () {
    document.addEventListener('click', closeIngredientMenus);
    document.addEventListener('scroll', closeIngredientMenus, true);
    window.addEventListener('resize', closeIngredientMenus);
  }, 0);
}

function upgradeActionCells() {
  var changed = false;
  document.querySelectorAll('#ingredient-table-body tr[data-search]').forEach(function (row) {
    var cell = row.lastElementChild;
    if (!cell || cell.querySelector('[data-actions-menu]')) return;
    cell.innerHTML =
      '<div class="flex items-center justify-end">' +
        '<button type="button" data-actions-menu onclick="openIngredientRowMenu(event,\'' + row.id + '\')" aria-label="Row actions" title="Actions" class="press w-8 h-8 rounded-lg hover:bg-white hover:card-shadow flex items-center justify-center text-stone-400 hover:text-dark transition-all"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
      '</div>';
    changed = true;
  });
  if (changed) {
    try { savePersistedRows('kibbleguard-ingredients-rows', document.getElementById('ingredient-table-body')); } catch (e) { /* still shows the new menu this session */ }
  }
  return changed;
}
upgradeActionCells();

// opens the Add form if routed here from Dashboard's "Flag as unrecognized" button.
// opens Edit instead if routed here from a dispute's "Review Ingredient Entry" button on OCR Scan Records
(function () {
  var params = new URLSearchParams(window.location.search);
  var prefillName = params.get('new');
  var editRowId = params.get('edit');
  var editName = params.get('edit-name');
  if (prefillName) {
    openIngredientForm('add');
    var nameField = document.getElementById('f-name');
    if (nameField) nameField.value = prefillName;
    showToast('Unrecognized OCR token routed here, finish classifying it below', 'info');
  } else if (editRowId && document.getElementById(editRowId)) {
    editIngredient(editRowId);
    showToast("Routed here from a scan dispute, review this entry's classification", 'info');
  } else if (editName) {
    var matchedRow = Array.prototype.find.call(document.querySelectorAll('#ingredient-table-body tr[data-search]'), function (row) {
      var field = row.querySelector('[data-field="name"]');
      return field && field.textContent.trim() === editName;
    });
    if (matchedRow) {
      editIngredient(matchedRow.id);
      showToast("Routed here from a scan dispute, review this entry's classification", 'info');
    } else {
      showToast('Could not find "' + editName + '" in the database. It may need to be added', 'danger');
    }
  }
})();

computeRegistryHealth();
animateAllCountUps();

// fills in the "Times Scanned" column for every row.
// turns it into a clickable button (see showIngredientScanUsers below) if it's actually been scanned
function renderIngredientScanCounts() {
  var tally = tallyIngredientFrequency();
  var byName = {};
  tally.list.forEach(function (item) { byName[item.name] = item.count; });

  document.querySelectorAll('#ingredient-table-body tr[data-search]').forEach(function (row) {
    var nameEl = row.querySelector('[data-field="name"]');
    var cell = row.querySelector('[data-field="scan-count"]');
    if (!nameEl || !cell) return;
    var name = nameEl.textContent.trim();
    var count = byName[name] || 0;
    if (count === 0) {
      cell.textContent = 'Not yet scanned';
    } else {
      cell.innerHTML = '<button onclick="showIngredientScanUsers(\'' + escapeHTML(name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")) + '\')" class="press text-brand hover:underline font-bold">' + count + ' of ' + tally.scanCount + ' scans</button>';
    }
  });
}

// click on "Times Scanned" to see the actual owners and scans behind that number, not just the count.
// useful if an ingredient's classification changes and you need to know who to reach out to
function showIngredientScanUsers(ingredientName) {
  var matches = getScansContainingIngredient(ingredientName);
  var rowsHtml = matches.map(function (m) {
    var speciesIcon = m.species === 'canine' ? 'fa-dog' : 'fa-cat';
    var speciesColor = m.species === 'canine' ? 'text-[#03C4C9]' : 'text-[#B57EDC]';
    var dateStr = new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return '<div class="flex items-center justify-between p-4 rounded-2xl bg-stone-100 border border-stone-200">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-9 h-9 rounded-xl bg-white ' + speciesColor + ' flex items-center justify-center text-sm shrink-0 shadow-sm"><i class="fa-solid ' + speciesIcon + '"></i></div>' +
          '<div><p class="text-sm font-bold text-dark">' + escapeHTML(m.owner) + '</p><p class="text-[11px] text-stone-500">' + m.scanId + ' \u00b7 ' + dateStr + '</p></div>' +
        '</div>' +
        '<a href="ocr-scans.html?inspect=' + encodeURIComponent(m.scanId) + '" class="press px-3 py-1.5 text-[11px] font-bold text-brand border border-brand/20 rounded-lg hover:bg-brand-light transition-all">View Scan</a>' +
      '</div>';
  }).join('');

  openModal({
    title: 'Scans Containing ' + ingredientName,
    subtitle: matches.length + ' pet owner' + (matches.length === 1 ? '' : 's') + ' affected',
    bodyHtml: '<div class="space-y-3">' + rowsHtml + '</div>',
    footerHtml: '<button onclick="closeModal()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Close</button>'
  });
}

syncIngredientFilterUI();
initScrollFadeIndicators();

renderNavBadges();
applyRoleState();
renderIngredientScanCounts();
filterIngredients();   // also refreshes the "Showing all N ingredients" label, which otherwise stays at the static number in the HTML

/* ---------- Scan Label: OCR a dog or cat food label straight into the Ingredient
   Database instead of typing everything in by hand. Works the same way for either
   species. Three steps: upload -> OCR extracts ingredient names -> each name is
   checked against the database (exact / possible / new) on the Scan Results screen. ---------- */
var scanLabelState = null; // { results: [...], activeIndex } while a scan session is open
var scanCameraStream = null; // active getUserMedia stream, if the camera tab is open
var scanCapturedBlob = null; // photo taken with the camera, as an alternative to a chosen file

function openScanLabelModal() {
  openModal({
    title: 'Scan Label',
    subtitle: 'Scan or upload a photo of a dog or cat food ingredients label',
    bodyHtml:
      '<div class="space-y-4">' +
        '<div class="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200 w-fit">' +
          '<button type="button" id="scan-tab-upload" onclick="switchScanTab(\'upload\')" class="press px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all"><i class="fa-solid fa-upload mr-1"></i>Upload Photo</button>' +
          '<button type="button" id="scan-tab-camera" onclick="switchScanTab(\'camera\')" class="press px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all"><i class="fa-solid fa-camera mr-1"></i>Use Camera</button>' +
        '</div>' +

        '<div id="scan-panel-upload">' +
          '<label class="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 cursor-pointer hover:border-brand transition-all" for="scan-label-file">' +
            '<i class="fa-solid fa-image text-2xl text-stone-400"></i>' +
            '<span class="text-xs font-bold text-dark">Click to choose a label photo</span>' +
            '<span class="text-[10px] text-stone-400">Works for dog or cat food, treats or supplements</span>' +
            '<input type="file" id="scan-label-file" accept="image/*" class="hidden" onchange="onScanLabelFileChosen(this)">' +
          '</label>' +
        '</div>' +

        '<div id="scan-panel-camera" class="hidden space-y-3">' +
          '<div class="relative rounded-2xl overflow-hidden bg-stone-900 aspect-video flex items-center justify-center">' +
            '<video id="scan-camera-video" class="w-full h-full object-cover" autoplay playsinline muted></video>' +
            '<canvas id="scan-camera-canvas" class="hidden"></canvas>' +
          '</div>' +
          '<button type="button" onclick="captureScanPhoto()" class="press w-full py-2.5 rounded-xl bg-dark text-white text-xs font-bold flex items-center justify-center gap-2"><i class="fa-solid fa-camera"></i> Capture Photo</button>' +
        '</div>' +

        '<div id="scan-label-preview" class="hidden flex items-center gap-3 p-3 rounded-xl bg-stone-100 border border-stone-200">' +
          '<img id="scan-label-preview-img" class="w-14 h-14 rounded-lg object-cover border border-stone-200" alt="">' +
          '<span id="scan-label-filename" class="text-xs font-bold text-dark flex-1 truncate"></span>' +
        '</div>' +
        '<div id="scan-label-status" class="hidden p-3 rounded-xl bg-brand-light border border-brand/10 text-xs font-bold text-brand flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin"></i> <span id="scan-label-status-text">Reading label...</span></div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="scan-label-submit-btn" onclick="submitLabelScan()" data-perm="manageIngredients" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all" disabled>Scan Label</button>'
  });
  switchScanTab('upload');
}

// Upload Photo / Use Camera tabs. Switching away from Camera stops the hardware
// stream -- a webcam left running in the background after the admin picks Upload
// instead (or closes the modal) is both a privacy problem and a wasted resource.
function switchScanTab(tab) {
  var uploadPanel = document.getElementById('scan-panel-upload');
  var cameraPanel = document.getElementById('scan-panel-camera');
  var uploadTab = document.getElementById('scan-tab-upload');
  var cameraTab = document.getElementById('scan-tab-camera');
  var activeCls = 'press px-4 py-1.5 rounded-lg bg-white text-dark text-[10px] font-bold shadow-sm transition-all';
  var inactiveCls = 'press px-4 py-1.5 rounded-lg text-stone-500 hover:text-dark text-[10px] font-bold transition-all';
  if (uploadPanel) uploadPanel.classList.toggle('hidden', tab !== 'upload');
  if (cameraPanel) cameraPanel.classList.toggle('hidden', tab !== 'camera');
  if (uploadTab) uploadTab.className = tab === 'upload' ? activeCls : inactiveCls;
  if (cameraTab) cameraTab.className = tab === 'camera' ? activeCls : inactiveCls;
  if (tab === 'camera') {
    startScanCamera();
  } else {
    stopScanCamera();
  }
}

function startScanCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Camera access is not available in this browser.', 'danger');
    switchScanTab('upload');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
    scanCameraStream = stream;
    var video = document.getElementById('scan-camera-video');
    if (video) video.srcObject = stream;
  }).catch(function (err) {
    showToast('Could not open the camera: ' + err.message, 'danger');
    switchScanTab('upload');
  });
}

function stopScanCamera() {
  if (scanCameraStream) {
    scanCameraStream.getTracks().forEach(function (t) { t.stop(); });
    scanCameraStream = null;
  }
}

// Snapshots the current camera frame to a JPEG blob -- same file shape (and the
// same OCR endpoint/prompt) as a chosen upload, so the scan flow after this point
// doesn't need to know or care which route the photo came from.
function captureScanPhoto() {
  var video = document.getElementById('scan-camera-video');
  var canvas = document.getElementById('scan-camera-canvas');
  if (!video || !canvas || !video.videoWidth) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(function (blob) {
    if (!blob) { showToast('Could not capture that photo. Try again.', 'danger'); return; }
    scanCapturedBlob = blob;
    var fileInput = document.getElementById('scan-label-file');
    if (fileInput) fileInput.value = ''; // a capture replaces any previously chosen file
    var preview = document.getElementById('scan-label-preview');
    var img = document.getElementById('scan-label-preview-img');
    var nameEl = document.getElementById('scan-label-filename');
    if (preview && img && nameEl) {
      img.src = URL.createObjectURL(blob);
      nameEl.textContent = 'Photo captured just now';
      preview.classList.remove('hidden');
    }
    var btn = document.getElementById('scan-label-submit-btn');
    if (btn) btn.disabled = false;
    showToast('Photo captured. Review it below, or capture again if it\'s blurry.', 'info');
  }, 'image/jpeg', 0.92);
}

function onScanLabelFileChosen(input) {
  var file = input.files && input.files[0];
  var btn = document.getElementById('scan-label-submit-btn');
  if (!file) { if (btn) btn.disabled = true; return; }
  scanCapturedBlob = null; // choosing a file replaces any earlier camera capture
  var preview = document.getElementById('scan-label-preview');
  var img = document.getElementById('scan-label-preview-img');
  var nameEl = document.getElementById('scan-label-filename');
  if (preview && img && nameEl) {
    img.src = URL.createObjectURL(file);
    nameEl.textContent = file.name;
    preview.classList.remove('hidden');
  }
  if (btn) btn.disabled = false;
}

function submitLabelScan() {
  var input = document.getElementById('scan-label-file');
  var file = scanCapturedBlob || (input && input.files && input.files[0]);
  if (!file) return;
  stopScanCamera();
  var btn = document.getElementById('scan-label-submit-btn');
  var statusWrap = document.getElementById('scan-label-status');
  var statusText = document.getElementById('scan-label-status-text');
  if (btn) btn.disabled = true;
  if (statusWrap) statusWrap.classList.remove('hidden');
  if (statusText) statusText.textContent = 'Reading label...';

  var form = new FormData();
  form.append('labelImage', file, file.name || 'label-capture.jpg');
  fetch('/api/admin/ingredients/ocr-label', { method: 'POST', body: form })
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
    .then(function (res) {
      if (!res.ok) {
        var msg = (res.data && res.data.error) || 'Could not read that label. Try a clearer photo.';
        showToast(msg, 'danger');
        if (btn) btn.disabled = false;
        if (statusWrap) statusWrap.classList.add('hidden');
        return;
      }
      var ingredients = res.data.ingredients || [];
      if (statusText) statusText.textContent = 'Checking ' + ingredients.length + ' ingredient' + (ingredients.length === 1 ? '' : 's') + ' against the database...';
      return fetch('/api/admin/ingredients/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: ingredients })
      }).then(function (r2) { return r2.json(); }).then(function (matchData) {
        openScanResultsScreen(matchData.results || []);
      });
    })
    .catch(function () {
      showToast('Something went wrong reading that label. Check your connection and try again.', 'danger');
      if (btn) btn.disabled = false;
      if (statusWrap) statusWrap.classList.add('hidden');
    });
}

function openScanResultsScreen(results) {
  scanLabelState = { results: results, activeIndex: null };
  renderScanResultsScreen();
}

function scanResultRowHtml(r, idx) {
  var wrap = 'p-4 rounded-2xl border flex items-start justify-between gap-4 flex-wrap';
  if (r.status === 'exact') {
    var statusWord = r.reviewStatus === 'pending' ? 'Pending Vet Review' : 'Approved';
    var statusCls = r.reviewStatus === 'pending' ? 'text-caution' : 'text-safe';
    return '<div class="' + wrap + ' bg-safe/5 border-safe/10">' +
      '<div><p class="text-sm font-bold text-dark">' + escapeHTML(r.name) + '</p>' +
      '<p class="text-[11px] text-stone-500 mt-0.5">Already in database &rarr; <span class="font-mono">' + escapeHTML(r.ingredientId) + '</span> ' + escapeHTML(r.primaryName) + ' <span class="font-bold ' + statusCls + '">(' + statusWord + ')</span></p></div>' +
      '<button onclick="viewScanMatchedIngredient(\'' + r.ingredientId + '\')" class="press shrink-0 px-4 py-2 text-[11px] font-bold text-dark bg-white border border-stone-200 rounded-xl hover:bg-stone-50">View</button>' +
    '</div>';
  }
  if (r.status === 'possible') {
    return '<div class="' + wrap + ' bg-caution/5 border-caution/10">' +
      '<div class="flex-1 min-w-[220px]"><p class="text-sm font-bold text-dark">' + escapeHTML(r.name) + '</p>' +
      '<p class="text-[11px] text-stone-500 mt-0.5">Did you mean <span class="font-bold text-dark">' + escapeHTML(r.primaryName) + '</span>? (' + r.matchScore + '% match)</p>' +
      '<div class="flex flex-wrap gap-2 mt-2">' +
        '<button onclick="confirmScanMatch(' + idx + ')" class="press px-3 py-1.5 text-[10px] font-bold text-white bg-brand rounded-lg hover:bg-brand-hover">Confirm match</button>' +
        '<button onclick="addScanAlias(' + idx + ')" class="press px-3 py-1.5 text-[10px] font-bold text-dark bg-white border border-stone-200 rounded-lg hover:bg-stone-50">Add as alias</button>' +
        '<button onclick="createNewFromScan(' + idx + ')" data-perm="manageIngredients" class="press px-3 py-1.5 text-[10px] font-bold text-dark bg-white border border-stone-200 rounded-lg hover:bg-stone-50">Create new instead</button>' +
      '</div></div>' +
    '</div>';
  }
  if (r.status === 'added') {
    return '<div class="' + wrap + ' bg-caution/5 border-caution/10">' +
      '<div><p class="text-sm font-bold text-dark">' + escapeHTML(r.name) + '</p>' +
      '<p class="text-[11px] text-caution font-bold mt-0.5"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Added -- Pending Verification</p></div>' +
    '</div>';
  }
  if (r.status === 'aliased') {
    return '<div class="' + wrap + ' bg-safe/5 border-safe/10">' +
      '<div><p class="text-sm font-bold text-dark">' + escapeHTML(r.name) + '</p>' +
      '<p class="text-[11px] text-safe font-bold mt-0.5"><i class="fa-solid fa-circle-check mr-1"></i>Saved as an alias of ' + escapeHTML(r.primaryName) + '</p></div>' +
    '</div>';
  }
  // 'new'
  return '<div class="' + wrap + ' bg-stone-100 border-stone-200">' +
    '<div><p class="text-sm font-bold text-dark">' + escapeHTML(r.name) + '</p>' +
    '<p class="text-[11px] text-stone-500 mt-0.5">Not in the database yet</p></div>' +
    '<button onclick="createNewFromScan(' + idx + ')" data-perm="manageIngredients" class="press shrink-0 px-4 py-2 text-[11px] font-bold text-white bg-brand rounded-xl hover:bg-brand-hover">Add Ingredient</button>' +
  '</div>';
}

function renderScanResultsScreen() {
  var results = scanLabelState.results;
  var doneCount = results.filter(function (r) { return r.status === 'exact' || r.status === 'added' || r.status === 'aliased'; }).length;
  openModal({
    title: 'Scan Results',
    subtitle: doneCount + ' of ' + results.length + ' resolved',
    wide: true,
    bodyHtml: results.length
      ? '<div class="space-y-3">' + results.map(scanResultRowHtml).join('') + '</div>'
      : '<p class="text-sm text-stone-500">No ingredients detected.</p>',
    footerHtml: '<button onclick="closeModal()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Done</button>'
  });
}

// "View" on an exact match -- finds that ingredient's real row in the table (by its
// database id, not the name-based slug) and reuses the normal Risk Library preview
function viewScanMatchedIngredient(ingredientId) {
  var row = document.querySelector('[data-ingredient-id="' + ingredientId + '"]');
  if (!row) { showToast('Could not find that ingredient in the table -- try refreshing the page.', 'danger'); return; }
  previewIngredient(row.id);
}

// "Confirm match" -- the admin agrees this was just an OCR misread of an ingredient
// already in the database, nothing to save, just mark it resolved
function confirmScanMatch(idx) {
  var r = scanLabelState.results[idx];
  r.status = 'exact';
  renderScanResultsScreen();
  showToast('"' + r.name + '" confirmed as ' + r.primaryName, 'success');
}

// "Add as alias" -- same ingredient, the label just uses different wording, so that
// wording gets saved onto the existing entry instead of creating a duplicate
function addScanAlias(idx) {
  var r = scanLabelState.results[idx];
  fetch('/api/admin/ingredients/' + encodeURIComponent(r.ingredientId) + '/alias', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: r.name })
  }).then(function (res) { return res.ok; }).then(function (ok) {
    if (!ok) { showToast('Could not save that alias. Try again.', 'danger'); return; }
    r.status = 'aliased';
    renderScanResultsScreen();
    showToast('"' + r.name + '" saved as an alias of ' + r.primaryName, 'success');
  }).catch(function () { showToast('Could not save that alias. Check your connection.', 'danger'); });
}

// "Create new instead" (possible match) / "Add Ingredient" (new) -- opens the normal
// Add Ingredient form, pre-filled with the scanned name. activeIndex remembers which
// scan result to update once it's saved (see onIngredientAddedFromScan below).
function createNewFromScan(idx) {
  var r = scanLabelState.results[idx];
  scanLabelState.activeIndex = idx;
  openIngredientForm('add', null, r.name);
}

// Hook called from saveIngredient()'s "add" branch. A no-op outside an active scan
// session (scanLabelState is null for the regular manual Add Ingredient flow).
function onIngredientAddedFromScan(name) {
  if (!scanLabelState) return;
  var idx = scanLabelState.activeIndex;
  if (idx == null || !scanLabelState.results[idx]) return;
  scanLabelState.results[idx].status = 'added';
  scanLabelState.activeIndex = null;
  renderScanResultsScreen();
}

/* ---------- Export Ingredient Database ---------- */
// every category actually in use right now, in the order they first
// appear - used to build the export modal's category checkboxes
function getDistinctIngredientCategories() {
  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  var seen = {};
  var categories = [];
  rows.forEach(function (row) {
    var el = row.querySelector('[data-field="category"]');
    var c = el ? el.textContent.trim() : '';
    if (c && !seen[c]) { seen[c] = true; categories.push(c); }
  });
  return categories;
}

// turns a category name into a safe html id, since category names have
// spaces/slashes/etc that aren't valid in an id attribute
function ingredientCategoryCheckboxId(category) {
  return 'ingredient-export-category-' + category.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

// the export modal - filters here are separate from the table's own
// search/filter, though the match count does respect whatever's currently
// searched too (see getMatchingIngredientRows)
function openIngredientExportOptions() {
  var categories = getDistinctIngredientCategories();
  var categoryCheckboxes = categories.map(function (c) {
    return '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="' + ingredientCategoryCheckboxId(c) + '" checked class="accent-brand ingredient-export-filter-input" onchange="updateIngredientExportMatchCount()">' + c + '</label>';
  }).join('');

  openModal({
    title: 'Export Ingredient Report',
    subtitle: 'Narrow down which ingredients to include, then pick the columns',
    wide: true,
    bodyHtml:
      '<div class="space-y-6">' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-filter"></i></span> Step 1 &middot; Which ingredients</p>' +

          '<div class="mb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Classification</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setIngredientExportGroup(\'ingredient-export-class-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setIngredientExportGroup(\'ingredient-export-class-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="ingredient-export-class-toxic" checked class="accent-brand ingredient-export-filter-input" onchange="updateIngredientExportMatchCount()">Toxic</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="ingredient-export-class-caution" checked class="accent-brand ingredient-export-filter-input" onchange="updateIngredientExportMatchCount()">Caution</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="ingredient-export-class-safe" checked class="accent-brand ingredient-export-filter-input" onchange="updateIngredientExportMatchCount()">Safe</label>' +
            '</div>' +
          '</div>' +

          '<div class="mb-4">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Species</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setIngredientExportGroup(\'ingredient-export-species-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setIngredientExportGroup(\'ingredient-export-species-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="ingredient-export-species-canine" checked class="accent-brand ingredient-export-filter-input" onchange="updateIngredientExportMatchCount()"><i class="fa-solid fa-dog mr-1 text-[#03C4C9]"></i>Canine</label>' +
              '<label class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer text-xs font-bold text-dark"><input type="checkbox" id="ingredient-export-species-feline" checked class="accent-brand ingredient-export-filter-input" onchange="updateIngredientExportMatchCount()"><i class="fa-solid fa-cat mr-1 text-[#B57EDC]"></i>Feline</label>' +
            '</div>' +
            '<p class="text-[10px] text-stone-400 mt-1.5">Matches an ingredient if either checked species has one of the checked classifications above &mdash; e.g. Canine + Toxic only exports ingredients that are toxic for dogs, regardless of their feline classification.</p>' +
          '</div>' +

          (categories.length > 0 ?
          '<div>' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Category</label>' +
              '<span class="text-[10px] font-bold text-brand"><a href="javascript:void(0)" onclick="setIngredientExportGroup(\'ingredient-export-category-\', true)" class="hover:underline">All</a> / <a href="javascript:void(0)" onclick="setIngredientExportGroup(\'ingredient-export-category-\', false)" class="hover:underline">None</a></span>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' + categoryCheckboxes + '</div>' +
          '</div>' : '') +
        '</div>' +

        '<div class="p-5 rounded-2xl bg-stone-100 border border-stone-200">' +
          '<p class="text-xs font-bold text-dark uppercase tracking-widest mb-4 flex items-center gap-2"><span class="w-6 h-6 rounded-lg bg-dark text-white flex items-center justify-center text-[10px]"><i class="fa-solid fa-table-columns"></i></span> Step 2 &middot; Which columns</p>' +
          '<div class="space-y-2">' +
            '<div class="p-3 rounded-xl bg-white border border-stone-200 flex items-center justify-between">' +
              '<div><p class="text-xs font-bold text-dark">Basic Info</p><p class="text-[10px] text-stone-400 mt-0.5">Ingredient name, category</p></div>' +
              '<i class="fa-solid fa-lock text-stone-300 text-sm" title="Always included"></i>' +
            '</div>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">Classifications</p><p class="text-[10px] text-stone-400 mt-0.5">Risk level for whichever species you picked above</p></div>' +
              '<input id="ingredient-export-classifications" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
            '<label class="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">' +
              '<div><p class="text-xs font-bold text-dark">Risk &amp; Scan Data</p><p class="text-[10px] text-stone-400 mt-0.5">Risk index, times scanned</p></div>' +
              '<input id="ingredient-export-risk" type="checkbox" checked class="w-5 h-5 accent-brand shrink-0 ml-4">' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="flex items-center justify-between p-4 rounded-2xl bg-brand-light border border-brand/10">' +
          '<p class="text-xs font-bold text-dark"><i class="fa-solid fa-file-lines mr-2 text-brand"></i><span id="ingredient-export-match-count">-</span> will be exported</p>' +
          '<p class="text-[10px] text-stone-500">Also respects the table search</p>' +
        '</div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button onclick="printIngredientReport()" data-perm="manageIngredients" class="press px-5 py-2.5 text-xs font-bold text-dark bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-all"><i class="fa-solid fa-print mr-1.5"></i>Print / PDF</button>' +
      '<button onclick="exportIngredientReport()" data-perm="manageIngredients" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Export CSV</button>'
  });

  updateIngredientExportMatchCount();
}

// the "All / None" shortcut links next to each checkbox group in the export modal
function setIngredientExportGroup(prefix, checked) {
  document.querySelectorAll('.ingredient-export-filter-input').forEach(function (el) {
    if (el.id.indexOf(prefix) === 0) el.checked = checked;
  });
  updateIngredientExportMatchCount();
}

// the one place that decides what actually gets exported - both the live
// "X of Y" counter and the real CSV/Print export call this, so they can't
// disagree. Species is checked here too now: a row only counts for a
// species if that species checkbox is checked AND that species'
// classification is one of the checked ones -- so "Canine + Toxic" alone
// exports rows that are toxic for dogs, ignoring whatever the cat
// classification happens to be
function getMatchingIngredientRows() {
  var allowedClass = {
    Toxic: document.getElementById('ingredient-export-class-toxic').checked,
    Caution: document.getElementById('ingredient-export-class-caution').checked,
    Safe: document.getElementById('ingredient-export-class-safe').checked
  };
  var allowedSpecies = {
    canine: document.getElementById('ingredient-export-species-canine').checked,
    feline: document.getElementById('ingredient-export-species-feline').checked
  };
  var categories = getDistinctIngredientCategories();
  var allowedCategory = {};
  categories.forEach(function (c) {
    var el = document.getElementById(ingredientCategoryCheckboxId(c));
    allowedCategory[c] = el ? el.checked : true;
  });

  var rows = document.querySelectorAll('#ingredient-table-body tr[data-search]');
  var matched = [];
  rows.forEach(function (row) {
    if (row.dataset.filterMatch === 'false') return;
    var d = row.dataset;
    var canineMatches = allowedSpecies.canine && allowedClass[d.canine];
    var felineMatches = allowedSpecies.feline && allowedClass[d.feline];
    if (!canineMatches && !felineMatches) return;
    var categoryEl = row.querySelector('[data-field="category"]');
    var category = categoryEl ? categoryEl.textContent.trim() : '';
    if (category && categories.length > 0 && !allowedCategory[category]) return;
    matched.push(row);
  });
  return matched;
}

// updates the live count shown in the export modal as checkboxes change
function updateIngredientExportMatchCount() {
  var total = document.querySelectorAll('#ingredient-table-body tr[data-search]').length;
  var el = document.getElementById('ingredient-export-match-count');
  var matched = getMatchingIngredientRows().length;
  if (el) el.textContent = matched + ' of ' + total + ' ingredients';
}

// shared validation for both the CSV export and the Print/PDF view
function validateIngredientExportSelection() {
  var classChecked = document.getElementById('ingredient-export-class-toxic').checked ||
    document.getElementById('ingredient-export-class-caution').checked || document.getElementById('ingredient-export-class-safe').checked;
  if (!classChecked) {
    showToast('Select at least one classification to export', 'danger');
    return null;
  }
  var speciesChecked = document.getElementById('ingredient-export-species-canine').checked ||
    document.getElementById('ingredient-export-species-feline').checked;
  if (!speciesChecked) {
    showToast('Select at least one species to export', 'danger');
    return null;
  }
  var matchedRows = getMatchingIngredientRows();
  if (matchedRows.length === 0) {
    showToast('No ingredients match the selected filters', 'danger');
    return null;
  }
  return matchedRows;
}

// builds the exact same headers/rows for the CSV and the Print/PDF view.
// the Classifications column follows whichever species you filtered by in
// Step 1 -- a Canine-only export doesn't carry a Feline column along with
// it just because the row happened to also have a feline classification
function buildIngredientExportTable(matchedRows) {
  var includeClassifications = document.getElementById('ingredient-export-classifications').checked;
  var includeRisk = document.getElementById('ingredient-export-risk').checked;
  var showCanine = document.getElementById('ingredient-export-species-canine').checked;
  var showFeline = document.getElementById('ingredient-export-species-feline').checked;

  var headers = ['Ingredient', 'Category'];
  if (includeClassifications) {
    if (showCanine) headers.push('Canine');
    if (showFeline) headers.push('Feline');
  }
  if (includeRisk) {
    if (showCanine) headers.push('Canine Risk Index');
    if (showFeline) headers.push('Feline Risk Index');
    headers.push('Times Scanned');
  }

  var rows = matchedRows.map(function (row) {
    var d = row.dataset;
    var nameEl = row.querySelector('[data-field="name"]');
    var name = nameEl ? nameEl.textContent.trim() : '';
    var categoryEl = row.querySelector('[data-field="category"]');
    var category = categoryEl ? categoryEl.textContent.trim() : '';
    var fields = [name, category];
    if (includeClassifications) {
      if (showCanine) fields.push(d.canine === 'Unrated' ? 'Not rated' : d.canine);
      if (showFeline) fields.push(d.feline === 'Unrated' ? 'Not rated' : d.feline);
    }
    if (includeRisk) {
      var scanCountEl = row.querySelector('[data-field="scan-count"]');
      var scanCount = scanCountEl ? scanCountEl.textContent.trim() : '';
      if (showCanine) fields.push(d.canine === 'Unrated' ? 'Not rated' : (d.canineRiskIndex || ''));
      if (showFeline) fields.push(d.feline === 'Unrated' ? 'Not rated' : (d.felineRiskIndex || ''));
      fields.push(scanCount);
    }
    return fields;
  });

  return { headers: headers, rows: rows };
}

// builds and downloads the actual CSV file from whatever matched
function exportIngredientReport() {
  var matchedRows = validateIngredientExportSelection();
  if (!matchedRows) return;

  closeModal();
  var table = buildIngredientExportTable(matchedRows);
  var lines = [table.headers.join(',')];
  table.rows.forEach(function (fields) {
    lines.push(fields.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(','));
  });

  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'kibbleguard-ingredient-report.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Ingredient report exported', 'success');
}

// same matched rows/columns as exportIngredientReport() above, just handed
// to the browser's print dialog (with "Save as PDF") instead of downloaded
function printIngredientReport() {
  var matchedRows = validateIngredientExportSelection();
  if (!matchedRows) return;

  closeModal();
  var table = buildIngredientExportTable(matchedRows);
  var total = document.querySelectorAll('#ingredient-table-body tr[data-search]').length;
  openPrintReport({
    title: 'Ingredient Report',
    subtitle: 'KibbleGuard · Ingredient Database',
    filterSummary: [matchedRows.length + ' of ' + total + ' ingredients'],
    headers: table.headers,
    rows: table.rows
  });
}

/* ---------- Classification change history ----------
   Every change to a species rating or risk index is stored with old value,
   new value, who made it and when, keyed by ingredient name. Shown at the
   bottom of the Preview modal. */
function getIngredientHistory(name) {
  var all = {};
  try { all = JSON.parse(localStorage.getItem('kibbleguard-ingredient-history')) || {}; } catch (e) { all = {}; }
  return all[name.toLowerCase()] || [];
}
function recordIngredientChange(name, before, after) {
  var show = function (v) { return (!v || v === 'Unrated') ? 'Not rated' : v; };
  var changes = [];
  [['canine', 'Canine rating'], ['feline', 'Feline rating'], ['canineRisk', 'Canine risk index'], ['felineRisk', 'Feline risk index']].forEach(function (f) {
    var b = before ? before[f[0]] : '', a = after[f[0]];
    if (before && (b || '') === (a || '')) return;
    if (!before && !a) return;
    changes.push({ label: f[1], from: before ? show(b) : 'new entry', to: show(a) });
  });
  if (!changes.length) return;
  var all = {};
  try { all = JSON.parse(localStorage.getItem('kibbleguard-ingredient-history')) || {}; } catch (e) { all = {}; }
  var key = name.toLowerCase();
  var actor = getLoggedInAdmin();
  if (!all[key]) all[key] = [];
  all[key].push({ by: actor ? actor.name : 'Unknown admin', time: new Date().toISOString(), changes: changes });
  if (all[key].length > 30) all[key] = all[key].slice(-30);
  try { localStorage.setItem('kibbleguard-ingredient-history', JSON.stringify(all)); } catch (e) {}
}
function ingredientHistoryHtml(name) {
  var items = getIngredientHistory(name).slice().reverse();
  var body = items.length ? items.map(function (h) {
    var when = new Date(h.time).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    return '<div class="p-3 rounded-xl bg-stone-100 border border-stone-200">' +
      '<p class="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1">' + escapeHTML(h.by) + ' &middot; ' + when + '</p>' +
      h.changes.map(function (c) { if (c.note) return '<p class="text-xs text-dark">' + escapeHTML(c.note) + '</p>'; return '<p class="text-xs text-dark"><span class="font-bold">' + escapeHTML(c.label) + ':</span> ' + escapeHTML(c.from) + ' &rarr; <span class="font-bold">' + escapeHTML(c.to) + '</span></p>'; }).join('') +
    '</div>';
  }).join('') : '<p class="text-xs text-stone-400">No rating changes recorded yet. Changes made from now on are tracked here.</p>';
  return '<div class="mt-6"><p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Classification History</p><div class="space-y-2">' + body + '</div></div>';
}

/* ---------- OCR token tester ----------
   Resolves a raw OCR token against ingredient names and aliases. Exact match
   first, then closest match by edit distance after fixing common OCR
   look-alikes (0/o, 1/l, 5/s). Compared to the Auto-Approve threshold. */
function editDistance(a, b) {
  var prev = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    var cur = [i];
    for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function normalizeOcrToken(t) {
  return t.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
// same clean-up, but keeps hyphens as word breaks and returns the separate words, so
// "Xyli-Extract" becomes ["xyli", "extract"] instead of one long "xyliextract"
function ocrWords(t) {
  return t.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/[^a-z0-9\s-]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}
// words that appear on many different ingredients, so matching on them alone says nothing
// ("Cacao Extract" and "Xyli-Extract" share only the word "extract")
var OCR_GENERIC_WORDS = ['extract', 'powder', 'meal', 'oil', 'flavor', 'flavour', 'natural', 'concentrate', 'dried', 'dehydrated', 'derivative', 'compound', 'compounds'];
function ocrContentWords(words) {
  var kept = words.filter(function (w) { return OCR_GENERIC_WORDS.indexOf(w) === -1; });
  return kept.length ? kept : words;
}
// similarity of two single words. A cut-off word that starts the real one
// ("xyli" for "xylitol") counts as a strong match, since OCR often drops the end of a word
function ocrWordSim(a, b) {
  if (a === b) return 1;
  var lo = Math.min(a.length, b.length), hi = Math.max(a.length, b.length);
  if (lo >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return 0.55 + 0.45 * (lo / hi);
  return 1 - editDistance(a, b) / hi;
}
// word-by-word score: how much of the candidate name the token covers, and how much of the
// token the candidate explains, combined so extra unmatched words pull the score down
function ocrWordScore(tokenWords, candWords) {
  var tw = ocrContentWords(tokenWords), cw = ocrContentWords(candWords);
  if (!tw.length || !cw.length) return 0;
  function cover(from, to) {
    var num = 0, den = 0;
    from.forEach(function (f) {
      var best = 0;
      to.forEach(function (t) { best = Math.max(best, ocrWordSim(f, t)); });
      num += best * f.length; den += f.length;
    });
    return den ? num / den : 0;
  }
  return Math.sqrt(cover(cw, tw) * cover(tw, cw));
}
function resolveOcrToken(token) {
  var norm = normalizeOcrToken(token), words = ocrWords(token), results = [];
  document.querySelectorAll('#ingredient-table-body tr[data-search]').forEach(function (row) {
    var name = row.querySelector('[data-field="name"]').textContent.trim();
    var names = [{ text: name, via: 'name' }];
    (row.dataset.aliases || '').split(',').forEach(function (a) { if (a.trim()) names.push({ text: a.trim(), via: 'alias' }); });
    names.forEach(function (n) {
      var cand = normalizeOcrToken(n.text);
      if (!cand || !norm) return;
      var whole = cand === norm ? 1 : 1 - editDistance(norm, cand) / Math.max(norm.length, cand.length);
      var sim = Math.max(whole, ocrWordScore(words, ocrWords(n.text)));
      results.push({ row: row, name: name, matched: n.text, via: n.via, sim: sim });
    });
  });
  var best = {};
  results.forEach(function (r) { if (!best[r.name] || r.sim > best[r.name].sim) best[r.name] = r; });
  return Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return b.sim - a.sim; });
}
function testOcrToken() {
  var input = document.getElementById('token-test-input');
  var out = document.getElementById('token-test-result');
  var token = input.value.trim();
  if (!token) { out.innerHTML = '<p class="text-xs text-stone-400">Type a raw token as OCR might read it, for example "Xyli-Extract" or "0nion Powder".</p>'; return; }
  var ranked = resolveOcrToken(token);
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-safety-rules')); } catch (e) { saved = null; }
  var threshold = saved && saved.autoApprove ? parseInt(saved.autoApprove, 10) : 92;
  var top = ranked[0];
  if (!top || top.sim < 0.3) {
    out.innerHTML = '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200"><p class="text-xs font-bold text-dark">No close match for "' + escapeHTML(token) + '"</p><p class="text-[11px] text-stone-500 mt-1">This token would go to manual triage and could become a new ingredient entry.</p></div>';
    return;
  }
  var pct = Math.round(top.sim * 100);
  var auto = pct >= threshold;
  var how = top.sim === 1 ? 'Exact match on ' + (top.via === 'alias' ? 'alias "' + top.matched + '"' : 'ingredient name') : 'Closest match via ' + (top.via === 'alias' ? 'alias "' + top.matched + '"' : 'name');
  out.innerHTML =
    '<div class="p-4 rounded-2xl ' + (auto ? 'bg-safe/5 border border-safe/10' : 'bg-caution/5 border border-caution/10') + '">' +
      '<div class="flex items-center justify-between gap-3 flex-wrap"><div><p class="text-sm font-bold text-dark">Resolves to ' + escapeHTML(top.name) + '</p><p class="text-[11px] text-stone-500 mt-0.5">' + escapeHTML(how) + '</p></div>' +
      '<div class="flex items-center gap-2"><span class="text-xs font-bold tabular-nums text-dark">' + pct + '% match</span>' + riskBadgeHtml(top.row.dataset.canine) + riskBadgeHtml(top.row.dataset.feline) + '</div></div>' +
      '<p class="text-[11px] mt-2 font-bold ' + (auto ? 'text-safe' : 'text-caution') + '">' + (auto ? 'At or above the ' + threshold + '% auto-approve threshold: classified automatically.' : 'Below the ' + threshold + '% auto-approve threshold: sent to manual triage.') + '</p>' +
    '</div>' +
    (ranked.length > 1 ? '<p class="text-[10px] text-stone-400 mt-3">Other candidates: ' + ranked.slice(1, 3).map(function (r) { return escapeHTML(r.name) + ' (' + Math.round(r.sim * 100) + '%)'; }).join(', ') + '</p>' : '');
}

// free-text history entries (merge, delete, rename)
function recordIngredientEvent(name, note) {
  var all = {};
  try { all = JSON.parse(localStorage.getItem('kibbleguard-ingredient-history')) || {}; } catch (e) { all = {}; }
  var key = name.toLowerCase();
  var actor = getLoggedInAdmin();
  if (!all[key]) all[key] = [];
  all[key].push({ by: actor ? actor.name : 'Unknown admin', time: new Date().toISOString(), changes: [{ note: note }] });
  if (all[key].length > 30) all[key] = all[key].slice(-30);
  try { localStorage.setItem('kibbleguard-ingredient-history', JSON.stringify(all)); } catch (e) {}
}
// a rename moves the old history under the new name so it isn't split in two
function renameIngredientHistory(oldName, newName) {
  if (!oldName || oldName.toLowerCase() === newName.toLowerCase()) return;
  var all = {};
  try { all = JSON.parse(localStorage.getItem('kibbleguard-ingredient-history')) || {}; } catch (e) { all = {}; }
  var o = oldName.toLowerCase(), n = newName.toLowerCase();
  all[n] = (all[o] || []).concat(all[n] || []);
  delete all[o];
  try { localStorage.setItem('kibbleguard-ingredient-history', JSON.stringify(all)); } catch (e) {}
  recordIngredientEvent(newName, 'Renamed from "' + oldName + '"');
}

/* ---------- Refresh ----------
   Re-reads the saved ingredient rows (so another admin's add/edit/delete shows up),
   then redraws counts, Registry Health and the Waiting for a Rating list in place,
   keeping the current search, filters and page. */
function refreshIngredients() {
  var tbody = document.getElementById('ingredient-table-body');
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-ingredients-rows')); } catch (e) { saved = null; }
  if (tbody && saved && saved.length) { tbody.innerHTML = saved.join(''); markRowsLoaded('kibbleguard-ingredients-rows'); upgradeActionCells(); }
  var page = PAGINATION_STATE['ingredient-table-body'] || 1;
  renderIngredientScanCounts();
  filterIngredients();
  if (page > 1) {
    PAGINATION_STATE['ingredient-table-body'] = page;
    applyTablePagination('ingredient-table-body', 'ingredient-pagination-controls', 10, false);
  }
  applyPermissionGating();
  renderNavBadges();
}
initRefreshControl({ key: 'ingredient-database', label: 'Ingredient Database', onRefresh: refreshIngredients, auto: false });

// the Refresh control is appended to the header by initRefreshControl; on pages that
// already have a button group on the right, tuck it into that group so the header
// layout stays two-sided instead of becoming three-way
(function () {
  var w = document.getElementById('refresh-control');
  var actions = document.querySelector('main header > div.gap-3');
  if (w && actions) actions.insertBefore(w, actions.firstChild);
})();

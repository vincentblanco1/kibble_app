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
  // also unused here, same reason as above
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
// unused here too - shared badge helpers, not every page uses every one
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- Safety Rules-specific interactions ---------- */
var ADVICE_CONTENT = {
  canine: {
    level3: 'IMMEDIATE ACTION REQUIRED. This ingredient is known to be highly toxic or fatal to dogs. Do not feed. Contact your veterinarian immediately if ingested.',
    level2: 'Exercise caution. This ingredient may cause mild digestive upset or sensitivity in some dogs. Monitor your pet closely if fed.',
    level1: 'This ingredient is generally recognized as safe (GRAS) for consumption by healthy dogs in appropriate amounts.'
  },
  feline: {
    level3: 'IMMEDIATE ACTION REQUIRED. This ingredient is known to be highly toxic or fatal to cats. Do not feed. Contact your veterinarian immediately if ingested.',
    level2: 'Exercise caution. This ingredient may cause mild digestive upset or sensitivity in some cats. Monitor your pet closely if fed.',
    level1: 'This ingredient is generally recognized as safe (GRAS) for consumption by healthy cats in appropriate amounts.'
  }
};

(function restoreSafetyRulesState() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('kibbleguard-safety-rules')); } catch (e) { saved = null; }
  if (!saved) return;
  if (saved.adviceContent) {
    ADVICE_CONTENT.canine = saved.adviceContent.canine || ADVICE_CONTENT.canine;
    ADVICE_CONTENT.feline = saved.adviceContent.feline || ADVICE_CONTENT.feline;
    var l1 = document.getElementById('level1-textarea'), l2 = document.getElementById('level2-textarea'), l3 = document.getElementById('level3-textarea');
    if (l1) l1.value = ADVICE_CONTENT.canine.level1;
    if (l2) l2.value = ADVICE_CONTENT.canine.level2;
    if (l3) l3.value = ADVICE_CONTENT.canine.level3;
  }
  if (saved.autoApprove !== undefined) {
    var autoSlider = document.getElementById('auto-approve-slider');
    if (autoSlider) {
      autoSlider.value = saved.autoApprove;
      document.getElementById('auto-approve-label').textContent = saved.autoApprove + '%';
    }
  }
  if (saved.hazardFloor !== undefined) {
    var hazardSlider = document.getElementById('hazard-floor-slider');
    if (hazardSlider) {
      hazardSlider.value = saved.hazardFloor;
      document.getElementById('hazard-floor-label').textContent = saved.hazardFloor + '%';
    }
  }
})();

restorePersistedRows('kibbleguard-taxonomy-rows', document.getElementById('taxonomy-list'));   // (the first-run save happens before any auto-listed rows exist)

// counts how many real ingredients actually belong to each category, reading
// Ingredient Database's own saved rows (a separate page/file, so this reaches
// across via the same shared localStorage key it persists to) and updating
// each category's "Nodes" count here to match. a brand-new category with no
// ingredients in it yet correctly shows 0.
function refreshTaxonomyNodeCounts() {
  var savedIngredientRows = null;
  try { savedIngredientRows = JSON.parse(localStorage.getItem('kibbleguard-ingredients-rows')); } catch (e) { savedIngredientRows = null; }
  if (!savedIngredientRows) return; // Ingredient Database hasn't been visited yet this session, leave seed counts as-is

  var tempTable = document.createElement('table');
  tempTable.innerHTML = savedIngredientRows.join('');
  var categoryCounts = {};
  tempTable.querySelectorAll('[data-field="category"]').forEach(function (el) {
    var cat = el.textContent.trim();
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  // categories the Ingredient Database actually uses but this list doesn't show yet (Toxic Plants &
  // Fruits, Functional & Specialty Ingredients, ...) get a row too, otherwise the "Nodes" numbers
  // here add up to far fewer ingredients than the database holds. These rows are rebuilt on every
  // visit and never saved (see persistTaxonomyRows), so they can't go stale.
  var taxonomyList = document.getElementById('taxonomy-list');
  var listed = {};
  taxonomyList.querySelectorAll('[data-category-name]').forEach(function (r) { listed[r.dataset.categoryName] = true; });
  Object.keys(categoryCounts).sort().forEach(function (cat) {
    if (!cat || listed[cat]) return;
    var extra = document.createElement('div');
    extra.className = 'p-4 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-between group';
    extra.dataset.categoryName = cat;
    extra.dataset.auto = 'true';
    extra.innerHTML =
      '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-stone-500 shadow-sm"><i class="fa-solid fa-tag"></i></div>' +
        '<span class="text-xs font-bold text-dark">' + escapeHTML(cat) + '</span>' +
      '</div>' +
      '<span class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">0 Nodes</span>';
    taxonomyList.appendChild(extra);
  });

  document.querySelectorAll('#taxonomy-list > div').forEach(function (row) {
    // reads the row's own data-category-name attribute rather than picking a
    // span out by its styling classes - picking it out by styling classes
    // would silently break this lookup the moment a redesign changed those
    // classes, since querySelector would just return null and the row would
    // be skipped with nothing to notice
    var name = row.dataset.categoryName;
    var countEl = row.lastElementChild;
    if (!name || !countEl) return;
    var count = categoryCounts[name] || 0;
    countEl.textContent = count + (count === 1 ? ' Node' : ' Nodes');
  });
}
refreshTaxonomyNodeCounts();

var currentSpecies = 'canine';
var ACTIVE_TAB_CANINE = 'press px-5 py-1.5 rounded-lg bg-[#03C4C9] text-[#06343A] text-[10px] font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed';
var ACTIVE_TAB_FELINE = 'press px-5 py-1.5 rounded-lg bg-[#B57EDC] text-[#2B1240] text-[10px] font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed';
var INACTIVE_TAB = 'press px-5 py-1.5 rounded-lg text-stone-400 hover:text-dark text-[10px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed';

// switches the advice-text textareas between canine/feline - saves
// whatever's currently in the boxes back to ADVICE_CONTENT first, so
// flipping species and back doesn't lose an in-progress edit
function switchSpecies(species) {
  if (species === currentSpecies) return;
  ADVICE_CONTENT[currentSpecies].level1 = document.getElementById('level1-textarea').value;
  ADVICE_CONTENT[currentSpecies].level2 = document.getElementById('level2-textarea').value;
  ADVICE_CONTENT[currentSpecies].level3 = document.getElementById('level3-textarea').value;
  currentSpecies = species;
  document.getElementById('level3-textarea').value = ADVICE_CONTENT[species].level3;
  document.getElementById('level2-textarea').value = ADVICE_CONTENT[species].level2;
  document.getElementById('level1-textarea').value = ADVICE_CONTENT[species].level1;
  document.getElementById('species-canine-btn').className = species === 'canine' ? ACTIVE_TAB_CANINE : INACTIVE_TAB;
  document.getElementById('species-feline-btn').className = species === 'feline' ? ACTIVE_TAB_FELINE : INACTIVE_TAB;
  showToast((species === 'canine' ? 'Canine' : 'Feline') + ' advice profile loaded', 'info');
}

/* ---------- View / Edit mode ---------- */
var EDITABLE_FIELD_IDS = ['auto-approve-slider', 'hazard-floor-slider', 'level1-textarea', 'level2-textarea', 'level3-textarea'];
var editModeSnapshot = null;

// locks/unlocks the sliders and textareas.
// textareas use readOnly instead of disabled, so their text still looks normal instead of greyed out
function setEditableFieldsEnabled(enabled) {
  EDITABLE_FIELD_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'TEXTAREA') el.readOnly = !enabled;
    else el.disabled = !enabled;
  });
}

// grabs the current value of every editable field, so Cancel can put
// things back exactly how they were before Edit mode was entered
function snapshotEditableFields() {
  var snap = {};
  EDITABLE_FIELD_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) snap[id] = el.value;
  });
  return snap;
}

// the other half of snapshotEditableFields - puts the saved values back
function restoreEditableFields(snap) {
  Object.keys(snap).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = snap[id];
  });
  document.getElementById('auto-approve-label').textContent = document.getElementById('auto-approve-slider').value + '%';
  document.getElementById('hazard-floor-label').textContent = document.getElementById('hazard-floor-slider').value + '%';
  updateSliderFill(document.getElementById('auto-approve-slider'), '#45671D');
  updateSliderFill(document.getElementById('hazard-floor-slider'), '#B91C1C');
}

// the two banners telling you whether the page is locked or editable
function setLockBanners(locked) {
  var lockedHtml = '<i class="fa-solid fa-lock text-stone-400"></i> Read-only. Click "Edit Safety Rules" above to make changes.';
  var editingHtml = '<i class="fa-solid fa-pen text-brand"></i> Editing now. Click "Save Logic Profile" or "Cancel" above when done.';
  var banner1 = document.getElementById('rules-lock-banner-1');
  var banner2 = document.getElementById('rules-lock-banner-2');
  [banner1, banner2].forEach(function (banner) {
    if (!banner) return;
    banner.innerHTML = locked ? lockedHtml : editingHtml;
    banner.className = locked
      ? 'mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 border border-stone-200 text-[11px] font-bold text-stone-500'
      : 'mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-light border border-brand/20 text-[11px] font-bold text-brand';
  });
  // banner2 doesn't use the mb-6 spacing (its parent already spaces via space-y-12)
  if (banner2) banner2.classList.remove('mb-6');
}

// this button itself is permission-gated (manageSafetyRules) - the whole
// unlock flow only starts if you're actually allowed to make changes
function enterEditMode() {
  editModeSnapshot = snapshotEditableFields();
  setEditableFieldsEnabled(true);
  setLockBanners(false);
  document.getElementById('species-canine-btn').disabled = true;
  document.getElementById('species-feline-btn').disabled = true;
  document.getElementById('edit-mode-btn').classList.add('hidden');
  document.getElementById('cancel-edit-btn').classList.remove('hidden');
  document.getElementById('save-logic-btn').classList.remove('hidden');
}

// shared cleanup for both Save and Cancel.
// locks the fields back up and resets all the buttons/banners to their read-only state
function exitEditMode() {
  setEditableFieldsEnabled(false);
  setLockBanners(true);
  document.getElementById('species-canine-btn').disabled = false;
  document.getElementById('species-feline-btn').disabled = false;
  document.getElementById('edit-mode-btn').classList.remove('hidden');
  document.getElementById('cancel-edit-btn').classList.add('hidden');
  document.getElementById('save-logic-btn').classList.add('hidden');
  editModeSnapshot = null;
}

// discards whatever was typed and puts the original values back
function cancelEditMode() {
  if (editModeSnapshot) restoreEditableFields(editModeSnapshot);
  exitEditMode();
  showToast('Changes discarded', 'info');
}

function saveLogicProfile() {
  var autoApprove = document.getElementById('auto-approve-label').textContent;
  var hazardFloor = document.getElementById('hazard-floor-label').textContent;
  var species = currentSpecies === 'canine' ? 'Canine' : 'Feline';

  // commits whatever's currently typed into ADVICE_CONTENT first.
  // switching species reloads the textareas straight from there, so without this,
  // an in-progress edit would get overwritten and lost
  ADVICE_CONTENT[currentSpecies].level1 = document.getElementById('level1-textarea').value;
  ADVICE_CONTENT[currentSpecies].level2 = document.getElementById('level2-textarea').value;
  ADVICE_CONTENT[currentSpecies].level3 = document.getElementById('level3-textarea').value;

  var btn = document.getElementById('save-logic-btn');
  withSavingState(btn, 'Saving...', function () {
    localStorage.setItem('kibbleguard-safety-rules', JSON.stringify({
      autoApprove: document.getElementById('auto-approve-slider').value,
      hazardFloor: document.getElementById('hazard-floor-slider').value,
      adviceContent: ADVICE_CONTENT
    }));

    showToast('Logic profile saved: ' + species + ' advice, auto-approve ' + autoApprove + ', hazard floor ' + hazardFloor, 'success');
    logAdminAction('Updated safety rules: auto-approve ' + autoApprove + ', hazard floor ' + hazardFloor, 'settings');
    exitEditMode();
  });
}

// saves the category list, leaving out the auto-listed rows (see refreshTaxonomyNodeCounts) so
// only categories an admin really created are stored
function persistTaxonomyRows(list) {
  var autos = Array.prototype.slice.call(list.querySelectorAll('[data-auto="true"]'));
  autos.forEach(function (r) { list.removeChild(r); });
  try { savePersistedRows('kibbleguard-taxonomy-rows', list); }
  finally { autos.forEach(function (r) { list.appendChild(r); }); }
}

var TAXONOMY_ICONS = [
  { value: 'fa-vial', label: 'Artificial Preservatives', color: 'text-blue-500' },
  { value: 'fa-palette', label: 'Artificial Colors', color: 'text-pink-500' },
  { value: 'fa-bone', label: 'Animal Proteins', color: 'text-stone-500' },
  { value: 'fa-seedling', label: 'Grains & Carbohydrates', color: 'text-safe' },
  { value: 'fa-candy-cane', label: 'Sweeteners & Sugars', color: 'text-amber-500' },
  { value: 'fa-leaf', label: 'Plant Ingredients Requiring Moderation', color: 'text-safe' }
];

// the "Add Category" modal for the ingredient taxonomy list
function openTaxonomyForm() {
  var iconOptions = TAXONOMY_ICONS.map(function (o) {
    return '<option value="' + o.value + '|' + o.color + '">' + o.label + '</option>';
  }).join('');
  openModal({
    title: 'Add Ingredient Category',
    subtitle: 'Create a new classification bucket for the ingredient database',
    bodyHtml:
      '<div class="space-y-4">' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Category Name</label>' +
          '<input id="f-tax-name" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="e.g. Essential Oils"></div>' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Icon Style</label>' +
          '<select id="f-tax-icon" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand">' + iconOptions + '</select></div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="save-taxonomy-btn" onclick="saveTaxonomyClass()" data-perm="manageSafetyRules" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Add Category</button>'
  });
}

// adds the new category to the list.
// these categories then show up as options on Ingredient Database's add/edit form too
function saveTaxonomyClass() {
  var name = document.getElementById('f-tax-name').value.trim();
  var iconVal = document.getElementById('f-tax-icon').value.split('|');
  if (!name) {
    showToast('Category name is required', 'danger');
    return;
  }
  var btn = document.getElementById('save-taxonomy-btn');
  withSavingState(btn, 'Adding...', function () {
    var list = document.getElementById('taxonomy-list');
    var row = document.createElement('div');
    row.className = 'p-4 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-between group';
    row.dataset.categoryName = name; // set as a property, not via the innerHTML string below, so it can't ever end up mis-escaped
    row.innerHTML =
      '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center ' + iconVal[1] + ' shadow-sm"><i class="fa-solid ' + iconVal[0] + '"></i></div>' +
        '<span class="text-xs font-bold text-dark">' + escapeHTML(name) + '</span>' +
      '</div>' +
      '<span class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">0 Nodes</span>';
    list.appendChild(row);

    try {
      persistTaxonomyRows(list);
    } catch (e) {
      row.remove();
      throw e;
    }

    row.classList.add('flash-highlight');
    setTimeout(function () { row.classList.remove('flash-highlight'); }, 800);
    closeModal();
    showToast('Category added', 'success');
  });
}

// fills in the slider track up to its current value and updates the thumb
// color to match. the unfilled part's color has to be set here based on
// theme too, since this is an inline style and inline always wins over
// whatever the stylesheet says, dark mode or not
function updateSliderFill(slider, color) {
  var min = slider.min !== '' ? Number(slider.min) : 0;
  var max = slider.max !== '' ? Number(slider.max) : 100;
  var pct = ((slider.value - min) / (max - min)) * 100;
  var trackColor = document.documentElement.classList.contains('dark-theme') ? '#3a3b40' : '#f5f4f2';
  slider.style.background = 'linear-gradient(to right, ' + color + ' 0%, ' + color + ' ' + pct + '%, ' + trackColor + ' ' + pct + '%, ' + trackColor + ' 100%)';
  slider.style.setProperty('--slider-color', color);
}

updateSliderFill(document.getElementById('auto-approve-slider'), '#45671D');
updateSliderFill(document.getElementById('hazard-floor-slider'), '#B91C1C');

renderNavBadges();
applyRoleState();

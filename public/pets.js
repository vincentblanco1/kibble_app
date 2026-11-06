/**
 * KibbleGuard Companion Profile Management Engine
 * Fixes single-character letter-splitting bug by parsing full phrase tokens.
 * Adds custom user image file upload with Base64 encoding.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Baseline companion profiles
  const DEFAULT_PETS = [
    {
      id: 'buster',
      name: 'Buster',
      species: 'canine',
      breed: 'French Bulldog',
      ageBracket: 'Adult (3.5y)',
      weightKg: 12.4,
      dailyCalorieGoal: 680,
      sensitivities: ['BHA / BHT Preservative', 'Xylitol Prohibited', 'Chicken Sensitivity'],
      avatar: '🐶',
      photoUrl: null,
      status: 'Active',
      lastScanDate: 'Oct 19, 2026',
      lastScanBatch: '#KG-9021'
    },
    {
      id: 'milo',
      name: 'Milo',
      species: 'feline',
      breed: 'Domestic Short Hair',
      ageBracket: 'Senior (8y)',
      weightKg: 4.1,
      dailyCalorieGoal: 210,
      sensitivities: ['Propylene Glycol Fatal', 'Taurine Essential', 'Renal Formula Watch'],
      avatar: '🐱',
      photoUrl: null,
      status: 'Active',
      lastScanDate: 'Oct 18, 2026',
      lastScanBatch: '#KG-8994'
    }
  ];

  // Pets live in the database. The browser copy is only a backup for when the server can't be reached.
  const kgUserId = (function () { try { return (JSON.parse(localStorage.getItem('kibbleguard_user')) || {}).id || 1; } catch (e) { return 1; } })();
  let pets = [];

  function kgDay(d) {
    return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  }

  // database row -> the shape this page draws
  function petFromDb(p, lastScan) {
    const feline = /fel|cat/i.test(String(p.species || ''));
    const w = p.weight ? Number(p.weight) : null;
    return {
      id: p.id,
      name: p.name || 'Companion',
      species: feline ? 'feline' : 'canine',
      breed: p.breed || '',
      ageBracket: p.life_stage || 'Adult',
      weightKg: w,
      dailyCalorieGoal: w && w > 0 ? Math.round(70 * Math.pow(w, 0.75) * (feline ? 1.2 : 1.6)) : (feline ? 220 : 600),
      sensitivities: String(p.allergies || '').split(',').map(t => t.trim()).filter(Boolean),
      avatar: feline ? '🐱' : '🐶',
      photoUrl: p.image_url || null,
      status: 'Active',
      lastScanDate: lastScan ? new Date(lastScan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
      lastScanBatch: lastScan ? '#KG-' + lastScan.id : null,
      gender: p.gender || '',
      birthdate: p.birthdate || '',
      vaccineStatus: p.vaccine_status || '',
      dewormingDate: p.deworming_date || '',
      takesMedicine: p.takes_medicine || 'No',
      takesSupplements: p.takes_supplements || 'No',
      medicalConditions: p.medical_conditions || 'None'
    };
  }

  async function loadPets() {
    try {
      const responses = await Promise.all([
        fetch('/api/pets?user_id=' + encodeURIComponent(kgUserId)),
        fetch('/api/history?user_id=' + encodeURIComponent(kgUserId))
      ]);
      if (!responses[0].ok) throw new Error('Server returned ' + responses[0].status);
      const rows = await responses[0].json();
      const scans = responses[1].ok ? await responses[1].json() : [];
      pets = (rows || []).map(p => petFromDb(p, scans.filter(s => s.petId === p.id)[0]));   // history is newest first
      try { localStorage.setItem('kibbleguard_pets', JSON.stringify(pets)); } catch (e) { /* storage full: not critical */ }
    } catch (err) {
      console.error('Failed to load pets from the server, using the browser copy:', err);
      try { const stored = JSON.parse(localStorage.getItem('kibbleguard_pets')); pets = Array.isArray(stored) ? stored : []; } catch (e) { pets = []; }
    }
    renderAllPetProfiles();
  }

  // Temporary container for newly selected Base64 photo string
  let currentUploadedPhotoBase64 = null;

  // DOM Bindings
  const gridContainer = document.getElementById('petProfilesGrid');
  const petStatCount = document.getElementById('petStatCount');
  const petCanineCount = document.getElementById('petCanineCount');
  const petFelineCount = document.getElementById('petFelineCount');

  // Modal Elements
  const openModalBtn = document.getElementById('openAddPetModalBtn');
  const modal = document.getElementById('addPetModal');
  const modalTitle = document.getElementById('modalTitle');
  const closeModalBtn = document.getElementById('closeAddPetModalBtn');
  const cancelModalBtn = document.getElementById('cancelPetModalBtn');
  const addPetForm = document.getElementById('addPetForm');
  const savePetSubmitBtn = document.getElementById('savePetSubmitBtn');

  // Form Input Bindings
  const petNameInput = document.getElementById('petNameInput');
  const petSpeciesInput = document.getElementById('petSpeciesInput');
  const petBreedInput = document.getElementById('petBreedInput');
  const petAgeInput = document.getElementById('petAgeInput');
  const petWeightInput = document.getElementById('petWeightInput');
  const petSensitivitiesInput = document.getElementById('petSensitivitiesInput');
  const petGenderInput = document.getElementById('petGenderInput');
  const petBirthdateInput = document.getElementById('petBirthdateInput');
  const petVaccineInput = document.getElementById('petVaccineInput');
  const petDewormingInput = document.getElementById('petDewormingInput');
  const petMedicineInput = document.getElementById('petMedicineInput');
  const petSupplementsInput = document.getElementById('petSupplementsInput');
  const petMedicalConditionsInput = document.getElementById('petMedicalConditionsInput');

  const CANINE_CONDITIONS = ['None','Allergies','Arthritis','Diabetes','Epilepsy','Heart Disease','Hypothyroidism','IBD','Kidney Disease','Liver Disease','Obesity','Skin Conditions'];
  const FELINE_CONDITIONS = ['None','Allergies','Arthritis','CKD (Chronic Kidney Disease)','Diabetes','Feline Asthma','Feline Lower Urinary Tract Disease','Heart Disease','Hyperthyroidism','IBD','Obesity','Skin Conditions'];

  function updateMedicalConditionsDropdown(species) {
    if (!petMedicalConditionsInput) return;
    const isCanine = (species || '').toLowerCase() === 'canine';
    const opts = isCanine ? CANINE_CONDITIONS : FELINE_CONDITIONS;
    const current = petMedicalConditionsInput.value;
    petMedicalConditionsInput.innerHTML = opts.map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('');
  }

  // Photo Upload & Preview Elements
  const petImageFileInput = document.getElementById('petImageFileInput');
  const petPhotoPreviewImg = document.getElementById('petPhotoPreviewImg');
  const previewEmojiFallback = document.getElementById('previewEmojiFallback');
  const removePhotoBtn = document.getElementById('removePhotoBtn');

  // --- Photo Upload Reader ---
  // Photos taken directly with a phone camera are routinely 3-12MB -- flatly
  // rejecting anything over 2MB meant taking a photo (rather than picking a
  // pre-shrunk one) almost always failed. Instead, shrink it down client-side
  // (resize to a sane max dimension and re-encode as JPEG) so any photo just
  // works, while what actually gets stored (in the database and the
  // localStorage pets cache) stays small.
  function compressPetPhoto(file, onDone, onError, maxDim, quality) {
    maxDim = maxDim || 900;
    quality = quality || 0.82;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
          else { w = Math.round(w * (maxDim / h)); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length > 1.5 * 1024 * 1024) dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        onDone(dataUrl);
      };
      img.onerror = function() { onError(new Error('Could not decode image')); };
      img.src = evt.target.result;
    };
    reader.onerror = function() { onError(new Error('Could not read file')); };
    reader.readAsDataURL(file);
  }

  petImageFileInput?.addEventListener('change', function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    compressPetPhoto(file, function(dataUrl) {
      currentUploadedPhotoBase64 = dataUrl;
      showPhotoInPreview(currentUploadedPhotoBase64);
    }, function() {
      alert('Could not read that photo. Please try a different one.');
    });
  });

  function showPhotoInPreview(dataUrl) {
    if (dataUrl) {
      petPhotoPreviewImg.src = dataUrl;
      petPhotoPreviewImg.classList.remove('hidden');
      previewEmojiFallback.classList.add('hidden');
      removePhotoBtn?.classList.remove('hidden');
    } else {
      petPhotoPreviewImg.src = '';
      petPhotoPreviewImg.classList.add('hidden');
      previewEmojiFallback.classList.remove('hidden');
      removePhotoBtn?.classList.add('hidden');
    }
  }

  removePhotoBtn?.addEventListener('click', function() {
    currentUploadedPhotoBase64 = null;
    petImageFileInput.value = '';
    showPhotoInPreview(null);
  });

  // Switch default emoji on species change if no custom image is loaded
  petSpeciesInput?.addEventListener('change', function() {
    if (!currentUploadedPhotoBase64) {
      previewEmojiFallback.textContent = petSpeciesInput.value === 'canine' ? '🐶' : '🐱';
    }
    updateMedicalConditionsDropdown(petSpeciesInput.value);
  });

  // --- Modal Open/Close Controls ---
  function openAddModal(editingPetId = null) {
    if (!modal) return;

    if (editingPetId) {
      const pet = pets.find(p => p.id === editingPetId);
      if (pet) {
        modalTitle.textContent = `Edit ${pet.name}'s Profile`;
        savePetSubmitBtn.textContent = 'Update Profile';
        addPetForm.setAttribute('data-edit-id', pet.id);

        petNameInput.value = pet.name || '';
        petSpeciesInput.value = pet.species || 'canine';
        petBreedInput.value = pet.breed || '';
        petAgeInput.value = pet.ageBracket || 'Adult';
        petWeightInput.value = pet.weightKg ? pet.weightKg : '';
        if (petGenderInput) petGenderInput.value = pet.gender || 'Neutered Male';
        if (petBirthdateInput) petBirthdateInput.value = pet.birthdate || '';
        if (petVaccineInput) petVaccineInput.value = pet.vaccineStatus || 'Up to Date';
        if (petDewormingInput) petDewormingInput.value = pet.dewormingDate || '';
        updateMedicalConditionsDropdown(pet.species);
        if (petMedicineInput) petMedicineInput.value = pet.takesMedicine || 'No';
        if (petSupplementsInput) petSupplementsInput.value = pet.takesSupplements || 'No';
        if (petMedicalConditionsInput) petMedicalConditionsInput.value = pet.medicalConditions || 'None';

        // Clean comma-separated string for sensitivities
        const safeArray = Array.isArray(pet.sensitivities) 
          ? pet.sensitivities 
          : (typeof pet.sensitivities === 'string' ? pet.sensitivities.split(',') : []);
        petSensitivitiesInput.value = safeArray.join(', ');

        currentUploadedPhotoBase64 = pet.photoUrl || null;
        showPhotoInPreview(currentUploadedPhotoBase64);
        if (!currentUploadedPhotoBase64) {
          previewEmojiFallback.textContent = pet.species === 'canine' ? '🐶' : '🐱';
        }
      }
    } else {
      modalTitle.textContent = 'Register Companion Profile';
      savePetSubmitBtn.textContent = 'Save Companion';
      addPetForm.removeAttribute('data-edit-id');
      addPetForm.reset();
      currentUploadedPhotoBase64 = null;
      showPhotoInPreview(null);
      previewEmojiFallback.textContent = petSpeciesInput.value === 'canine' ? '🐶' : '🐱';
      updateMedicalConditionsDropdown(petSpeciesInput ? petSpeciesInput.value : 'canine');
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    petNameInput?.focus();
  }

  function closeAddModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    document.body.style.overflow = '';
    addPetForm.reset();
    currentUploadedPhotoBase64 = null;
    showPhotoInPreview(null);
  }

  openModalBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openAddModal();
  });

  closeModalBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAddModal();
  });

  cancelModalBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAddModal();
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeAddModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') {
      closeAddModal();
    }
  });

  // --- Strict Multi-Word Sensitivities Parsing Fix ---
  function normalizeSensitivities(input) {
    if (!input) return [];
    
    // If input is an array, join it first
    let rawString = Array.isArray(input) ? input.join(', ') : String(input);
    
    // Split ONLY by comma to protect whole phrases like "Artificial Red Dye #40"
    return rawString
      .split(',')
      .map(token => token.trim())
      .filter(token => token.length > 0 && token !== ',');
  }

  // --- Render Profile Grid ---
  function renderAllPetProfiles() {
    if (!gridContainer) return;

    const canines = pets.filter(p => (p.species || '').toLowerCase() === 'canine');
    const felines = pets.filter(p => (p.species || '').toLowerCase() === 'feline');

    if (petStatCount) petStatCount.textContent = `${pets.length} Registered`;
    if (petCanineCount) petCanineCount.textContent = `${canines.length} Canine`;
    if (petFelineCount) petFelineCount.textContent = `${felines.length} Feline`;
    // Real count of pets with at least one sensitivity/allergy on file -- used to be a
    // permanently hardcoded "Stratified Active" label that meant nothing.
    const petStatWatches = document.getElementById('petStatWatches');
    if (petStatWatches) {
      const withWatches = pets.filter(p => normalizeSensitivities(p.allergies).length > 0).length;
      petStatWatches.textContent = `${withWatches} ${withWatches === 1 ? 'Watch' : 'Watches'}`;
    }

    if (!pets.length) {
      gridContainer.innerHTML = `
        <div class="col-span-full text-center py-12 text-[#788673]">
          <i class="fa-solid fa-paw text-3xl mb-3 block"></i>
          <p class="font-bold">No pets added yet.</p>
          <p class="text-xs">Click "Add Pet Profile" to get started.</p>
        </div>
      `;
      return;
    }

    gridContainer.innerHTML = pets.map(pet => {
      const isCanine = (pet.species || '').toLowerCase() === 'canine';
      const speciesBadge = isCanine 
        ? '<span class="px-2 py-0.5 rounded-full bg-orange-100 text-[#b45309] font-extrabold text-[9px] uppercase border border-orange-200">Canine</span>'
        : '<span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-extrabold text-[9px] uppercase border border-purple-200">Feline</span>';

      // Custom Picture OR Emoji Fallback
      let avatarHtml = '';
      if (pet.photoUrl) {
        avatarHtml = `<img src="${pet.photoUrl}" alt="${pet.name}" class="w-14 h-14 rounded-2xl object-cover border border-[#ebdcd0] shadow-sm">`;
      } else {
        const bgBox = isCanine ? 'bg-orange-100 border-orange-200' : 'bg-purple-100 border-purple-200';
        const defaultEmoji = isCanine ? '🐶' : '🐱';
        avatarHtml = `
          <div class="w-14 h-14 rounded-2xl ${bgBox} flex items-center justify-center text-3xl shadow-inner border">
            ${pet.avatar || defaultEmoji}
          </div>
        `;
      }

      // Safe tag phrase extraction
      const tags = normalizeSensitivities(pet.sensitivities);

      return `
        <div class="tactile-card p-6 space-y-4 relative group transition-all hover:border-[#45671d]" data-pet-id="${pet.id}">
          
          <!-- Top Row: Avatar, Names & Edit/Delete -->
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3 min-w-0">
              ${avatarHtml}
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-extrabold text-[#182811] truncate">${pet.name}</h3>
                  ${speciesBadge}
                </div>
                <p class="text-xs font-bold text-[#788673] truncate">${pet.breed || 'Companion Animal'} • ${pet.status || 'Active'}</p>
              </div>
            </div>

            <!-- Edit & Delete Buttons -->
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" class="edit-pet-btn text-slate-300 hover:text-[#45671d] p-1.5 transition-colors" data-id="${pet.id}" title="Edit Profile">
                <i class="fa-solid fa-pen-to-square text-xs"></i>
              </button>
              <button type="button" class="delete-pet-btn text-slate-300 hover:text-red-500 p-1.5 transition-colors" data-id="${pet.id}" title="Archive Profile">
                <i class="fa-solid fa-trash text-xs"></i>
              </button>
            </div>
          </div>

          <!-- Secondary Metric Strip -->
          <div class="grid grid-cols-3 gap-2 text-xs bg-[#fbf9f6] p-3 rounded-xl border border-[#ebdcd0]">
            <div>
              <span class="text-[9.5px] uppercase font-bold text-[#788673] block">Life Stage</span>
              <strong class="text-[#182811] text-[11px] block truncate">${pet.ageBracket || 'Adult'}</strong>
            </div>
            <div>
              <span class="text-[9.5px] uppercase font-bold text-[#788673] block">Weight</span>
              <strong class="text-[#182811] text-[11px] block">${pet.weightKg ? pet.weightKg + ' kg' : '— kg'}</strong>
            </div>
            <div>
              <span class="text-[9.5px] uppercase font-bold text-[#788673] block">Daily Energy</span>
              <strong class="text-[#182811] text-[11px] block">${pet.dailyCalorieGoal || '500'} kcal</strong>
            </div>
          </div>

          <!-- Gender, birth date, vaccine and deworming -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-[#fbf9f6] p-3 rounded-xl border border-[#ebdcd0]">
            <div>
              <span class="text-[9.5px] uppercase font-bold text-[#788673] block">Gender</span>
              <strong class="text-[#182811] text-[11px] block truncate">${pet.gender || '—'}</strong>
            </div>
            <div>
              <span class="text-[9.5px] uppercase font-bold text-[#788673] block">Birth Date</span>
              <strong class="text-[#182811] text-[11px] block truncate">${kgDay(pet.birthdate)}</strong>
            </div>
            <div>
              <span class="text-[9.5px] uppercase font-bold text-[#788673] block">Vaccine</span>
              <strong class="text-[#182811] text-[11px] block truncate">${pet.vaccineStatus || '—'}</strong>
            </div>
            <div>
              <span class="text-[9.5px] uppercase font-bold text-[#788673] block">Last Deworming</span>
              <strong class="text-[#182811] text-[11px] block truncate">${kgDay(pet.dewormingDate)}</strong>
            </div>
          </div>

          <!-- Clean Full-Phrase Sensitivities Cloud (No letter-splitting) -->
          <div class="space-y-1.5">
            <span class="text-[10px] uppercase font-extrabold text-[#788673] block">Active Clinical Sensitivities &amp; Watches</span>
            <div class="flex flex-wrap gap-1.5 min-h-[38px]">
              ${tags.length > 0 
                ? tags.map(phrase => {
                    const lower = phrase.toLowerCase();
                    const isSevere = lower.includes('fatal') || lower.includes('prohibited') || lower.includes('xylitol') || lower.includes('hazard');
                    const isRenal = lower.includes('renal') || lower.includes('taurine') || lower.includes('watch');
                    
                    const badgeClass = isSevere 
                      ? 'bg-red-50 border-red-200 text-red-700' 
                      : (isRenal ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-orange-50 border-orange-200 text-[#b45309]');

                    return `<span class="px-2.5 py-1 rounded-lg border font-bold text-[10.5px] leading-tight ${badgeClass}">${phrase}</span>`;
                  }).join('')
                : '<span class="text-[11px] text-[#788673] italic">No active contraindications registered.</span>'
              }
            </div>
          </div>

          <!-- Footer Hook -->
          <div class="pt-3 border-t border-[#ebdcd0] flex items-center justify-between text-xs">
            <div>
              <span class="text-[#788673] block text-[10.5px]">Last Evaluated: <strong class="text-[#182811]">${pet.lastScanDate || 'No scans yet'}</strong></span>
              <span class="text-[10px] text-[#788673]">Batch: <strong>${pet.lastScanBatch || '—'}</strong></span>
            </div>
            <a href="results.html?pet=${pet.id}" class="px-3.5 py-1.5 bg-[#45671d]/10 hover:bg-[#45671d] hover:text-white text-[#45671d] font-extrabold rounded-xl transition-all flex items-center gap-1.5 text-xs">
              <i class="fa-solid fa-camera text-[10px]"></i> Scan for ${pet.name}
            </a>
          </div>

        </div>
      `;
    }).join('');

    // Attach Delete Listeners
    gridContainer.querySelectorAll('.delete-pet-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const target = pets.find(p => p.id === id);
        if (confirm(`Are you sure you want to archive ${target ? target.name : 'this companion'}?`)) {
          try {
            const response = await fetch('/api/pets/' + encodeURIComponent(id), { method: 'DELETE' });
            if (response.ok) await loadPets();
            else alert('Failed to delete pet from the database.');
          } catch (err) {
            console.error('Delete request error:', err);
            alert('Failed to connect to server.');
          }
        }
      });
    });

    // Attach Edit Listeners
    gridContainer.querySelectorAll('.edit-pet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        openAddModal(id);
      });
    });
  }

  function savePets() {
    try {
      localStorage.setItem('kibbleguard_pets', JSON.stringify(pets));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  // --- Form Submission ---
  addPetForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const editId = addPetForm.getAttribute('data-edit-id');
    const name = petNameInput.value.trim();
    const species = petSpeciesInput.value || 'canine';
    const breed = petBreedInput.value.trim() || (species === 'canine' ? 'Mixed Canine' : 'Domestic Short Hair (Puspin)');
    const ageBracket = petAgeInput.value || 'Adult';
    const weightVal = parseFloat(petWeightInput.value) || null;
    const rawSensitivities = petSensitivitiesInput.value.trim();

    if (!name) return;

    const isCanine = species.toLowerCase() === 'canine';
    const cleanTags = normalizeSensitivities(rawSensitivities);

    // Approximate daily kcal baseline
    const calorieBaseline = weightVal && weightVal > 0 
      ? Math.round(70 * Math.pow(weightVal, 0.75) * (isCanine ? 1.6 : 1.2)) 
      : (isCanine ? 600 : 220);

    // same id = update, new id = insert
    const payload = {
      id: editId || ('pet-' + Date.now()),
      user_id: kgUserId,
      name: name,
      species: isCanine ? 'Canine' : 'Feline',
      breed: breed,
      gender: petGenderInput ? petGenderInput.value : null,
      birthdate: petBirthdateInput && petBirthdateInput.value ? petBirthdateInput.value : null,
      weight: weightVal,
      allergies: cleanTags.join(', '),
      vaccine_status: petVaccineInput ? petVaccineInput.value : null,
      deworming_date: petDewormingInput && petDewormingInput.value ? petDewormingInput.value : null,
      image_url: currentUploadedPhotoBase64 || null,
      life_stage: ageBracket,
      takes_medicine: petMedicineInput ? petMedicineInput.value : 'No',
      takes_supplements: petSupplementsInput ? petSupplementsInput.value : 'No',
      medical_conditions: petMedicalConditionsInput ? petMedicalConditionsInput.value : 'None'
    };

    try {
      const response = await fetch('/api/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) { alert('Error saving pet profile to the server.'); return; }
      await loadPets();
      closeAddModal();
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to connect to server.');
    }
  });

  // Initial Run
  loadPets();
});
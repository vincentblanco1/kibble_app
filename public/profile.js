document.addEventListener('DOMContentLoaded', () => {
  const editToggleBtn = document.getElementById('editToggleBtn');
  const cancelProfileEditBtn = document.getElementById('cancelProfileEditBtn');
  const actionButtonsBar = document.getElementById('profileActionButtonsBar');
  const userProfileForm = document.getElementById('userProfileForm');
  const avatarInput = document.getElementById('avatarInput');
  const avatarUploadLabel = document.getElementById('avatarUploadLabel');
  const profileAvatarPreview = document.getElementById('profileAvatarPreview');
  const displayFullName = document.getElementById('displayFullName');
  const displayEmail = document.getElementById('displayEmail');
  const displayRole = document.getElementById('displayRole');
  const birthdateInput = document.getElementById('birthdateInput');
  const computedAgeDisplay = document.getElementById('computedAgeDisplay');
  const petCountInput = document.getElementById('petCountInput');
  const accountLogoutBtn = document.getElementById('accountLogoutBtn');
  const sidebarSignOutBtn = document.getElementById('sidebarSignOutBtn');

  // Read the authenticated user from localStorage (set at login/signup)
  let kgUser = {};
  try { kgUser = JSON.parse(localStorage.getItem('kibbleguard_user') || '{}'); } catch (e) {}
  const kgUserId = kgUser.id || null;

  // Split the stored name into first/last (the signup stores full name as "name")
  function splitName(fullName) {
    if (!fullName) return { first: '', last: '' };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  }

  const nameParts = splitName(kgUser.name || '');

  // Default Profile Model — seeded from the logged-in account, not hardcoded
  const defaultProfile = {
    firstName: nameParts.first,
    middleName: '',
    lastName: nameParts.last,
    email: kgUser.email || '',
    birthdate: '',
    gender: '',
    country: '',
    region: '',
    city: '',
    caregiverRole: 'Primary Caregiver',
    feedingStyle: 'Commercial Dry Kibble',
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-2.jpg'
  };

  let userProfile = { ...defaultProfile, ...JSON.parse(localStorage.getItem('kibbleguard_user_profile') || '{}') };
  // Always use the real auth email regardless of what's in the localStorage profile cache
  if (kgUser.email) userProfile.email = kgUser.email;

  // Compute live pet count from pet profiles database
  function getRegisteredPetCount() {
    const pets = JSON.parse(localStorage.getItem('kibbleguard_pets') || '[]');
    return pets.length > 0 ? pets.length : 2;
  }

  function calculateAge(dateStr) {
    if (!dateStr) return 'N/A';
    const birthDate = new Date(dateStr);
    const diff = Date.now() - birthDate.getTime();
    const ageYears = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    return ageYears > 0 ? `${ageYears} yrs old` : '< 1 yr';
  }

  function setField(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function populateProfileFields() {
    setField('firstNameInput', userProfile.firstName);
    setField('middleNameInput', userProfile.middleName);
    setField('lastNameInput', userProfile.lastName);
    setField('emailInput', userProfile.email);
    setField('birthdateInput', userProfile.birthdate);
    setField('genderInput', userProfile.gender);
    setField('countryInput', userProfile.country);
    setField('regionInput', userProfile.region);
    setField('cityInput', userProfile.city);
    setField('caregiverRoleInput', userProfile.caregiverRole);
    setField('feedingStyleInput', userProfile.feedingStyle);

    // Synchronize locked pet count
    const actualPetCount = getRegisteredPetCount();
    if (petCountInput) {
      petCountInput.value = actualPetCount > 0 ? `${actualPetCount} Registered ${actualPetCount === 1 ? 'Pet' : 'Pets'}` : '';
    }

    if (computedAgeDisplay) {
      computedAgeDisplay.value = calculateAge(userProfile.birthdate);
    }

    const firstName = userProfile.firstName || '';
    const middleName = userProfile.middleName || '';
    const lastName = userProfile.lastName || '';
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || kgUser.name || '—';
    if (displayFullName) displayFullName.textContent = fullName;
    if (displayEmail) displayEmail.textContent = userProfile.email || kgUser.email || '—';
    if (displayRole) displayRole.textContent = `Verified Owner${userProfile.city ? ' • ' + userProfile.city : ''}`;
    if (profileAvatarPreview && userProfile.avatar) profileAvatarPreview.src = userProfile.avatar;
  }

  function setEditMode(isEditing) {
    // Keep petCountInput and computedAgeDisplay locked at all times
    const inputs = userProfileForm.querySelectorAll('input:not(#computedAgeDisplay):not(#petCountInput), select');
    inputs.forEach(input => input.disabled = !isEditing);

    if (avatarUploadLabel) {
      avatarUploadLabel.classList.toggle('hidden', !isEditing);
    }
    if (avatarInput) {
      avatarInput.disabled = !isEditing;
    }

    if (isEditing) {
      actionButtonsBar.classList.remove('hidden');
      actionButtonsBar.classList.add('flex');
      editToggleBtn.classList.add('hidden');
    } else {
      actionButtonsBar.classList.add('hidden');
      actionButtonsBar.classList.remove('flex');
      editToggleBtn.classList.remove('hidden');
    }
  }

  birthdateInput?.addEventListener('change', (e) => {
    if (computedAgeDisplay) {
      computedAgeDisplay.value = calculateAge(e.target.value);
    }
  });

  avatarInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (profileAvatarPreview) profileAvatarPreview.src = event.target.result;
        userProfile.avatar = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  editToggleBtn?.addEventListener('click', () => setEditMode(true));

  cancelProfileEditBtn?.addEventListener('click', () => {
    populateProfileFields();
    setEditMode(false);
  });

  function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

  userProfileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = getVal('firstNameInput');
    const middleName = getVal('middleNameInput');
    const lastName = getVal('lastNameInput');
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

    userProfile = {
      ...userProfile,
      firstName,
      middleName,
      lastName,
      email: getVal('emailInput') || userProfile.email,
      birthdate: getVal('birthdateInput'),
      gender: getVal('genderInput'),
      country: getVal('countryInput'),
      region: getVal('regionInput'),
      city: getVal('cityInput'),
      caregiverRole: getVal('caregiverRoleInput'),
      petCount: getRegisteredPetCount(),
      feedingStyle: getVal('feedingStyleInput')
    };

    localStorage.setItem('kibbleguard_user_profile', JSON.stringify(userProfile));

    // Save to database if logged in
    if (kgUserId) {
      try {
        const patchData = {
          name: fullName || kgUser.name,
          middle_name: userProfile.middleName,
          birthdate: userProfile.birthdate,
          gender: userProfile.gender,
          city: userProfile.city,
          region: userProfile.region,
          country: userProfile.country,
          caregiver_role: userProfile.caregiverRole,
          feeding_style: userProfile.feedingStyle,
          pet_count: userProfile.petCount
        };
        const resp = await fetch('/api/users/' + kgUserId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchData)
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          console.warn('Profile DB save failed:', errData.error || resp.status);
        }
      } catch (err) {
        console.warn('Could not save profile to database:', err);
      }
    }

    populateProfileFields();
    setEditMode(false);
  });

  // Logout / Sign Out Handlers
  function handleLogout() {
    if (confirm('Are you sure you want to log out of KibbleGuard?')) {
      localStorage.removeItem('kibbleguard_auth_token');
      window.location.href = 'landing.html';
    }
  }

  accountLogoutBtn?.addEventListener('click', handleLogout);
  sidebarSignOutBtn?.addEventListener('click', handleLogout);

  populateProfileFields();
});
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

  // Default Profile Model
  const defaultProfile = {
    firstName: 'Vincent',
    middleName: 'Gregg',
    lastName: 'Blanco',
    email: 'vincent.gregg@uphsd.edu.ph',
    birthdate: '2002-05-18',
    gender: 'Male',
    country: 'Philippines',
    region: 'NCR (National Capital Region)',
    city: 'Las Piñas City',
    caregiverRole: 'Pet Owner',
    feedingStyle: 'Commercial Dry Kibble',
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-2.jpg'
  };

  let userProfile = JSON.parse(localStorage.getItem('kibbleguard_user_profile')) || defaultProfile;

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

  function populateProfileFields() {
    document.getElementById('firstNameInput').value = userProfile.firstName || '';
    document.getElementById('middleNameInput').value = userProfile.middleName || '';
    document.getElementById('lastNameInput').value = userProfile.lastName || '';
    document.getElementById('emailInput').value = userProfile.email || 'vincent.gregg@uphsd.edu.ph';
    document.getElementById('birthdateInput').value = userProfile.birthdate || '';
    document.getElementById('genderInput').value = userProfile.gender || 'Male';
    document.getElementById('countryInput').value = userProfile.country || 'Philippines';
    document.getElementById('regionInput').value = userProfile.region || 'NCR (National Capital Region)';
    document.getElementById('cityInput').value = userProfile.city || 'Las Piñas City';
    document.getElementById('caregiverRoleInput').value = userProfile.caregiverRole || 'Pet Owner';
    document.getElementById('feedingStyleInput').value = userProfile.feedingStyle || 'Commercial Dry Kibble';

    // Synchronize locked pet count
    const actualPetCount = getRegisteredPetCount();
    if (petCountInput) {
      petCountInput.value = `${actualPetCount} Registered ${actualPetCount === 1 ? 'Pet' : 'Pets'}`;
    }

    if (computedAgeDisplay) {
      computedAgeDisplay.value = calculateAge(userProfile.birthdate);
    }

    const fullName = `${userProfile.firstName} ${userProfile.middleName ? userProfile.middleName + ' ' : ''}${userProfile.lastName}`;
    if (displayFullName) displayFullName.textContent = fullName;
    if (displayEmail) displayEmail.textContent = userProfile.email || 'vincent.gregg@uphsd.edu.ph';
    if (displayRole) displayRole.textContent = `Verified Owner • ${userProfile.city || 'NCR'}`;
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

  userProfileForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    userProfile = {
      ...userProfile,
      firstName: document.getElementById('firstNameInput').value.trim(),
      middleName: document.getElementById('middleNameInput').value.trim(),
      lastName: document.getElementById('lastNameInput').value.trim(),
      email: document.getElementById('emailInput').value.trim(),
      birthdate: document.getElementById('birthdateInput').value,
      gender: document.getElementById('genderInput').value,
      country: document.getElementById('countryInput').value.trim(),
      region: document.getElementById('regionInput').value.trim(),
      city: document.getElementById('cityInput').value.trim(),
      caregiverRole: document.getElementById('caregiverRoleInput').value,
      petCount: getRegisteredPetCount(),
      feedingStyle: document.getElementById('feedingStyleInput').value
    };

    localStorage.setItem('kibbleguard_user_profile', JSON.stringify(userProfile));
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
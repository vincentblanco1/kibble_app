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
function riskOptions(selected) {
  // also unused here
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
// unused here too - shared block, not every page needs every helper
function verdictBadgeHtml(level) {
  var m = VERDICT_STYLES[level] || VERDICT_STYLES['Safe'];
  return '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' + m.cls + ' font-bold text-[9px] uppercase tracking-widest border"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>';
}

/* ---------- Settings-specific interactions ---------- */
var PREFERENCE_STORAGE_KEYS = {
  'pref-notify-triage': 'kibbleguard-notify-triage',
  'pref-notify-dispute': 'kibbleguard-notify-dispute',
  'pref-notify-inquiries': 'kibbleguard-notify-inquiries'
};

// the on/off switches for notification preferences (styled checkboxes,
// not real <input> elements) - saves to localStorage and immediately
// updates the sidebar nav dots since those depend on these settings
function togglePreference(id) {
  var btn = document.getElementById(id);
  var isOn = btn.classList.contains('bg-brand');
  if (isOn) {
    btn.classList.remove('bg-brand');
    btn.classList.add('bg-stone-200');
    btn.querySelector('.pref-dot').classList.remove('left-6');
    btn.querySelector('.pref-dot').classList.add('left-1');
  } else {
    btn.classList.add('bg-brand');
    btn.classList.remove('bg-stone-200');
    btn.querySelector('.pref-dot').classList.add('left-6');
    btn.querySelector('.pref-dot').classList.remove('left-1');
  }
  var storageKey = PREFERENCE_STORAGE_KEYS[id];
  if (storageKey) {
    localStorage.setItem(storageKey, isOn ? 'false' : 'true');
    renderNavBadges();
  }
}

// sets each toggle's visual state to match what's actually saved, runs
// once on page load
function restorePreferenceToggleStates() {
  Object.keys(PREFERENCE_STORAGE_KEYS).forEach(function (id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    var storedValue = localStorage.getItem(PREFERENCE_STORAGE_KEYS[id]);
    var shouldBeOn = storedValue !== 'false';
    var currentlyOn = btn.classList.contains('bg-brand');
    if (shouldBeOn !== currentlyOn) {
      btn.classList.toggle('bg-brand', shouldBeOn);
      btn.classList.toggle('bg-stone-200', !shouldBeOn);
      btn.querySelector('.pref-dot').classList.toggle('left-6', shouldBeOn);
      btn.querySelector('.pref-dot').classList.toggle('left-1', !shouldBeOn);
    }
  });
}
restorePreferenceToggleStates();

/* ---------- Admin profile: view / edit mode ---------- */
var profileEditSnapshot = null;

// unlocks the name/email fields on the profile card.
// snapshots the current values first, so Cancel can restore them exactly
function enterProfileEditMode() {
  profileEditSnapshot = {
    name: document.getElementById('admin-name').value,
    email: document.getElementById('admin-email').value
  };
  document.getElementById('admin-name').disabled = false;
  document.getElementById('admin-email').disabled = false;
  document.getElementById('edit-profile-btn').classList.add('hidden');
  document.getElementById('cancel-profile-btn').classList.remove('hidden');
  document.getElementById('save-profile-btn').classList.remove('hidden');
}

// shared cleanup for both Save and Cancel below
function exitProfileEditMode() {
  document.getElementById('admin-name').disabled = true;
  document.getElementById('admin-email').disabled = true;
  document.getElementById('edit-profile-btn').classList.remove('hidden');
  document.getElementById('cancel-profile-btn').classList.add('hidden');
  document.getElementById('save-profile-btn').classList.add('hidden');
  profileEditSnapshot = null;
}

// discards the edit and restores the snapshotted values
function cancelProfileEditMode() {
  if (profileEditSnapshot) {
    document.getElementById('admin-name').value = profileEditSnapshot.name;
    document.getElementById('admin-email').value = profileEditSnapshot.email;
  }
  exitProfileEditMode();
  showToast('Changes discarded', 'info');
}

// saves the admin's own profile info (name/email/retention) - every admin
// can edit their own profile regardless of role, so this isn't permission-gated
//
// name/email persist into the same admin-accounts store everything else
// (login, RBAC, the sidebar) reads from, so a saved change actually shows
// up everywhere else that reads an admin's identity, not just on this page.
// retention persists to its own key and is restored on page load, rather
// than resetting to the HTML's default <select> option ("1 Year") every time
function saveGlobalSettings() {
  var name = document.getElementById('admin-name').value.trim();
  var email = document.getElementById('admin-email').value.trim().toLowerCase();
  var retention = document.getElementById('pref-retention').value;
  if (!name) {
    showToast('Admin name cannot be empty', 'danger');
    return;
  }
  if (!email) {
    showToast('Admin email cannot be empty', 'danger');
    return;
  }

  var sessionEmail = localStorage.getItem('kibbleguard-admin-email');
  var accounts = getAdminAccounts();
  var account = accounts.find(function (a) { return a.email === sessionEmail; });
  if (!account) {
    showToast('Could not find your account to save changes to', 'danger');
    return;
  }
  var emailTaken = accounts.some(function (a) { return a !== account && a.email === email; });
  if (emailTaken) {
    showToast('An account with that email already exists', 'danger');
    return;
  }

  var btn = document.getElementById('save-profile-btn');
  withSavingState(btn, 'Saving...', function () {
    var originalName = account.name;
    var originalEmail = account.email;
    var originalRetention = localStorage.getItem('kibbleguard-scan-retention');
    var emailChanged = email !== originalEmail;
    account.name = name;
    account.email = email;

    try {
      saveAdminAccounts(accounts, { unguarded: true });
      if (emailChanged) localStorage.setItem('kibbleguard-admin-email', email);
      localStorage.setItem('kibbleguard-scan-retention', retention);
    } catch (e) {
      account.name = originalName;
      account.email = originalEmail;
      if (emailChanged) localStorage.setItem('kibbleguard-admin-email', sessionEmail);
      throw e;
    }

    populateAdminProfileCard();
    applySidebarIdentity();
    if (typeof renderAdminTeamList === 'function') renderAdminTeamList();

    var affectedCount = countScansOlderThanRetention(retention);
    var message = 'Settings saved. Retention set to ' + retention;
    if (affectedCount > 0) message += ' (' + affectedCount + ' existing scan' + (affectedCount === 1 ? '' : 's') + ' would be archived once this policy runs)';
    showToast(message, 'success');
    logAdminAction('Updated profile settings, retention set to ' + retention + (affectedCount > 0 ? ' (' + affectedCount + ' scans would be affected)' : ''), 'settings');
    exitProfileEditMode();
  });
}

// sets the retention <select> to whatever was actually saved, runs once on
// page load - before this fix nothing ever wrote this key, so the dropdown
// always silently fell back to the HTML's hardcoded "1 Year" default
function restoreRetentionSelectValue() {
  var select = document.getElementById('pref-retention');
  if (!select) return;
  var saved = localStorage.getItem('kibbleguard-scan-retention');
  if (saved && Array.prototype.some.call(select.options, function (o) { return o.value === saved; })) {
    select.value = saved;
  }
}

// a real, safe computation of how many actual persisted scan records are
// older than the selected retention window - reports the number rather
// than deleting anything, since the seed scans' fixed 2024 dates would
// otherwise get wiped out entirely the moment any period but Indefinite
// is picked, purely because of how much real time has passed since then
function countScansOlderThanRetention(retention) {
  if (retention === 'Indefinite') return 0;
  var monthsMap = { '6 Months': 6, '1 Year': 12, '2 Years': 24 };
  var months = monthsMap[retention];
  if (!months) return 0;

  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  var savedRows = null;
  try { savedRows = JSON.parse(localStorage.getItem('kibbleguard-scans-rows')); } catch (e) { savedRows = null; }
  if (!savedRows) return 0;

  var tempTable = document.createElement('table');
  tempTable.innerHTML = savedRows.join('');
  var count = 0;
  tempTable.querySelectorAll('tr[data-date]').forEach(function (row) {
    var scanDate = new Date(row.dataset.date);
    if (!isNaN(scanDate) && scanDate < cutoff) count++;
  });
  return count;
}

// the change-password modal, with the live requirement checklist wired
// to updateSettingsPasswordRequirements below as you type
function openPasswordForm() {
  openModal({
    title: 'Update Password',
    subtitle: "You'll be asked to sign in again after changing it",
    bodyHtml:
      '<div class="space-y-4">' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Current Password</label>' +
          '<div class="relative mt-1.5"><input id="f-current-password" type="password" class="w-full px-4 py-2.5 pr-11 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">' + passwordToggleButtonHtml('f-current-password') + '</div></div>' +
        '<div>' +
          '<label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">New Password</label>' +
          '<div class="relative mt-1.5"><input id="f-new-password" oninput="updateSettingsPasswordRequirements()" type="password" class="w-full px-4 py-2.5 pr-11 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="Create a new password">' + passwordToggleButtonHtml('f-new-password') + '</div>' +
        '</div>' +
        '<div>' +
          '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">Password Security Rules</p>' +
          '<div class="grid grid-cols-2 gap-x-3 gap-y-1.5" id="settings-password-requirements">' +
            passwordRequirementHtml('settings-req-length', 'At least 8 characters') +
            passwordRequirementHtml('settings-req-mixedCase', 'Mixed case (upper &amp; lower)') +
            passwordRequirementHtml('settings-req-number', 'At least 1 number (0-9)') +
            passwordRequirementHtml('settings-req-special', 'At least 1 special symbol (!@#$%^&amp;*)') +
          '</div>' +
        '</div>' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Confirm New Password</label>' +
          '<div class="relative mt-1.5"><input id="f-confirm-password" type="password" class="w-full px-4 py-2.5 pr-11 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="Re-enter your new password">' + passwordToggleButtonHtml('f-confirm-password') + '</div></div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="submit-password-change-btn" onclick="submitPasswordChange()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Update Password</button>'
  });
}

// lights up each of the 4 password rules green with a check mark as it gets
// satisfied (shared helper in app.js, same as the accept-invite page)
function updateSettingsPasswordRequirements() {
  updatePasswordRequirementList('settings-req-', document.getElementById('f-new-password').value);
}

// validates current password, all 4 requirements, matching confirmation,
// and that it's actually different from the old one, before saving
function submitPasswordChange() {
  var currentPass = document.getElementById('f-current-password').value;
  var newPass = document.getElementById('f-new-password').value;
  var confirmPass = document.getElementById('f-confirm-password').value;

  var account = getLoggedInAdmin();
  if (!account) {
    showToast('Could not verify your account, please log in again', 'danger');
    return;
  }
  if (currentPass !== account.password) {
    showToast('Current password is incorrect', 'danger');
    return;
  }
  var checks = getPasswordChecks(newPass);
  if (!checks.length || !checks.mixedCase || !checks.number || !checks.special) {
    showToast("New password doesn't meet all the requirements above", 'danger');
    return;
  }
  if (newPass !== confirmPass) {
    showToast('New passwords do not match', 'danger');
    return;
  }
  if (newPass === currentPass) {
    showToast('New password must be different from your current password', 'danger');
    return;
  }

  var btn = document.getElementById('submit-password-change-btn');
  withSavingState(btn, 'Updating...', function () {
    var accounts = getAdminAccounts();
    var record = accounts.find(function (a) { return a.email === account.email; });
    record.password = newPass;
    record.hasCustomPassword = true;
    saveAdminAccounts(accounts, { unguarded: true });

    closeModal();
    showToast('Password updated', 'success');
    logAdminAction('Updated own account password', 'security');
  });
}

// the "deactivate my own access" flow. sets the account to 'deactivated' (login is
// refused and the session ends), and a Chief Admin can restore it from the Admin Team
// list. The last active Chief Admin can't do this, or nobody could restore anyone
function confirmDeactivate() {
  var me = getLoggedInAdmin();
  var activeChiefs = getAdminAccounts().filter(function (a) { return a.role === 'Chief Admin' && a.status === 'active'; });
  if (me && me.role === 'Chief Admin' && activeChiefs.length <= 1) {
    openModal({
      title: 'Cannot Deactivate',
      subtitle: 'You are the only active Chief Admin',
      bodyHtml: '<p class="text-sm text-stone-600 leading-relaxed">If you deactivate yourself, nobody would be able to restore access or manage the admin team. Invite or promote another Chief Admin first.</p>',
      footerHtml: '<button onclick="closeModal()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Got it</button>'
    });
    return;
  }
  openModal({
    title: 'Deactivate Admin Access',
    subtitle: 'You will be signed out right away',
    bodyHtml: '<p class="text-sm text-stone-600 leading-relaxed">You will immediately lose access to the KibbleGuard admin control center. A Chief Admin can restore your access from the Admin Team list. This does not affect pet owner accounts or live scan processing.</p>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="confirm-deactivate-btn" onclick="performDeactivateSelf()" class="press px-6 py-2.5 text-xs font-bold text-white bg-danger hover:bg-red-600 rounded-xl shadow-lg shadow-danger/20 transition-all">Deactivate My Access</button>'
  });
}

function performDeactivateSelf() {
  var me = getLoggedInAdmin();
  if (!me) return;
  var btn = document.getElementById('confirm-deactivate-btn');
  withSavingState(btn, 'Deactivating...', function () {
    var accounts = getAdminAccounts();
    var record = accounts.find(function (a) { return a.email === me.email; });
    if (!record) return;
    assertKeyCurrent('kibbleguard-admin-accounts', 'the admin team');   // before the log line below, so a refused save is never logged as done
    // logged BEFORE the status changes: logAdminAction credits whoever getLoggedInAdmin()
    // returns, and that only returns accounts that are still active
    logAdminAction(me.name + ' deactivated their own admin access', 'security');
    record.status = 'deactivated';
    saveAdminAccounts(accounts);
    localStorage.removeItem('kibbleguard-admin-email');
    window.location.href = 'auth.html?deactivated=1';
  });
}

// a Chief Admin brings a deactivated admin back to active
function restoreAdmin(email) {
  var btn = Array.prototype.find.call(document.querySelectorAll('button[onclick*="restoreAdmin"]'), function (b) {
    return b.getAttribute('onclick').indexOf("'" + email + "'") !== -1;
  });
  withSavingState(btn, '', function () {
    var accounts = getAdminAccounts();
    var record = accounts.find(function (a) { return a.email === email; });
    if (!record) return;
    record.status = 'active';
    saveAdminAccounts(accounts);
    showToast(record.name + '\'s admin access was restored', 'success');
    logAdminAction('Restored admin access: ' + record.name + ' (' + record.role + ')', 'security');
    renderAdminTeamList();
  });
}

// the "Invite Admin" modal - name, email, role
function openInviteForm() {
  openModal({
    title: 'Invite Admin',
    subtitle: "They'll receive an email to set up their account",
    bodyHtml:
      '<div class="space-y-4">' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Full Name</label>' +
          '<input id="f-invite-name" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="e.g. Daniella Albano"></div>' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Email Address</label>' +
          '<input id="f-invite-email" type="email" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="name@kibbleguard.app"></div>' +
        '<div><label class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Role</label>' +
          '<select id="f-invite-role" class="w-full mt-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand">' +
            '<option>Ingredient Reviewer</option><option>Support Admin</option><option>Chief Admin</option>' +
          '</select></div>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="submit-invite-btn" onclick="submitInvite()" data-perm="manageAdminTeam" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Send Invite</button>'
  });
}

// creates the pending account and sends the invite email.
// checks for a duplicate email first, since two accounts can't share one
function submitInvite() {
  var name = document.getElementById('f-invite-name').value.trim();
  var email = document.getElementById('f-invite-email').value.trim().toLowerCase();
  var role = document.getElementById('f-invite-role').value;
  if (!name || !email) {
    showToast('Name and email are required', 'danger');
    return;
  }
  var accounts = getAdminAccounts();
  if (accounts.some(function (a) { return a.email === email; })) {
    showToast('An account with that email already exists', 'danger');
    return;
  }

  var btn = document.getElementById('submit-invite-btn');
  withSavingState(btn, 'Sending...', function () {
    var token = generateInviteToken();
    accounts.push({ name: name, email: email, role: role, status: 'pending', inviteToken: token });
    saveAdminAccounts(accounts);
    logAdminAction('Invited new admin: ' + name + ' (' + role + ')', 'security');

    // the real version of this should POST {name, email, role} to something
    // like /api/admin/invite and let the SERVER generate the token and send the email.
    // doing it here in the browser isn't secure enough for real use -
    // it's just building the link locally so there's something to share for now
    var link = window.location.origin + window.location.pathname.replace('settings.html', '') + 'accept-invite.html?token=' + token;
    var summaries = (typeof ROLE_ACCESS_SUMMARY !== 'undefined') ? ROLE_ACCESS_SUMMARY : {};
    var accessSummary = summaries[roleStringToKey(role)] || 'Access varies by role.';

    closeModal();
    showToast('Sending invite email to ' + email + '...', 'info');
    sendSystemEmail({ type: 'admin-invite', to: email, name: name, role: role, link: link }).then(function () {
      logAdminAction('Invite email sent to ' + email, 'security');
      showInviteSentModal(name, email, accessSummary, link, true);
    }).catch(function () {
      showInviteSentModal(name, email, accessSummary, link, false);
    });
    renderAdminTeamList();
  });
}

// shown right after sending an invite.
// the message differs depending on whether the email actually succeeded, but the link is always
// shown either way, so there's a fallback if the email never arrives
function showInviteSentModal(name, email, accessSummary, link, emailSucceeded) {
  var statusLine = emailSucceeded
    ? '<p class="text-sm text-stone-600 leading-relaxed mb-4"><i class="fa-solid fa-circle-check text-safe mr-1"></i>Invite email sent to ' + email + '. If it doesn\'t arrive, share this link directly.</p>'
    : '<p class="text-sm text-stone-600 leading-relaxed mb-4"><i class="fa-solid fa-circle-exclamation text-danger mr-1"></i>The invite email failed to send. Share this link with ' + name + ' directly instead.</p>';
  openModal({
    title: 'Invite Created',
    subtitle: name + ' \u00b7 ' + email,
    bodyHtml:
      statusLine +
      '<div class="p-4 rounded-2xl bg-stone-100 border border-stone-200 mb-4">' +
        '<p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">As ' + email + ' will have access to:</p>' +
        '<p class="text-xs text-stone-600 leading-relaxed">' + accessSummary + '</p>' +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        '<input id="invite-link-field" type="text" readonly value="' + link + '" class="flex-1 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-mono text-stone-600 focus:outline-none">' +
        '<button onclick="copyInviteLink()" class="press px-4 py-3 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl transition-all shrink-0">Copy</button>' +
      '</div>',
    footerHtml: '<button onclick="closeModal()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Done</button>'
  });
}

// the Copy button next to an invite link field
function copyInviteLink() {
  var field = document.getElementById('invite-link-field');
  field.select();
  navigator.clipboard && navigator.clipboard.writeText(field.value).then(function () {
    showToast('Invite link copied', 'success');
  }).catch(function () {
    showToast('Could not copy, copy manually instead', 'danger');
  });
}

// the whole admin roster - pending invites get resend/revoke buttons,
// active admins get a remove button (except yourself, which shows nothing)
function renderAdminTeamList() {
  var list = document.getElementById('admin-team-list');
  if (!list) return;
  var accounts = getAdminAccounts();
  var currentEmail = (getLoggedInAdmin() || {}).email;
  list.innerHTML = accounts.map(function (a) {
    var isPending = a.status === 'pending';
    var isDeactivated = a.status === 'deactivated';
    var statusBadge = isDeactivated
      ? '<span class="px-3 py-1 rounded-full bg-stone-100 text-stone-500 text-[9px] font-bold uppercase tracking-widest border border-stone-200">' + a.role + ' &middot; Deactivated</span>'
      : isPending
      ? '<span class="px-3 py-1 rounded-full bg-stone-100 text-stone-500 text-[9px] font-bold uppercase tracking-widest border border-stone-200">' + a.role + ' &middot; Pending</span>'
      : '<span class="px-3 py-1 rounded-full bg-safe/10 text-safe text-[9px] font-bold uppercase tracking-widest border border-safe/10">' + a.role + '</span>';
    var actions;
    if (isDeactivated) {
      actions = '<button onclick="restoreAdmin(\'' + a.email + '\')" data-perm="manageAdminTeam" title="Restore access" class="press w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-brand transition-all"><i class="fa-solid fa-user-check text-xs"></i></button>' +
        '<button onclick="confirmRemoveAdmin(\'' + a.email + '\')" data-perm="manageAdminTeam" title="Remove admin" class="press w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-danger transition-all"><i class="fa-solid fa-user-slash text-xs"></i></button>';
    } else if (isPending) {
      actions = '<button onclick="resendInviteLink(\'' + a.email + '\')" data-perm="manageAdminTeam" title="Copy invite link" class="press w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-brand transition-all"><i class="fa-solid fa-link text-xs"></i></button>' +
        '<button onclick="revokeInvite(\'' + a.email + '\')" data-perm="manageAdminTeam" title="Revoke invite" class="press w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-danger transition-all"><i class="fa-solid fa-trash text-xs"></i></button>';
    } else if (a.email !== currentEmail) {
      actions = '<button onclick="confirmRemoveAdmin(\'' + a.email + '\')" data-perm="manageAdminTeam" title="Remove admin" class="press w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-danger transition-all"><i class="fa-solid fa-user-slash text-xs"></i></button>';
    } else {
      actions = '';
    }
    return '<div class="p-6 flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          '<img src="' + getAvatarSrc(a) + '" class="w-10 h-10 rounded-xl object-cover shadow-sm">' +
          '<div><p class="text-sm font-bold text-dark">' + escapeHTML(a.name) + '</p><p class="text-[11px] text-stone-500">' + escapeHTML(a.email) + '</p></div>' +
        '</div>' +
        '<div class="flex items-center gap-2">' + statusBadge + actions + '</div>' +
      '</div>';
  }).join('');
  if (typeof applyPermissionGating === 'function') applyPermissionGating();
}

// confirmation before actually removing an admin's access
function confirmRemoveAdmin(email) {
  var account = getAdminAccounts().find(function (a) { return a.email === email; });
  if (!account) return;
  openModal({
    title: 'Remove Admin',
    subtitle: account.name + ' \u00b7 ' + account.role,
    bodyHtml: '<p class="text-sm text-stone-600 leading-relaxed">This immediately revokes <span class="font-bold text-dark">' + account.name + '</span>\'s access to the admin panel. They will no longer be able to log in. This cannot be undone from here -- they would need a new invite to regain access.</p>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 text-xs font-bold text-stone-500 hover:text-dark transition-all">Cancel</button>' +
      '<button id="confirm-remove-admin-btn" onclick="performRemoveAdmin(\'' + email + '\')" class="press px-6 py-2.5 text-xs font-bold text-white bg-danger hover:bg-red-600 rounded-xl shadow-lg shadow-danger/20 transition-all">Remove Admin</button>'
  });
}

// the actual removal - takes them out of the accounts list entirely and emails them that it happened
function performRemoveAdmin(email) {
  var accounts = getAdminAccounts();
  var account = accounts.find(function (a) { return a.email === email; });
  if (!account) return;
  var btn = document.getElementById('confirm-remove-admin-btn');
  withSavingState(btn, 'Removing...', function () {
    var remaining = accounts.filter(function (a) { return a.email !== email; });
    saveAdminAccounts(remaining);
    closeModal();
    showToast('Sending notification email to ' + account.name + '...', 'info');
    logAdminAction('Removed admin: ' + account.name + ' (' + account.role + ')', 'security');
    sendSystemEmail({ type: 'admin-removed', to: account.email, name: account.name }).then(function () {
      showToast(account.name + '\'s admin access was removed, notification email sent', 'danger');
    }).catch(function () {
      showToast(account.name + '\'s admin access was removed, but the notification email failed to send', 'danger');
    });
    renderAdminTeamList();
  });
}

// re-shows the same invite link for a pending account (same token as before, doesn't generate a new one)
function resendInviteLink(email) {
  var account = getAdminAccounts().find(function (a) { return a.email === email; });
  if (!account) return;
  var link = window.location.origin + window.location.pathname.replace('settings.html', '') + 'accept-invite.html?token=' + account.inviteToken;
  openModal({
    title: 'Invite Link',
    subtitle: account.name + ' \u00b7 ' + account.email,
    bodyHtml:
      '<div class="flex items-center gap-2">' +
        '<input id="invite-link-field" type="text" readonly value="' + link + '" class="flex-1 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-mono text-stone-600 focus:outline-none">' +
        '<button onclick="copyInviteLink()" class="press px-4 py-3 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl transition-all shrink-0">Copy</button>' +
      '</div>',
    footerHtml: '<button onclick="closeModal()" class="press px-6 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-hover rounded-xl shadow-lg shadow-brand/20 transition-all">Done</button>'
  });
}

// cancels a pending invite before it's ever accepted, removing the account entirely as if it never existed
function revokeInvite(email) {
  var btn = Array.prototype.find.call(document.querySelectorAll('button[onclick*="revokeInvite"]'), function (b) {
    return b.getAttribute('onclick').indexOf("'" + email + "'") !== -1;
  });
  withSavingState(btn, '', function () {
    var accounts = getAdminAccounts().filter(function (a) { return a.email !== email; });
    saveAdminAccounts(accounts);
    showToast('Invite revoked', 'success');
    logAdminAction('Revoked pending invite: ' + email, 'security');
    renderAdminTeamList();
  });
}

/* ---------- Appearance: theme selector ---------- */
function updateThemeSelectorUI(preference) {
  ['light', 'dark', 'system'].forEach(function (opt) {
    var btn = document.getElementById('theme-btn-' + opt);
    if (!btn) return;
    btn.className = opt === preference
      ? 'press flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-brand bg-brand-light text-brand transition-all'
      : 'press flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-stone-100 text-stone-500 hover:border-stone-200 transition-all';
  });
}

// one of the Light/Dark/System buttons was clicked
function handleThemeButtonClick(preference) {
  setTheme(preference);
  var label = preference.charAt(0).toUpperCase() + preference.slice(1);
  showToast('Theme set to ' + label, 'success');
}

updateThemeSelectorUI(localStorage.getItem('kibbleguard-theme') || 'system');

/* ---------- Compact table density toggle ---------- */
function updateDensitySelectorUI(density) {
  var toggle = document.getElementById('pref-compact-density');
  if (!toggle) return;
  var dot = toggle.querySelector('.pref-dot');
  if (density === 'compact') {
    toggle.classList.add('bg-brand');
    toggle.classList.remove('bg-stone-200');
    dot.classList.add('left-6');
    dot.classList.remove('left-1');
  } else {
    toggle.classList.remove('bg-brand');
    toggle.classList.add('bg-stone-200');
    dot.classList.remove('left-6');
    dot.classList.add('left-1');
  }
}

// the compact/comfortable table spacing toggle
function handleDensityToggleClick() {
  var current = localStorage.getItem('kibbleguard-table-density') || 'comfortable';
  var next = current === 'compact' ? 'comfortable' : 'compact';
  setTableDensity(next);
  showToast('Table density set to ' + next, 'success');
}

updateDensitySelectorUI(localStorage.getItem('kibbleguard-table-density') || 'comfortable');

// fills in the profile card with whoever's actually logged in, runs on page load
function populateAdminProfileCard() {
  var account = getLoggedInAdmin();
  if (!account) return;
  document.getElementById('profile-name-display').textContent = account.name;
  document.getElementById('profile-role-badge').textContent = account.role;
  document.getElementById('admin-name').value = account.name;
  document.getElementById('admin-email').value = account.email;
  document.getElementById('profile-avatar-img').src = getAvatarSrc(account);

  var joinedEl = document.getElementById('profile-joined-date');
  if (joinedEl) {
    joinedEl.textContent = account.joinedDate
      ? new Date(account.joinedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown';
  }

  var lastLoginEl = document.getElementById('profile-last-login');
  if (lastLoginEl) {
    var lastLogins = {};
    try { lastLogins = JSON.parse(localStorage.getItem('kibbleguard-last-logins')) || {}; } catch (e) { lastLogins = {}; }
    var lastLogin = lastLogins[account.email];
    if (!lastLogin) {
      lastLoginEl.textContent = 'First login this session';
    } else {
      var loginDate = new Date(lastLogin);
      var isToday = loginDate.toDateString() === new Date().toDateString();
      lastLoginEl.textContent = isToday
        ? 'Today, ' + loginDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : loginDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + loginDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  }
}

// the profile photo upload - checks it's actually an image and under 2MB,
// then reads it as a data URL so it can be stored directly in localStorage
// (no real file storage/backend exists to upload to)
function handleAvatarFileSelected(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file', 'danger');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be smaller than 2MB', 'danger');
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    var accounts = getAdminAccounts();
    var account = getLoggedInAdmin();
    var record = accounts.find(function (a) { return a.email === account.email; });
    record.avatarDataUrl = e.target.result;
    try {
      saveAdminAccounts(accounts, { unguarded: true });
    } catch (err) {
      showToast('Could not save that photo: ' + (err && err.message ? err.message : 'storage may be full'), 'danger');
      return;
    }
    populateAdminProfileCard();
    applySidebarIdentity();
    renderAdminTeamList();
    showToast('Profile photo updated', 'success');
    logAdminAction(account.name + ' updated their profile photo', 'security');
  };
  reader.onerror = function () {
    showToast('Could not read that image file', 'danger');
  };
  reader.readAsDataURL(file);
}

renderNavBadges();
applyRoleState();
renderAdminTeamList();
populateAdminProfileCard();
restoreRetentionSelectValue();

/* ---------- Refresh ----------
   Re-reads the admin accounts so the Admin Team list shows invites accepted, admins
   removed, or access deactivated/restored by someone else. If YOUR account was removed
   or deactivated meanwhile, applyRoleState() signs you out. The profile card is left
   alone while it is being edited, so a refresh can't wipe what you're typing. */
function refreshSettings() {
  markKeyLoaded('kibbleguard-admin-accounts');
  applyRoleState();
  renderAdminTeamList();
  if (!profileEditSnapshot) populateAdminProfileCard();
  applySidebarIdentity();
  renderNavBadges();
}
initRefreshControl({ key: 'settings', label: 'Settings', onRefresh: refreshSettings, auto: false });

// the Refresh control is appended to the header by initRefreshControl; on pages that
// already have a button group on the right, tuck it into that group so the header
// layout stays two-sided instead of becoming three-way
(function () {
  var w = document.getElementById('refresh-control');
  var actions = document.querySelector('main header > div.gap-3');
  if (w && actions) actions.insertBefore(w, actions.firstChild);
})();

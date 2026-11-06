document.addEventListener('DOMContentLoaded', () => {
  const exportDataBtn = document.getElementById('exportDataBtn');
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  const disputeReportForm = document.getElementById('disputeReportForm');
  const reportSuccessAlert = document.getElementById('reportSuccessAlert');
  const recentReportsList = document.getElementById('recentReportsList');
  const reportsCountBadge = document.getElementById('reportsCountBadge');

  // Dark Mode Engine lives globally below (updateThemeSelectorUI / handleThemeButtonClick),
  // since settings.html's buttons call it via inline onclick, which needs a global function,
  // not one trapped inside this DOMContentLoaded closure. The actual theme engine
  // (computeEffectiveTheme / applyTheme / restoreThemeState / setTheme) is in app.js and
  // targets <html>.dark-theme, not document.body -- this file used to carry its own
  // separate, older copy that targeted the body and a different pair of button ids
  // ("themeLightBtn"/"themeDarkBtn") that no longer exist in the current settings.html,
  // so it silently did nothing. Removed in favor of the one real implementation.

  // 2. Render Stored Dispute Reports
  function renderStoredReports() {
    if (!recentReportsList) return;
    const reports = JSON.parse(localStorage.getItem('kibbleguard_reports') || '[]');

    if (reportsCountBadge) {
      reportsCountBadge.textContent = `${reports.length} Logged`;
    }

    if (reports.length === 0) {
      recentReportsList.innerHTML = `
        <div class="py-6 text-center text-[#788673] text-xs">
          <p>No active disputes or bug reports filed yet.</p>
        </div>
      `;
      return;
    }

    recentReportsList.innerHTML = reports.map(r => `
      <div class="p-3 rounded-xl bg-[#fbf9f6] border border-[#ebdcd0] flex items-start justify-between gap-3 text-xs">
        <div class="space-y-0.5 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-bold text-[#182811] truncate">${r.category}</span>
            <span class="px-2 py-0.2 rounded-full bg-orange-100 text-[#b45309] text-[9.5px] font-extrabold uppercase shrink-0">${r.status || 'Under Review'}</span>
          </div>
          <p class="text-[10.5px] text-[#788673] truncate">Ref: ${r.reference} • ${r.description}</p>
        </div>
        <span class="text-[10px] text-[#788673] font-medium shrink-0">${new Date(r.timestamp).toLocaleDateString()}</span>
      </div>
    `).join('');
  }

  // 3. Dispute & Flag Submission Handler
  disputeReportForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const reportPayload = {
      id: 'REP-' + Date.now(),
      category: document.getElementById('reportCategory').value,
      reference: document.getElementById('reportReference').value.trim() || 'N/A',
      description: document.getElementById('reportDescription').value.trim(),
      timestamp: new Date().toISOString(),
      status: 'Under Review'
    };

    const existingReports = JSON.parse(localStorage.getItem('kibbleguard_reports') || '[]');
    existingReports.unshift(reportPayload);
    localStorage.setItem('kibbleguard_reports', JSON.stringify(existingReports));

    // also send the report to the database so the admin sees it in the tickets queue
    // `kibbleguard_auth_user` only ever holds the signed-in owner's EMAIL, not their numeric id
    // (set that way at login in auth.js) -- sending it as `user_id` meant the admin's ticket
    // join could never match it back to a real account, so every reply went nowhere and the
    // admin panel showed "Unknown owner" even for a real, logged-in pet owner. The real numeric
    // id lives in the `kibbleguard_user` record also saved at login; fall back to the email only
    // if that's somehow missing, since the backend now also matches tickets by email.
    var kgUser = {};
    try { kgUser = JSON.parse(localStorage.getItem('kibbleguard_user')) || {}; } catch (e) { kgUser = {}; }
    fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: reportPayload.category,
        message: reportPayload.description,
        scan_id: reportPayload.reference === 'N/A' ? null : reportPayload.reference,
        timestamp: reportPayload.timestamp,
        user_id: kgUser.id || localStorage.getItem('kibbleguard_auth_user') || 'Unknown User'
      })
    }).catch(function (err) { console.warn('Report saved on this device only:', err); });

    if (reportSuccessAlert) {
      reportSuccessAlert.classList.remove('hidden');
      setTimeout(() => reportSuccessAlert.classList.add('hidden'), 4000);
    }
    disputeReportForm.reset();
    renderStoredReports();
  });

  // 4. Export JSON Data
  exportDataBtn?.addEventListener('click', () => {
    const backupData = {
      pets: JSON.parse(localStorage.getItem('kibbleguard_pets') || '[]'),
      reports: JSON.parse(localStorage.getItem('kibbleguard_reports') || '[]'),
      theme: localStorage.getItem('kibbleguard_theme') || 'light',
      exportTimestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kibbleguard_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 5. Clear Cache
  clearCacheBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your evaluation history cache? Your registered pets will remain intact.')) {
      localStorage.removeItem('kibbleguard_scan_history');
      alert('Evaluation cache cleared successfully.');
    }
  });

  renderStoredReports();
  renderAdminTeamList();
});

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

/* ---------- Admin Team: invite, list, deactivate/restore/remove ----------
   The "Invite Admin" button called openInviteForm(), which didn't exist
   anywhere in the codebase -- clicking it just threw a silent console
   error. The real backend for this was already built (server routes
   /api/admin/invite/:token and /api/admin/accept-invite, which write a
   real row into the users table; accept-invite.html where the invited
   person sets their password; getAdminAccounts/saveAdminAccounts/
   generateInviteToken in app.js for the shared roster). What was missing
   was the piece that actually creates a pending invite and shows its
   link, and the admin-team-list rendering, below. */

function adminTeamRoleOptions(selected) {
  return ['Chief Admin', 'Ingredient Reviewer', 'Support Admin'].map(function (r) {
    return '<option value="' + r + '"' + (r === selected ? ' selected' : '') + '>' + r + '</option>';
  }).join('');
}

// there's no email service wired up (sendSystemEmail in app.js is a stub),
// so the invite link has to be copied and sent by hand -- this just needs
// to resolve correctly next to accept-invite.html regardless of exactly
// where this page is being served from
function inviteLinkFor(token) {
  return new URL('accept-invite.html?token=' + encodeURIComponent(token), window.location.href).href;
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () { fallbackCopyToClipboard(text); });
  } else {
    fallbackCopyToClipboard(text);
  }
}
function fallbackCopyToClipboard(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* best effort */ }
  document.body.removeChild(ta);
}

function openInviteForm() {
  openModal({
    title: 'Invite Admin',
    subtitle: "They'll get a link to set their own password and join the team.",
    bodyHtml:
      '<div class="space-y-4">' +
        '<div><label class="text-xs font-bold text-dark block mb-1.5">Full Name</label>' +
          '<input type="text" id="invite-name" placeholder="e.g. Maria Santos" class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand"></div>' +
        '<div><label class="text-xs font-bold text-dark block mb-1.5">Email Address</label>' +
          '<input type="email" id="invite-email" placeholder="name@kibbleguard.app" class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand"></div>' +
        '<div><label class="text-xs font-bold text-dark block mb-1.5">Role</label>' +
          '<select id="invite-role" class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-brand">' + adminTeamRoleOptions('Support Admin') + '</select></div>' +
        '<p id="invite-form-error" class="hidden text-xs font-bold text-danger"></p>' +
      '</div>',
    footerHtml:
      '<button onclick="closeModal()" class="press px-5 py-2.5 rounded-xl bg-stone-100 text-dark text-xs font-bold">Cancel</button>' +
      '<button onclick="submitInviteForm()" data-perm="manageAdminTeam" class="press px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-lg shadow-brand/20">Send Invite</button>'
  });
  setTimeout(function () { var el = document.getElementById('invite-name'); if (el) el.focus(); }, 50);
}

function showInviteFormError(msg) {
  var el = document.getElementById('invite-form-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function submitInviteForm() {
  var nameEl = document.getElementById('invite-name');
  var emailEl = document.getElementById('invite-email');
  var roleEl = document.getElementById('invite-role');
  if (!nameEl || !emailEl || !roleEl) return;

  var name = nameEl.value.trim();
  var email = emailEl.value.trim().toLowerCase();
  var role = roleEl.value;

  if (!name) { showInviteFormError('Please enter a name.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showInviteFormError('Please enter a valid email address.'); return; }

  var accounts = getAdminAccounts();
  if (accounts.some(function (a) { return String(a.email).toLowerCase() === email; })) {
    showInviteFormError('There is already an admin account (or pending invite) with that email.');
    return;
  }

  var token = generateInviteToken();
  accounts.push({ name: name, email: email, role: role, status: 'pending', inviteToken: token });

  try {
    saveAdminAccounts(accounts);
  } catch (e) {
    showInviteFormError(e && e.message ? e.message : 'Could not save that invite, please try again.');
    return;
  }

  renderAdminTeamList();
  showInviteLinkModal(name, inviteLinkFor(token));
}

function showInviteLinkModal(name, link) {
  openModal({
    title: 'Invite sent to ' + name,
    subtitle: "Email sending isn't wired up yet -- copy this link and send it to them yourself (Slack, text, email, however).",
    bodyHtml:
      '<div class="flex items-center gap-2">' +
        '<input type="text" readonly id="invite-link-box" value="' + escapeHTML(link) + '" onclick="this.select()" class="flex-1 px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono text-dark">' +
        '<button onclick="copyInviteLinkFromBox()" class="press shrink-0 w-10 h-10 rounded-xl bg-brand hover:bg-brand-hover text-white flex items-center justify-center"><i class="fa-solid fa-copy"></i></button>' +
      '</div>' +
      '<p class="text-[11px] text-stone-400 mt-3">This link lets them set their own password and sign in as ' + escapeHTML(name) + '. It only works once.</p>',
    footerHtml: '<button onclick="closeModal()" class="press px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold">Done</button>'
  });
}

function copyInviteLinkFromBox() {
  var box = document.getElementById('invite-link-box');
  if (!box) return;
  box.select();
  copyTextToClipboard(box.value);
  showToast('Invite link copied', 'success');
}

function copyInviteLinkForEmail(email) {
  var acc = getAdminAccounts().find(function (a) { return a.email === email && a.status === 'pending'; });
  if (!acc || !acc.inviteToken) { showToast('Could not find that invite', 'danger'); return; }
  copyTextToClipboard(inviteLinkFor(acc.inviteToken));
  showToast('Invite link copied', 'success');
}

function cancelInvite(email) {
  if (!confirm('Cancel this invite? They will no longer be able to use the link.')) return;
  var accounts = getAdminAccounts().filter(function (a) { return !(a.email === email && a.status === 'pending'); });
  try { saveAdminAccounts(accounts); } catch (e) { showToast(e.message, 'danger'); return; }
  renderAdminTeamList();
  showToast('Invite cancelled', 'success');
}

function deactivateAdmin(email) {
  var me = getLoggedInAdmin();
  if (me && me.email === email) { showToast('You cannot deactivate your own account', 'danger'); return; }
  if (!confirm('Deactivate this admin? They will no longer be able to log in until restored.')) return;
  var accounts = getAdminAccounts();
  var acc = accounts.find(function (a) { return a.email === email; });
  if (!acc) return;
  acc.status = 'deactivated';
  try { saveAdminAccounts(accounts); } catch (e) { showToast(e.message, 'danger'); return; }
  renderAdminTeamList();
  showToast('Admin deactivated', 'success');
}

function restoreAdmin(email) {
  var accounts = getAdminAccounts();
  var acc = accounts.find(function (a) { return a.email === email; });
  if (!acc) return;
  acc.status = 'active';
  try { saveAdminAccounts(accounts); } catch (e) { showToast(e.message, 'danger'); return; }
  renderAdminTeamList();
  showToast('Admin restored', 'success');
}

function removeAdminRosterEntry(email) {
  if (!confirm('Remove this person from the admin team list? This does not delete any account they already created.')) return;
  var accounts = getAdminAccounts().filter(function (a) { return a.email !== email; });
  try { saveAdminAccounts(accounts); } catch (e) { showToast(e.message, 'danger'); return; }
  renderAdminTeamList();
  showToast('Removed', 'success');
}

function adminTeamStatusBadge(status) {
  if (status === 'pending') return '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-widest">Pending</span>';
  if (status === 'deactivated') return '<span class="px-2 py-0.5 rounded-full bg-stone-200 text-stone-500 text-[9px] font-bold uppercase tracking-widest">Deactivated</span>';
  return '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase tracking-widest">Active</span>';
}

function renderAdminTeamList() {
  var list = document.getElementById('admin-team-list');
  if (!list) return;
  var accounts = getAdminAccounts();
  var me = getLoggedInAdmin();

  if (!accounts.length) {
    list.innerHTML = '<div class="p-8 text-center text-xs text-stone-400">No admins yet.</div>';
    return;
  }

  list.innerHTML = accounts.map(function (a) {
    var isMe = !!(me && me.email === a.email);
    var actions = '';
    if (a.status === 'pending') {
      actions =
        '<button onclick="copyInviteLinkForEmail(\'' + a.email.replace(/'/g, "\\'") + '\')" data-perm="manageAdminTeam" class="press px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-dark text-[10px] font-bold">Copy Link</button>' +
        '<button onclick="cancelInvite(\'' + a.email.replace(/'/g, "\\'") + '\')" data-perm="manageAdminTeam" class="press px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold">Cancel</button>';
    } else if (a.status === 'deactivated') {
      actions =
        '<button onclick="restoreAdmin(\'' + a.email.replace(/'/g, "\\'") + '\')" data-perm="manageAdminTeam" class="press px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold">Restore</button>' +
        '<button onclick="removeAdminRosterEntry(\'' + a.email.replace(/'/g, "\\'") + '\')" data-perm="manageAdminTeam" class="press px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold">Remove</button>';
    } else if (!isMe) {
      actions = '<button onclick="deactivateAdmin(\'' + a.email.replace(/'/g, "\\'") + '\')" data-perm="manageAdminTeam" class="press px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold">Deactivate</button>';
    }
    return (
      '<div class="flex items-center justify-between gap-4 px-8 py-5">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<img src="' + getAvatarSrc(a) + '" alt="" class="w-10 h-10 rounded-full object-cover shrink-0">' +
          '<div class="min-w-0">' +
            '<p class="text-xs font-bold text-dark truncate">' + escapeHTML(a.name) + (isMe ? ' <span class="text-stone-400 font-medium">(You)</span>' : '') + '</p>' +
            '<p class="text-[11px] text-stone-400 truncate">' + escapeHTML(a.email) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-3 shrink-0">' +
          '<div class="text-right hidden sm:block">' +
            '<p class="text-[10px] font-bold text-brand uppercase tracking-widest">' + escapeHTML(a.role) + '</p>' +
            adminTeamStatusBadge(a.status) +
          '</div>' +
          '<div class="flex items-center gap-2">' + actions + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  if (typeof applyPermissionGating === 'function') applyPermissionGating();
}
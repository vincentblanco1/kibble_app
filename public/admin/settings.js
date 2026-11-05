document.addEventListener('DOMContentLoaded', () => {
  const themeLightBtn = document.getElementById('themeLightBtn');
  const themeDarkBtn = document.getElementById('themeDarkBtn');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  const disputeReportForm = document.getElementById('disputeReportForm');
  const reportSuccessAlert = document.getElementById('reportSuccessAlert');
  const recentReportsList = document.getElementById('recentReportsList');
  const reportsCountBadge = document.getElementById('reportsCountBadge');

  // 1. Dark Mode Engine
  const savedTheme = localStorage.getItem('kibbleguard_theme') || 'light';

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
      if (themeDarkBtn && themeLightBtn) {
        themeDarkBtn.className = 'flex-1 py-1.5 px-3 rounded-lg font-bold text-[11px] bg-[#45671d] text-white shadow-xs transition-all flex items-center justify-center gap-1.5';
        themeLightBtn.className = 'flex-1 py-1.5 px-3 rounded-lg font-bold text-[11px] text-[#788673] hover:text-[#182811] transition-all flex items-center justify-center gap-1.5';
      }
    } else {
      document.body.classList.remove('dark-theme');
      if (themeDarkBtn && themeLightBtn) {
        themeLightBtn.className = 'flex-1 py-1.5 px-3 rounded-lg font-bold text-[11px] bg-[#45671d] text-white shadow-xs transition-all flex items-center justify-center gap-1.5';
        themeDarkBtn.className = 'flex-1 py-1.5 px-3 rounded-lg font-bold text-[11px] text-[#788673] hover:text-[#182811] transition-all flex items-center justify-center gap-1.5';
      }
    }
  }

  applyTheme(savedTheme);

  themeLightBtn?.addEventListener('click', () => {
    localStorage.setItem('kibbleguard_theme', 'light');
    applyTheme('light');
  });

  themeDarkBtn?.addEventListener('click', () => {
    localStorage.setItem('kibbleguard_theme', 'dark');
    applyTheme('dark');
  });

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
});
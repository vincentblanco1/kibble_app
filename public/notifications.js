document.addEventListener('DOMContentLoaded', () => {
  const DEFAULT_NOTIFICATIONS = [
    {
      id: 'notif-1',
      type: 'warning',
      category: 'hazard',
      icon: 'fa-triangle-exclamation',
      iconColor: 'text-[#ff9800] bg-[#fff8ed] border border-orange-200',
      title: 'Caution: Preservative Flagged',
      message: 'Beggin\' Strips batch #KG-9021 contains BHA. Flagged for Buster (Canine).',
      time: '15m ago',
      read: false,
      link: 'results.html?batch=KG-9021'
    },
    {
      id: 'notif-2',
      type: 'hazard',
      category: 'hazard',
      icon: 'fa-shield-cat',
      iconColor: 'text-purple-600 bg-purple-50 border border-purple-200',
      title: 'Cross-Feeding Warning',
      message: 'Propylene Glycol detected in canine kibble. Strictly lethal if shared with Milo (Cat).',
      time: '2h ago',
      read: false,
      link: 'results.html?batch=KG-9021'
    },
    {
      id: 'notif-3',
      type: 'success',
      category: 'system',
      icon: 'fa-circle-check',
      iconColor: 'text-emerald-600 bg-emerald-50 border border-emerald-200',
      title: 'Database Baseline Synced',
      message: 'Veterinary nutritional rules calibrated against AAFCO & FEDIAF 2026 standards.',
      time: '1d ago',
      read: true,
      link: 'wiki.html'
    },
    {
      id: 'notif-4',
      type: 'hazard',
      category: 'hazard',
      icon: 'fa-skull-crossbones',
      iconColor: 'text-red-600 bg-red-50 border border-red-200',
      title: 'Critical Lethal Sweetener Detected',
      message: 'Dental Care Sweetener Chews batch #KG-8812 contains Xylitol. Strictly fatal to dogs.',
      time: '3d ago',
      read: true,
      link: 'results.html?batch=KG-8812'
    }
  ];

  let notifications = JSON.parse(localStorage.getItem('kibbleguard_notifications')) || DEFAULT_NOTIFICATIONS;

  // --- Header Dropdown Drawer Controls ---
  const notifBtn = document.getElementById('notificationBellBtn');
  const notifDropdown = document.getElementById('notificationDropdown');
  const notifBadge = document.getElementById('notificationBadge');
  const notifList = document.getElementById('notificationListContainer');
  const markAllReadBtn = document.getElementById('markAllReadBtn');

  // --- Dedicated Page Controls (notifications.html) ---
  const fullListContainer = document.getElementById('fullNotificationList');
  const emptyState = document.getElementById('notifEmptyState');
  const countAll = document.getElementById('countAllNotifs');
  const countUnread = document.getElementById('countUnreadNotifs');
  const centerMarkAllBtn = document.getElementById('centerMarkAllReadBtn');
  const centerClearAllBtn = document.getElementById('centerClearAllBtn');
  const pageFilterBtns = document.querySelectorAll('.notif-page-filter-btn');

  let activePageFilter = 'all';

  // ----- Database: alerts live on the server (the browser copy is only a backup) -----
  const kgUser = (function () { try { return JSON.parse(localStorage.getItem('kibbleguard_user')) || {}; } catch (e) { return {}; } })();
  const kgHasAccount = !!kgUser.id;
  const kgUserId = kgUser.id || 1;
  function kgEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  const KG_STYLE = {
    allergy: { icon: 'fa-paw', iconColor: 'text-[#9333ea] bg-[#f4effa] border border-purple-200' },
    danger: { icon: 'fa-skull-crossbones', iconColor: 'text-[#dc2626] bg-red-50 border border-red-200' },
    warning: { icon: 'fa-triangle-exclamation', iconColor: 'text-[#ff9800] bg-[#fff8ed] border border-orange-200' },
    success: { icon: 'fa-circle-check', iconColor: 'text-[#16a34a] bg-emerald-50 border border-emerald-200' },
    info: { icon: 'fa-envelope-open-text', iconColor: 'text-[#45671d] bg-[#f4f8ee] border border-[#d5e3c0]' }
  };
  function kgMap(n) {
    const st = KG_STYLE[n.type] || KG_STYLE.info;
    return { id: String(n.id), type: n.type, category: n.category, icon: st.icon, iconColor: st.iconColor, title: n.title, message: n.message, time: n.time, read: !!n.read, link: n.link || '' };
  }
  function kgSync(action, id) {
    if (!kgHasAccount) return;
    const q = '?user_id=' + encodeURIComponent(kgUserId);
    const routes = {
      'read': ['/api/notifications/' + encodeURIComponent(id) + '/read' + q, 'PATCH'],
      'read-all': ['/api/notifications/read-all' + q, 'PATCH'],
      'delete': ['/api/notifications/' + encodeURIComponent(id) + q, 'DELETE'],
      'clear': ['/api/notifications' + q, 'DELETE']
    };
    const r = routes[action];
    if (r) fetch(r[0], { method: r[1] }).catch(() => {});
  }
  async function kgLoad() {
    if (!kgHasAccount) return;
    try {
      const res = await fetch('/api/notifications?user_id=' + encodeURIComponent(kgUserId));
      if (!res.ok) return;
      notifications = (await res.json()).map(kgMap);
      saveNotifications();
      updateBadgesAndCounters();
      renderDropdown();
      if (fullListContainer) renderFullPage();
      window.dispatchEvent(new Event('kg-notifications-updated'));
    } catch (e) {
      console.warn('Notifications not loaded from the server:', e);
    }
  }
  window.kgRefreshNotifications = kgLoad;

  function saveNotifications() {
    localStorage.setItem('kibbleguard_notifications', JSON.stringify(notifications));
    updateBadgesAndCounters();
  }

  function updateBadgesAndCounters() {
    const unreadCount = notifications.filter(n => !n.read).length;

    // Header badge
    if (notifBadge) {
      if (unreadCount > 0) {
        notifBadge.textContent = unreadCount;
        notifBadge.classList.remove('hidden');
      } else {
        notifBadge.classList.add('hidden');
      }
    }

    // Page counters if on notifications.html
    if (countAll) countAll.textContent = notifications.length;
    if (countUnread) countUnread.textContent = unreadCount;
  }

  // --- Render Header Dropdown Drawer ---
  function renderDropdown() {
    if (!notifList) return;

    if (notifications.length === 0) {
      notifList.innerHTML = `
        <div class="py-8 text-center text-xs text-[#788673]">
          <i class="fa-regular fa-bell-slash text-lg mb-1 block"></i>
          No notifications yet.
        </div>
      `;
      return;
    }

    // Show top 3 in drawer
    notifList.innerHTML = notifications.slice(0, 3).map(n => `
      <div class="p-3 rounded-2xl border ${n.read ? 'bg-white border-[#ebdcd0]' : 'bg-[#fffaf0] border-[#ff9800]/30'} transition-all hover:border-[#45671d]/40 flex items-start gap-3 text-xs relative group" data-id="${n.id}">
        <div class="w-8 h-8 rounded-xl ${n.iconColor} flex items-center justify-center shrink-0 text-sm mt-0.5">
          <i class="fa-solid ${n.icon}"></i>
        </div>
        <div class="flex-1 min-w-0 pr-4">
          <div class="flex items-center justify-between">
            <h4 class="font-extrabold text-[#182811] text-[11.5px] truncate">${kgEsc(n.title)}</h4>
            <span class="text-[9.5px] text-[#788673]">${n.time}</span>
          </div>
          <p class="text-[11px] text-[#788673] leading-snug mt-0.5">${kgEsc(n.message)}</p>
          ${n.link ? `<a href="${n.link}" class="inline-block mt-1.5 font-extrabold text-[10.5px] text-[#45671d] hover:underline">Inspect Details →</a>` : ''}
        </div>
        <button type="button" class="dismiss-drawer-btn absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs" data-id="${n.id}" title="Dismiss">
          ✕
        </button>
      </div>
    `).join('');

    notifList.querySelectorAll('.dismiss-drawer-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        notifications = notifications.filter(n => n.id !== id);
        saveNotifications();
        kgSync('delete', id);
        renderDropdown();
        if (fullListContainer) renderFullPage();
      });
    });
  }

  // --- Render Full Page (notifications.html) ---
  function renderFullPage() {
    if (!fullListContainer) return;

    let filtered = notifications;
    if (activePageFilter === 'unread') {
      filtered = notifications.filter(n => !n.read);
    } else if (activePageFilter === 'hazard') {
      filtered = notifications.filter(n => n.category === 'hazard');
    } else if (activePageFilter === 'system') {
      filtered = notifications.filter(n => n.category === 'system');
    }

    if (filtered.length === 0) {
      fullListContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    fullListContainer.innerHTML = filtered.map(n => `
      <div class="tactile-card p-5 ${n.read ? 'bg-white' : 'bg-[#fffdfa] border-l-4 border-l-[#ff9800]'} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-[#45671d]/40 group" data-id="${n.id}">
        <div class="flex items-start gap-4 flex-1">
          <div class="w-10 h-10 rounded-2xl ${n.iconColor} flex items-center justify-center shrink-0 text-base shadow-xs mt-0.5">
            <i class="fa-solid ${n.icon}"></i>
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h3 class="text-sm font-extrabold text-[#182811]">${kgEsc(n.title)}</h3>
              ${!n.read ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-[#b45309] font-extrabold text-[9.5px] uppercase">New Alert</span>' : ''}
              <span class="text-[11px] font-semibold text-[#788673]">• ${n.time}</span>
            </div>
            <p class="text-xs text-[#586754] leading-relaxed max-w-3xl">${kgEsc(n.message)}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 self-end sm:self-center shrink-0">
          ${n.link ? `<a href="${n.link}" class="px-4 py-2 bg-white border border-[#ebdcd0] hover:border-[#45671d] text-[#182811] hover:text-[#45671d] rounded-xl text-xs font-bold transition-all shadow-2xs">Inspect</a>` : ''}
          ${!n.read ? `<button type="button" class="mark-single-read-btn px-3 py-2 bg-[#fbf9f6] border border-[#ebdcd0] hover:bg-slate-100 text-[#182811] rounded-xl text-xs font-bold" data-id="${n.id}" title="Mark Read"><i class="fa-solid fa-check text-xs"></i></button>` : ''}
          <button type="button" class="delete-single-btn px-3 py-2 text-slate-400 hover:text-red-600 rounded-xl text-xs transition-colors" data-id="${n.id}" title="Delete Notification">
            <i class="fa-solid fa-trash text-xs"></i>
          </button>
        </div>
      </div>
    `).join('');

    // Attach listeners for single mark read
    fullListContainer.querySelectorAll('.mark-single-read-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const target = notifications.find(n => n.id === id);
        if (target) target.read = true;
        saveNotifications();
        kgSync('read', id);
        renderDropdown();
        renderFullPage();
      });
    });

    // Attach listeners for single delete
    fullListContainer.querySelectorAll('.delete-single-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        notifications = notifications.filter(n => n.id !== id);
        saveNotifications();
        kgSync('delete', id);
        renderDropdown();
        renderFullPage();
      });
    });
  }

  // --- Dropdown Event Listeners ---
  notifBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!notifDropdown) return;
    notifDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (notifDropdown && !notifDropdown.contains(e.target) && !notifBtn?.contains(e.target)) {
      notifDropdown.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifDropdown && !notifDropdown.classList.contains('hidden')) {
      notifDropdown.classList.add('hidden');
    }
  });

  markAllReadBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifications = notifications.map(n => ({ ...n, read: true }));
    saveNotifications();
    kgSync('read-all');
    renderDropdown();
    if (fullListContainer) renderFullPage();
  });

  // --- Dedicated Page Event Listeners ---
  centerMarkAllBtn?.addEventListener('click', () => {
    notifications = notifications.map(n => ({ ...n, read: true }));
    saveNotifications();
    kgSync('read-all');
    renderDropdown();
    renderFullPage();
  });

  centerClearAllBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all notification history?')) {
      notifications = [];
      saveNotifications();
      kgSync('clear');
      renderDropdown();
      renderFullPage();
    }
  });

  pageFilterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const button = e.currentTarget;
      activePageFilter = button.getAttribute('data-filter');

      pageFilterBtns.forEach(b => {
        b.className = 'notif-page-filter-btn px-4 py-2 rounded-full text-xs font-bold text-[#788673] bg-[#fbf9f6] border border-[#ebdcd0] hover:text-[#182811] transition-all shrink-0';
      });

      button.className = 'notif-page-filter-btn px-4 py-2 rounded-full text-xs font-extrabold bg-[#45671d] text-white transition-all shrink-0 shadow-xs';

      renderFullPage();
    });
  });

  // Initial Run
  updateBadgesAndCounters();
  renderDropdown();
  if (fullListContainer) renderFullPage();
  kgLoad();
});
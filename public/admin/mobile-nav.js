// Shared bottom-dock + "More" sheet for every mobile-admin page (mobile-dashboard.html,
// mobile-ocr-scans.html, etc.) -- one definition here instead of duplicating the same
// markup nine times, so adding/renaming a section only has to happen in one place.
//
// Call renderAdminMobileNav('dashboard') (etc.) from an inline <script> placed right
// after </main> and BEFORE the page's own <script src="dashboard.js"> tag, so the dock's
// <a href="..."> links already exist in the DOM by the time that page's init calls
// applyRoleState() -- renderNavBadges() and applyNavVisibility() in app.js look for
// those links (by href) to attach the same unread-count dots and role-based hide/show
// the desktop sidebar gets.
//
// The 4 dock slots are the sections most likely to be checked from a phone (overview,
// ingredient lookups, scan/triage verification, users & pets); the other 5 live in the
// "More" sheet.
var ADMIN_MOBILE_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', href: 'mobile-dashboard.html', dock: true },
  { key: 'ingredients', label: 'Ingredients', icon: 'fa-dna', href: 'mobile-ingredient-database.html', dock: true },
  { key: 'scans', label: 'Scans', icon: 'fa-camera-retro', href: 'mobile-ocr-scans.html', dock: true },
  { key: 'users', label: 'Users', icon: 'fa-users', href: 'mobile-users-pets.html', dock: true },
  { key: 'safety-rules', label: 'Safety Rules', icon: 'fa-shield-halved', href: 'mobile-safety-rules.html', dock: false },
  { key: 'safety-feed', label: 'Safety Feed', icon: 'fa-bullhorn', href: 'mobile-safety-feed.html', dock: false },
  { key: 'inquiries', label: 'Inquiries', icon: 'fa-headset', href: 'mobile-inquiries.html', dock: false },
  { key: 'activity-log', label: 'Activity Log', icon: 'fa-clock-rotate-left', href: 'mobile-activity-log.html', dock: false },
  { key: 'settings', label: 'Settings', icon: 'fa-gear', href: 'mobile-settings.html', dock: false }
];

function renderAdminMobileNav(activeKey) {
  if (document.getElementById('admin-mobile-dock')) return;
  var dockSections = ADMIN_MOBILE_SECTIONS.filter(function (s) { return s.dock; });
  var sheetSections = ADMIN_MOBILE_SECTIONS.filter(function (s) { return !s.dock; });
  var activeIsInSheet = sheetSections.some(function (s) { return s.key === activeKey; });

  var dock = document.createElement('nav');
  dock.id = 'admin-mobile-dock';
  dock.className = 'admin-mobile-dock';
  dock.setAttribute('aria-label', 'Admin sections');
  dock.innerHTML = dockSections.map(function (s) {
    var active = s.key === activeKey;
    return '<a href="' + s.href + '" class="admin-dock-item' + (active ? ' active' : '') + '"' +
      (active ? ' aria-current="page"' : '') + '><i class="fa-solid ' + s.icon + '"></i><span>' + s.label + '</span></a>';
  }).join('') +
    '<button type="button" id="admin-more-btn" onclick="openAdminMoreSheet()" class="admin-dock-item' + (activeIsInSheet ? ' active' : '') + '" aria-haspopup="true" aria-expanded="false">' +
    '<i class="fa-solid fa-ellipsis"></i><span>More</span></button>';
  document.body.appendChild(dock);

  var backdrop = document.createElement('div');
  backdrop.id = 'admin-more-backdrop';
  backdrop.className = 'hidden';
  backdrop.onclick = function () { closeAdminMoreSheet(); };
  document.body.appendChild(backdrop);

  var sheet = document.createElement('div');
  sheet.id = 'admin-more-sheet';
  sheet.className = 'hidden';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'More admin sections');
  sheet.innerHTML = '<div class="admin-more-handle"></div>' +
    sheetSections.map(function (s) {
      var active = s.key === activeKey;
      return '<a href="' + s.href + '" class="admin-more-link"' + (active ? ' aria-current="page" style="color:#45671D"' : '') + '>' +
        '<i class="fa-solid ' + s.icon + '"></i>' + s.label + '</a>';
    }).join('');
  document.body.appendChild(sheet);
}

function openAdminMoreSheet() {
  var backdrop = document.getElementById('admin-more-backdrop');
  var sheet = document.getElementById('admin-more-sheet');
  var btn = document.getElementById('admin-more-btn');
  if (!backdrop || !sheet) return;
  backdrop.classList.remove('hidden');
  sheet.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeAdminMoreSheet() {
  var backdrop = document.getElementById('admin-more-backdrop');
  var sheet = document.getElementById('admin-more-sheet');
  var btn = document.getElementById('admin-more-btn');
  if (!backdrop || !sheet) return;
  backdrop.classList.add('hidden');
  sheet.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

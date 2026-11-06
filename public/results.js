/**
 * KibbleGuard Diagnostic Inspection Console Engine
 * Handles WebRTC live stream, pulsing scanning laser, clean snapshot capture & retake lifecycle,
 * rock-solid species risk evaluation layout, interactive finding drill-down drawer, and notification hub.
 */
document.addEventListener('DOMContentLoaded', () => {
  let activeStream = null;

  // Viewport & Camera DOM Elements
  const packagingBoxTrigger = document.getElementById('packagingBoxTrigger');
  const headerCameraLink = document.getElementById('headerCameraLink');
  const liveVideoFeed = document.getElementById('liveVideoFeed');
  const capturedImagePreview = document.getElementById('capturedImagePreview');
  const snapshotCanvas = document.getElementById('snapshotCanvas');
  const ocrLaserBeam = document.getElementById('ocrLaserBeam');
  const staticViewportGraphic = document.getElementById('staticViewportGraphic');
  const tapPillContainer = document.getElementById('tapPillContainer');
  const cameraControlsOverlay = document.getElementById('cameraControlsOverlay');
  const cancelCameraBtn = document.getElementById('cancelCameraBtn');
  const takeSnapshotBtn = document.getElementById('takeSnapshotBtn');
  const retakeCameraBtn = document.getElementById('retakeCameraBtn');
  const labelUploadInput = document.getElementById('labelUploadInput');

  // Species Selection Elements
  const targetBusterOption = document.getElementById('targetBusterOption');
  const targetMiloOption = document.getElementById('targetMiloOption');
  const busterIndicator = document.getElementById('busterIndicator');
  const miloIndicator = document.getElementById('miloIndicator');

  // Diagnostic Indicators
  const scoreNumberDisplay = document.getElementById('scoreNumberDisplay');
  const scoreRiskLabel = document.getElementById('scoreRiskLabel');
  const scoreSvgGauge = document.getElementById('scoreSvgGauge');
  const cautionPillBadge = document.getElementById('cautionPillBadge');
  const verdictHeadline = document.getElementById('verdictHeadline');
  const verdictSubtext = document.getElementById('verdictSubtext');
  const tokenCountsRow = document.getElementById('tokenCountsRow');
  const pgFindingCard = document.getElementById('pgFindingCard');
  const pgBadge = document.getElementById('pgBadge');
  const pgBodyText = document.getElementById('pgBodyText');
  const pgNoteText = document.getElementById('pgNoteText');
  const filterFindingsBtn = document.getElementById('filterFindingsBtn');

  // Notification Elements
  const notifBtn = document.getElementById('notificationBellBtn');
  const notifDropdown = document.getElementById('notificationDropdown');
  const notifBadge = document.getElementById('notificationBadge');
  const notifList = document.getElementById('notificationListContainer');
  const markAllReadBtn = document.getElementById('markAllReadBtn');

  // ===================================================
  // 1. Universal Notification Drawer Functionality
  // ===================================================
  const DEFAULT_NOTIFICATIONS = [
    {
      id: 'notif-1',
      title: 'Caution: Preservative Flagged',
      time: '15m ago',
      message: 'Beggin\' Strips batch #KG-9021 contains BHA. Flagged for Buster (Canine).',
      read: false,
      icon: 'fa-triangle-exclamation',
      iconColor: 'text-[#ff9800] bg-[#fff8ed] border border-orange-200'
    },
    {
      id: 'notif-2',
      title: 'Cross-Feeding Warning',
      time: '2h ago',
      message: 'Propylene Glycol detected in canine kibble. Strictly lethal if shared with Milo (Cat).',
      read: false,
      icon: 'fa-shield-cat',
      iconColor: 'text-purple-600 bg-purple-50 border border-purple-200'
    }
  ];

  function getNotifications() {
    try {
      const stored = localStorage.getItem('kibbleguard_notifications');
      return stored ? JSON.parse(stored) : DEFAULT_NOTIFICATIONS;
    } catch (e) {
      return DEFAULT_NOTIFICATIONS;
    }
  }

  let notifications = getNotifications();

  function syncNotificationUI() {
    const unread = notifications.filter(n => !n.read).length;
    if (notifBadge) {
      if (unread > 0) {
        notifBadge.textContent = unread;
        notifBadge.style.display = 'flex';
        notifBadge.classList.remove('hidden');
      } else {
        notifBadge.style.display = 'none';
        notifBadge.classList.add('hidden');
      }
    }

    if (notifList) {
      if (notifications.length === 0) {
        notifList.innerHTML = `<div class="py-6 text-center text-xs text-[#788673]">No notifications.</div>`;
        return;
      }
      notifList.innerHTML = notifications.slice(0, 4).map(n => `
        <div class="p-3 rounded-2xl border ${n.read ? 'bg-white border-[#ebdcd0]' : 'bg-[#fffaf0] border-[#ff9800]/30'} transition-all flex items-start gap-3 text-xs">
          <div class="w-8 h-8 rounded-xl ${n.iconColor} flex items-center justify-center shrink-0 text-sm mt-0.5">
            <i class="fa-solid ${n.icon}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <h4 class="font-extrabold text-[#182811] text-[11.5px] truncate">${n.title}</h4>
              <span class="text-[9.5px] text-[#788673]">${n.time}</span>
            </div>
            <p class="text-[11px] text-[#788673] leading-snug mt-0.5">${n.message}</p>
          </div>
        </div>
      `).join('');
    }
  }

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isClosed = notifDropdown.classList.contains('hidden') || notifDropdown.style.display === 'none';
      if (isClosed) {
        notifDropdown.classList.remove('hidden');
        notifDropdown.style.display = 'block';
      } else {
        notifDropdown.classList.add('hidden');
        notifDropdown.style.display = 'none';
      }
    });

    document.addEventListener('click', (e) => {
      if (notifDropdown && !notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
        notifDropdown.classList.add('hidden');
        notifDropdown.style.display = 'none';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && notifDropdown) {
        notifDropdown.classList.add('hidden');
        notifDropdown.style.display = 'none';
      }
    });
  }

  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      notifications = notifications.map(n => ({ ...n, read: true }));
      try {
        localStorage.setItem('kibbleguard_notifications', JSON.stringify(notifications));
      } catch (err) {}
      syncNotificationUI();
    });
  }

  syncNotificationUI();

  // ===================================================
  // 2. WebRTC Live Camera & Clean Snapshot Capture
  // ===================================================
  async function startCamera(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (activeStream) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Camera API is not supported in this browser or requires a secure connection (localhost / HTTPS).");
      return;
    }

    try {
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      if (liveVideoFeed) {
        liveVideoFeed.srcObject = activeStream;
        liveVideoFeed.classList.remove('hidden');
      }

      // Hide previous frozen image if re-opening camera
      if (capturedImagePreview) {
        capturedImagePreview.classList.add('hidden');
      }

      // Show pulsing optical laser sweep line
      if (ocrLaserBeam) {
        ocrLaserBeam.classList.remove('hidden');
      }

      // Hide static specimen text during active camera stream
      if (staticViewportGraphic) {
        staticViewportGraphic.classList.add('hidden');
      }

      // Show bottom shutter controls with Cancel and Capture Photo
      if (cameraControlsOverlay) {
        cameraControlsOverlay.classList.remove('hidden');
        cameraControlsOverlay.classList.add('flex');
      }
      takeSnapshotBtn?.classList.remove('hidden');
      retakeCameraBtn?.classList.add('hidden');

    } catch (err) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert("Camera permission was denied. Please allow access via your browser address bar.");
      } else {
        alert("Unable to open camera: " + err.message);
      }
    }
  }

  function stopCamera(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }

    if (liveVideoFeed) {
      liveVideoFeed.srcObject = null;
      liveVideoFeed.classList.add('hidden');
    }

    // Hide laser beam
    if (ocrLaserBeam) {
      ocrLaserBeam.classList.add('hidden');
    }

    // If an image was captured, keep it visible; otherwise restore static specimen graphic
    if (capturedImagePreview && !capturedImagePreview.classList.contains('hidden')) {
      if (staticViewportGraphic) staticViewportGraphic.classList.add('hidden');
      if (cameraControlsOverlay) {
        cameraControlsOverlay.classList.remove('hidden');
        cameraControlsOverlay.classList.add('flex');
      }
      takeSnapshotBtn?.classList.add('hidden');
      retakeCameraBtn?.classList.remove('hidden');
    } else {
      if (staticViewportGraphic) staticViewportGraphic.classList.remove('hidden');
      if (cameraControlsOverlay) {
        cameraControlsOverlay.classList.add('hidden');
        cameraControlsOverlay.classList.remove('flex');
      }
    }
  }

  function captureSnapshot(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!activeStream || !liveVideoFeed || !snapshotCanvas) return;

    // 1. Shutter flash effect
    liveVideoFeed.classList.add('brightness-150');
    setTimeout(() => liveVideoFeed.classList.remove('brightness-150'), 120);

    // 2. Draw frame onto canvas
    const width = liveVideoFeed.videoWidth || 1280;
    const height = liveVideoFeed.videoHeight || 720;
    snapshotCanvas.width = width;
    snapshotCanvas.height = height;

    const ctx = snapshotCanvas.getContext('2d');
    ctx.drawImage(liveVideoFeed, 0, 0, width, height);

    // 3. Convert to Data URL and show clean photo without text clutter
    const capturedDataUrl = snapshotCanvas.toDataURL('image/jpeg', 0.92);
    if (capturedImagePreview) {
      capturedImagePreview.src = capturedDataUrl;
      capturedImagePreview.classList.remove('hidden');
    }

    // 4. Shut down camera hardware stream & hide laser
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }
    liveVideoFeed.srcObject = null;
    liveVideoFeed.classList.add('hidden');

    if (ocrLaserBeam) {
      ocrLaserBeam.classList.add('hidden');
    }

    // 5. Keep specimen text overlay hidden so preview remains clean
    if (staticViewportGraphic) {
      staticViewportGraphic.classList.add('hidden');
    }

    // 6. Keep bottom bar visible with Cancel and orange Retake button
    if (cameraControlsOverlay) {
      cameraControlsOverlay.classList.remove('hidden');
      cameraControlsOverlay.classList.add('flex');
    }
    takeSnapshotBtn?.classList.add('hidden');
    retakeCameraBtn?.classList.remove('hidden');
  }

  // Camera Event Listeners
  packagingBoxTrigger?.addEventListener('click', (e) => {
    if (!activeStream && !e.target.closest('#cameraControlsOverlay')) {
      startCamera(e);
    }
  });

  headerCameraLink?.addEventListener('click', startCamera);
  cancelCameraBtn?.addEventListener('click', (e) => {
    if (capturedImagePreview) {
      capturedImagePreview.src = '';
      capturedImagePreview.classList.add('hidden');
    }
    if (tapPillContainer) {
      tapPillContainer.innerHTML = '<i class="fa-solid fa-camera mr-1"></i> Tap to Open Camera Viewfinder';
    }
    stopCamera(e);
  });
  takeSnapshotBtn?.addEventListener('click', captureSnapshot);

  // Retake Button Listener
  retakeCameraBtn?.addEventListener('click', (e) => {
    if (capturedImagePreview) {
      capturedImagePreview.classList.add('hidden');
    }
    startCamera(e);
  });

  // Packaging Label File Upload
  labelUploadInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (capturedImagePreview) {
          capturedImagePreview.src = evt.target.result;
          capturedImagePreview.classList.remove('hidden');
        }
        if (liveVideoFeed) liveVideoFeed.classList.add('hidden');
        if (ocrLaserBeam) ocrLaserBeam.classList.add('hidden');
        if (staticViewportGraphic) staticViewportGraphic.classList.add('hidden');
        if (cameraControlsOverlay) {
          cameraControlsOverlay.classList.remove('hidden');
          cameraControlsOverlay.classList.add('flex');
        }
        takeSnapshotBtn?.classList.add('hidden');
        retakeCameraBtn?.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  // ===================================================
  // 3. Species Switcher (Buster vs. Milo) - Fixed Layout
  // ===================================================
  function setSpecies(species) {
    if (species === 'buster') {
      // Buster Active
      targetBusterOption.className = 'w-full p-3.5 rounded-2xl border-2 border-[#ff9800] bg-[#fff8ed] flex items-center justify-between cursor-pointer transition-all';
      if (busterIndicator) busterIndicator.className = 'w-4 h-4 rounded-full border-4 border-[#ff9800] bg-white shrink-0 ml-3';

      // Milo Inactive
      targetMiloOption.className = 'w-full p-3.5 rounded-2xl border border-[#ebdcd0] bg-white opacity-75 hover:opacity-100 flex items-center justify-between cursor-pointer transition-all';
      if (miloIndicator) miloIndicator.className = 'w-4 h-4 rounded-full border-2 border-slate-300 shrink-0 ml-3';

      // Score: 64 Moderate Risk
      if (scoreNumberDisplay) scoreNumberDisplay.textContent = '64';
      if (scoreRiskLabel) {
        scoreRiskLabel.textContent = 'Moderate Risk';
        scoreRiskLabel.className = 'text-[7.5px] font-extrabold uppercase tracking-wider text-[#ff9800]';
      }
      if (scoreSvgGauge) {
        scoreSvgGauge.setAttribute('stroke', '#ff9800');
        scoreSvgGauge.style.strokeDashoffset = '90';
      }
      if (cautionPillBadge) {
        cautionPillBadge.textContent = '⚠️ Caution Flag';
        cautionPillBadge.className = 'px-2.5 py-1 rounded bg-[#fff3e0] text-[#b45309] font-extrabold text-[10.5px] uppercase border border-[#f59e0b] inline-block';
      }
      if (verdictHeadline) verdictHeadline.textContent = 'Contains Flagged Synthetic Antioxidants & Preservatives';
      if (verdictSubtext) verdictSubtext.textContent = 'The rule-engine matched 2 flagged additives against canine veterinary toxicological records.';
      
      if (tokenCountsRow) {
        tokenCountsRow.innerHTML = `
          <span class="text-xs font-bold text-[#16a34a] flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#16a34a]"></span> 18 Safe Tokens</span>
          <span class="text-xs font-bold text-[#ff9800] flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#ff9800]"></span> 2 Caution Tokens</span>
          <span class="text-xs font-bold text-[#dc2626] flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#dc2626]"></span> 0 Lethal Toxins</span>
        `;
      }

      // PG Finding Card (Caution for dogs)
      if (pgFindingCard) pgFindingCard.className = 'tactile-card p-4 border-l-4 border-l-[#ff9800] flex items-start gap-4 diagnostic-item cursor-pointer hover:border-[#45671d] transition-all group';
      if (pgBadge) {
        pgBadge.textContent = 'CAUTION';
        pgBadge.className = 'px-2 py-0.5 rounded bg-orange-100 text-[#b45309] font-extrabold text-[9.5px]';
      }
      if (pgBodyText) pgBodyText.textContent = 'Permitted in moderate thresholds for canines; strictly lethal and prohibited for felines (causes Heinz body anemia).';
      if (pgNoteText) {
        pgNoteText.textContent = 'Cross-Species Note: If shared with Milo (Cat), do NOT feed.';
        pgNoteText.className = 'text-[10.5px] font-bold text-[#ba7f57]';
      }

    } else {
      // Milo Active
      targetMiloOption.className = 'w-full p-3.5 rounded-2xl border-2 border-purple-500 bg-purple-50/40 flex items-center justify-between cursor-pointer transition-all';
      if (miloIndicator) miloIndicator.className = 'w-4 h-4 rounded-full border-4 border-purple-500 bg-white shrink-0 ml-3';

      // Buster Inactive
      targetBusterOption.className = 'w-full p-3.5 rounded-2xl border border-[#ebdcd0] bg-white opacity-75 hover:opacity-100 flex items-center justify-between cursor-pointer transition-all';
      if (busterIndicator) busterIndicator.className = 'w-4 h-4 rounded-full border-2 border-slate-300 shrink-0 ml-3';

      // Score: 92 Lethal Risk for Milo
      if (scoreNumberDisplay) scoreNumberDisplay.textContent = '92';
      if (scoreRiskLabel) {
        scoreRiskLabel.textContent = 'Critical Hazard';
        scoreRiskLabel.className = 'text-[7.5px] font-extrabold uppercase tracking-wider text-red-600';
      }
      if (scoreSvgGauge) {
        scoreSvgGauge.setAttribute('stroke', '#dc2626');
        scoreSvgGauge.style.strokeDashoffset = '20';
      }
      if (cautionPillBadge) {
        cautionPillBadge.textContent = '🚨 Prohibited for Felines';
        cautionPillBadge.className = 'px-2.5 py-1 rounded bg-red-100 text-red-800 font-extrabold text-[10.5px] uppercase border border-red-300 inline-block';
      }
      if (verdictHeadline) verdictHeadline.textContent = 'Formula Contains Additives Strictly Fatal to Cats';
      if (verdictSubtext) verdictSubtext.textContent = 'Detected Propylene Glycol. Cats lack glucuronidation pathways, triggering acute Heinz body anemia.';

      if (tokenCountsRow) {
        tokenCountsRow.innerHTML = `
          <span class="text-xs font-bold text-[#16a34a] flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#16a34a]"></span> 17 Safe Tokens</span>
          <span class="text-xs font-bold text-[#ff9800] flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#ff9800]"></span> 1 Caution Token</span>
          <span class="text-xs font-bold text-[#dc2626] flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#dc2626]"></span> 1 Lethal Hazard</span>
        `;
      }

      // PG Finding Card (Fatal for cats)
      if (pgFindingCard) pgFindingCard.className = 'tactile-card p-4 border-l-4 border-l-red-600 flex items-start gap-4 diagnostic-item bg-red-50/20 cursor-pointer hover:border-red-600 transition-all group';
      if (pgBadge) {
        pgBadge.textContent = 'FATAL HAZARD';
        pgBadge.className = 'px-2 py-0.5 rounded bg-red-100 text-red-800 font-extrabold text-[9.5px] animate-pulse';
      }
      if (pgBodyText) pgBodyText.textContent = 'Strictly prohibited by FDA/FEDIAF for felines. Causes severe oxidative damage to red blood cells and hemolytic anemia.';
      if (pgNoteText) {
        pgNoteText.textContent = 'CRITICAL WARNING: NEVER feed this product to Milo under any circumstances.';
        pgNoteText.className = 'text-[10.5px] font-black text-red-700';
      }
    }
  }

  targetBusterOption?.addEventListener('click', () => setSpecies('buster'));
  targetMiloOption?.addEventListener('click', () => setSpecies('milo'));

  // ===================================================
  // 4. Hazard Level Filter
  // ===================================================
  let currentFilter = 'all';
  if (filterFindingsBtn) {
    filterFindingsBtn.addEventListener('click', () => {
      const items = document.querySelectorAll('.diagnostic-item');
      if (currentFilter === 'all') {
        currentFilter = 'caution';
        filterFindingsBtn.textContent = 'Showing: Caution Only ▾';
        items.forEach(el => el.style.display = el.getAttribute('data-hazard') === 'caution' ? '' : 'none');
      } else if (currentFilter === 'caution') {
        currentFilter = 'safe';
        filterFindingsBtn.textContent = 'Showing: Safe Only ▾';
        items.forEach(el => el.style.display = el.getAttribute('data-hazard') === 'safe' ? '' : 'none');
      } else {
        currentFilter = 'all';
        filterFindingsBtn.textContent = 'Filter by Hazard Level ▾';
        items.forEach(el => el.style.display = '');
      }
    });
  }

  // ===================================================
  // 5. Interactive Finding Detail Slide-Over Drawer
  // ===================================================
  // ---- Ingredient database cache (populated from Supabase API) ----
  const FINDINGS_DATABASE = {};
  let _dbIngredientsLoaded = false;
  // Desktop and mobile share this file; point "Inspect Full Dossier" links at whichever
  // wiki page matches the page currently loaded.
  const WIKI_PAGE = /mobile-/i.test(window.location.pathname) ? 'mobile-wiki.html' : 'wiki.html';

  // Normalize a name for matching: lowercase, trim, collapse whitespace,
  // strip trailing punctuation/parentheticals so DB values with slightly
  // different formatting (trailing spaces, "Potato " vs "potato", etc.)
  // still match OCR-extracted ingredient names.
  function _normalizeIngredientName(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')   // drop parenthetical notes e.g. "Potato (Source of Fiber)"
      .replace(/[^a-z0-9%\s-]/g, ' ') // strip punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Fetch all ingredients from the wiki-ingredients API and build a lookup cache.
  // Each entry is keyed by the lowercase primary_name so drawerEntry() can match scan results.
  async function _loadIngredientDB() {
    if (_dbIngredientsLoaded) return;
    try {
      const res = await fetch('/api/wiki-ingredients');
      if (!res.ok) throw new Error('API ' + res.status);
      const data = await res.json();
      const dogList = data.dog || [];
      const catList = data.cat || [];
      const dogMap = {};
      dogList.forEach(function (d) { dogMap[d.ingredient_id] = d; });
      const catMap = {};
      catList.forEach(function (c) { catMap[c.ingredient_id] = c; });
      const allIds = new Set([...Object.keys(dogMap), ...Object.keys(catMap)]);
      allIds.forEach(function (id) {
        const dog = dogMap[id] || null;
        const cat = catMap[id] || null;
        const primary = dog || cat;
        const severity = Math.max(dog ? dog.severity_score : 0, cat ? cat.severity_score : 0);
        const dogRisk = (dog ? dog.risk : 'safe').toLowerCase();
        const catRisk = (cat ? cat.risk : 'safe').toLowerCase();

        function badgeCls(risk) {
          var r = (risk || '').toLowerCase();
          if (r === 'toxic' || r === 'highly toxic') return 'bg-red-100 text-red-700';
          if (r === 'caution') return 'bg-orange-100 text-[#b45309]';
          return 'bg-emerald-100 text-[#15803d]';
        }
        function badgeWord(risk) {
          var r = (risk || '').toLowerCase();
          if (r === 'toxic' || r === 'highly toxic') return 'TOXIC';
          if (r === 'caution') return 'CAUTION';
          return 'SAFE';
        }

        var overallBadge = severity >= 70 ? badgeCls('toxic') : (severity >= 30 ? badgeCls('caution') : badgeCls('safe'));
        var overallWord = severity >= 70 ? 'TOXIC' : (severity >= 30 ? 'CAUTION' : 'SAFE');

        var entry = {
          title: primary.primary_name,
          category: primary.category || 'Ingredient',
          aliases: primary.aliases || '',
          badge: overallWord,
          badgeClass: overallBadge,
          severity_score: severity,
          mechanism: (dog ? dog.notes : '') || (cat ? cat.notes : '') || 'No detailed notes available.',
          canine: (dog ? dog.notes : '') || 'No canine-specific data available.',
          feline: (cat ? cat.notes : '') || 'No feline-specific data available.',
          alternative: (dog ? dog.emergency_action : '') || (cat ? cat.emergency_action : '') || 'No alternative suggested.',
          wikiSearch: WIKI_PAGE + '?search=' + encodeURIComponent(primary.primary_name),
          clinical_symptoms: (dog ? dog.clinical_symptoms : '') || (cat ? cat.clinical_symptoms : '') || '',
          dosage: (dog ? dog.dosage : '') || (cat ? cat.dosage : '') || '',
          // Per-species breakdown for the full drill-down drawer
          dog_risk: dogRisk,
          cat_risk: catRisk,
          dog_risk_word: badgeWord(dogRisk),
          cat_risk_word: badgeWord(catRisk),
          dog_risk_badge: badgeCls(dogRisk),
          cat_risk_badge: badgeCls(catRisk),
          dog_clinical: dog ? (dog.clinical_symptoms || '') : '',
          cat_clinical: cat ? (cat.clinical_symptoms || '') : '',
          dog_dosage: dog ? (dog.dosage || '') : '',
          cat_dosage: cat ? (cat.dosage || '') : '',
          dog_emergency: dog ? (dog.emergency_action || '') : '',
          cat_emergency: cat ? (cat.emergency_action || '') : '',
          emergency_action: (dog ? dog.emergency_action : '') || (cat ? cat.emergency_action : '') || ''
        };

        // Key by ingredient_id
        FINDINGS_DATABASE[id] = entry;
        // Also key by normalized primary_name for easy scan-result matching
        var normName = _normalizeIngredientName(primary.primary_name);
        if (normName) FINDINGS_DATABASE[normName] = entry;
        // Also key by normalized aliases
        var aliases = primary.aliases || '';
        aliases.split(',').forEach(function (a) {
          var normAlias = _normalizeIngredientName(a);
          if (normAlias) FINDINGS_DATABASE[normAlias] = entry;
        });
      });
      _dbIngredientsLoaded = true;
      console.log('[results] Ingredient DB loaded:', Object.keys(FINDINGS_DATABASE).length, 'lookup keys');
    } catch (err) {
      console.error('[results] Failed to load ingredient DB:', err.message);
    }
  }

  // Start loading immediately
  _loadIngredientDB();

  const drawer = document.getElementById('findingDetailDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const closeDrawerBtn2 = document.getElementById('closeDrawerBtn2');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerCategory = document.getElementById('drawerCategory');
  const drawerAliases = document.getElementById('drawerAliases');
  const drawerBadge = document.getElementById('drawerBadge');
  const drawerScoreBadge = document.getElementById('drawerScoreBadge');
  const drawerMechanism = document.getElementById('drawerMechanism');
  const drawerCanine = document.getElementById('drawerCanine');
  const drawerCanineClinical = document.getElementById('drawerCanineClinical');
  const drawerCanineDosage = document.getElementById('drawerCanineDosage');
  const drawerCanineRiskBadge = document.getElementById('drawerCanineRiskBadge');
  const drawerFeline = document.getElementById('drawerFeline');
  const drawerFelineClinical = document.getElementById('drawerFelineClinical');
  const drawerFelineDosage = document.getElementById('drawerFelineDosage');
  const drawerFelineRiskBadge = document.getElementById('drawerFelineRiskBadge');
  const drawerEmergencySection = document.getElementById('drawerEmergencySection');
  const drawerEmergency = document.getElementById('drawerEmergency');
  const drawerAlternativeSection = document.getElementById('drawerAlternativeSection');
  const drawerAlternative = document.getElementById('drawerAlternative');
  const drawerWikiLink = document.getElementById('drawerWikiLink');

  // Shared renderer: populates every field of the drawer from a FINDINGS_DATABASE-shaped entry
  function populateDrawer(data) {
    if (!data || !drawer) return;

    drawerTitle.textContent = data.title;
    drawerCategory.textContent = data.category;
    drawerBadge.textContent = data.badge;
    drawerBadge.className = `px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${data.badgeClass}`;

    if (drawerAliases) {
      if (data.aliases) {
        drawerAliases.textContent = data.aliases;
        drawerAliases.classList.remove('hidden');
      } else {
        drawerAliases.classList.add('hidden');
      }
    }

    if (drawerScoreBadge) {
      if (data.severity_score !== undefined && data.severity_score !== null) {
        drawerScoreBadge.textContent = 'Score: ' + data.severity_score;
        drawerScoreBadge.classList.remove('hidden');
      } else {
        drawerScoreBadge.classList.add('hidden');
      }
    }

    drawerMechanism.textContent = data.mechanism;

    // Canine block
    drawerCanine.textContent = data.canine;
    if (drawerCanineRiskBadge) {
      if (data.dog_risk_word) {
        drawerCanineRiskBadge.textContent = data.dog_risk_word;
        drawerCanineRiskBadge.className = `ml-auto px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${data.dog_risk_badge || 'bg-slate-100 text-slate-700'}`;
      } else {
        drawerCanineRiskBadge.classList.add('hidden');
      }
    }
    if (drawerCanineClinical) {
      if (data.dog_clinical) {
        drawerCanineClinical.textContent = 'Clinical symptoms: ' + data.dog_clinical;
        drawerCanineClinical.classList.remove('hidden');
      } else {
        drawerCanineClinical.classList.add('hidden');
      }
    }
    if (drawerCanineDosage) {
      if (data.dog_dosage) {
        drawerCanineDosage.textContent = 'Dosage info: ' + data.dog_dosage;
        drawerCanineDosage.classList.remove('hidden');
      } else {
        drawerCanineDosage.classList.add('hidden');
      }
    }

    // Feline block
    drawerFeline.textContent = data.feline;
    if (drawerFelineRiskBadge) {
      if (data.cat_risk_word) {
        drawerFelineRiskBadge.textContent = data.cat_risk_word;
        drawerFelineRiskBadge.className = `ml-auto px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${data.cat_risk_badge || 'bg-slate-100 text-slate-700'}`;
      } else {
        drawerFelineRiskBadge.classList.add('hidden');
      }
    }
    if (drawerFelineClinical) {
      if (data.cat_clinical) {
        drawerFelineClinical.textContent = 'Clinical symptoms: ' + data.cat_clinical;
        drawerFelineClinical.classList.remove('hidden');
      } else {
        drawerFelineClinical.classList.add('hidden');
      }
    }
    if (drawerFelineDosage) {
      if (data.cat_dosage) {
        drawerFelineDosage.textContent = 'Dosage info: ' + data.cat_dosage;
        drawerFelineDosage.classList.remove('hidden');
      } else {
        drawerFelineDosage.classList.add('hidden');
      }
    }

    // Emergency action (only shown if present)
    if (drawerEmergencySection && drawerEmergency) {
      if (data.emergency_action) {
        drawerEmergency.textContent = data.emergency_action;
        drawerEmergencySection.classList.remove('hidden');
      } else {
        drawerEmergencySection.classList.add('hidden');
      }
    }

    // Alternative / recommendation
    if (drawerAlternativeSection && drawerAlternative) {
      if (data.alternative && !/^No alternative/i.test(data.alternative)) {
        drawerAlternative.textContent = data.alternative;
        drawerAlternativeSection.classList.remove('hidden');
      } else {
        drawerAlternativeSection.classList.add('hidden');
      }
    }

    if (drawerWikiLink) drawerWikiLink.href = data.wikiSearch || WIKI_PAGE;

    drawerBackdrop?.classList.remove('hidden');
    drawer.classList.add('drawer-open');
  }

  function openFindingDrawer(tokenKey) {
    // Try the DB cache (populated from API)
    const data = FINDINGS_DATABASE[tokenKey];
    populateDrawer(data);
  }

  function closeFindingDrawer() {
    drawer?.classList.remove('drawer-open');
    drawerBackdrop?.classList.add('hidden');
  }

  document.querySelectorAll('.diagnostic-item').forEach(card => {
    card.addEventListener('click', () => {
      const token = card.getAttribute('data-token');
      if (token) openFindingDrawer(token);
    });
  });

  closeDrawerBtn?.addEventListener('click', closeFindingDrawer);
  closeDrawerBtn2?.addEventListener('click', closeFindingDrawer);
  drawerBackdrop?.addEventListener('click', closeFindingDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('drawer-open')) {
      closeFindingDrawer();
    }
  });

  // ==========================================================================
  // LIVE SCAN
  // Connects this page to the database and the Gemini scanner: your real pets,
  // the real result in the existing panels and cards (including the drill-down
  // drawer), the not-pet-food message, the allergy flag, and re-opening a saved
  // scan from Scan History. Works for results.html and mobile-results.html.
  // ==========================================================================
  (function liveScan() {
    const kgUser = (function () { try { return JSON.parse(localStorage.getItem('kibbleguard_user')) || {}; } catch (e) { return {}; } })();
    const kgUserId = kgUser.id || 1;
    const IS_MOBILE = /(^|\/)mobile-[^\/]*$/.test(window.location.pathname);
    const $ = function (id) { return document.getElementById(id); };
    const esc = function (v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
    };
    const isFeline = function (v) { return /fel|cat/i.test(String(v || '')); };
    const splitList = function (v) { return Array.isArray(v) ? v : String(v || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean); };

    let selectedPet = null;     // { id, name, species: 'Canine'|'Feline', ... } or a generic "any dog / any cat"
    let scanning = false;
    let currentScanId = null;   // the real scans.id of whatever result is on screen -- set in renderScan(), read by the Dispute button

    // ---- the result panels (these elements have ids on both pages) ----
    const panel = function () {
      const list = $('diagnosticCardsList') || (document.querySelector('.diagnostic-item') ? document.querySelector('.diagnostic-item').parentElement : null);
      return {
        score: $('scoreNumberDisplay'), label: $('scoreRiskLabel'), gauge: $('scoreSvgGauge'), pill: $('cautionPillBadge'),
        headline: $('verdictHeadline'), sub: $('verdictSubtext'), counts: $('tokenCountsRow'), list: list
      };
    };

    // ---------------------------------------------------------------------
    // 1. Your pets in the "Evaluating metabolic risk for" box
    // ---------------------------------------------------------------------
    const firstPetCard = $('targetBusterOption');
    const petBox = firstPetCard ? firstPetCard.parentElement : null;

    function petCardHtml(p, selected) {
      const feline = p.species === 'Feline';
      const accent = feline ? '#a855f7' : '#ff9800';
      const tint = feline ? 'bg-[#f4effa]' : 'bg-[#fff8ed]';
      const pad = IS_MOBILE ? 'p-3' : 'p-3.5';
      const box = selected
        ? 'w-full ' + pad + ' rounded-2xl border-2 border-[' + accent + '] ' + tint + ' flex items-center justify-between cursor-pointer transition-all'
        : 'w-full ' + pad + ' rounded-2xl border border-[#ebdcd0] bg-white opacity-75 hover:opacity-100 flex items-center justify-between cursor-pointer transition-all';
      const dot = selected
        ? 'w-4 h-4 rounded-full border-4 border-[' + accent + '] bg-white shrink-0 ml-3'
        : 'w-4 h-4 rounded-full border-2 border-slate-300 shrink-0 ml-3';
      const sens = splitList(p.allergies);
      const details = [p.breed, p.weight ? p.weight + ' kg' : '', sens.length ? 'Sensitive: ' + sens.slice(0, 2).join(', ') : ''].filter(Boolean).join(' • ');
      const avatar = p.image_url
        ? '<img src="' + esc(p.image_url) + '" alt="" class="w-9 h-9 rounded-xl object-cover shrink-0 border border-[#ebdcd0]">'
        : '<span class="' + (IS_MOBILE ? 'text-2xl' : 'text-2xl shrink-0') + '">' + (feline ? '🐱' : '🐶') + '</span>';
      const textBlock = IS_MOBILE
        ? '<div><h4>' + esc(p.name) + ' (' + p.species + ')</h4><p class="' + (feline ? 'text-[#7e22ce]' : 'text-[#b45309]') + '">' + esc(details || 'No profile details yet') + '</p></div>'
        : '<div class="flex flex-col min-w-0 flex-1"><h4 class="font-extrabold text-sm text-[#182811] leading-tight">' + esc(p.name) + ' (' + p.species + ')</h4>' +
          '<p class="text-[11px] text-[#788673] font-semibold truncate mt-0.5">' + esc(details || 'No profile details yet') + '</p></div>';
      return '<div data-live-pet="' + esc(p.key) + '" class="' + box + '">' +
        '<div class="flex items-center gap-' + (IS_MOBILE ? '3' : '3.5') + ' flex-1 min-w-0">' + avatar + textBlock + '</div>' +
        '<div class="' + dot + '"></div></div>';
    }

    function drawPetCards() {
      if (!petBox) return;
      petBox.innerHTML = petBox.__pets.map(function (p) { return petCardHtml(p, selectedPet && selectedPet.key === p.key); }).join('');
    }

    function choosePet(key) {
      const found = petBox.__pets.filter(function (p) { return p.key === key; })[0];
      if (!found) return;
      selectedPet = found;
      drawPetCards();
    }

    if (petBox) {
      fetch('/api/pets?user_id=' + encodeURIComponent(kgUserId))
        .then(function (res) { if (!res.ok) throw new Error('Server returned ' + res.status); return res.json(); })
        .then(function (rows) {
          const pets = (rows || []).map(function (p) {
            return Object.assign({}, p, { key: String(p.id), species: isFeline(p.species) ? 'Feline' : 'Canine' });
          });
          // no pets saved yet: scan for "any dog" / "any cat"
          petBox.__pets = pets.length ? pets : [
            { key: 'any-dog', id: null, name: 'Any dog', species: 'Canine', breed: 'No pet profile selected' },
            { key: 'any-cat', id: null, name: 'Any cat', species: 'Feline', breed: 'No pet profile selected' }
          ];
          const wanted = new URLSearchParams(window.location.search).get('pet');
          selectedPet = petBox.__pets.filter(function (p) { return wanted && String(p.id) === wanted; })[0] || petBox.__pets[0];
          drawPetCards();
          petBox.addEventListener('click', function (e) {
            const card = e.target.closest('[data-live-pet]');
            if (card) choosePet(card.getAttribute('data-live-pet'));
          });
        })
        .catch(function (err) { console.warn('Pets not loaded from the server, showing the page defaults:', err); });
    }

    const speciesNow = function () { return selectedPet ? selectedPet.species : 'Canine'; };

    // ---------------------------------------------------------------------
    // 2. Result panels: busy / error / not pet food / real result
    // ---------------------------------------------------------------------
    const RATING = {
      Safe:    { color: '#16a34a', label: 'Low Risk',      pill: '✅ Safe',         pillCls: 'bg-[#ecfdf5] text-[#15803d] border border-[#4caf50]', word: 'SAFE',    border: 'border-l-[#4caf50]', iconBg: 'bg-[#f0fdf4]', iconFg: 'text-emerald-600', icon: 'fa-check',                  emoji: '🌿', badge: 'bg-emerald-100 text-[#15803d]', cat: 'text-[#16a34a]' },
      Caution: { color: '#ff9800', label: 'Moderate Risk', pill: '⚠️ Caution Flag', pillCls: 'bg-[#fff3e0] text-[#b45309] border border-[#f59e0b]', word: 'CAUTION', border: 'border-l-[#ff9800]', iconBg: 'bg-[#fff8ed]', iconFg: 'text-[#ff9800]',  icon: 'fa-triangle-exclamation',   emoji: '🧪', badge: 'bg-orange-100 text-[#b45309]',  cat: 'text-[#8c633a]' },
      Toxic:   { color: '#dc2626', label: 'High Risk',     pill: '⛔ Toxic Flag',   pillCls: 'bg-[#fef2f2] text-[#b91c1c] border border-[#dc2626]', word: 'TOXIC',   border: 'border-l-[#dc2626]', iconBg: 'bg-[#fef2f2]', iconFg: 'text-[#dc2626]',  icon: 'fa-skull-crossbones',       emoji: '☠️', badge: 'bg-red-100 text-[#b91c1c]',     cat: 'text-[#b91c1c]' },
      'Not Rated': { color: '#9e9e9e', label: 'Not Rated', pill: '❔ Not Rated',   pillCls: 'bg-gray-100 text-gray-600 border border-gray-300',     word: 'NOT RATED', border: 'border-l-gray-400', iconBg: 'bg-gray-50',  iconFg: 'text-gray-500',   icon: 'fa-circle-question',        emoji: '❔', badge: 'bg-gray-100 text-gray-600',     cat: 'text-gray-500' }
    };
    const PILL_BASE = 'px-2.5 py-1 rounded font-extrabold text-[10.5px] uppercase inline-block ';

    function showBusy(title, text) {
      const p = panel();
      if (p.headline) p.headline.textContent = title || 'Analyzing label…';
      if (p.sub) p.sub.textContent = text || 'Reading the ingredients and checking them against the safety database.';
    }
    function showError(message) {
      const p = panel();
      if (p.headline) p.headline.textContent = 'Scan could not be completed';
      if (p.sub) p.sub.textContent = message + ' Please try again with a clear, well-lit photo of the ingredient list.';
    }
    function setCounts(p, parts) {
      if (!p.counts) return;
      const dot = IS_MOBILE ? 'w-1.5 h-1.5' : 'w-2 h-2';
      const cls = IS_MOBILE ? 'flex items-center gap-1' : 'text-xs font-bold flex items-center gap-1.5';
      p.counts.innerHTML = parts.map(function (c) {
        return '<span class="' + cls + '" style="color:' + c.color + '"><span class="' + dot + ' rounded-full" style="background:' + c.color + '"></span> ' + esc(c.text) + '</span>';
      }).join('');
    }

    function showNotPetFood(data) {
      const p = panel();
      const type = data && data.productType;
      const titles = { not_pet_food: "This doesn't look like pet food", other_animal_food: 'This is not dog or cat food', unclear: "Can't tell if this is pet food" };
      const advice = {
        not_pet_food: 'Please scan the ingredient label of a dog or cat food or treat package.',
        other_animal_food: 'KibbleGuard only checks dog and cat food.',
        unclear: "Please include the front of the package, or any wording that says what pet it's for, and scan again."
      };
      if (p.gauge) { p.gauge.setAttribute('stroke', '#d9d2c9'); p.gauge.style.strokeDashoffset = '251.2'; }
      if (p.score) p.score.textContent = '—';
      if (p.label) { p.label.textContent = 'No verdict'; p.label.style.color = '#91967e'; }
      if (p.pill) { p.pill.className = PILL_BASE + 'bg-slate-100 text-slate-600 border border-slate-300'; p.pill.textContent = type === 'unclear' ? '❔ Not Confirmed' : '🚫 Not Pet Food'; }
      if (p.headline) p.headline.textContent = titles[type] || titles.not_pet_food;
      if (p.sub) {
        const seen = data && data.reason ? String(data.reason).replace(/[.\s]+$/, '') + '. ' : '';
        p.sub.textContent = seen + (advice[type] || advice.not_pet_food) + ' Nothing was scored or saved.';
      }
      setCounts(p, [{ color: '#91967e', text: 'No ingredients were scored' }]);
      if (p.list) p.list.innerHTML = '<div class="tactile-card p-4 text-xs text-[#788673] bg-white">No ingredients were checked for this photo.</div>';
    }

    // ---------------------------------------------------------------------
    // 3. Findings: cards in the page's own design + the drill-down drawer
    // ---------------------------------------------------------------------
    // Match ingredient name against the dynamic FINDINGS_DATABASE (loaded from Supabase)
    function drawerEntry(it, speciesName) {
      // Try to find a match in the DB by normalized name (handles whitespace/
      // punctuation/case differences between OCR text and the Supabase data)
      var nameKey = _normalizeIngredientName(it.name || '');
      var base = (nameKey && FINDINGS_DATABASE[nameKey]) ? Object.assign({}, FINDINGS_DATABASE[nameKey]) : null;

      // If no exact match, try partial matching against all DB keys — but only
      // for keys of meaningful length, and only whole-word-ish substrings, so
      // short/generic keys (e.g. "salt", "oil") don't falsely swallow unrelated matches.
      if (!base && nameKey && nameKey.length >= 3) {
        var keys = Object.keys(FINDINGS_DATABASE);
        var bestKey = null;
        for (var ki = 0; ki < keys.length; ki++) {
          var k = keys[ki];
          if (k.length < 3) continue; // skip ingredient_id / short noise keys
          if (nameKey === k) { bestKey = k; break; }
          if ((nameKey.indexOf(k) !== -1 || k.indexOf(nameKey) !== -1)) {
            // Prefer the longest matching key (more specific match)
            if (!bestKey || k.length > bestKey.length) bestKey = k;
          }
        }
        if (bestKey) base = Object.assign({}, FINDINGS_DATABASE[bestKey]);
      }

      const s = RATING[it.status] || RATING.Safe;
      const rated = 'Rated ' + (it.status || 'Safe') + ' for ' + (speciesName === 'Feline' ? 'cats' : 'dogs') + ' in the KibbleGuard database.';
      const notEval = ' Not independently listed in the KibbleGuard ingredient database for the other species — treat as unverified until checked.';
      const entry = base || {
        title: it.name || 'Ingredient',
        category: it.category || 'Ingredient',
        aliases: '',
        badge: s.word,
        badgeClass: s.badge,
        severity_score: it.status === 'Toxic' ? 85 : (it.status === 'Caution' ? 45 : 0),
        mechanism: it.notes || 'This ingredient was detected on the label but has no detailed clinical dossier in the KibbleGuard database yet. It was screened using general rule-based matching only.',
        canine: speciesName === 'Canine' ? rated : ('Not evaluated for dogs in this scan.' + notEval),
        feline: speciesName === 'Feline' ? rated : ('Not evaluated for cats in this scan.' + notEval),
        dog_risk_word: speciesName === 'Canine' ? s.word : null,
        cat_risk_word: speciesName === 'Feline' ? s.word : null,
        dog_risk_badge: speciesName === 'Canine' ? s.badge : null,
        cat_risk_badge: speciesName === 'Feline' ? s.badge : null,
        alternative: 'No alternative suggested for this ingredient.',
        wikiSearch: WIKI_PAGE + '?search=' + encodeURIComponent(it.name || '')
      };

      // Keep the scanned label's own wording as the displayed name — never replace it with
      // the database's primary name — but if the DB match came in under a different name or
      // alias (e.g. scanned "Chicken Broth" matched DB entry "Meat Broth"), note that in the
      // description instead, so the connection is visible without renaming the ingredient.
      if (base) {
        var scannedNorm = _normalizeIngredientName(it.name || '');
        var altNames = [];
        var seenNorm = { };
        seenNorm[scannedNorm] = true;
        var dbTitleNorm = _normalizeIngredientName(base.title || '');
        if (dbTitleNorm && !seenNorm[dbTitleNorm]) { altNames.push(base.title); seenNorm[dbTitleNorm] = true; }
        (base.aliases || '').split(',').forEach(function (a) {
          var aTrim = a.trim();
          var aNorm = _normalizeIngredientName(aTrim);
          if (aTrim && aNorm && !seenNorm[aNorm]) { altNames.push(aTrim); seenNorm[aNorm] = true; }
        });
        if (altNames.length) {
          entry.mechanism = (entry.mechanism || '') + ' Also known in the database as: ' + altNames.join(', ') + '.';
        }
      }

      entry.title = it.name || entry.title;
      if (it.allergy) {
        entry.badge = it.allergy.match === 'direct' ? 'ALLERGY' : 'POSSIBLE ALLERGY';
        entry.badgeClass = 'bg-purple-100 text-[#7e22ce]';
        entry.mechanism = it.allergy.message + ' ' + (entry.mechanism || '');
      }
      return entry;
    }
    const liveFindings = {};
    function openLiveDrawer(key) {
      const data = liveFindings[key] || (typeof FINDINGS_DATABASE === 'object' ? FINDINGS_DATABASE[key] : null);
      populateDrawer(data);
    }

    function cardHtml(it, key) {
      const s = RATING[it.status] || RATING.Safe;
      const al = it.allergy;
      const hazard = it.status === 'Safe' && !al ? 'safe' : 'caution';
      const border = al ? 'border-l-[#9333ea]' : s.border;
      const alPill = al ? '<span class="px-2' + (IS_MOBILE ? '' : '.5') + ' py-0.5 rounded bg-purple-100 text-[#7e22ce] font-extrabold text-[' + (IS_MOBILE ? '8.5' : '9.5') + 'px] shrink-0">' + (al.match === 'direct' ? 'ALLERGY' : 'POSSIBLE ALLERGY') + '</span>' : '';
      const pill = '<span class="' + (IS_MOBILE ? 'px-1.5 py-0.5 rounded ' + s.badge + ' font-black text-[8.5px] shrink-0' : 'px-2.5 py-0.5 rounded ' + s.badge + ' font-extrabold text-[9.5px]') + '">' + s.word + '</span>';
      const pills = al ? '<span class="flex items-center gap-1">' + alPill + pill + '</span>' : pill;
      const notes = esc(it.notes || 'No specific restrictions recorded.');
      const allergyLine = al ? '<p class="' + (IS_MOBILE ? 'text-[10.5px]' : 'text-[11px]') + ' font-extrabold text-[#7e22ce]">🐾 ' + esc(al.message) + '</p>' : '';
      if (IS_MOBILE) {
        return '<div class="tactile-card p-3.5 border-l-4 ' + border + ' flex items-start gap-3 diagnostic-item bg-white cursor-pointer" data-hazard="' + hazard + '" data-token="' + key + '">' +
          '<span class="text-xl shrink-0 mt-0.5">' + (al ? '🐾' : s.emoji) + '</span>' +
          '<div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-1"><h4 class="font-extrabold text-xs text-[#182811] truncate">' + esc(it.name || 'Ingredient') + '</h4>' + pills + '</div>' +
          allergyLine + '<p class="text-[10.5px] text-[#788673] mt-0.5 leading-snug">' + notes + '</p></div></div>';
      }
      const entry = liveFindings[key];
      const alt = (entry && entry.alternative && !/^No alternative/.test(entry.alternative)) ? 'Suggested alternative: ' + entry.alternative : (it.status === 'Safe' ? 'Rated safe in the KibbleGuard database' : 'Open the drill-down for details');
      return '<div class="tactile-card p-4 bg-white border-l-4 ' + border + ' flex items-start gap-4 diagnostic-item cursor-pointer hover:border-[#45671d] transition-all group" data-hazard="' + hazard + '" data-token="' + key + '">' +
        '<div class="w-9 h-9 rounded-full ' + (al ? 'bg-purple-50' : s.iconBg) + ' flex items-center justify-center text-base shrink-0 mt-0.5 ' + (al ? 'text-[#9333ea]' : s.iconFg) + '"><i class="fa-solid ' + (al ? 'fa-paw' : s.icon) + '"></i></div>' +
        '<div class="flex-1 space-y-1"><div class="flex items-center justify-between"><h4 class="font-extrabold text-sm text-[#182811] group-hover:text-[#45671d] transition-colors">' + esc(it.name || 'Ingredient') + '</h4>' + pills + '</div>' +
        allergyLine +
        '<p class="text-[11px] font-bold ' + s.cat + '">Category: ' + esc(it.category || 'Ingredient') + '</p>' +
        '<p class="text-xs text-[#788673]">' + notes + '</p>' +
        '<div class="flex items-center justify-between pt-1"><p class="text-[10.5px] font-bold ' + s.cat + '">' + esc(alt) + '</p><span class="text-[10.5px] font-extrabold text-[#45671d] group-hover:underline">Drill down →</span></div></div></div>';
    }

    let listBound = null;
    async function renderScan(data, speciesName) {
      // Ensure ingredient DB is loaded before rendering so drawer has full data
      await _loadIngredientDB();
      currentScanId = data.scanId || null;
      renderDisputeStatus(data.dispute || null);
      var lowConfidenceBanner = $('lowConfidenceBanner');
      if (lowConfidenceBanner) lowConfidenceBanner.classList.toggle('hidden', !data.confidenceTooWeak);
      const p = panel();
      const style = RATING[data.rating] || RATING.Caution;
      const items = Array.isArray(data.results) ? data.results.slice() : [];
      const flagged = Array.isArray(data.flagged) ? data.flagged : [];
      const score = Math.max(0, Math.min(100, Number(data.score) || 0));
      const tally = { Safe: 0, Caution: 0, Toxic: 0, 'Not Rated': 0 };
      items.forEach(function (it) { if (tally[it.status] !== undefined) tally[it.status] += 1; });
      const allergyItems = items.filter(function (it) { return it && it.allergy; });
      const otherFlagged = flagged.filter(function (f) { return f && f.rating !== 'Allergen'; });
      const unique = function (list) { return list.filter(function (v, i) { return v && list.indexOf(v) === i; }); };

      if (p.gauge) { p.gauge.setAttribute('stroke', style.color); p.gauge.style.strokeDashoffset = String(251.2 * (1 - score / 100)); }
      if (p.score) p.score.textContent = String(score);
      if (p.label) { p.label.textContent = style.label; p.label.style.color = style.color; }
      if (p.pill) { p.pill.className = PILL_BASE + style.pillCls; p.pill.textContent = allergyItems.length ? '🚨 Allergy Alert' : style.pill; }

      if (p.headline) {
        const names = unique(otherFlagged.map(function (f) { return f.name; }));
        const allergyNames = unique(allergyItems.map(function (it) { return it.name; }));
        if (allergyItems.length) {
          p.headline.textContent = 'Allergy alert for ' + allergyItems[0].allergy.pet + ': ' + allergyNames.slice(0, 3).join(', ') + (allergyNames.length > 3 ? ' +' + (allergyNames.length - 3) + ' more' : '');
        } else {
          p.headline.textContent = names.length
            ? 'Contains Flagged Ingredients: ' + names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) + ' more' : '')
            : (items.length ? 'No Flagged Ingredients Detected' : 'No ingredients could be read from this label');
        }
      }
      if (p.sub) {
        let sentence = 'The rule-engine matched ' + otherFlagged.length + ' flagged ingredient' + (otherFlagged.length === 1 ? '' : 's') + ' against ' + speciesName.toLowerCase() + ' veterinary toxicological records.';
        if (allergyItems.length) {
          const direct = allergyItems.some(function (it) { return it.allergy.match === 'direct'; });
          sentence = allergyItems[0].allergy.pet + "'s profile lists " + unique(allergyItems.map(function (it) { return it.allergy.term; })).join(', ') +
            (direct ? ', and this label contains a matching ingredient. ' : ', and this label may contain a related ingredient. ') + sentence;
        } else if (data.allergy && data.allergy.terms && data.allergy.terms.length) {
          sentence += ' Checked against ' + data.allergy.pet + "'s allergy list (" + data.allergy.terms.join(', ') + '): no matches.';
        }
        p.sub.textContent = sentence;
      }

      const parts = IS_MOBILE
        ? [{ color: '#16a34a', text: tally.Safe + ' Safe' }, { color: '#ff9800', text: tally.Caution + ' Caution' }, { color: '#dc2626', text: tally.Toxic + ' Fatal' }]
        : [{ color: '#16a34a', text: tally.Safe + ' Safe Tokens' }, { color: '#ff9800', text: tally.Caution + ' Caution Tokens' }, { color: '#dc2626', text: tally.Toxic + ' Lethal Toxins' }];
      if (tally['Not Rated']) parts.push({ color: '#9e9e9e', text: tally['Not Rated'] + (IS_MOBILE ? ' Not Rated' : ' Not Rated Tokens') });
      if (allergyItems.length) parts.push({ color: '#7e22ce', text: allergyItems.length + (IS_MOBILE ? ' Allergy' : (allergyItems.length === 1 ? ' Allergen Match' : ' Allergen Matches')) });
      setCounts(p, parts);

      if (p.list) {
        const order = { Toxic: 0, Caution: 1, Safe: 2, 'Not Rated': 3 };
        const rank = function (it) { return it.allergy ? (it.allergy.match === 'direct' ? -2 : -1) : (order[it.status] === undefined ? 3 : order[it.status]); };
        items.sort(function (a, b) { return rank(a) - rank(b); });
        items.forEach(function (it, i) { liveFindings['live-' + i] = drawerEntry(it, speciesName); });
        p.list.innerHTML = items.length
          ? items.map(function (it, i) { return cardHtml(it, 'live-' + i); }).join('')
          : '<div class="tactile-card p-4 text-xs text-[#788673] bg-white">No ingredient list was detected. Try a closer, sharper photo of the ingredients panel.</div>';
        if (listBound !== p.list) {
          listBound = p.list;
          p.list.addEventListener('click', function (e) {
            const card = e.target.closest('.diagnostic-item');
            if (card && card.getAttribute('data-token')) openLiveDrawer(card.getAttribute('data-token'));
          });
        }
      }
    }

    // ---------------------------------------------------------------------
    // 4. Send the photo to the scanner (camera capture or file upload)
    // ---------------------------------------------------------------------
    function toJpegBlob(source, w, h) {
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
      return new Promise(function (resolve) { c.toBlob(resolve, 'image/jpeg', 0.85); });
    }
    function loadImageFromFile(file) {
      return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
        img.src = url;
      });
    }

    async function runScan(blob) {
      if (scanning) return;
      scanning = true;
      showBusy();
      const speciesName = speciesNow();
      try {
        if (!blob) throw new Error('The photo could not be prepared.');
        const form = new FormData();
        form.append('labelImage', blob, 'scan-' + Date.now() + '.jpg');
        form.append('species', speciesName);
        form.append('user_id', kgUserId);
        if (selectedPet && selectedPet.id) form.append('pet_id', selectedPet.id);

        const res = await fetch('/api/assess', { method: 'POST', body: form });
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (res.status === 422 && data.notPetFood) { showNotPetFood(data); return; }
        if (!res.ok || data.error) throw new Error(data.error || ('The scanner returned an error (' + res.status + ').'));
        renderScan(data, speciesName);
        if (typeof window.kgRefreshNotifications === 'function') window.kgRefreshNotifications();
      } catch (err) {
        console.error('Scan failed:', err);
        showError(err && err.message ? err.message : 'Could not reach the scanner.');
      } finally {
        scanning = false;
      }
    }

    const snapCanvas = $('snapshotCanvas');
    const snapBtn = $('takeSnapshotBtn');
    if (snapBtn && snapCanvas) {
      // the page's own capture code has just drawn the frame into the canvas
      snapBtn.addEventListener('click', function () {
        if (!capturedImagePreview || capturedImagePreview.classList.contains('hidden')) return;
        toJpegBlob(snapCanvas, snapCanvas.width, snapCanvas.height).then(runScan);
      });
    }
    if (labelUploadInput) {
      labelUploadInput.addEventListener('change', function () {
        const file = labelUploadInput.files && labelUploadInput.files[0];
        if (!file) return;
        loadImageFromFile(file)
          .then(function (img) { return toJpegBlob(img, img.naturalWidth || img.width, img.naturalHeight || img.height); })
          .then(runScan)
          .catch(function (err) { showError(err.message); });
      });
    }

    // ---------------------------------------------------------------------
    // 4b. Dispute this result -- sends a note to the admin, tied to the real
    // scan so they can see the exact product/ingredients that were scanned
    // Shows/hides the "Dispute submitted" + "Admin response" block that sits right under
    // the pet-evaluator box. dispute is the {note, resolved, resolution, resolutionType,
    // submittedAt} object /api/history/:id now returns for a scan, or null if none was filed.
    function renderDisputeStatus(dispute) {
      const block = $('disputeStatusBlock');
      if (!block) return;
      if (!dispute || !dispute.note) { block.classList.add('hidden'); return; }
      block.classList.remove('hidden');
      const labelEl = $('disputeStatusLabel');
      const noteEl = $('disputeStatusNote');
      const replyBox = $('disputeAdminReply');
      const replyText = $('disputeAdminReplyText');
      if (labelEl) labelEl.textContent = dispute.resolved ? 'Dispute reviewed' : 'Dispute submitted — awaiting admin review';
      if (noteEl) noteEl.textContent = 'Your note: "' + dispute.note + '"';
      if (dispute.resolved && dispute.resolution) {
        if (replyBox) replyBox.classList.remove('hidden');
        if (replyText) {
          const verdictNote = dispute.resolutionType === 'overturned' ? ' The verdict was corrected.' : ' The original classification was upheld.';
          replyText.textContent = dispute.resolution + verdictNote;
        }
      } else if (replyBox) {
        replyBox.classList.add('hidden');
      }
    }
    // ---------------------------------------------------------------------
    function closeDisputeModal() {
      const overlay = $('disputeModalOverlay');
      if (overlay) overlay.remove();
    }
    function submitDispute() {
      const input = $('disputeNoteInput');
      const errorEl = $('disputeModalError');
      const note = input ? input.value.trim() : '';
      if (errorEl) errorEl.classList.add('hidden');
      if (!note) {
        if (errorEl) { errorEl.textContent = 'Please describe what seems wrong.'; errorEl.classList.remove('hidden'); }
        return;
      }
      const btn = $('disputeSubmitBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
      fetch('/api/scans/' + encodeURIComponent(currentScanId) + '/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: kgUserId, note: note })
      })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.body && res.body.error) || 'Could not submit your dispute. Try again.');
          renderDisputeStatus({ note: note, resolved: false });
          const card = document.querySelector('#disputeModalOverlay .tactile-card');
          if (card) {
            card.innerHTML =
              '<div class="text-center py-2">' +
                '<i class="fa-solid fa-circle-check text-3xl text-[#45671d] mb-3"></i>' +
                '<h3 class="font-extrabold text-sm text-[#182811] mb-1">Dispute submitted</h3>' +
                '<p class="text-xs text-[#788673]">An admin will review this exact scan and follow up if needed.</p>' +
                '<button type="button" id="disputeDoneBtn" class="mt-4 px-5 py-2 text-xs font-bold text-white bg-[#45671d] rounded-xl">Done</button>' +
              '</div>';
            const doneBtn = $('disputeDoneBtn');
            if (doneBtn) doneBtn.addEventListener('click', closeDisputeModal);
          }
        })
        .catch(function (err) {
          if (errorEl) { errorEl.textContent = err.message; errorEl.classList.remove('hidden'); }
          if (btn) { btn.disabled = false; btn.textContent = 'Submit Dispute'; }
        });
    }
    function openDisputeModal() {
      closeDisputeModal();
      const overlay = document.createElement('div');
      overlay.id = 'disputeModalOverlay';
      overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4';
      overlay.innerHTML =
        '<div class="tactile-card bg-white rounded-2xl p-6 w-full max-w-sm">' +
          '<h3 class="font-extrabold text-sm text-[#182811] mb-1">Dispute this result</h3>' +
          '<p class="text-xs text-[#788673] mb-3">Tell us what seems wrong. An admin will review this exact scan, including every ingredient that was detected.</p>' +
          '<textarea id="disputeNoteInput" rows="4" maxlength="2000" placeholder="e.g. I don’t think this ingredient should be flagged for my pet..." class="w-full px-3 py-2.5 border border-[#ebdcd0] rounded-xl text-xs focus:outline-none focus:border-[#45671d] resize-none"></textarea>' +
          '<p id="disputeModalError" class="hidden text-[11px] text-red-600 mt-2"></p>' +
          '<div class="flex items-center justify-end gap-2 mt-4">' +
            '<button type="button" id="disputeCancelBtn" class="px-4 py-2 text-xs font-bold text-[#788673]">Cancel</button>' +
            '<button type="button" id="disputeSubmitBtn" class="px-4 py-2 text-xs font-bold text-white bg-[#45671d] rounded-xl">Submit Dispute</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDisputeModal(); });
      const cancelBtn = $('disputeCancelBtn'), submitBtn = $('disputeSubmitBtn');
      if (cancelBtn) cancelBtn.addEventListener('click', closeDisputeModal);
      if (submitBtn) submitBtn.addEventListener('click', submitDispute);
    }
    const disputeBtn = $('disputeResultBtn');
    if (disputeBtn) {
      disputeBtn.addEventListener('click', function () {
        if (!currentScanId) { alert('Run or open a scan first, then you can dispute its result.'); return; }
        openDisputeModal();
      });
    }

    // ---------------------------------------------------------------------
    // 5. Opened from Scan History / a notification: show the saved scan
    // ---------------------------------------------------------------------
    function showSavedPhoto(src) {
      if (capturedImagePreview && src) { capturedImagePreview.src = src; capturedImagePreview.classList.remove('hidden'); }
      if (staticViewportGraphic) staticViewportGraphic.classList.add('hidden');
      if (cameraControlsOverlay) { cameraControlsOverlay.classList.remove('hidden'); cameraControlsOverlay.classList.add('flex'); }
      if (retakeCameraBtn) retakeCameraBtn.classList.remove('hidden');
    }
    const batchParam = new URLSearchParams(window.location.search).get('batch');
    const batchMatch = batchParam ? /^KG-(\d+)$/i.exec(batchParam) : null;
    if (batchMatch) {
      showBusy('Loading scan…', 'Fetching the saved result from the database.');
      fetch('/api/history/' + encodeURIComponent(batchMatch[1]) + '?user_id=' + encodeURIComponent(kgUserId))
        .then(function (res) { return res.json().then(function (body) { if (!res.ok || body.error) throw new Error(body.error || 'That scan could not be found.'); return body; }); })
        .then(function (data) {
          const speciesName = isFeline(data.species) ? 'Feline' : 'Canine';
          renderScan(data, speciesName);
          if (data.image) showSavedPhoto(data.image);
        })
        .catch(function (err) { console.error('Could not load saved scan:', err); showError(err && err.message ? err.message : 'That scan could not be loaded.'); });
    }
    // the scan page's own bell picks up alerts loaded from the server
    window.addEventListener('kg-notifications-updated', function () { notifications = getNotifications(); syncNotificationUI(); });
  })();
});

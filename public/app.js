// Applies the saved dark/light preference on EVERY page, not just Settings (where it's set).
// Runs immediately (this script tag sits right before </body>, so document.body already
// exists) rather than waiting for DOMContentLoaded, so a dark-mode page doesn't flash light
// first. Previously only settings.js ever added this class, and only while actually on the
// Settings page -- navigating anywhere else silently dropped back to light, even though the
// preference was saved correctly.
(function applyStoredTheme() {
  try {
    if (localStorage.getItem('kibbleguard_theme') === 'dark') {
      document.body.classList.add('dark-theme');
    }
  } catch (e) { /* localStorage unavailable (private mode, etc.) -- just stay light */ }
})();

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Universal User Profile & Title Sync across all pages
  // ==========================================
  const defaultProfile = {
    firstName: '',
    middleName: '',
    lastName: '',
    city: '',
    petCount: 0,
    role: 'VERIFIED OWNER'
  };

  // Read user data from auth (set at login/signup)
  const kgUserRaw = JSON.parse(localStorage.getItem('kibbleguard_user') || '{}');
  const savedProfile = { ...defaultProfile, ...JSON.parse(localStorage.getItem('kibbleguard_user_profile') || '{}') };

  // Use auth user name as fallback if profile names are empty
  if (!savedProfile.firstName && kgUserRaw.name) {
    const parts = kgUserRaw.name.trim().split(/\s+/);
    savedProfile.firstName = parts[0] || '';
    savedProfile.lastName = parts[parts.length - 1] || '';
    if (parts.length > 2) savedProfile.middleName = parts.slice(1, -1).join(' ');
  }

  // Compute actual pet count from localStorage
  const actualPets = JSON.parse(localStorage.getItem('kibbleguard_pets') || '[]');
  const actualPetCount = actualPets.length;

  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserRole = document.getElementById('sidebarUserRole');
  const sidebarUserLoc = document.getElementById('sidebarUserLoc');
  const sidebarAvatarCircle = document.getElementById('sidebarAvatarCircle');
  // The mobile top header has its own small avatar button (separate element from the
  // desktop sidebar's), which used to just hardcode "VB" regardless of who was logged in.
  const mobileHeaderAvatar = document.getElementById('mobileHeaderAvatar');

  if (sidebarUserName || mobileHeaderAvatar) {
    const fName = savedProfile.firstName || '';
    const mName = savedProfile.middleName || '';
    const lName = savedProfile.lastName || '';
    const middleInitial = mName ? ` ${mName.charAt(0)}.` : '';
    const displayName = fName && lName ? `${fName}${middleInitial} ${lName}` : (fName || lName || kgUserRaw.name || 'User');
    if (sidebarUserName) sidebarUserName.textContent = displayName;
    const hasAvatar = savedProfile.avatar && !savedProfile.avatar.includes('uxpilot-auth.appspot.com');
    const initials = `${(fName || displayName).charAt(0)}${lName ? lName.charAt(0) : ''}`.toUpperCase() || 'U';
    [sidebarAvatarCircle, mobileHeaderAvatar].forEach((el) => {
      if (!el) return;
      if (hasAvatar) {
        // Show uploaded profile photo instead of initials
        el.textContent = '';
        el.style.backgroundImage = `url(${savedProfile.avatar})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      } else {
        el.style.backgroundImage = '';
        el.textContent = initials;
      }
    });
  }

  if (sidebarUserRole) {
    sidebarUserRole.textContent = 'VERIFIED OWNER';
  }

  if (sidebarUserLoc) {
    const city = savedProfile.city || '';
    const petText = actualPetCount > 0 ? `${actualPetCount} Pet${actualPetCount === 1 ? '' : 's'}` : 'No Pets';
    sidebarUserLoc.textContent = city ? `${city} • ${petText}` : petText;
  }

  // ==========================================
// 2. Global Sign Out Controller
// ==========================================
const sidebarSignOutBtn = document.getElementById('sidebarSignOutBtn');

if (sidebarSignOutBtn) {
  sidebarSignOutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to sign out of KibbleGuard?')) {

      // Clear all saved login information
      localStorage.removeItem('kibbleguard_auth_token');
      localStorage.removeItem('kibbleguard_auth_user');
      localStorage.removeItem('kibbleguard_user');

      // Clear saved profile information
      localStorage.removeItem('kibbleguard_user_profile');

      // Return to the landing page
      window.location.replace('landing.html');
    }
  });
}
  // ==========================================
  // 3. Sidebar Hamburger Collapse Controller
  // ==========================================
  const sidebar = document.getElementById('appSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');

  if (sidebar && toggleBtn) {
    const isCollapsed = localStorage.getItem('kibbleguard_sidebar_collapsed') === 'true';
    if (isCollapsed) sidebar.classList.add('collapsed');

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('kibbleguard_sidebar_collapsed', sidebar.classList.contains('collapsed'));
    });
  }

  // ==========================================
  // 4. Hardware Camera Engine (Universal Fallback)
  // ==========================================
  const packagingBoxTrigger = document.getElementById('packagingBoxTrigger');
  const headerCameraLink = document.getElementById('headerCameraLink');
  const liveVideo = document.getElementById('liveVideoFeed');
  const staticViewport = document.getElementById('staticViewportGraphic');
  const cameraControls = document.getElementById('cameraControlsOverlay');
  const takeSnapshotBtn = document.getElementById('takeSnapshotBtn');
  const retakeCameraBtn = document.getElementById('retakeCameraBtn');
  const cancelCameraBtn = document.getElementById('cancelCameraBtn');
  const snapshotCanvas = document.getElementById('snapshotCanvas');
  const fileUploadInput = document.getElementById('labelUploadInput');

  let activeCameraStream = null;

  async function openCameraStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera access API is not supported in this browser environment. Opening file selector instead.');
      if (fileUploadInput) fileUploadInput.click();
      return;
    }

    try {
      activeCameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      if (liveVideo) {
        liveVideo.srcObject = activeCameraStream;
        liveVideo.classList.remove('hidden');
        if (staticViewport) staticViewport.classList.add('hidden');
        if (cameraControls) cameraControls.classList.remove('hidden');
        if (retakeCameraBtn) retakeCameraBtn.classList.add('hidden');
        if (takeSnapshotBtn) takeSnapshotBtn.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('Camera permission denied or camera device missing:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('Camera permission was blocked. Please allow camera access in your browser settings.');
      } else {
        alert(`Unable to open camera: ${err.message || 'Device camera unavailable'}. Switching to file upload.`);
      }
      if (fileUploadInput) fileUploadInput.click();
    }
  }

  function stopCameraStream() {
    if (activeCameraStream) {
      activeCameraStream.getTracks().forEach(track => track.stop());
      activeCameraStream = null;
    }
    if (liveVideo) {
      liveVideo.srcObject = null;
      liveVideo.classList.add('hidden');
    }
    if (staticViewport) staticViewport.classList.remove('hidden');
    if (cameraControls) cameraControls.classList.add('hidden');
  }

  function captureFrame() {
    if (!liveVideo || !activeCameraStream) return;
    if (snapshotCanvas) {
      snapshotCanvas.width = liveVideo.videoWidth || 640;
      snapshotCanvas.height = liveVideo.videoHeight || 480;
      const ctx = snapshotCanvas.getContext('2d');
      ctx.drawImage(liveVideo, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    }
    liveVideo.pause();
    if (takeSnapshotBtn) takeSnapshotBtn.classList.add('hidden');
    if (retakeCameraBtn) retakeCameraBtn.classList.remove('hidden');
  }

  function retakeFrame() {
    if (liveVideo) liveVideo.play();
    if (takeSnapshotBtn) takeSnapshotBtn.classList.remove('hidden');
    if (retakeCameraBtn) retakeCameraBtn.classList.add('hidden');
  }

  packagingBoxTrigger?.addEventListener('click', (e) => {
    if (e.target.closest('#cameraControlsOverlay')) return;
    if (!activeCameraStream) openCameraStream();
  });

  headerCameraLink?.addEventListener('click', (e) => {
    e.stopPropagation();
    openCameraStream();
  });

  takeSnapshotBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    captureFrame();
  });

  retakeCameraBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    retakeFrame();
  });

  cancelCameraBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    stopCameraStream();
  });

  // ==========================================
  // 5. Species Evaluation Switcher & Query Pre-selector
  // ==========================================
  const busterOpt = document.getElementById('targetBusterOption');
  const miloOpt = document.getElementById('targetMiloOption');

  function selectBuster() {
    if (!busterOpt || !miloOpt) return;
    busterOpt.className = 'species-option-card border-2 border-[#ff9800] bg-[#fff8ed]';
    const busterRadio = busterOpt.lastElementChild;
    if (busterRadio) busterRadio.className = 'w-4 h-4 rounded-full border-4 border-[#ff9800] bg-white shrink-0 ml-3';

    miloOpt.className = 'species-option-card border border-[#ebdcd0] bg-white opacity-75 hover:opacity-100';
    const miloRadio = miloOpt.lastElementChild;
    if (miloRadio) miloRadio.className = 'w-4 h-4 rounded-full border-2 border-slate-300 shrink-0 ml-3';
  }

  function selectMilo() {
    if (!busterOpt || !miloOpt) return;
    miloOpt.className = 'species-option-card border-2 border-[#a855f7] bg-[#f4effa]';
    const miloRadio = miloOpt.lastElementChild;
    if (miloRadio) miloRadio.className = 'w-4 h-4 rounded-full border-4 border-[#a855f7] bg-white shrink-0 ml-3';

    busterOpt.className = 'species-option-card border border-[#ebdcd0] bg-white opacity-75 hover:opacity-100';
    const busterRadio = busterOpt.lastElementChild;
    if (busterRadio) busterRadio.className = 'w-4 h-4 rounded-full border-2 border-slate-300 shrink-0 ml-3';
  }

  busterOpt?.addEventListener('click', selectBuster);
  miloOpt?.addEventListener('click', selectMilo);

  const urlParams = new URLSearchParams(window.location.search);
  const petParam = urlParams.get('pet');
  if (petParam === 'milo') selectMilo();
  if (petParam === 'buster') selectBuster();

  // ==========================================
  // 6. Isolated Live Pixel Terrarium Canvas
  // ==========================================
  const canvas = document.getElementById('habitatCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const W = 100;
    const H = 70;
    canvas.width = W;
    canvas.height = H;

    // Buster (Dog) State
    let barkly = { 
      x: 55, 
      y: 48, 
      vx: 0.35, 
      dir: 1, 
      legFrame: 0, 
      bounceY: 0, 
      bounceVel: 0, 
      isExcited: false, 
      tailWag: 0 
    };

    // Milo (Cat) State
    let whiskers = { 
      x: 18, 
      y: 35, 
      frame: 0, 
      purrTimer: 0, 
      pawSwat: 0, 
      perchTarget: 18,
      isLeaping: false
    };

    let treats = [];
    let particles = []; // Floating hearts & purr sparkles

    function drawPixel(x, y, w, h, col) {
      ctx.fillStyle = col;
      ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
    }

    // ONLY called when Buster eats a treat
    function spawnDogHeart(x, y) {
      particles.push({
        x: x,
        y: y,
        vy: -0.45,
        type: 'heart',
        life: 1.0,
        decay: 0.02
      });
    }

    // ONLY called when Milo purrs or lands
    function spawnCatPurr(x, y) {
      particles.push({
        x: x,
        y: y,
        vy: -0.32,
        type: 'sparkle',
        life: 1.0,
        decay: 0.025
      });
    }

    function drawHeartParticle(p) {
      const alpha = Math.max(0, p.life);
      ctx.fillStyle = `rgba(244, 63, 94, ${alpha})`;
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);
      // Pixel Heart Glyph
      ctx.fillRect(px - 2, py - 2, 2, 2);
      ctx.fillRect(px + 1, py - 2, 2, 2);
      ctx.fillRect(px - 3, py - 1, 7, 2);
      ctx.fillRect(px - 2, py + 1, 5, 2);
      ctx.fillRect(px - 1, py + 3, 3, 1);
      ctx.fillRect(px, py + 4, 1, 1);
    }

    function drawSparkleParticle(p) {
      const alpha = Math.max(0, p.life);
      ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`;
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);
      // Cat Purr / Star Sparkle
      ctx.fillRect(px, py - 2, 1, 5);
      ctx.fillRect(px - 2, py, 5, 1);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(px, py, 1, 1);
    }

    function renderHabitat() {
      // Background Sky & Mountains
      ctx.fillStyle = '#0f0f14';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#442f2b';
      ctx.beginPath();
      ctx.moveTo(0, 50); ctx.lineTo(30, 38); ctx.lineTo(60, 50); ctx.fill();
      ctx.fillStyle = '#513a34';
      ctx.beginPath();
      ctx.moveTo(40, 50); ctx.lineTo(75, 34); ctx.lineTo(100, 50); ctx.fill();

      // Botanical Canopy Trees
      drawPixel(8, 20, 22, 12, '#e69c24');
      drawPixel(12, 16, 14, 8, '#f8c85c');
      drawPixel(17, 30, 4, 25, '#4a2e2b');

      drawPixel(48, 18, 26, 14, '#d27d19');
      drawPixel(54, 14, 16, 8, '#f8c85c');
      drawPixel(58, 30, 5, 25, '#3e2321');

      drawPixel(80, 20, 20, 12, '#e69c24');
      drawPixel(88, 30, 4, 25, '#4a2e2b');

      // Grassy Ground Layers
      drawPixel(0, 54, W, 3, '#f6d376');
      drawPixel(0, 57, W, 4, '#c9903e');
      drawPixel(0, 61, W, 9, '#7d4f27');

      // ----------------------------------------
      // 1. UPDATE & DRAW CAT (MILO)
      // ----------------------------------------
      whiskers.frame += 0.04;
      if (whiskers.purrTimer > 0) {
        whiskers.purrTimer--;
        if (whiskers.purrTimer % 18 === 0) {
          spawnCatPurr(whiskers.x + 8, whiskers.y - 7);
        }
      }

      // Smooth, gentle glide between perches (reduced speed from 0.1 to 0.035)
      const distToTarget = whiskers.perchTarget - whiskers.x;
      if (Math.abs(distToTarget) > 0.5) {
        whiskers.x += distToTarget * 0.035;
        whiskers.isLeaping = true;
      } else {
        whiskers.x = whiskers.perchTarget;
        if (whiskers.isLeaping) {
          whiskers.isLeaping = false;
          whiskers.purrTimer = 40; // purr on arrival
        }
      }

      // Natural hop arc while leaping between trees
      const leapArc = whiskers.isLeaping ? -Math.sin(Math.PI * (1 - Math.abs(distToTarget) / 50)) * 6 : 0;
      const breathing = Math.sin(whiskers.frame) > 0.8 ? -1 : 0;
      const catY = whiskers.y + breathing + leapArc;
      const swat = whiskers.pawSwat > 0 ? 2 : 0;
      if (whiskers.pawSwat > 0) whiskers.pawSwat--;

      // Cat Body & Fur
      drawPixel(whiskers.x, catY, 8, 6, '#9e9e9e');
      drawPixel(whiskers.x + 5, catY - 4, 5, 5, '#bdbdbd');
      // Pointed Ears
      drawPixel(whiskers.x + 5, catY - 6, 2, 2, '#757575');
      drawPixel(whiskers.x + 8, catY - 6, 2, 2, '#757575');
      // Bright Cat Eyes (Blinks to happy squint when purring)
      if (whiskers.purrTimer > 0 && Math.floor(whiskers.frame * 2) % 2 === 0) {
        drawPixel(whiskers.x + 8, catY - 2, 2, 1, '#111'); // Happy squint
      } else {
        drawPixel(whiskers.x + 8, catY - 2, 1, 1, '#111'); // Alert eye
      }
      // Feline Collar & Tail
      drawPixel(whiskers.x + 6, catY + 2, 2, 1, '#a855f7');
      drawPixel(whiskers.x - 2, catY + 2 + (Math.sin(whiskers.frame * 1.5) > 0 ? -1 : 1), 3, 2, '#9e9e9e');
      // Playful Paw Swat (Only if treat falls nearby)
      drawPixel(whiskers.x + 4, catY + 5 + swat, 2, 2, '#dedede');

      // ----------------------------------------
      // 2. UPDATE & DRAW FALLING TREATS
      // ----------------------------------------
      for (let i = treats.length - 1; i >= 0; i--) {
        const t = treats[i];
        t.y += 0.85;
        if (t.y >= 53) t.y = 53;

        // Bone-shaped biscuit treat
        drawPixel(t.x, t.y, 4, 2, '#ffffff');
        drawPixel(t.x - 1, t.y - 1, 1, 1, '#ffffff');
        drawPixel(t.x + 4, t.y - 1, 1, 1, '#ffffff');
        drawPixel(t.x - 1, t.y + 2, 1, 1, '#ffffff');
        drawPixel(t.x + 4, t.y + 2, 1, 1, '#ffffff');

        // Optional swat only if a treat physically falls next to the cat
        if (Math.abs(t.x - (whiskers.x + 5)) < 7 && t.y < 42 && t.y > 28) {
          whiskers.pawSwat = 6;
        }

        // Dog eats the treat -> ONLY HERE DO WE TRIGGER BUSTER'S BOUNCE & HEART
        if (Math.abs(barkly.x - t.x) < 5 && t.y >= 51) {
          treats.splice(i, 1);
          barkly.bounceVel = -2.2; // Launch happy bounce
          barkly.isExcited = true;
          spawnDogHeart(barkly.x + 4, barkly.y - 8);
          setTimeout(() => { barkly.isExcited = false; }, 1800);
        }
      }

      // ----------------------------------------
      // 3. UPDATE & DRAW DOG (BUSTER)
      // ----------------------------------------
      barkly.legFrame += barkly.isExcited ? 0.35 : 0.15;
      barkly.tailWag += 0.3;

      // Handle vertical bounce physics
      barkly.bounceY += barkly.bounceVel;
      if (barkly.bounceY < -5) {
        barkly.bounceVel = 0.35; // fall back down
      } else if (barkly.bounceY >= 0) {
        barkly.bounceY = 0;
        barkly.bounceVel = 0;
      }

      // Movement AI toward treats or patrol
      if (treats.length > 0) {
        barkly.dir = treats[0].x > barkly.x ? 1 : -1;
        barkly.x += barkly.dir * 0.7; // run toward treat
      } else {
        barkly.x += barkly.vx * barkly.dir * (barkly.isExcited ? 1.5 : 1);
        if (barkly.x > 82) barkly.dir = -1;
        if (barkly.x < 24) barkly.dir = 1;
      }

      const bx = barkly.x;
      const by = barkly.y + barkly.bounceY;
      const leg = Math.sin(barkly.legFrame) > 0 ? 1 : 0;
      const wagOffset = Math.sin(barkly.tailWag) > 0 ? 1 : -1;

      // Dog Torso
      drawPixel(bx, by, 9, 6, '#d27d19');
      drawPixel(bx + 2, by + 2, 5, 4, '#f6d376');
      // Legs with running cadence
      drawPixel(bx + 1, by + 6, 2, 2 - leg, '#9b530c');
      drawPixel(bx + 6, by + 6, 2, 1 + leg, '#9b530c');

      // Facing Right
      if (barkly.dir === 1) {
        drawPixel(bx + 7, by - 2, 5, 5, '#d27d19');
        drawPixel(bx + 6, by - 2, 2, 4, '#00bcd4'); // Cyan collar
        drawPixel(bx + 11, by, 2, 2, '#9b530c');
        drawPixel(bx + 12, by, 1, 1, '#111'); // Snout
        drawPixel(bx + 7, by + 2, 1, 2, '#f44336'); // Tongue
        drawPixel(bx - 2, by - 1 + wagOffset, 2, 2, '#d27d19'); // Wags tail
      } else {
        // Facing Left
        drawPixel(bx - 3, by - 2, 5, 5, '#d27d19');
        drawPixel(bx + 1, by - 2, 2, 4, '#00bcd4'); // Cyan collar
        drawPixel(bx - 4, by, 2, 2, '#9b530c');
        drawPixel(bx - 4, by, 1, 1, '#111'); // Snout
        drawPixel(bx + 1, by + 2, 1, 2, '#f44336'); // Tongue
        drawPixel(bx + 9, by - 1 + wagOffset, 2, 2, '#d27d19'); // Wags tail
      }

      // ----------------------------------------
      // 4. UPDATE & DRAW PARTICLES
      // ----------------------------------------
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.y += p.vy;
        p.life -= p.decay;

        if (p.life <= 0) {
          particles.splice(i, 1);
        } else {
          if (p.type === 'heart') {
            drawHeartParticle(p);
          } else {
            drawSparkleParticle(p);
          }
        }
      }

      requestAnimationFrame(renderHabitat);
    }

    requestAnimationFrame(renderHabitat);

    // Feed Treat Button -> Strictly spawns biscuit for Buster
    document.getElementById('feedTreatBtn')?.addEventListener('click', () => {
      const dropX = 26 + Math.random() * 50;
      treats.push({ x: dropX, y: 10 });
    });

    // Switch Pet Button -> Strictly moves Milo with a paced leap & purrs upon landing (NO BUSTER REACTION)
    document.getElementById('switchPetBtn')?.addEventListener('click', () => {
      whiskers.perchTarget = whiskers.perchTarget === 18 ? 68 : 18;
    });
  }

  // ==========================================
  // 7. Search Bar Filter in Overview
  // ==========================================
  const searchInput = document.getElementById('overviewSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#auditLogTableBody tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
});

// ============================================================================
// LIVE DATABASE CONNECTOR
// Talks to the Node/SQLite server (server.js). Each part looks for the elements
// it needs and is skipped when they are not on the page, so it is safe on every
// page (desktop and mobile). If the server can't be reached, a page keeps
// showing its built-in content.
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const kgUser = (function () {
    try { return JSON.parse(localStorage.getItem('kibbleguard_user')) || {}; } catch (e) { return {}; }
  })();
  const kgUserId = kgUser.id || 1;
  const IS_MOBILE = /(^|\/)mobile-[^\/]*$/.test(window.location.pathname);
  const RESULTS_PAGE = IS_MOBILE ? 'mobile-results.html' : 'results.html';

  const esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  const getJson = function (url) {
    return fetch(url).then(function (res) { if (!res.ok) throw new Error('Server returned ' + res.status); return res.json(); });
  };
  const pad2 = function (n) { return String(Math.max(0, Math.round(Number(n) || 0))).padStart(2, '0'); };
  const riskOf = function (r) { return Math.max(0, Math.min(100, 100 - (Number(r.score) || 0))); };   // risk index = 100 - safety score
  const statusOf = function (r) { return r.result === 'Toxic' ? 'lethal' : (r.result === 'Caution' ? 'caution' : 'safe'); };
  const isFeline = function (v) { return /fel|cat/i.test(String(v || '')); };
  const splitList = function (v) { return Array.isArray(v) ? v : String(v || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean); };
  const fmtDate = function (iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const fmtShort = function (iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const fmtTime = function (iso) { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const petFromDb = function (p) {
    return {
      id: p.id, name: p.name || 'Companion', species: isFeline(p.species) ? 'feline' : 'canine', breed: p.breed || '',
      lifeStage: p.life_stage || '', weightKg: p.weight, sensitivities: splitList(p.allergies), photoUrl: p.image_url || null
    };
  };
  const watchChip = function (phrase, small) {
    const lower = String(phrase).toLowerCase();
    const severe = /fatal|prohibited|xylitol|hazard/.test(lower);
    const cls = severe ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-[#b45309]';
    return '<span class="px-2.5 py-0.5 rounded-lg ' + cls + ' font-bold text-[' + (small ? '9.5' : '10') + 'px]">' + esc(phrase) + '</span>';
  };

  // Everything below needs the same two lists, so each is fetched once.
  let petsPromise = null, historyPromise = null;
  const loadPets = function () { return petsPromise || (petsPromise = getJson('/api/pets?user_id=' + encodeURIComponent(kgUserId)).then(function (rows) { return (rows || []).map(petFromDb); })); };
  const loadHistory = function () { return historyPromise || (historyPromise = getJson('/api/history?user_id=' + encodeURIComponent(kgUserId))); };

  // --------------------------------------------------------------------------
  // 1. Sidebar: the logged-in owner's name, and how many pets they have
  // --------------------------------------------------------------------------
  if (kgUser.name) {
    const nameEl = document.getElementById('sidebarUserName');
    if (nameEl) nameEl.textContent = kgUser.name;
    const avatarEl = document.getElementById('sidebarAvatarCircle');
    if (avatarEl) avatarEl.textContent = String(kgUser.name).trim().split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join('').toUpperCase();
  }
  const sidebarLoc = document.getElementById('sidebarUserLoc');
  if (sidebarLoc) {
    loadPets().then(function (pets) {
      const city = String(sidebarLoc.textContent).split('•')[0].trim() || 'Las Piñas City';
      sidebarLoc.textContent = city + ' • ' + pets.length + (pets.length === 1 ? ' Pet' : ' Pets');
    }).catch(function () {});
  }

  // --------------------------------------------------------------------------
  // 2. History page (desktop): the audit log from the database, with the
  //    summary numbers, filter pills and search all working
  // --------------------------------------------------------------------------
  const historyBox = document.getElementById('historyRecordsContainer');
  if (historyBox) {
    const STYLES = {
      caution: { edge: 'border-l-amber-600 hover:border-amber-700', ring: 'border-amber-600 text-amber-700', pill: 'bg-amber-100 text-amber-800', word: 'Caution', text: 'text-amber-800' },
      safe: { edge: 'border-l-emerald-600 hover:border-emerald-700', ring: 'border-emerald-600 text-emerald-700', pill: 'bg-emerald-100 text-emerald-800', word: 'Safe', text: 'text-emerald-700' },
      lethal: { edge: 'border-l-red-600 hover:border-red-700', ring: 'border-red-600 text-red-700', pill: 'bg-red-100 text-red-800', word: 'Lethal', text: 'text-red-700' },
      allergy: { edge: 'border-l-purple-600 hover:border-purple-700', ring: 'border-purple-600 text-purple-700', pill: 'bg-purple-100 text-purple-800', word: 'Allergy', text: 'text-purple-700' }
    };
    const historyRecord = function (r) {
      const status = statusOf(r);
      const st = r.allergy ? STYLES.allergy : STYLES[status];
      const flagged = Array.isArray(r.flagged) ? r.flagged : [];
      const flaggedText = flagged.length ? flagged.slice(0, 2).join(', ') + (flagged.length > 2 ? ' +' + (flagged.length - 2) + ' more' : '') : 'No flagged ingredients';
      return '' +
        '<div class="tactile-card p-4 bg-white border-l-8 ' + st.edge + ' flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all" data-status="' + status + '">' +
          '<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 flex-1 items-center">' +
            '<div><span class="font-mono font-black text-xs text-[#182811] block">#KG-' + esc(r.id) + '</span>' +
              '<span class="text-[10px] text-[#788673] font-medium">' + esc(fmtDate(r.createdAt)) + ' • ' + esc(fmtTime(r.createdAt)) + '</span></div>' +
            '<div><strong class="text-sm font-extrabold text-[#182811] block">' + esc(r.productName || 'Pet Food Scan') + '</strong>' +
              '<span class="text-[11px] text-[#788673]">' + esc(r.tokens || 0) + ' extracted tokens' + (r.petName ? ' • ' + esc(r.petName) : '') + '</span></div>' +
            '<div class="flex items-center gap-2.5">' +
              '<div class="w-9 h-9 rounded-full border-2 ' + st.ring.split(' ')[0] + ' bg-white flex items-center justify-center shrink-0 shadow-2xs font-black text-xs ' + st.ring.split(' ')[1] + '">' + pad2(riskOf(r)) + '</div>' +
              '<span class="px-2.5 py-0.5 rounded-full ' + st.pill + ' text-[9.5px] font-black uppercase">' + st.word + '</span></div>' +
            '<div><span class="text-xs font-bold ' + st.text + ' block">' + esc(flaggedText) + '</span></div>' +
          '</div>' +
          '<div class="flex items-center justify-end"><a href="' + RESULTS_PAGE + '?batch=KG-' + esc(r.id) + '" class="text-xs font-extrabold text-[#45671d] hover:underline px-3 py-1.5 rounded-lg bg-[#fbf9f6] border border-[#ebdcd0]">Inspect →</a></div>' +
        '</div>';
    };

    const filterBtns = Array.prototype.slice.call(document.querySelectorAll('.history-filter-btn'));
    const searchInput = document.getElementById('historySearchInput');
    const ACTIVE = 'history-filter-btn px-4 py-2 rounded-full text-xs font-extrabold bg-[#45671d] text-white transition-all shrink-0 shadow-xs';
    const IDLE = 'history-filter-btn px-4 py-2 rounded-full text-xs font-bold text-[#788673] bg-[#fbf9f6] border border-[#ebdcd0] hover:text-[#182811] transition-all shrink-0';
    let activeFilter = 'all';

    const applyFilters = function () {
      const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
      let shown = 0;
      Array.prototype.forEach.call(historyBox.querySelectorAll('[data-status]'), function (card) {
        const okStatus = activeFilter === 'all' || card.getAttribute('data-status') === activeFilter;
        const okText = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
        card.style.display = okStatus && okText ? '' : 'none';
        if (okStatus && okText) shown += 1;
      });
      let none = document.getElementById('historyNoMatch');
      if (!shown && historyBox.querySelector('[data-status]')) {
        if (!none) { none = document.createElement('div'); none.id = 'historyNoMatch'; none.className = 'tactile-card p-6 text-center text-xs text-[#788673] font-bold'; none.textContent = 'No scans match this filter.'; historyBox.appendChild(none); }
      } else if (none) { none.remove(); }
    };
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeFilter = btn.getAttribute('data-filter') || 'all';
        filterBtns.forEach(function (b) { b.className = b === btn ? ACTIVE : IDLE; });
        applyFilters();
      });
    });
    if (searchInput) searchInput.addEventListener('input', applyFilters);

    loadHistory().then(function (rows) {
      if (!Array.isArray(rows)) return;
      const total = rows.length;
      const safe = rows.filter(function (r) { return r.result === 'Safe'; }).length;
      const caution = rows.filter(function (r) { return r.result === 'Caution'; }).length;
      const toxic = rows.filter(function (r) { return r.result === 'Toxic'; }).length;
      const setStat = function (id, text, count) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        const bar = el.parentElement ? el.parentElement.querySelector('.h-full') : null;
        if (bar) bar.style.width = (total ? Math.round(count / total * 100) : 0) + '%';
      };
      setStat('historyStatTotal', total + (total === 1 ? ' Record' : ' Records'), total);
      setStat('historyStatSafe', safe + ' Clear', safe);
      setStat('historyStatCaution', caution + ' Flagged', caution);
      setStat('historyStatLethal', toxic + ' Prohibited', toxic);
      if (filterBtns[0]) filterBtns[0].textContent = 'All audits (' + total + ')';

      historyBox.innerHTML = total
        ? rows.map(historyRecord).join('')
        : '<div class="tactile-card p-8 text-center text-xs text-[#788673] font-bold">No scans yet. Scan a label and it will show up here.</div>';
      applyFilters();
    }).catch(function (err) { console.warn('History not loaded from the server, showing the page defaults:', err); });
  }

  // --------------------------------------------------------------------------
  // 3. History page (mobile)
  // --------------------------------------------------------------------------
  if (IS_MOBILE && /mobile-history\.html$/.test(window.location.pathname)) {
    const stack = document.querySelector('main .space-y-2\\.5');
    const stats = document.querySelectorAll('main .grid.grid-cols-2 strong');
    const countSpan = Array.prototype.slice.call(document.querySelectorAll('header span')).filter(function (s) { return /AUDITED/i.test(s.textContent); })[0];
    const M = {
      caution: { edge: 'border-l-[#ff9800]', pill: 'bg-orange-100 text-[#b45309]', word: 'CAUTION' },
      safe: { edge: 'border-l-[#16a34a]', pill: 'bg-emerald-100 text-emerald-800', word: 'SAFE' },
      lethal: { edge: 'border-l-red-600', pill: 'bg-red-100 text-red-700', word: 'LETHAL' },
      allergy: { edge: 'border-l-purple-600', pill: 'bg-purple-100 text-purple-700', word: 'ALLERGY' }
    };
    // Search box + filter pills -- mirrors desktop history.html's applyFilters(), which
    // mobile never had any wiring for (the pills/search box were entirely missing from
    // the mobile markup until now).
    const mSearchInput = document.getElementById('historySearchInput');
    const mFilterBtns = Array.prototype.slice.call(document.querySelectorAll('.history-filter-btn'));
    const M_ACTIVE = 'history-filter-btn px-3 py-1.5 rounded-full text-[11px] font-extrabold bg-[#45671d] text-white shrink-0 shadow-xs';
    const M_IDLE = 'history-filter-btn px-3 py-1.5 rounded-full text-[11px] font-bold text-[#788673] bg-white border border-[#ebdcd0] shrink-0';
    let mActiveFilter = 'all';
    const mApplyFilters = function () {
      if (!stack) return;
      const q = mSearchInput ? mSearchInput.value.trim().toLowerCase() : '';
      let shown = 0;
      Array.prototype.forEach.call(stack.querySelectorAll('[data-status]'), function (card) {
        const okStatus = mActiveFilter === 'all' || card.getAttribute('data-status') === mActiveFilter;
        const okText = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
        card.style.display = okStatus && okText ? '' : 'none';
        if (okStatus && okText) shown += 1;
      });
      let none = document.getElementById('mHistoryNoMatch');
      if (!shown && stack.querySelector('[data-status]')) {
        if (!none) { none = document.createElement('div'); none.id = 'mHistoryNoMatch'; none.className = 'tactile-card p-5 text-center text-xs text-[#788673] font-bold'; none.textContent = 'No scans match this filter.'; stack.appendChild(none); }
      } else if (none) { none.remove(); }
    };
    mFilterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        mActiveFilter = btn.getAttribute('data-filter') || 'all';
        mFilterBtns.forEach(function (b) { b.className = b === btn ? M_ACTIVE : M_IDLE; });
        mApplyFilters();
      });
    });
    if (mSearchInput) mSearchInput.addEventListener('input', mApplyFilters);

    if (stack) {
      loadHistory().then(function (rows) {
        if (!Array.isArray(rows)) return;
        const n = function (res) { return rows.filter(function (r) { return r.result === res; }).length; };
        if (countSpan) countSpan.textContent = rows.length + ' AUDITED';
        if (stats.length >= 4) {
          stats[0].textContent = rows.length + (rows.length === 1 ? ' Record' : ' Records');
          stats[1].textContent = n('Safe') + ' Clear';
          stats[2].textContent = n('Caution') + ' Flagged';
          stats[3].textContent = n('Toxic') + ' Toxic';
        }
        stack.innerHTML = rows.length ? rows.map(function (r) {
          const status = statusOf(r);
          const st = M[r.allergy ? 'allergy' : status];
          const flagged = Array.isArray(r.flagged) ? r.flagged : [];
          const who = (r.petName ? r.petName + ' ' : '') + '(' + (isFeline(r.species) ? 'Feline' : 'Canine') + ')';
          const line = flagged.length ? flagged.slice(0, 2).join(', ') + ' flagged.' : 'No flagged ingredients.';
          return '' +
            '<div class="tactile-card p-3.5 space-y-1 bg-white border-l-4 ' + st.edge + ' cursor-pointer" data-status="' + (r.allergy ? 'allergy' : status) + '" onclick="window.location.href=\'' + RESULTS_PAGE + '?batch=KG-' + esc(r.id) + '\'">' +
              '<div class="flex items-center justify-between"><span class="font-mono text-[10px] font-bold text-slate-500">#KG-' + esc(r.id) + ' • ' + esc(fmtShort(r.createdAt)) + '</span>' +
                '<span class="px-2 py-0.5 rounded ' + st.pill + ' font-extrabold text-[8.5px]">' + st.word + '</span></div>' +
              '<h4 class="font-black text-xs text-[#182811]">' + esc(r.productName || 'Pet Food Scan') + '</h4>' +
              '<p class="text-[10.5px] text-[#788673]">' + esc(who) + ' • ' + esc(line) + '</p>' +
            '</div>';
        }).join('') : '<div class="tactile-card p-6 text-center text-xs text-[#788673] font-bold">No scans yet. Scan a label and it will show up here.</div>';
        mApplyFilters();
      }).catch(function (err) { console.warn('History not loaded from the server, showing the page defaults:', err); });
    }
  }

  // --------------------------------------------------------------------------
  // 4. Overview page (desktop + mobile): summary tiles, your pets, recent scans
  // --------------------------------------------------------------------------
  const labelSpan = function (re) {
    return Array.prototype.slice.call(document.querySelectorAll('span')).filter(function (s) { return re.test(s.textContent); })[0] || null;
  };
  const scansLabel = labelSpan(/^\s*EVALUATED SCANS\s*$/i);
  if (scansLabel) {
    const tileOf = function (el) { return el.closest('.tactile-card'); };
    const scansTile = tileOf(scansLabel);
    const tilesParent = scansTile ? scansTile.parentElement : null;
    const tiles = tilesParent ? Array.prototype.slice.call(tilesParent.children) : [];
    const petsTile = tiles[0], cautionTile = tiles[2];
    const valueOf = function (tile) { return tile ? tile.querySelector(IS_MOBILE ? 'h3' : 'strong') : null; };
    const subOf = function (tile) { const v = valueOf(tile); return v ? v.nextElementSibling : null; };
    const statusOfTile = function (tile) { return tile ? tile.querySelector('.border-t > span') : null; };
    const setText = function (el, text) { if (el) el.textContent = text; };

    Promise.all([loadPets(), loadHistory()]).then(function (res) {
      const pets = res[0], rows = res[1] || [];
      const flaggedRows = rows.filter(function (r) { return r.result !== 'Safe' || (r.flagged || []).length > 0; });   // anything flagged, even when the overall verdict stays Safe
      const clean = rows.length - flaggedRows.length;

      // pets tile
      setText(valueOf(petsTile), pets.length + ' Active');
      const names = pets.slice(0, 2).map(function (p) { return p.name + ' (' + (p.species === 'feline' ? 'Cat' : 'Dog') + ')'; });
      setText(subOf(petsTile), pets.length ? names.join(' & ') + (pets.length > 2 ? ' +' + (pets.length - 2) + ' more' : '') + (IS_MOBILE ? ' • All Guarded' : '') : 'No pets added yet');
      setText(statusOfTile(petsTile), pets.length ? (pets.length === 1 ? '● Guarded' : '● All Guarded') : '● Add a pet to start');

      // scans tile
      setText(valueOf(scansTile), rows.length + (rows.length === 1 ? ' Batch' : ' Batches'));
      setText(subOf(scansTile), clean + ' Clean • ' + flaggedRows.length + ' Flagged' + (IS_MOBILE ? ' with Additives' : ''));
      setText(statusOfTile(scansTile), rows.length ? 'Last scan: ' + fmtShort(rows[0].createdAt) : 'No scans yet');

      // caution tile
      const counts = {};
      flaggedRows.forEach(function (r) { (r.flagged || []).forEach(function (n) { counts[n] = (counts[n] || 0) + 1; }); });
      const top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 2);
      setText(valueOf(cautionTile), flaggedRows.length + ' Flagged');
      setText(subOf(cautionTile), top.length ? top.join(' & ') + ' flagged' + (IS_MOBILE ? ' in your scans' : '') : 'No flagged ingredients');
      setText(statusOfTile(cautionTile), flaggedRows.some(function (r) { return r.result === 'Toxic'; }) ? '▲ High Risk' : (flaggedRows.length ? '▲ Moderate Risk' : '✓ No risk found'));

      // household companions (desktop only: the mobile overview has no pet cards)
      const petsHeading = Array.prototype.slice.call(document.querySelectorAll('h3')).filter(function (h) { return /Household companions/i.test(h.textContent); })[0];
      const petGrid = petsHeading ? petsHeading.closest('.space-y-3').querySelector('.grid') : null;
      if (petGrid) {
        const lastFor = function (petId) { return rows.filter(function (r) { return r.petId === petId; })[0]; };
        petGrid.innerHTML = pets.length ? pets.map(function (p) {
          const feline = p.species === 'feline';
          const last = lastFor(p.id);
          const risk = last ? (last.result === 'Safe' ? ['text-emerald-700', 'Clean'] : (last.result === 'Toxic' ? ['text-red-700', 'Toxic'] : ['text-amber-700', 'Caution'])) : null;
          const avatar = p.photoUrl
            ? '<img src="' + esc(p.photoUrl) + '" alt="' + esc(p.name) + '" class="w-full h-full object-cover">'
            : '<div class="w-full h-full flex items-center justify-center text-xl ' + (feline ? 'bg-purple-100' : 'bg-orange-100') + '">' + (feline ? '🐱' : '🐶') + '</div>';
          const chips = p.sensitivities.slice(0, 3).map(function (t) { return watchChip(t); }).join('') || '<span class="text-[10px] text-[#788673] italic">No active watches</span>';
          return '' +
            '<div class="tactile-card p-5 bg-white space-y-3">' +
              '<div class="flex items-center justify-between"><div class="flex items-center gap-3">' +
                '<div class="w-12 h-12 rounded-full border-2 ' + (feline ? 'border-purple-300' : 'border-amber-400') + ' overflow-hidden shrink-0 shadow-2xs">' + avatar + '</div>' +
                '<div><h4 class="font-extrabold text-sm text-[#182811]">' + esc(p.name) + '</h4><span class="text-[11px] text-[#788673] block">' + esc((p.breed || (feline ? 'Cat' : 'Dog')) + (p.lifeStage ? ' • ' + p.lifeStage : '')) + '</span></div></div>' +
                '<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9.5px] font-extrabold uppercase">Protected</span></div>' +
              '<div class="space-y-1 pt-1"><span class="text-[9.5px] font-extrabold uppercase text-[#788673] block tracking-wider">Active watches</span><div class="flex flex-wrap gap-1.5">' + chips + '</div></div>' +
              '<div class="pt-2.5 border-t border-[#ebdcd0] flex items-center justify-between text-xs">' +
                '<span class="text-[#788673]">Risk index: ' + (risk ? '<strong class="' + risk[0] + ' font-bold">' + risk[1] + ' (' + riskOf(last) + ')</strong>' : '<strong class="text-[#788673] font-bold">No scans yet</strong>') + '</span>' +
                '<a href="' + RESULTS_PAGE + '?pet=' + encodeURIComponent(p.id) + '" class="text-[#45671d] font-extrabold hover:underline">Scan →</a></div>' +
            '</div>';
        }).join('') : '<div class="col-span-full tactile-card p-6 text-center text-xs text-[#788673] font-bold">No pets added yet. <a href="pets.html" class="text-[#45671d] hover:underline">Add your first pet →</a></div>';
      }

      // recent scans
      const recentHeading = Array.prototype.slice.call(document.querySelectorAll('h3')).filter(function (h) { return /^(Recent scans|Recent Inspections)$/i.test(h.textContent.trim()); })[0];
      const recentCard = recentHeading ? recentHeading.closest('.tactile-card') : null;
      const recentList = recentCard ? recentCard.querySelector(IS_MOBILE ? '.space-y-2' : '.space-y-3') : null;
      if (recentList) {
        const recent = rows.slice(0, 3);
        if (!recent.length) {
          recentList.innerHTML = '<div class="p-4 rounded-2xl border border-[#ebdcd0] text-xs text-[#788673] font-bold text-center">No scans yet. Scan a label and it will show up here.</div>';
        } else if (IS_MOBILE) {
          recentList.innerHTML = recent.map(function (r) {
            const pill = r.allergy ? ['bg-purple-100 text-purple-700', 'Allergy'] : (r.result === 'Toxic' ? ['bg-red-100 text-red-700', 'Toxic'] : (r.result === 'Caution' ? ['bg-orange-100 text-[#b45309]', 'Caution'] : ['bg-emerald-100 text-emerald-800', 'Safe']));
            return '<a href="' + RESULTS_PAGE + '?batch=KG-' + esc(r.id) + '" class="p-2.5 rounded-xl border border-[#ebdcd0] flex items-center justify-between text-xs bg-[#fbf9f6] block">' +
              '<div><strong class="text-[#182811] block text-xs">' + esc(r.productName || 'Pet Food Scan') + '</strong><span class="text-[10px] text-[#788673]">' + esc((r.petName ? r.petName + ' • ' : '') + fmtShort(r.createdAt)) + '</span></div>' +
              '<span class="px-2 py-0.5 rounded ' + pill[0] + ' font-extrabold text-[9px]">' + pill[1] + '</span></a>';
          }).join('');
        } else {
          const R = {
            caution: { box: 'border-amber-200 bg-[#fef9ec]', ring: 'border-amber-600', num: 'text-amber-700', lab: 'text-amber-800', note: 'text-amber-800', btn: 'border-amber-300' },
            safe: { box: 'border-emerald-200 bg-[#e2f4ed]/50', ring: 'border-emerald-600', num: 'text-emerald-700', lab: 'text-emerald-800', note: 'text-emerald-700', btn: 'border-emerald-300' },
            lethal: { box: 'border-red-200 bg-red-50/60', ring: 'border-red-600', num: 'text-red-700', lab: 'text-red-800', note: 'text-red-700', btn: 'border-red-300' }
          };
          recentList.innerHTML = recent.map(function (r) {
            const st = R[statusOf(r)];
            const flagged = r.flagged || [];
            const note = r.allergy ? '🐾 Allergy match for ' + (r.petName || 'your pet') : (flagged.length ? '▲ ' + flagged.slice(0, 2).join(', ') + ' detected' : '✓ No flagged ingredients');
            return '' +
              '<div class="p-3 rounded-2xl border ' + st.box + ' flex items-center justify-between gap-3 text-xs">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                  '<div class="w-12 h-12 rounded-full border-2 ' + st.ring + ' bg-white flex flex-col items-center justify-center shrink-0 shadow-2xs"><span class="text-xs font-black ' + st.num + ' leading-none">' + pad2(riskOf(r)) + '</span><span class="text-[7.5px] font-extrabold uppercase tracking-tighter ' + st.lab + '">RISK</span></div>' +
                  '<div class="space-y-0.5 min-w-0"><strong class="text-[#182811] block font-extrabold text-xs truncate">' + esc(r.productName || 'Pet Food Scan') + '</strong>' +
                    '<span class="text-[10px] text-[#788673] block truncate">' + esc((r.petName ? r.petName + ' • ' : '') + (r.tokens || 0) + ' tokens parsed') + '</span>' +
                    '<span class="text-[10px] font-bold ' + st.note + '">' + esc(note) + '</span></div></div>' +
                '<a href="' + RESULTS_PAGE + '?batch=KG-' + esc(r.id) + '" class="px-3 py-1.5 rounded-xl bg-white border ' + st.btn + ' text-[#45671d] font-extrabold text-xs hover:bg-[#45671d] hover:text-white transition-all shrink-0">Inspect →</a>' +
              '</div>';
          }).join('');
        }
      }
    }).catch(function (err) { console.warn('Overview not loaded from the server, showing the page defaults:', err); });
  }

  // --------------------------------------------------------------------------
  // 5. Pet Profiles (mobile): your pets from the database + add-pet form
  // --------------------------------------------------------------------------
  if (IS_MOBILE && /mobile-pets\.html$/.test(window.location.pathname)) {
    var CANINE_CONDS = ['None','Allergies','Arthritis','Diabetes','Epilepsy','Heart Disease','Hypothyroidism','IBD','Kidney Disease','Liver Disease','Obesity','Skin Conditions'];
    var FELINE_CONDS = ['None','Allergies','Arthritis','CKD (Chronic Kidney Disease)','Diabetes','Feline Asthma','Feline Lower Urinary Tract Disease','Heart Disease','Hyperthyroidism','IBD','Obesity','Skin Conditions'];

    function mUpdateConditions(species) {
      var sel = document.getElementById('mPetMedicalConditionsInput');
      if (!sel) return;
      var opts = /feline|cat/i.test(species) ? FELINE_CONDS : CANINE_CONDS;
      var cur = sel.value;
      sel.innerHTML = opts.map(function(o){ return '<option value="' + o + '"' + (o === cur ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    }

    // iOS Safari has a long-standing bug where, after its native <select> picker closes inside a
    // scrollable overlay like this bottom sheet, the page can get stuck at its current scroll
    // position and stop responding to swipes entirely until reloaded. Forcing a reflow right
    // after the picker closes (toggling overflow off and back on, one frame later) is the
    // standard workaround -- it makes Safari recompute the scrollable area instead of leaving it
    // wedged in whatever state the picker left it in.
    function mUnstickScroll() {
      var panel = document.querySelector('#mobileAddPetModal > div');
      if (!panel) return;
      panel.style.overflow = 'hidden';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { panel.style.overflow = 'auto'; });
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#mobileAddPetForm select, #mobileAddPetForm input'), function (el) {
      el.addEventListener('change', mUnstickScroll);
      el.addEventListener('blur', mUnstickScroll);
    });

    // Mobile only ever had Add + Delete for pets -- there was no way to fix a typo in a pet's
    // name, update their weight, or change a medical condition without deleting and re-adding
    // them from scratch. The backend already supports this (POST /api/pets upserts by id when
    // the id already exists), so this just needed the missing Edit button + pre-filled form.
    var petsById = {};
    var editingPetId = null;

    // Companion photo upload -- mirrors desktop pets.js's own photo field, which the
    // mobile add/edit form never had at all (editing only ever carried over whatever
    // photo a pet already had; there was no way to set or change one on mobile).
    var mCurrentUploadedPhoto = null;
    var petImageFileInput = document.getElementById('petImageFileInput');
    var petPhotoPreviewImg = document.getElementById('petPhotoPreviewImg');
    var previewEmojiFallback = document.getElementById('previewEmojiFallback');
    var removePhotoBtn = document.getElementById('removePhotoBtn');

    function mShowPhotoInPreview(dataUrl) {
      if (!petPhotoPreviewImg || !previewEmojiFallback) return;
      if (dataUrl) {
        petPhotoPreviewImg.src = dataUrl;
        petPhotoPreviewImg.classList.remove('hidden');
        previewEmojiFallback.classList.add('hidden');
        if (removePhotoBtn) removePhotoBtn.classList.remove('hidden');
      } else {
        petPhotoPreviewImg.src = '';
        petPhotoPreviewImg.classList.add('hidden');
        previewEmojiFallback.classList.remove('hidden');
        if (removePhotoBtn) removePhotoBtn.classList.add('hidden');
      }
    }

    if (petImageFileInput) {
      petImageFileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          alert('Selected image exceeds 2MB limit. Please select a smaller photo.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function (evt) {
          mCurrentUploadedPhoto = evt.target.result;
          mShowPhotoInPreview(mCurrentUploadedPhoto);
        };
        reader.readAsDataURL(file);
      });
    }
    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', function () {
        mCurrentUploadedPhoto = null;
        if (petImageFileInput) petImageFileInput.value = '';
        mShowPhotoInPreview(null);
      });
    }

    function mRenderPets(pets) {
      var main = document.getElementById('mobilePetsMain');
      var countEl = document.getElementById('mobilePetCount');
      if (!main) return;
      petsById = {};
      pets.forEach(function (p) { petsById[p.id] = p; });
      if (countEl) countEl.textContent = pets.length + ' REGISTERED';
      main.innerHTML = '';
      if (!pets.length) {
        main.innerHTML = '<div class="tactile-card p-6 text-center text-xs text-[#788673] font-bold bg-white rounded-2xl">No pets yet. Tap <i class="fa-solid fa-plus"></i> to add one.</div>';
        return;
      }
      main.innerHTML = pets.map(function(p) {
        var feline = /feline|cat/i.test(String(p.species || ''));
        var badge = feline ? '<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-black text-[8.5px]">FELINE</span>' : '<span class="px-2 py-0.5 rounded bg-orange-100 text-[#b45309] font-black text-[8.5px]">CANINE</span>';
        var pic = p.image_url ? '<img src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '" class="w-10 h-10 rounded-xl object-cover border border-[#ebdcd0]">' : '<span class="text-3xl">' + (feline ? '🐱' : '🐶') + '</span>';
        var sensitivities = String(p.allergies || '').split(',').map(function(t){ return t.trim(); }).filter(Boolean);
        var chips = sensitivities.map(function(t) {
          var severe = /fatal|prohibited|xylitol|hazard/i.test(t);
          return '<span class="px-2 py-0.5 rounded ' + (severe ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-orange-50 border border-orange-200 text-[#b45309]') + ' font-bold text-[9.5px]">' + esc(t) + '</span>';
        }).join('') || '<span class="text-[10px] text-[#788673] italic">No active contraindications.</span>';
        var medTags = '';
        if (p.takes_medicine === 'Yes') medTags += '<span class="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-bold text-[9.5px]">On Medication</span> ';
        if (p.takes_supplements === 'Yes') medTags += '<span class="px-2 py-0.5 rounded bg-green-50 border border-green-200 text-green-700 font-bold text-[9.5px]">Takes Supplements</span> ';
        if (p.medical_conditions && p.medical_conditions !== 'None') medTags += '<span class="px-2 py-0.5 rounded bg-yellow-50 border border-yellow-200 text-yellow-700 font-bold text-[9.5px]">' + esc(p.medical_conditions) + '</span>';
        return '<div class="tactile-card p-4 space-y-3 bg-white">' +
          '<div class="flex items-center justify-between"><div class="flex items-center gap-3">' + pic +
            '<div><div class="flex items-center gap-1.5"><h3 class="text-sm font-black text-[#182811]">' + esc(p.name) + '</h3>' + badge + '</div>' +
            '<p class="text-[11px] text-[#788673] font-bold">' + esc((p.breed || 'Companion') + (p.weight ? ' • ' + p.weight + ' kg' : '')) + '</p></div></div>' +
            '<div class="flex items-center gap-3">' +
              '<button class="mobile-edit-pet text-[10px] text-[#45671d] font-bold" data-pet-id="' + esc(p.id) + '"><i class="fa-solid fa-pen"></i></button>' +
              '<button class="mobile-delete-pet text-[10px] text-red-400 font-bold" data-pet-id="' + esc(p.id) + '"><i class="fa-solid fa-trash-can"></i></button>' +
            '</div>' +
          '</div>' +
          (medTags ? '<div class="flex flex-wrap gap-1">' + medTags + '</div>' : '') +
          '<div class="p-2.5 bg-[#fbf9f6] rounded-xl border border-[#ebdcd0] text-[11px] space-y-1"><strong class="text-[9px] uppercase font-bold text-[#788673] block">Active Watches:</strong><div class="flex flex-wrap gap-1">' + chips + '</div></div>' +
          '<a href="' + RESULTS_PAGE + '?pet=' + encodeURIComponent(p.id) + '" class="block w-full py-2 text-center bg-[#45671d]/10 text-[#45671d] font-black rounded-xl text-xs"><i class="fa-solid fa-camera mr-1"></i> Scan for ' + esc(p.name) + '</a>' +
        '</div>';
      }).join('');

      // delete listeners
      Array.prototype.slice.call(main.querySelectorAll('.mobile-delete-pet')).forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var petId = btn.getAttribute('data-pet-id');
          if (!confirm('Delete this pet?')) return;
          fetch('/api/pets/' + encodeURIComponent(petId), { method: 'DELETE' })
            .then(function(r) { if (r.ok) mLoadAndRender(); })
            .catch(function(err) { console.error('Delete failed', err); });
        });
      });

      // edit listeners
      Array.prototype.slice.call(main.querySelectorAll('.mobile-edit-pet')).forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var petId = btn.getAttribute('data-pet-id');
          var p = petsById[petId];
          if (p) mOpenEditPet(p);
        });
      });
    }

    // Pre-fills the Add/Edit modal with an existing pet's data and flips it into "edit" mode,
    // so Save updates that pet (same id, upserted by the backend) instead of creating a new one.
    function mOpenEditPet(p) {
      var modal = document.getElementById('mobileAddPetModal');
      var title = document.getElementById('mobileModalTitle');
      if (!modal) return;
      editingPetId = p.id;
      if (title) title.textContent = 'Edit Pet';
      var set = function (id, val) { var el = document.getElementById(id); if (el) el.value = (val == null ? '' : val); };
      set('mPetNameInput', p.name);
      set('mPetSpeciesInput', /feline|cat/i.test(String(p.species || '')) ? 'Feline' : 'Canine');
      set('mPetBreedInput', p.breed);
      set('mPetGenderInput', p.gender);
      set('mPetWeightInput', p.weight);
      set('mPetBirthdateInput', (p.birthdate || '').slice(0, 10));
      set('mPetAgeInput', p.life_stage || 'Adult');
      set('mPetVaccineInput', p.vaccine_status || 'Up to Date');
      set('mPetDewormingInput', (p.deworming_date || '').slice(0, 10));
      set('mPetSensitivitiesInput', p.allergies);
      set('mPetMedicineInput', p.takes_medicine || 'No');
      set('mPetSupplementsInput', p.takes_supplements || 'No');
      mUpdateConditions(p.species || 'Canine');
      set('mPetMedicalConditionsInput', p.medical_conditions || 'None');
      mCurrentUploadedPhoto = p.image_url || null;
      mShowPhotoInPreview(mCurrentUploadedPhoto);
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }

    function mLoadAndRender() {
      loadPets().then(function(pets) {
        mRenderPets(pets.map(function(p){ return p._raw || p; }));
      }).catch(function(err) {
        console.warn('Could not load pets:', err);
        // fallback: fetch directly
        fetch('/api/pets?user_id=' + encodeURIComponent(kgUserId))
          .then(function(r){ return r.json(); })
          .then(function(rows){ mRenderPets(rows || []); })
          .catch(function(){ mRenderPets([]); });
      });
    }

    // Wire add-pet button
    var addBtn = document.getElementById('mobileAddPetBtn');
    var modal = document.getElementById('mobileAddPetModal');
    var closeBtn = document.getElementById('mobileClosePetModal');
    var addForm = document.getElementById('mobileAddPetForm');
    var speciesSel = document.getElementById('mPetSpeciesInput');

    if (addBtn && modal) {
      addBtn.addEventListener('click', function() {
        editingPetId = null;
        var title = document.getElementById('mobileModalTitle');
        if (title) title.textContent = 'Add Pet';
        if (addForm) addForm.reset();
        mCurrentUploadedPhoto = null;
        mShowPhotoInPreview(null);
        mUpdateConditions('Canine');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
      });
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', function() {
        editingPetId = null;
        modal.classList.add('hidden');
        modal.style.display = 'none';
      });
    }
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) { editingPetId = null; modal.classList.add('hidden'); modal.style.display = 'none'; }
      });
    }
    if (speciesSel) {
      speciesSel.addEventListener('change', function() { mUpdateConditions(speciesSel.value); });
    }

    if (addForm) {
      addForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var saveBtn = document.getElementById('mPetSaveText');
        var name = (document.getElementById('mPetNameInput') || {}).value || '';
        if (!name.trim()) { alert('Please enter a pet name.'); return; }
        var species = (document.getElementById('mPetSpeciesInput') || {}).value || 'Canine';
        // Reusing the existing pet's id makes this an UPDATE rather than a new pet -- the backend
        // already upserts on id (POST /api/pets ... ON CONFLICT(id) DO UPDATE), this was just
        // never given the id to reuse. image_url is carried over too, so editing a pet never
        // silently wipes out a photo it already had (this form has no photo field of its own).
        var existingPet = editingPetId ? petsById[editingPetId] : null;
        var payload = {
          id: editingPetId || ('pet-' + Date.now()),
          user_id: kgUserId,
          name: name.trim(),
          species: species,
          breed: ((document.getElementById('mPetBreedInput') || {}).value || '').trim() || '',
          gender: (document.getElementById('mPetGenderInput') || {}).value || null,
          birthdate: (document.getElementById('mPetBirthdateInput') || {}).value || null,
          weight: parseFloat((document.getElementById('mPetWeightInput') || {}).value) || null,
          allergies: ((document.getElementById('mPetSensitivitiesInput') || {}).value || '').trim(),
          vaccine_status: (document.getElementById('mPetVaccineInput') || {}).value || 'Up to Date',
          deworming_date: (document.getElementById('mPetDewormingInput') || {}).value || null,
          life_stage: (document.getElementById('mPetAgeInput') || {}).value || 'Adult',
          takes_medicine: (document.getElementById('mPetMedicineInput') || {}).value || 'No',
          takes_supplements: (document.getElementById('mPetSupplementsInput') || {}).value || 'No',
          medical_conditions: (document.getElementById('mPetMedicalConditionsInput') || {}).value || 'None',
          image_url: mCurrentUploadedPhoto || (existingPet ? (existingPet.image_url || null) : null)
        };
        if (saveBtn) saveBtn.textContent = 'Saving…';
        fetch('/api/pets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function(r) {
          if (!r.ok) { alert('Error saving pet.'); return; }
          modal.classList.add('hidden');
          modal.style.display = 'none';
          addForm.reset();
          editingPetId = null;
          mCurrentUploadedPhoto = null;
          mShowPhotoInPreview(null);
          mLoadAndRender();
        }).catch(function(err) {
          console.error('Save error:', err);
          alert('Could not connect to server.');
        }).finally(function() {
          if (saveBtn) saveBtn.textContent = 'Save Pet';
        });
      });
    }

    // Initial load — fetch raw rows from API so we have all columns
    fetch('/api/pets?user_id=' + encodeURIComponent(kgUserId))
      .then(function(r){ return r.json(); })
      .then(function(rows){ mRenderPets(rows || []); })
      .catch(function(){ mRenderPets([]); });
  }
});

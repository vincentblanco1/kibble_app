// KibbleGuard Pixel Terrarium Engine (Self-contained Canvas Runner)
(function initHabitat() {
  const canvas = document.getElementById('habitatCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Virtual low-res pixel grid (scaled up)
  const W = 100;
  const H = 70;
  canvas.width = W;
  canvas.height = H;

  let barkly = { x: 55, y: 48, vx: 0.35, dir: 1, legFrame: 0 };
  let whiskers = { x: 18, y: 35, frame: 0, stretch: 0 };
  let treats = [];

  function drawPixelRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  function renderScene() {
    // 1. Dark Pixel Sky
    ctx.fillStyle = '#0f0f14';
    ctx.fillRect(0, 0, W, H);

    // 2. Mountains
    ctx.fillStyle = '#442f2b';
    ctx.beginPath();
    ctx.moveTo(0, 50); ctx.lineTo(30, 38); ctx.lineTo(60, 50); ctx.fill();
    ctx.fillStyle = '#513a34';
    ctx.beginPath();
    ctx.moveTo(40, 50); ctx.lineTo(75, 34); ctx.lineTo(100, 50); ctx.fill();

    // 3. Autumn Canopy Leaves (Gold / Orange)
    drawPixelRect(8, 20, 22, 12, '#e69c24');
    drawPixelRect(12, 16, 14, 8, '#f8c85c');
    drawPixelRect(6, 26, 26, 8, '#d27d19');
    // Tree Trunk 1
    drawPixelRect(17, 30, 4, 25, '#4a2e2b');

    drawPixelRect(48, 18, 26, 14, '#d27d19');
    drawPixelRect(54, 14, 16, 8, '#f8c85c');
    drawPixelRect(44, 26, 32, 8, '#bd6413');
    // Tree Trunk 2
    drawPixelRect(58, 30, 5, 25, '#3e2321');

    drawPixelRect(80, 20, 20, 12, '#e69c24');
    drawPixelRect(84, 16, 14, 8, '#f8c85c');
    // Tree Trunk 3
    drawPixelRect(88, 30, 4, 25, '#4a2e2b');

    // 4. Ground Soil & Grass
    drawPixelRect(0, 54, W, 3, '#f6d376');
    drawPixelRect(0, 57, W, 4, '#c9903e');
    drawPixelRect(0, 61, W, 9, '#7d4f27');

    // Fallen Leaves
    drawPixelRect(12, 55, 2, 1, '#bd3a13');
    drawPixelRect(38, 56, 2, 1, '#f8c85c');
    drawPixelRect(72, 55, 2, 1, '#bd3a13');
    drawPixelRect(92, 56, 2, 1, '#f8c85c');

    // 5. Whiskers the Cat (Perched in Tree 1)
    whiskers.frame += 0.03;
    const catY = whiskers.y + (Math.sin(whiskers.frame) > 0.8 ? -1 : 0);
    drawPixelRect(whiskers.x, catY, 8, 6, '#9e9e9e'); // body
    drawPixelRect(whiskers.x + 5, catY - 4, 5, 5, '#bdbdbd'); // head
    drawPixelRect(whiskers.x + 5, catY - 6, 2, 2, '#757575'); // ear
    drawPixelRect(whiskers.x + 8, catY - 6, 2, 2, '#757575'); // ear
    drawPixelRect(whiskers.x + 8, catY - 2, 1, 1, '#111'); // eye
    drawPixelRect(whiskers.x + 6, catY + 2, 2, 1, '#a855f7'); // collar
    drawPixelRect(whiskers.x - 2, catY + 2, 3, 2, '#9e9e9e'); // tail

    // 6. Treats Logic
    for (let i = treats.length - 1; i >= 0; i--) {
      const t = treats[i];
      t.y += 0.8;
      if (t.y >= 53) t.y = 53;
      drawPixelRect(t.x, t.y, 3, 2, '#fff');
      drawPixelRect(t.x - 1, t.y - 1, 1, 1, '#fff');
      drawPixelRect(t.x + 3, t.y - 1, 1, 1, '#fff');

      // Barkly eating treat
      if (Math.abs(barkly.x - t.x) < 4 && t.y >= 52) {
        treats.splice(i, 1);
      }
    }

    // 7. Barkly the Dog (Trotting Along Floor)
    barkly.legFrame += 0.15;
    if (treats.length > 0) {
      // Chase nearest treat
      const target = treats[0];
      barkly.dir = target.x > barkly.x ? 1 : -1;
      barkly.x += barkly.dir * 0.55;
    } else {
      // Regular stroll
      barkly.x += barkly.vx * barkly.dir;
      if (barkly.x > 82) barkly.dir = -1;
      if (barkly.x < 24) barkly.dir = 1;
    }

    const bx = barkly.x;
    const by = barkly.y;
    const legOffset = Math.sin(barkly.legFrame) > 0 ? 1 : 0;

    // Body
    drawPixelRect(bx, by, 9, 6, '#d27d19');
    drawPixelRect(bx + 2, by + 2, 5, 4, '#f6d376');
    // Legs
    drawPixelRect(bx + 1, by + 6, 2, 2 - legOffset, '#9b530c');
    drawPixelRect(bx + 6, by + 6, 2, 1 + legOffset, '#9b530c');

    if (barkly.dir === 1) {
      // Facing Right
      drawPixelRect(bx + 7, by - 2, 5, 5, '#d27d19'); // head
      drawPixelRect(bx + 6, by - 2, 2, 4, '#00bcd4'); // cyan floppy ear
      drawPixelRect(bx + 11, by, 2, 2, '#9b530c'); // snout
      drawPixelRect(bx + 12, by, 1, 1, '#111'); // nose
      drawPixelRect(bx + 7, by + 2, 1, 2, '#f44336'); // red collar
      drawPixelRect(bx - 2, by - 1, 2, 2, '#d27d19'); // tail
    } else {
      // Facing Left
      drawPixelRect(bx - 3, by - 2, 5, 5, '#d27d19'); // head
      drawPixelRect(bx + 1, by - 2, 2, 4, '#00bcd4'); // cyan floppy ear
      drawPixelRect(bx - 4, by, 2, 2, '#9b530c'); // snout
      drawPixelRect(bx - 4, by, 1, 1, '#111'); // nose
      drawPixelRect(bx + 1, by + 2, 1, 2, '#f44336'); // red collar
      drawPixelRect(bx + 9, by - 1, 2, 2, '#d27d19'); // tail
    }
  }

  function loop() {
    renderScene();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Button Listeners
  const treatBtn = document.getElementById('habitatFeedBtn');
  if (treatBtn) {
    treatBtn.addEventListener('click', () => {
      treats.push({ x: 20 + Math.random() * 60, y: 10 });
    });
  }

  const switchBtn = document.getElementById('habitatSwitchBtn');
  if (switchBtn) {
    switchBtn.addEventListener('click', () => {
      // Swap positions
      const tempX = barkly.x;
      barkly.x = 75;
      whiskers.x = Math.max(15, (tempX % 60) + 10);
    });
  }
})();
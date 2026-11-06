document.addEventListener('DOMContentLoaded', () => {
  // 1. Smooth Scroll for Anchor Links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // 2. Interactive OCR Simulator Dataset (Lower Score = Safe | Higher Score = Toxic)
  const DEMO_SAMPLES = {
    'salmon': {
      id: 'BATCH: #KG-DEMO-03',
      title: 'Wild Alaskan Salmon Entrée',
      score: 'Toxicity Risk: 02 / 100',
      scoreColor: 'text-[#16a34a]',
      badgeText: '✅ Optimal Safety (Minimal Risk)',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      summary: 'High bioavailability animal protein with complete essential amino acid profile. Certified compliant with FEDIAF feline standards with zero toxicity markers.',
      findingName: 'Wild Salmon & Taurine Blend',
      findingTag: 'Vital Nutrients',
      findingDesc: 'Rich in EPA/DHA Omega-3 for renal vascular flow. Mandatory taurine protects felines against dilated cardiomyopathy (DCM).',
      findingBoxClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      tokensHtml: `
        <div class="p-2 rounded-lg border border-dashed border-emerald-500 bg-emerald-500/20 flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-emerald-300">TOKEN: Wild Salmon (Protein)</span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-500 text-black px-1.5 py-0.2 rounded">OPTIMAL</span>
        </div>
        <div class="p-2 rounded-lg border border-dashed border-emerald-500 bg-emerald-500/20 flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-emerald-300">TOKEN: Taurine (Amino Acid)</span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-500 text-black px-1.5 py-0.2 rounded">VITAL</span>
        </div>
      `
    },
    'bha': {
      id: 'BATCH: #KG-DEMO-01',
      title: 'Smokey Beef Jerky Strips',
      score: 'Toxicity Risk: 48 / 100',
      scoreColor: 'text-[#b45309]',
      badgeText: '⚠️ Moderate Hazard (Caution Flag)',
      badgeClass: 'bg-orange-100 text-[#b45309] border-orange-300',
      summary: 'The OCR engine parsed 19 nutritional tokens. 1 synthetic preservative was matched against canine toxicological archives.',
      findingName: 'BHA (Butylated Hydroxyanisole)',
      findingTag: 'Endocrine Caution',
      findingDesc: 'Chemical fat stabilizer associated with chronic bioaccumulation and allergic dermatitis in canine models. Recommended: Mixed Tocopherols.',
      findingBoxClass: 'bg-[#fff8ed] border-[#ff9800]/30 text-amber-900',
      tokensHtml: `
        <div class="p-2 rounded-lg border border-dashed border-[#ff9800] bg-[#ff9800]/20 flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-amber-300">TOKEN: BHA (Preservative)</span>
          <span class="text-[9px] font-extrabold uppercase bg-amber-500 text-black px-1.5 py-0.2 rounded">CAUTION</span>
        </div>
        <div class="p-2 rounded-lg border border-dashed border-emerald-500 bg-emerald-500/20 flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-emerald-300">TOKEN: Deboned Beef</span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-500 text-black px-1.5 py-0.2 rounded">SAFE</span>
        </div>
      `
    },
    'xylitol': {
      id: 'BATCH: #KG-DEMO-02',
      title: 'Dental Care Sweetener Chews',
      score: 'Toxicity Risk: 96 / 100',
      scoreColor: 'text-red-700',
      badgeText: '🚨 Severe Toxicity (Lethal Hazard)',
      badgeClass: 'bg-red-100 text-red-700 border-red-300 animate-pulse',
      summary: 'Fatal sweetener hazard detected. Ingestion as low as 0.1 g/kg stimulates profound canine pancreatic insulin discharge.',
      findingName: 'Xylitol (Birch Sugar Sweetener)',
      findingTag: 'Canine Fatal',
      findingDesc: 'Causes acute hypoglycemic collapse, seizures, and severe liver necrosis within 12-24 hours. Strictly prohibited for canines.',
      findingBoxClass: 'bg-red-50 border-red-200 text-red-900',
      tokensHtml: `
        <div class="p-2 rounded-lg border border-dashed border-red-500 bg-red-500/25 flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-red-300">TOKEN: Xylitol (Sweetener)</span>
          <span class="text-[9px] font-extrabold uppercase bg-red-600 text-white px-1.5 py-0.2 rounded">LETHAL</span>
        </div>
        <div class="p-2 rounded-lg border border-dashed border-slate-600 bg-slate-700/30 flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-slate-300">TOKEN: Mint Extract</span>
          <span class="text-[9px] font-extrabold uppercase bg-slate-500 text-white px-1.5 py-0.2 rounded">NEUTRAL</span>
        </div>
      `
    }
  };

  const switchBtns = document.querySelectorAll('.demo-switch-btn');
  const demoLaserBeam = document.getElementById('demoLaserBeam');

  switchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sampleKey = btn.getAttribute('data-sample');
      const data = DEMO_SAMPLES[sampleKey];
      if (!data) return;

      switchBtns.forEach(b => {
        b.className = 'demo-switch-btn px-4 py-2 rounded-xl text-xs font-bold text-[#788673] bg-white border border-[#ebdcd0] hover:text-[#182811] shadow-xs transition-all';
      });
      btn.className = 'demo-switch-btn px-4 py-2 rounded-xl text-xs font-extrabold bg-[#45671d] text-white shadow-xs transition-all';

      // Re-trigger laser sweep animation
      if (demoLaserBeam) {
        demoLaserBeam.classList.remove('scan-laser-line');
        void demoLaserBeam.offsetWidth;
        demoLaserBeam.classList.add('scan-laser-line');
      }

      document.getElementById('demoSampleId').textContent = data.id;
      document.getElementById('demoProductTitle').textContent = data.title;
      
      const scoreEl = document.getElementById('demoScoreDisplay');
      scoreEl.textContent = data.score;
      scoreEl.className = `text-2xl font-black ${data.scoreColor}`;

      document.getElementById('demoSummaryText').textContent = data.summary;
      document.getElementById('demoFindingName').textContent = data.findingName;
      document.getElementById('demoFindingDesc').textContent = data.findingDesc;
      document.getElementById('demoTokensOverlay').innerHTML = data.tokensHtml;

      const badge = document.getElementById('demoRiskBadge');
      badge.textContent = data.badgeText;
      badge.className = `px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border ${data.badgeClass}`;

      const card = document.getElementById('demoFindingCard');
      card.className = `p-4 rounded-2xl border space-y-2 text-xs transition-all ${data.findingBoxClass}`;
    });
  });

  // 3. Instant Public Ingredient Quick-Check Widget
  const QUICK_DATA = {
    'xylitol': {
      title: 'Xylitol (Birch Sugar)',
      category: 'Sugar Alcohol Sweetener',
      riskScore: 'Toxicity Score: 98 (Extreme Hazard)',
      badge: 'Critical Lethal',
      badgeClass: 'bg-red-100 text-red-700 border border-red-300',
      canine: 'Fatal insulin surge, severe hypoglycemia, and acute hepatic failure.',
      feline: 'Low documented acute pancreatic spike, but offers zero nutrition.'
    },
    'bha': {
      title: 'BHA & BHT (Preservatives)',
      category: 'Synthetic Phenolic Antioxidants',
      riskScore: 'Toxicity Score: 45 (Moderate Risk)',
      badge: 'Caution Flag',
      badgeClass: 'bg-orange-100 text-[#b45309] border border-orange-300',
      canine: 'Bioaccumulation linked to endocrine disruption and allergic dermatitis.',
      feline: 'Slow feline hepatic clearance increases long-term storage stress.'
    },
    'propylene glycol': {
      title: 'Propylene Glycol',
      category: 'Synthetic Humectant & Preservative',
      riskScore: 'Toxicity Score: 92 for Cats | 35 for Dogs',
      badge: 'Lethal to Cats',
      badgeClass: 'bg-purple-100 text-[#9333ea] border border-purple-300',
      canine: 'Tolerated in small regulated canine kibbles.',
      feline: 'Strictly lethal. Cats lack glucuronidation; causes Heinz body hemolytic anemia.'
    },
    'taurine': {
      title: 'Taurine',
      category: 'Essential Amino Sulfonic Acid',
      riskScore: 'Toxicity Score: 0 (Pure Essential Nutrient)',
      badge: 'Vital Nutrient',
      badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
      canine: 'Beneficial; prevents dilated cardiomyopathy in large breeds.',
      feline: 'Mandatory. Cats cannot synthesize taurine; deficiency causes blindness & DCM.'
    }
  };

  const instantInput = document.getElementById('instantCheckInput');
  const chips = document.querySelectorAll('.quick-chip');

  // Mobile's badge pill uses smaller sizing classes than desktop's; keep the base size
  // classes intact when we swap in the new color classes below instead of hardcoding
  // desktop's sizing on top (that pattern silently resized mobile's filter pills and
  // wiki species-toggle buttons elsewhere in this app, so avoid repeating it here).
  const badgeEl = document.getElementById('instantResultBadge');
  const badgeBaseClass = badgeEl ? badgeEl.className.replace(/\bbg-\S+|\btext-\S+|\bborder(-\S+)?\b/g, '').trim() : '';

  function lookupIngredient(query) {
    const q = query.toLowerCase().trim();
    let match = null;

    if (q.includes('xylitol') || q.includes('birch')) match = QUICK_DATA['xylitol'];
    else if (q.includes('bha') || q.includes('bht')) match = QUICK_DATA['bha'];
    else if (q.includes('propylene') || q.includes('glycol')) match = QUICK_DATA['propylene glycol'];
    else if (q.includes('taurine')) match = QUICK_DATA['taurine'];

    if (match) {
      const titleEl = document.getElementById('instantResultTitle');
      const categoryEl = document.getElementById('instantResultCategory');
      const canineEl = document.getElementById('instantCanineNote');
      const felineEl = document.getElementById('instantFelineNote');
      if (titleEl) titleEl.textContent = match.title;
      if (categoryEl) categoryEl.textContent = `${match.category} • ${match.riskScore}`;
      if (canineEl) canineEl.textContent = match.canine;
      if (felineEl) felineEl.textContent = match.feline;

      if (badgeEl) {
        badgeEl.textContent = match.badge;
        badgeEl.className = `${badgeBaseClass} ${match.badgeClass}`.trim();
      }
    }
  }

  instantInput?.addEventListener('input', (e) => {
    lookupIngredient(e.target.value);
  });

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const term = chip.getAttribute('data-term');
      if (instantInput) instantInput.value = term;
      lookupIngredient(term);
    });
  });
});
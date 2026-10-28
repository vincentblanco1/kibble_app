document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. NOTIFICATION BELL & DROPDOWN ENGINE
  // ==========================================
  const notifBtn = document.getElementById('notificationBellBtn');
  const notifDropdown = document.getElementById('notificationDropdown');
  const notifBadge = document.getElementById('notificationBadge');
  const notifList = document.getElementById('notificationListContainer');
  const markAllReadBtn = document.getElementById('markAllReadBtn');

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
      message: 'AAFCO & FEDIAF 2026 toxicity rules active.',
      time: '1d ago',
      read: true,
      link: 'wiki.html'
    }
  ];

  let notifications = [];
  try {
    const stored = localStorage.getItem('kibbleguard_notifications');
    notifications = stored ? JSON.parse(stored) : DEFAULT_NOTIFICATIONS;
  } catch (err) {
    notifications = DEFAULT_NOTIFICATIONS;
  }

  function saveNotifications() {
    try {
      localStorage.setItem('kibbleguard_notifications', JSON.stringify(notifications));
    } catch (e) {
      console.error('Failed to store notifications', e);
    }
    updateBadge();
    renderDropdown();
  }

  function updateBadge() {
    if (!notifBadge) return;
    const unreadCount = notifications.filter(n => !n.read).length;
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount;
      notifBadge.style.display = 'flex';
      notifBadge.classList.remove('hidden');
    } else {
      notifBadge.style.display = 'none';
      notifBadge.classList.add('hidden');
    }
  }

  function renderDropdown() {
    if (!notifList) return;

    if (!notifications || notifications.length === 0) {
      notifList.innerHTML = `
        <div class="py-8 text-center text-xs text-[#788673]">
          <i class="fa-regular fa-bell-slash text-base mb-1 block"></i>
          No active alerts in dispatch queue.
        </div>
      `;
      return;
    }

    notifList.innerHTML = notifications.slice(0, 4).map(n => `
      <div class="p-3 rounded-2xl border ${n.read ? 'bg-white border-[#ebdcd0]' : 'bg-[#fffaf0] border-[#ff9800]/30'} transition-all hover:border-[#45671d]/40 flex items-start gap-3 text-xs relative group" data-id="${n.id}">
        <div class="w-8 h-8 rounded-xl ${n.iconColor} flex items-center justify-center shrink-0 text-sm mt-0.5 shadow-2xs">
          <i class="fa-solid ${n.icon}"></i>
        </div>
        <div class="flex-1 min-w-0 pr-4">
          <div class="flex items-center justify-between">
            <h4 class="font-extrabold text-[#182811] text-[11.5px] truncate">${n.title}</h4>
            <span class="text-[9.5px] text-[#788673]">${n.time}</span>
          </div>
          <p class="text-[11px] text-[#788673] leading-snug mt-0.5">${n.message}</p>
          ${n.link ? `<a href="${n.link}" class="inline-block mt-1.5 font-extrabold text-[10.5px] text-[#45671d] hover:underline">Inspect Details →</a>` : ''}
        </div>
      </div>
    `).join('');
  }

  if (notifBtn && notifDropdown) {
    notifBtn.onclick = function(e) {
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
    };

    document.addEventListener('click', function(e) {
      if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
        notifDropdown.classList.add('hidden');
        notifDropdown.style.display = 'none';
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        notifDropdown.classList.add('hidden');
        notifDropdown.style.display = 'none';
      }
    });
  }

  if (markAllReadBtn) {
    markAllReadBtn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      notifications = notifications.map(n => ({ ...n, read: true }));
      saveNotifications();
    };
  }

  updateBadge();
  renderDropdown();


  // ==========================================
  // 2. CLINICAL DOSSIER DATASET
  // ==========================================
  const DOSSIER_DETAILS = {
    'xylitol': {
      title: 'Xylitol (Birch Sugar)',
      category: 'Critical Lethal Sweetener',
      aliases: 'Wood Sugar, E967, Birch Bark Extract',
      score: 98,
      canineTier: 'LETHAL TO CANINES',
      canineScore: 'Score: 98',
      canineBadgeClass: 'bg-red-100 text-red-700 border-red-200',
      felineTier: 'LOW TOXICITY (FELINE)',
      felineScore: 'Score: 10',
      felineBadgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      statusBadge: 'bg-red-100 text-red-700 border-red-200',
      mechanism: 'In canines, xylitol stimulates rapid, unregulated release of insulin from the pancreatic beta cells, causing a profound drop in blood glucose (hypoglycemia) within 30 to 60 minutes. Higher doses cause severe acute hepatic necrosis and liver failure.',
      canine: 'Fatal toxicity dose: >0.1 g/kg induces acute hypoglycemia and ataxia; >0.5 g/kg triggers acute liver failure and coagulopathy.',
      feline: 'Felines do not exhibit the same acute insulin spike. However, it provides zero nutritional value and is not recommended.',
      alternatives: 'Pure organic pumpkin puree, unsweetened applesauce, or natural sweet potato mash.'
    },
    'bha': {
      title: 'BHA & BHT (Synthetic Antioxidants)',
      category: 'Preservative / Endocrine Disruptor',
      aliases: 'Butylated Hydroxyanisole (E320), Butylated Hydroxytoluene (E321)',
      score: 48,
      canineTier: 'ENDOCRINE CAUTION',
      canineScore: 'Score: 48',
      canineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      felineTier: 'HEPATIC STRAIN (FELINE)',
      felineScore: 'Score: 54',
      felineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      statusBadge: 'bg-orange-100 text-[#b45309] border-orange-200',
      mechanism: 'Synthetic phenolic compounds added to fats and oils to delay oxidative rancidity. Slowly metabolized and excreted, resulting in chronic bioaccumulation in adipose tissue and hepatic strain.',
      canine: 'Associated with chronic allergic dermatitis, mast-cell degranulation, and cumulative liver stress over extended feeding.',
      feline: 'Cats clear phenolic compounds significantly slower due to liver glucuronidation deficiencies, heightening organ strain.',
      alternatives: 'Mixed natural tocopherols (Vitamin E), rosemary extract, and citric acid.'
    },
    'propylene-glycol': {
      title: 'Propylene Glycol (Humectant)',
      category: 'Strictly Prohibited for Felines',
      aliases: '1,2-Propanediol, E1520',
      score: 92,
      canineTier: 'REGULATED HUMECTANT',
      canineScore: 'Score: 30',
      canineBadgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      felineTier: 'STRICTLY FATAL TO CATS',
      felineScore: 'Score: 92 (CAT)',
      felineBadgeClass: 'bg-purple-100 text-purple-700 border-purple-200',
      statusBadge: 'bg-purple-100 text-purple-700 border-purple-200',
      mechanism: 'Synthetic chemical humectant used to maintain soft texture in semi-moist foods. Cats strictly lack glucuronidation metabolic pathways, causing toxic metabolites to damage red blood cell membranes.',
      canine: 'Tolerated in regulated small concentrations in canine food; not considered acutely toxic to dogs.',
      feline: 'Strictly lethal to felines. Causes oxidation of hemoglobin, triggering massive Heinz body hemolytic anemia and collapse.',
      alternatives: 'Vegetable glycerin or natural honey moisture binders.'
    },
    'taurine': {
      title: 'Taurine (Essential Amino Acid)',
      category: 'Mandatory Feline Nutrient',
      aliases: '2-aminoethanesulfonic acid',
      score: '00',
      canineTier: 'HEALTH BENEFIT (CANINE)',
      canineScore: 'Score: 00',
      canineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      felineTier: 'MANDATORY FELINE NUTRIENT',
      felineScore: 'Score: 00 (ESSENTIAL)',
      felineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      statusBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      mechanism: 'Crucial for conjugation of bile salts, retinal photoreceptor structure, normal reproductive performance, and cardiac myocardial calcium flux.',
      canine: 'Synthesized endogenously in most dogs; supplemental taurine prevents dilated cardiomyopathy (DCM) in large breeds.',
      feline: 'Mandatory dietary requirement. Cats cannot synthesize taurine; deficiency leads to irreversible central retinal degeneration and DCM.',
      alternatives: 'Fresh muscle meats (chicken heart, dark poultry, salmon, organ meats).'
    },
    'ethoxyquin': {
      title: 'Ethoxyquin (Synthetic Stabilizer)',
      category: 'Pesticide Derivative Preservative',
      aliases: '6-ethoxy-2,2,4-trimethyl-1,2-dihydroquinoline, E324',
      score: 58,
      canineTier: 'SYNTHETIC STABILIZER',
      canineScore: 'Score: 58',
      canineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      felineTier: 'RENAL RISK (FELINE)',
      felineScore: 'Score: 66',
      felineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      statusBadge: 'bg-orange-100 text-[#b45309] border-orange-200',
      mechanism: 'Originally registered as a pesticide and rubber anti-cracking agent. Added to overseas fish meals to prevent maritime combustion; associated with renal failure and elevated hepatic enzymes.',
      canine: 'Linked to elevated liver enzymes, immune deficiencies, and skin lesions in long-term feeding studies.',
      feline: 'Renal sensitivity makes felines vulnerable to accumulation; FDA recommends strict limits in pet diets.',
      alternatives: 'Freshly milled fish oils preserved with natural astaxanthin and Vitamin E.'
    },
    'carrageenan': {
      title: 'Carrageenan (Hydrocolloid Binder)',
      category: 'GI Mucosal Toxin & Inflammatory Agent',
      aliases: 'Chondrus crispus extract, Poligeenan, E407',
      score: 78,
      canineTier: 'ULCERATIVE COLITIS TRIGGER',
      canineScore: 'Score: 78',
      canineBadgeClass: 'bg-red-100 text-red-700 border-red-200',
      felineTier: 'SEVERE IBD TRIGGER',
      felineScore: 'Score: 84',
      felineBadgeClass: 'bg-red-100 text-red-700 border-red-200',
      statusBadge: 'bg-red-100 text-red-700 border-red-200',
      mechanism: 'Seaweed extract used as a gelling agent in canned wet food. Degraded carrageenan (poligeenan) stimulates severe pro-inflammatory cascades, macrophage infiltration, and intestinal epithelial ulceration.',
      canine: 'Triggers chronic loose stools, irritable bowel syndrome, and intestinal inflammation.',
      feline: 'Strongly associated with feline Inflammatory Bowel Disease (IBD) and chronic gastrointestinal distress.',
      alternatives: 'Agar-agar, guar gum, or gelatin.'
    },
    'dyes': {
      title: 'Synthetic Food Dyes (Red 40, Yellow 5 & 6)',
      category: 'Cosmetic Petroleum Colorants',
      aliases: 'Allura Red AC (E129), Tartrazine (E102), Sunset Yellow (E110)',
      score: 52,
      canineTier: 'ALLERGIC DERMATITIS',
      canineScore: 'Score: 52',
      canineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      felineTier: 'ZERO BENEFIT / METABOLIC LOAD',
      felineScore: 'Score: 50',
      felineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      statusBadge: 'bg-orange-100 text-[#b45309] border-orange-200',
      mechanism: 'Coal-tar petroleum derivatives added strictly for human cosmetic preference. Dogs and cats have dichromatic vision and cannot distinguish these shades.',
      canine: 'Documented triggers for allergic dermatitis, facial pruritus, and behavioral hyperactivity.',
      feline: 'Zero biological or behavioral utility; increases metabolic detoxification burden.',
      alternatives: 'Organic beetroot powder, turmeric, or spirulina.'
    },
    'garlic': {
      title: 'Garlic & Onion Derivatives',
      category: 'Hemolytic Allium Toxin',
      aliases: 'Allium sativum, Allium cepa, Onion Powder',
      score: 89,
      canineTier: 'HEMOLYTIC ALLIUM TOXIN',
      canineScore: 'Score: 82',
      canineBadgeClass: 'bg-red-100 text-red-700 border-red-200',
      felineTier: 'ACUTE LETHAL HEMOLYSIS',
      felineScore: 'Score: 94',
      felineBadgeClass: 'bg-red-100 text-red-700 border-red-200',
      statusBadge: 'bg-red-100 text-red-700 border-red-200',
      mechanism: 'Contains sulfur compounds (N-propyl disulfide) that overwhelm antioxidant defenses in red blood cells, precipitating hemoglobin clusters known as Heinz bodies.',
      canine: 'Causes hemolytic anemia at doses above 15 g/kg; smaller daily doses still cause cumulative oxidative damage.',
      feline: 'Felines are extremely susceptible; toxic symptoms emerge at as little as 5 g/kg.',
      alternatives: 'Nutritional yeast, bone broth, or dried oregano.'
    },
    'omega3': {
      title: 'Omega-3 Marine Fatty Acids (EPA & DHA)',
      category: 'Essential Anti-Inflammatory Nutrient',
      aliases: 'Eicosapentaenoic acid, Docosahexaenoic acid, Wild Salmon Oil',
      score: '00',
      canineTier: 'JOINT & COAT INTEGRITY',
      canineScore: 'Score: 00',
      canineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      felineTier: 'RENAL GLOMERULAR PROTECTION',
      felineScore: 'Score: 00',
      felineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      statusBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      mechanism: 'Incorporates directly into cell membrane phospholipids, displacing arachidonic acid and suppressing pro-inflammatory eicosanoids and cytokines.',
      canine: 'Provides clinically proven relief for canine osteoarthritis and atopic dermatitis.',
      feline: 'Crucial for slowing progression of feline chronic renal disease and maintaining cognitive health.',
      alternatives: 'Cold-pressed wild Alaskan salmon oil, sardines, or green-lipped mussel.'
    },
    'sodium-nitrite': {
      title: 'Sodium Nitrite & Nitrate',
      category: 'Curing Salt Preservative',
      aliases: 'E250, Curing Salt #1',
      score: 62,
      canineTier: 'CURING PRESERVATIVE',
      canineScore: 'Score: 62',
      canineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      felineTier: 'VASCULAR STRAIN',
      felineScore: 'Score: 68',
      felineBadgeClass: 'bg-orange-100 text-[#b45309] border-orange-200',
      statusBadge: 'bg-orange-100 text-[#b45309] border-orange-200',
      mechanism: 'Fixes pigment in cured meat treats and prevents bacterial growth. Combines with secondary amines in the stomach to form carcinogenic N-nitrosamines.',
      canine: 'High doses convert hemoglobin into methemoglobin, depriving vital tissues of oxygen.',
      feline: 'Small body mass increases susceptibility to methemoglobinemia; offers zero nutritive value.',
      alternatives: 'Naturally air-dried, freeze-dried single-ingredient muscle meats.'
    },
    'l-carnitine': {
      title: 'L-Carnitine',
      category: 'Metabolic Amino Acid',
      aliases: 'L-3-hydroxy-4-(trimethylammonio)butanoate',
      score: '00',
      canineTier: 'LEAN MUSCLE METABOLISM',
      canineScore: 'Score: 00',
      canineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      felineTier: 'HEPATIC LIPIDOSIS SHIELD',
      felineScore: 'Score: 00',
      felineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      statusBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      mechanism: 'Transports activated fatty acids across the inner mitochondrial membrane where beta-oxidation takes place, generating cellular ATP.',
      canine: 'Promotes lean muscle mass, aids in weight loss programs, and supports myocardial function.',
      feline: 'Protects overweight cats undergoing caloric restriction against fatal hepatic lipidosis (fatty liver syndrome).',
      alternatives: 'Grass-fed beef heart, dark meat poultry, and dairy fractions.'
    },
    'choline': {
      title: 'Choline Chloride',
      category: 'Essential Vitamin B4 Complex',
      aliases: 'Hepato-protectant, Vitamin B4',
      score: '00',
      canineTier: 'COGNITIVE SUPPORT',
      canineScore: 'Score: 00',
      canineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      felineTier: 'MANDATORY CLEARANCE NUTRIENT',
      felineScore: 'Score: 00',
      felineBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      statusBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      mechanism: 'Precursor for acetylcholine neurotransmitter and phosphatidylcholine, a structural component of cellular membranes essential for exporting triglycerides from the liver.',
      canine: 'Supports cognitive health in aging canines and prevents fatty liver infiltration.',
      feline: 'Mandatory nutrient required by AAFCO and FEDIAF feline nutritional profiles.',
      alternatives: 'Pasture-raised egg yolks, liver, and organ meats.'
    }
  };

  // 3. DOM Elements for Wiki Filtering & Species Perspective
  const filterButtons = document.querySelectorAll('.wiki-filter-btn');
  const speciesViewButtons = document.querySelectorAll('.species-view-btn');
  const cards = document.querySelectorAll('.wiki-card');
  const searchInput = document.getElementById('wikiSearchInput');
  const noResults = document.getElementById('wikiNoResults');

  let currentCategory = 'all';
  let activeSpecies = 'dual';

  // 4. Species Perspective Dynamic Recalibration
  function applySpeciesPerspective() {
    cards.forEach(card => {
      const compoundKey = card.getAttribute('data-compound');
      const data = DOSSIER_DETAILS[compoundKey];
      if (!data) return;

      const tierLabel = card.querySelector('.card-tier-label');
      const scoreBadge = card.querySelector('.card-score-badge');
      const canineBlock = card.querySelector('.canine-block');
      const felineBlock = card.querySelector('.feline-block');

      if (activeSpecies === 'canine') {
        if (tierLabel) tierLabel.textContent = data.canineTier;
        if (scoreBadge) {
          scoreBadge.textContent = data.canineScore;
          scoreBadge.className = `card-score-badge px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase border ${data.canineBadgeClass}`;
        }
        if (canineBlock) {
          canineBlock.classList.add('ring-2', 'ring-[#45671d]', 'scale-[1.02]');
          canineBlock.classList.remove('opacity-60');
        }
        if (felineBlock) {
          felineBlock.classList.add('opacity-40');
          felineBlock.classList.remove('ring-2', 'ring-[#45671d]', 'scale-[1.02]');
        }
      } else if (activeSpecies === 'feline') {
        if (tierLabel) tierLabel.textContent = data.felineTier;
        if (scoreBadge) {
          scoreBadge.textContent = data.felineScore;
          scoreBadge.className = `card-score-badge px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase border ${data.felineBadgeClass}`;
        }
        if (felineBlock) {
          felineBlock.classList.add('ring-2', 'ring-purple-600', 'scale-[1.02]');
          felineBlock.classList.remove('opacity-40');
        }
        if (canineBlock) {
          canineBlock.classList.add('opacity-40');
          canineBlock.classList.remove('ring-2', 'ring-[#45671d]', 'scale-[1.02]');
        }
      } else {
        // Dual view (default)
        if (tierLabel) tierLabel.textContent = data.category.toUpperCase();
        if (scoreBadge) {
          scoreBadge.textContent = `Score: ${data.score}`;
          scoreBadge.className = `card-score-badge px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase border ${data.statusBadge}`;
        }
        if (canineBlock) {
          canineBlock.classList.remove('ring-2', 'ring-[#45671d]', 'scale-[1.02]', 'opacity-40');
        }
        if (felineBlock) {
          felineBlock.classList.remove('ring-2', 'ring-purple-600', 'scale-[1.02]', 'opacity-40');
        }
      }
    });
  }

  // 5. Filter & Search Engine
  function applyFilters() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    let matchCount = 0;

    cards.forEach(card => {
      const cardCategory = card.getAttribute('data-category') || '';
      const cardText = card.innerText.toLowerCase();
      const cardSearch = (card.getAttribute('data-search') || '').toLowerCase();
      const canineHazard = card.getAttribute('data-canine-hazard');
      const felineHazard = card.getAttribute('data-feline-hazard');

      let matchesCategory = (currentCategory === 'all') || (cardCategory === currentCategory);

      // Category filter respecting active species perspective
      if (currentCategory === 'hazard') {
        if (activeSpecies === 'canine') {
          matchesCategory = (canineHazard === 'toxic');
        } else if (activeSpecies === 'feline') {
          matchesCategory = (felineHazard === 'toxic');
        } else {
          matchesCategory = (cardCategory === 'hazard');
        }
      }

      const matchesSearch = !query || cardText.includes(query) || cardSearch.includes(query);

      if (matchesCategory && matchesSearch) {
        card.style.display = '';
        matchCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (noResults) {
      noResults.style.display = matchCount === 0 ? 'block' : 'none';
      if (matchCount === 0) {
        noResults.classList.remove('hidden');
      } else {
        noResults.classList.add('hidden');
      }
    }
  }

  // 6. Handle Species Perspective Button Toggles
  speciesViewButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const button = e.currentTarget;
      activeSpecies = button.getAttribute('data-species') || 'dual';

      speciesViewButtons.forEach(b => {
        b.className = 'species-view-btn px-3.5 py-1.5 rounded-full text-xs font-bold text-[#788673] bg-[#fbf9f6] border border-[#ebdcd0] hover:text-[#182811] cursor-pointer transition-all';
      });

      if (activeSpecies === 'canine') {
        button.className = 'species-view-btn px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-[#ff9800] text-white shadow-xs cursor-pointer transition-all';
      } else if (activeSpecies === 'feline') {
        button.className = 'species-view-btn px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-purple-600 text-white shadow-xs cursor-pointer transition-all';
      } else {
        button.className = 'species-view-btn px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-[#45671d] text-white shadow-xs cursor-pointer transition-all';
      }

      applySpeciesPerspective();
      applyFilters();
    });
  });

  // 7. Handle Category Pill Button Clicking
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const button = e.currentTarget;
      currentCategory = button.getAttribute('data-category');

      filterButtons.forEach(b => {
        b.className = 'wiki-filter-btn px-4 py-2 rounded-full text-xs font-bold text-[#788673] bg-[#fbf9f6] border border-[#ebdcd0] hover:text-[#182811] transition-all shrink-0 cursor-pointer';
      });

      button.className = 'wiki-filter-btn px-4 py-2 rounded-full text-xs font-extrabold bg-[#45671d] text-white transition-all shrink-0 shadow-xs cursor-pointer';

      applyFilters();
    });
  });

  // 8. Handle Live Search Input
  searchInput?.addEventListener('input', applyFilters);


  // ==========================================
  // 9. INGREDIENT COMPARISON MODE ENGINE
  // ==========================================
  const toggleCompareBtn = document.getElementById('toggleCompareModeBtn');
  const compareBtnLabel = document.getElementById('compareBtnLabel');
  const compareBanner = document.getElementById('compareActiveBanner');
  const comparePrompt = document.getElementById('compareSelectionPrompt');
  const launchCompareBtn = document.getElementById('launchCompareBtn');
  const exitCompareBtn = document.getElementById('exitCompareBtn');
  const compareModal = document.getElementById('wikiCompareModal');
  const compareColsContainer = document.getElementById('compareColumnsContainer');
  const closeCompareBtn = document.getElementById('closeCompareModalBtn');
  const closeCompareBtn2 = document.getElementById('closeCompareModalBtn2');

  let isCompareMode = false;
  let selectedCompounds = [];

  function toggleCompareMode(forceState = null) {
    isCompareMode = forceState !== null ? forceState : !isCompareMode;

    if (isCompareMode) {
      toggleCompareBtn?.classList.add('bg-[#45671d]', 'text-white', '!border-[#45671d]');
      toggleCompareBtn?.classList.remove('bg-white', 'text-[#45671d]');
      if (compareBtnLabel) compareBtnLabel.textContent = 'Exit Compare';
      compareBanner?.classList.remove('hidden');
      document.querySelectorAll('.compare-checkbox-pill').forEach(el => el.classList.remove('hidden'));
    } else {
      toggleCompareBtn?.classList.remove('bg-[#45671d]', 'text-white', '!border-[#45671d]');
      toggleCompareBtn?.classList.add('bg-white', 'text-[#45671d]');
      if (compareBtnLabel) compareBtnLabel.textContent = 'Compare Mode';
      compareBanner?.classList.add('hidden');
      document.querySelectorAll('.compare-checkbox-pill').forEach(el => el.classList.add('hidden'));

      selectedCompounds = [];
      updateCompareSelectionUI();
    }
  }

  function handleCardSelection(compoundKey, cardEl) {
    const idx = selectedCompounds.indexOf(compoundKey);
    if (idx > -1) {
      selectedCompounds.splice(idx, 1);
    } else {
      if (selectedCompounds.length >= 2) {
        selectedCompounds.shift();
      }
      selectedCompounds.push(compoundKey);
    }
    updateCompareSelectionUI();
  }

  function updateCompareSelectionUI() {
    cards.forEach(card => {
      const key = card.getAttribute('data-compound');
      const pill = card.querySelector('.compare-checkbox-pill');
      if (selectedCompounds.includes(key)) {
        card.classList.add('ring-2', 'ring-[#45671d]', 'border-[#45671d]');
        if (pill) {
          pill.textContent = '✓ Selected';
          pill.className = 'compare-checkbox-pill absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full bg-[#45671d] text-white text-[9.5px] font-black shadow-xs';
        }
      } else {
        card.classList.remove('ring-2', 'ring-[#45671d]', 'border-[#45671d]');
        if (pill) {
          pill.textContent = '+ Compare';
          pill.className = 'compare-checkbox-pill absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full bg-white border border-[#ebdcd0] text-[9.5px] font-extrabold text-[#788673]';
        }
      }
    });

    if (launchCompareBtn) {
      launchCompareBtn.textContent = `View Side-by-Side (${selectedCompounds.length}/2)`;
      if (selectedCompounds.length === 2) {
        launchCompareBtn.disabled = false;
        launchCompareBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        launchCompareBtn.classList.add('cursor-pointer', 'hover:bg-[#324c14]');
        if (comparePrompt) {
          const name1 = DOSSIER_DETAILS[selectedCompounds[0]]?.title.split('(')[0].trim();
          const name2 = DOSSIER_DETAILS[selectedCompounds[1]]?.title.split('(')[0].trim();
          comparePrompt.innerHTML = `Ready! Comparing <strong class="text-[#182811]">${name1}</strong> vs <strong class="text-[#182811]">${name2}</strong>. Click 'View Side-by-Side' to launch.`;
        }
      } else {
        launchCompareBtn.disabled = true;
        launchCompareBtn.classList.add('opacity-50', 'cursor-not-allowed');
        launchCompareBtn.classList.remove('cursor-pointer', 'hover:bg-[#324c14]');
        if (comparePrompt) {
          comparePrompt.textContent = selectedCompounds.length === 1 
            ? '1 compound chosen. Select 1 more compound from the grid.' 
            : 'Select 2 compounds from the grid to compare canine & feline toxicology side-by-side.';
        }
      }
    }
  }

  function launchComparisonModal() {
    if (selectedCompounds.length < 2 || !compareColsContainer) return;

    const dataA = DOSSIER_DETAILS[selectedCompounds[0]];
    const dataB = DOSSIER_DETAILS[selectedCompounds[1]];
    if (!dataA || !dataB) return;

    function renderColumn(data) {
      return `
        <div class="tactile-card p-5 space-y-4 bg-[#fbf9f6]">
          <div class="flex items-start justify-between pb-2 border-b border-[#ebdcd0]">
            <div>
              <span class="text-[9.5px] font-extrabold uppercase tracking-wider text-[#788673] block">${data.category}</span>
              <h4 class="font-extrabold text-base text-[#182811]">${data.title}</h4>
              <p class="text-[10.5px] text-[#788673]">${data.aliases}</p>
            </div>
            <span class="px-2.5 py-1 rounded-full text-xs font-black border ${data.statusBadge}">
              Score: ${data.score}
            </span>
          </div>

          <div class="p-3.5 rounded-2xl bg-orange-50 border border-orange-200 space-y-1">
            <div class="flex items-center gap-1.5 text-[#b45309]">
              <i class="fa-solid fa-dog text-xs"></i>
              <strong class="font-bold uppercase tracking-wide text-[10px]">Canine Clinical Tolerance</strong>
            </div>
            <p class="text-[11.5px] leading-relaxed text-[#b45309] font-medium">${data.canine}</p>
          </div>

          <div class="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 space-y-1">
            <div class="flex items-center gap-1.5 text-purple-800">
              <i class="fa-solid fa-cat text-xs"></i>
              <strong class="font-bold uppercase tracking-wide text-[10px]">Feline Clinical Tolerance</strong>
            </div>
            <p class="text-[11.5px] leading-relaxed text-purple-800 font-medium">${data.feline}</p>
          </div>

          <div class="p-3.5 rounded-2xl bg-white border border-[#ebdcd0] space-y-1">
            <strong class="text-[#182811] text-[10.5px] font-bold block uppercase tracking-wide">Mechanism of Action</strong>
            <p class="text-xs text-[#586754] leading-relaxed">${data.mechanism}</p>
          </div>

          <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
            <strong class="text-emerald-900 text-[10.5px] font-bold block uppercase tracking-wide">Recommended Alternative</strong>
            <p class="text-xs text-emerald-800 leading-relaxed font-semibold">${data.alternatives}</p>
          </div>
        </div>
      `;
    }

    compareColsContainer.innerHTML = renderColumn(dataA) + renderColumn(dataB);
    compareModal?.classList.remove('hidden');
  }

  function closeComparisonModal() {
    compareModal?.classList.add('hidden');
  }

  toggleCompareBtn?.addEventListener('click', () => toggleCompareMode());
  exitCompareBtn?.addEventListener('click', () => toggleCompareMode(false));
  launchCompareBtn?.addEventListener('click', launchComparisonModal);
  closeCompareBtn?.addEventListener('click', closeComparisonModal);
  closeCompareBtn2?.addEventListener('click', closeComparisonModal);
  compareModal?.addEventListener('click', (e) => {
    if (e.target === compareModal) closeComparisonModal();
  });


  // ==========================================
  // 10. Clinical Dossier Modal Opening & Closing
  // ==========================================
  const modal = document.getElementById('wikiDossierModal');
  const closeModalBtn = document.getElementById('closeDossierModalBtn');
  const closeModalBtn2 = document.getElementById('closeDossierModalBtn2');

  function openDossier(compoundKey) {
    const data = DOSSIER_DETAILS[compoundKey];
    if (!data || !modal) return;

    document.getElementById('dossierModalTitle').textContent = data.title;
    document.getElementById('dossierModalCategory').textContent = data.category;
    document.getElementById('dossierModalAliases').textContent = data.aliases;
    document.getElementById('dossierModalMechanism').textContent = data.mechanism;
    document.getElementById('dossierModalCanine').textContent = data.canine;
    document.getElementById('dossierModalFeline').textContent = data.feline;
    document.getElementById('dossierModalAlternatives').textContent = data.alternatives;

    modal.classList.remove('hidden');
  }

  function closeDossier() {
    if (modal) modal.classList.add('hidden');
  }

  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      const compoundKey = card.getAttribute('data-compound');
      if (isCompareMode) {
        handleCardSelection(compoundKey, card);
      } else {
        openDossier(compoundKey);
      }
    });
  });

  closeModalBtn?.addEventListener('click', closeDossier);
  closeModalBtn2?.addEventListener('click', closeDossier);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeDossier();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modal && !modal.classList.contains('hidden')) closeDossier();
      if (compareModal && !compareModal.classList.contains('hidden')) closeComparisonModal();
    }
  });

  applyFilters();
});
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
  // 2. DYNAMIC INGREDIENT DATA FROM DATABASE
  // ==========================================
  // Combined ingredient data keyed by ingredient_id
  let allIngredients = {};  // { ingredient_id: { dog: {...}, cat: {...}, merged fields } }
  let allCards = [];         // rendered card DOM elements

  let currentCategory = 'all';
  let activeSpecies = 'dual';

  // DOM refs
  const cardsContainer = document.getElementById('wikiCardsContainer');
  const filterButtonGroup = document.getElementById('wikiFilterButtonGroup');
  const speciesViewButtons = document.querySelectorAll('.species-view-btn');
  const searchInput = document.getElementById('wikiSearchInput');
  const noResults = document.getElementById('wikiNoResults');

  // Stats
  const statTotalCount = document.getElementById('statTotalCount');
  const statHazardCount = document.getElementById('statHazardCount');
  const statCautionCount = document.getElementById('statCautionCount');

  // ==========================================
  // 3. FETCH & MERGE INGREDIENT DATA
  // ==========================================
  async function loadIngredients() {
    try {
      const res = await fetch('/api/wiki-ingredients');
      if (!res.ok) throw new Error('Failed to fetch ingredients');
      const data = await res.json();

      const dogList = data.dog || [];
      const catList = data.cat || [];

      // Index by ingredient_id
      const dogMap = {};
      dogList.forEach(d => { dogMap[d.ingredient_id] = d; });
      const catMap = {};
      catList.forEach(c => { catMap[c.ingredient_id] = c; });

      // Merge: use all unique ingredient_ids from both tables
      const allIds = new Set([...Object.keys(dogMap), ...Object.keys(catMap)]);

      allIds.forEach(id => {
        const dog = dogMap[id] || null;
        const cat = catMap[id] || null;
        const primary = dog || cat;

        allIngredients[id] = {
          ingredient_id: id,
          primary_name: primary.primary_name,
          category: primary.category,
          aliases: primary.aliases || '',
          dog: dog,
          cat: cat,
          // Merged severity: use max of both
          severity_score: Math.max(dog?.severity_score || 0, cat?.severity_score || 0),
          dog_severity: dog?.severity_score || 0,
          cat_severity: cat?.severity_score || 0,
          // No row for a species at all means it hasn't been assessed -- 'unrated', never
          // defaulted to 'safe' (a species with no data is not the same as a safe one).
          dog_risk: dog ? (dog.risk || 'safe').toLowerCase() : 'unrated',
          cat_risk: cat ? (cat.risk || 'safe').toLowerCase() : 'unrated',
          // Notes: prefer dog notes, fallback to cat
          notes: dog?.notes || cat?.notes || '',
          dog_notes: dog?.notes || '',
          cat_notes: cat?.notes || '',
          clinical_symptoms: dog?.clinical_symptoms || cat?.clinical_symptoms || '',
          dog_clinical: dog?.clinical_symptoms || '',
          cat_clinical: cat?.clinical_symptoms || '',
          dosage: dog?.dosage || cat?.dosage || '',
          dog_dosage: dog?.dosage || '',
          cat_dosage: cat?.dosage || '',
          alternatives_guidance: dog?.alternatives_guidance || cat?.alternatives_guidance || '',
          dog_alternatives: dog?.alternatives_guidance || '',
          cat_alternatives: cat?.alternatives_guidance || '',
          emergency_action: dog?.emergency_action || cat?.emergency_action || '',
          dog_emergency: dog?.emergency_action || '',
          cat_emergency: cat?.emergency_action || '',
          dog_weight_specific: dog?.weight_specific_data || '',
          cat_weight_specific: cat?.weight_specific_data || '',
          dog_breed_specific: dog?.breed_specific_data || '',
          cat_breed_specific: cat?.breed_specific_data || '',
          weight_specific: dog?.weight_specific_data || cat?.weight_specific_data || '',
          age_specific: dog?.age_specific_data || cat?.age_specific_data || '',
          breed_specific: dog?.breed_specific_data || cat?.breed_specific_data || ''
        };
      });

      renderStats();
      renderFilterPills();
      renderCards();
      applyFilters();

    } catch (err) {
      console.error('[wiki] Failed to load ingredients:', err);
      if (cardsContainer) {
        cardsContainer.innerHTML = `
          <div class="col-span-full py-16 text-center text-[#788673] space-y-2">
            <i class="fa-solid fa-triangle-exclamation text-2xl text-red-400"></i>
            <p class="font-bold text-sm">Failed to load ingredient database</p>
            <p class="text-xs">${err.message}. Please try refreshing the page.</p>
          </div>
        `;
      }
    }
  }

  // ==========================================
  // 4. RENDER STATS RIBBON
  // ==========================================
  function renderStats() {
    const items = Object.values(allIngredients);
    const total = items.length;
    const toxic = items.filter(i => {
      const dr = (i.dog_risk || '').toLowerCase();
      const cr = (i.cat_risk || '').toLowerCase();
      return dr === 'toxic' || cr === 'toxic' || dr === 'highly toxic' || cr === 'highly toxic';
    }).length;
    const caution = items.filter(i => {
      const dr = (i.dog_risk || '').toLowerCase();
      const cr = (i.cat_risk || '').toLowerCase();
      return dr === 'caution' || cr === 'caution';
    }).length;

    if (statTotalCount) statTotalCount.textContent = total;
    if (statHazardCount) statHazardCount.textContent = toxic;
    if (statCautionCount) statCautionCount.textContent = caution;
    updateMobileCount(total);
  }

  // ==========================================
  // 5. RENDER FILTER PILLS DYNAMICALLY
  // ==========================================
  const IS_MOBILE = /mobile-/i.test(window.location.pathname);

  function renderFilterPills() {
    if (!filterButtonGroup) return;

    // Collect unique categories
    const categories = new Set();
    Object.values(allIngredients).forEach(i => {
      if (i.category) categories.add(i.category);
    });

    const sortedCategories = [...categories].sort();

    // Mobile uses smaller pill sizing
    const pillActive = IS_MOBILE
      ? 'wiki-filter-btn px-3 py-1.5 rounded-full text-[11px] font-extrabold bg-[#45671d] text-white shrink-0 cursor-pointer'
      : 'wiki-filter-btn px-4 py-2 rounded-full text-xs font-extrabold bg-[#45671d] text-white transition-all shrink-0 shadow-xs cursor-pointer';
    const pillInactive = IS_MOBILE
      ? 'wiki-filter-btn px-3 py-1.5 rounded-full text-[11px] font-bold text-[#788673] bg-white border border-[#ebdcd0] shrink-0 cursor-pointer'
      : 'wiki-filter-btn px-4 py-2 rounded-full text-xs font-bold text-[#788673] bg-[#fbf9f6] border border-[#ebdcd0] hover:text-[#182811] transition-all shrink-0 cursor-pointer';

    let html = `<button type="button" class="${pillActive}" data-category="all">All Ingredients</button>`;

    sortedCategories.forEach(cat => {
      html += `<button type="button" class="${pillInactive}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    });

    filterButtonGroup.innerHTML = html;

    // Rebind filter click events
    filterButtonGroup.querySelectorAll('.wiki-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const button = e.currentTarget;
        currentCategory = button.getAttribute('data-category');

        filterButtonGroup.querySelectorAll('.wiki-filter-btn').forEach(b => {
          b.className = pillInactive;
        });
        button.className = pillActive;

        applyFilters();
      });
    });
  }

  // ==========================================
  // 6. RENDER INGREDIENT CARDS
  // ==========================================
  function getRiskColor(risk) {
    const r = (risk || '').toLowerCase();
    if (r === 'toxic' || r === 'highly toxic') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', strong: 'text-red-700', label: 'text-red-600', badgeBg: 'bg-red-100', badgeBorder: 'border-red-200', badgeText: 'text-red-700' };
    if (r === 'caution') return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-amber-700', strong: 'text-amber-800', label: 'text-[#b45309]', badgeBg: 'bg-orange-100', badgeBorder: 'border-orange-200', badgeText: 'text-[#b45309]' };
    // Not assessed for this species -- deliberately neutral grey, never green, so it's
    // never mistaken for an actual "Safe" rating (an ingredient with no row for a species
    // simply hasn't been evaluated for it, which is not the same thing as safe).
    if (r === 'unrated') return { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-500', strong: 'text-slate-500', label: 'text-slate-500', badgeBg: 'bg-slate-100', badgeBorder: 'border-slate-200', badgeText: 'text-slate-500' };
    // safe / beneficial
    return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', strong: 'text-emerald-800', label: 'text-emerald-700', badgeBg: 'bg-emerald-100', badgeBorder: 'border-emerald-200', badgeText: 'text-emerald-800' };
  }

  function getRiskLabel(risk) {
    const r = (risk || '').toLowerCase();
    if (r === 'toxic') return 'Toxic';
    if (r === 'highly toxic') return 'Highly Toxic';
    if (r === 'caution') return 'Caution';
    if (r === 'safe') return 'Safe';
    if (r === 'beneficial') return 'Beneficial';
    if (r === 'unrated') return 'Not Rated';
    return risk || 'Unknown';
  }

  function getOverallBadge(item) {
    // Use the higher severity between dog and cat
    const maxSeverity = item.severity_score;
    if (maxSeverity >= 70) return getRiskColor('toxic');
    if (maxSeverity >= 30) return getRiskColor('caution');
    return getRiskColor('safe');
  }

  function renderCards() {
    if (!cardsContainer) return;

    const items = Object.values(allIngredients);
    // Sort: highest severity first, then alphabetically
    items.sort((a, b) => b.severity_score - a.severity_score || a.primary_name.localeCompare(b.primary_name));

    allCards = [];
    cardsContainer.innerHTML = '';

    items.forEach(item => {
      const card = document.createElement('div');
      const badge = getOverallBadge(item);
      const dogColor = getRiskColor(item.dog_risk);
      const catColor = getRiskColor(item.cat_risk);

      // Determine tier label based on species perspective
      let tierLabel = escapeHtml(item.category || 'Ingredient');
      let tierLabelColor = badge.label;

      const searchText = [
        item.primary_name, item.aliases, item.category,
        item.notes, item.dog_risk, item.cat_risk
      ].filter(Boolean).join(' ').toLowerCase();

      card.className = IS_MOBILE
        ? 'tactile-card p-4 bg-white space-y-2 cursor-pointer wiki-card relative'
        : 'tactile-card p-6 bg-white space-y-4 cursor-pointer hover:border-[#45671d] transition-all group wiki-card relative';
      card.setAttribute('data-category', item.category || '');
      card.setAttribute('data-compound', item.ingredient_id);
      card.setAttribute('data-canine-risk', item.dog_risk);
      card.setAttribute('data-feline-risk', item.cat_risk);
      card.setAttribute('data-severity', item.severity_score);
      card.setAttribute('data-search', searchText);

      const aliasText = item.aliases ? escapeHtml(item.aliases) : '';
      const notesPreview = item.notes ? escapeHtml(item.notes).substring(0, 200) : 'No detailed notes available for this ingredient.';

      if (IS_MOBILE) {
        card.innerHTML = `
          <div class="compare-checkbox-pill hidden absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-white border border-[#ebdcd0] text-[9px] font-extrabold text-[#788673]">
            + Compare
          </div>
          <div class="flex items-start justify-between">
            <div>
              <span class="card-tier-label text-[9px] font-black uppercase ${tierLabelColor} block">${tierLabel}</span>
              <h3 class="card-title text-sm font-black text-[#182811]">${escapeHtml(item.primary_name)}</h3>
              ${aliasText ? `<span class="text-[10.5px] text-[#788673]">${aliasText}</span>` : ''}
            </div>
            <span class="card-score-badge px-2 py-0.5 rounded-full ${badge.badgeBg} ${badge.badgeText} font-black text-[9px] border ${badge.badgeBorder}">
              Score: ${item.severity_score}
            </span>
          </div>
          <p class="text-xs text-[#586754] leading-relaxed line-clamp-2">${notesPreview}</p>
          <span class="text-[11px] font-extrabold text-[#45671d] block">Read Clinical Dossier →</span>
        `;
      } else {
        card.innerHTML = `
          <div class="compare-checkbox-pill hidden absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full bg-white border border-[#ebdcd0] text-[9.5px] font-extrabold text-[#788673]">
            + Compare
          </div>
          <div class="flex items-start justify-between">
            <div>
              <span class="card-tier-label text-[9.5px] font-extrabold uppercase tracking-wider ${tierLabelColor} block mb-0.5">${tierLabel}</span>
              <h3 class="card-title text-base font-extrabold text-[#182811] group-hover:text-[#45671d] transition-colors">${escapeHtml(item.primary_name)}</h3>
              ${aliasText ? `<span class="text-xs text-[#788673] font-medium">${aliasText}</span>` : ''}
            </div>
            <span class="card-score-badge px-2.5 py-1 rounded-full ${badge.badgeBg} ${badge.badgeText} font-extrabold text-[10px] uppercase border ${badge.badgeBorder}">
              Score: ${item.severity_score}
            </span>
          </div>

          <p class="text-xs text-[#586754] leading-relaxed line-clamp-3">${notesPreview}</p>

          <div class="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div class="p-2.5 rounded-xl ${dogColor.bg} ${dogColor.border} border canine-block">
              <strong class="${dogColor.strong} block font-bold text-[10.5px]">🐶 Canine</strong>
              <span class="${dogColor.text} font-semibold text-[10.5px]">${getRiskLabel(item.dog_risk)}</span>
            </div>
            <div class="p-2.5 rounded-xl ${catColor.bg} ${catColor.border} border feline-block">
              <strong class="${catColor.strong} block font-bold text-[10.5px]">🐱 Feline</strong>
              <span class="${catColor.text} font-semibold text-[10.5px]">${getRiskLabel(item.cat_risk)}</span>
            </div>
          </div>

          <div class="pt-3 border-t border-[#ebdcd0] flex items-center justify-between text-xs">
            <span class="text-[#788673] font-bold">${escapeHtml(item.category || '')}</span>
            <span class="text-[#45671d] font-extrabold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Read Dossier →
            </span>
          </div>
        `;
      }

      // Click handler
      card.addEventListener('click', () => {
        if (isCompareMode) {
          handleCardSelection(item.ingredient_id, card);
        } else {
          openDossier(item.ingredient_id);
        }
      });

      cardsContainer.appendChild(card);
      allCards.push(card);
    });
  }

  // ==========================================
  // 7. SPECIES PERSPECTIVE
  // ==========================================
  function applySpeciesPerspective() {
    allCards.forEach(card => {
      const compoundKey = card.getAttribute('data-compound');
      const item = allIngredients[compoundKey];
      if (!item) return;

      const tierLabel = card.querySelector('.card-tier-label');
      const scoreBadge = card.querySelector('.card-score-badge');
      const canineBlock = card.querySelector('.canine-block');
      const felineBlock = card.querySelector('.feline-block');

      if (activeSpecies === 'canine') {
        const dogColor = getRiskColor(item.dog_risk);
        if (tierLabel) {
          tierLabel.textContent = getRiskLabel(item.dog_risk).toUpperCase() + ' (CANINE)';
          tierLabel.className = `card-tier-label text-[9.5px] font-extrabold uppercase tracking-wider ${dogColor.label} block mb-0.5`;
        }
        if (scoreBadge) {
          scoreBadge.textContent = `Score: ${item.dog_severity}`;
          scoreBadge.className = `card-score-badge px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase border ${dogColor.badgeBg} ${dogColor.badgeText} ${dogColor.badgeBorder}`;
        }
        if (canineBlock) {
          canineBlock.classList.add('ring-2', 'ring-[#45671d]', 'scale-[1.02]');
          canineBlock.classList.remove('opacity-40');
        }
        if (felineBlock) {
          felineBlock.classList.add('opacity-40');
          felineBlock.classList.remove('ring-2', 'ring-purple-600', 'scale-[1.02]');
        }
      } else if (activeSpecies === 'feline') {
        const catColor = getRiskColor(item.cat_risk);
        if (tierLabel) {
          tierLabel.textContent = getRiskLabel(item.cat_risk).toUpperCase() + ' (FELINE)';
          tierLabel.className = `card-tier-label text-[9.5px] font-extrabold uppercase tracking-wider ${catColor.label} block mb-0.5`;
        }
        if (scoreBadge) {
          scoreBadge.textContent = `Score: ${item.cat_severity}`;
          scoreBadge.className = `card-score-badge px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase border ${catColor.badgeBg} ${catColor.badgeText} ${catColor.badgeBorder}`;
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
        // Dual view
        const badge = getOverallBadge(item);
        if (tierLabel) {
          tierLabel.textContent = item.category || 'Ingredient';
          tierLabel.className = `card-tier-label text-[9.5px] font-extrabold uppercase tracking-wider ${badge.label} block mb-0.5`;
        }
        if (scoreBadge) {
          scoreBadge.textContent = `Score: ${item.severity_score}`;
          scoreBadge.className = `card-score-badge px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase border ${badge.badgeBg} ${badge.badgeText} ${badge.badgeBorder}`;
        }
        if (canineBlock) canineBlock.classList.remove('ring-2', 'ring-[#45671d]', 'scale-[1.02]', 'opacity-40');
        if (felineBlock) felineBlock.classList.remove('ring-2', 'ring-purple-600', 'scale-[1.02]', 'opacity-40');
      }
    });
  }

  // ==========================================
  // 8. FILTER & SEARCH
  // ==========================================
  function applyFilters() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    let matchCount = 0;

    allCards.forEach(card => {
      const cardCategory = card.getAttribute('data-category') || '';
      const cardText = card.innerText.toLowerCase();
      const cardSearch = (card.getAttribute('data-search') || '').toLowerCase();
      const canineRisk = card.getAttribute('data-canine-risk') || '';
      const felineRisk = card.getAttribute('data-feline-risk') || '';

      let matchesCategory = (currentCategory === 'all') || (cardCategory === currentCategory);

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

  // ==========================================
  // 9. SPECIES VIEW BUTTON TOGGLES
  // ==========================================
  // Same bug class as the filter pills above: these were hardcoded to desktop's
  // px-3.5 py-1.5 text-xs sizing, which permanently overwrote mobile's smaller
  // px-3 py-1.5 text-[11px] buttons the first time one was tapped. Branch on
  // IS_MOBILE (already defined above) like renderFilterPills() does.
  const speciesBase = IS_MOBILE
    ? 'species-view-btn px-3 py-1.5 rounded-full text-[11px] font-bold text-[#788673] bg-[#fbf9f6] border border-[#ebdcd0] shrink-0'
    : 'species-view-btn px-3.5 py-1.5 rounded-full text-xs font-bold text-[#788673] bg-[#fbf9f6] border border-[#ebdcd0] hover:text-[#182811] cursor-pointer transition-all';
  const speciesActive = IS_MOBILE
    ? 'species-view-btn px-3 py-1.5 rounded-full text-[11px] font-extrabold text-white shrink-0 shadow-xs'
    : 'species-view-btn px-3.5 py-1.5 rounded-full text-xs font-extrabold text-white shadow-xs cursor-pointer transition-all';

  speciesViewButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const button = e.currentTarget;
      activeSpecies = button.getAttribute('data-species') || 'dual';

      speciesViewButtons.forEach(b => {
        b.className = speciesBase;
      });

      if (activeSpecies === 'canine') {
        button.className = speciesActive + ' bg-[#ff9800]';
      } else if (activeSpecies === 'feline') {
        button.className = speciesActive + ' bg-purple-600';
      } else {
        button.className = speciesActive + ' bg-[#45671d]';
      }

      applySpeciesPerspective();
      applyFilters();
    });
  });

  // Live search
  searchInput?.addEventListener('input', applyFilters);


  // ==========================================
  // 10. COMPARISON MODE ENGINE
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
    // Preserve current hidden/visible state so this never fights toggleCompareMode's visibility toggle
    const hiddenPrefix = isCompareMode ? '' : 'hidden ';
    allCards.forEach(card => {
      const key = card.getAttribute('data-compound');
      const pill = card.querySelector('.compare-checkbox-pill');
      if (selectedCompounds.includes(key)) {
        card.classList.add('ring-2', 'ring-[#45671d]', 'border-[#45671d]');
        if (pill) {
          pill.textContent = '✓ Selected';
          pill.className = `compare-checkbox-pill ${hiddenPrefix}absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full bg-[#45671d] text-white text-[9.5px] font-black shadow-xs`;
        }
      } else {
        card.classList.remove('ring-2', 'ring-[#45671d]', 'border-[#45671d]');
        if (pill) {
          pill.textContent = '+ Compare';
          pill.className = `compare-checkbox-pill ${hiddenPrefix}absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full bg-white border border-[#ebdcd0] text-[9.5px] font-extrabold text-[#788673]`;
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
          const name1 = allIngredients[selectedCompounds[0]]?.primary_name || selectedCompounds[0];
          const name2 = allIngredients[selectedCompounds[1]]?.primary_name || selectedCompounds[1];
          comparePrompt.innerHTML = `Ready! Comparing <strong class="text-[#182811]">${escapeHtml(name1)}</strong> vs <strong class="text-[#182811]">${escapeHtml(name2)}</strong>. Click 'View Side-by-Side' to launch.`;
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

  function renderCompareColumn(item) {
    const badge = getOverallBadge(item);
    const dogColor = getRiskColor(item.dog_risk);
    const catColor = getRiskColor(item.cat_risk);

    return `
      <div class="tactile-card p-5 space-y-4 bg-[#fbf9f6]">
        <div class="flex items-start justify-between pb-2 border-b border-[#ebdcd0]">
          <div>
            <span class="text-[9.5px] font-extrabold uppercase tracking-wider text-[#788673] block">${escapeHtml(item.category || '')}</span>
            <h4 class="font-extrabold text-base text-[#182811]">${escapeHtml(item.primary_name)}</h4>
            <p class="text-[10.5px] text-[#788673]">${escapeHtml(item.aliases || '')}</p>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-black border ${badge.badgeBg} ${badge.badgeText} ${badge.badgeBorder}">
            Score: ${item.severity_score}
          </span>
        </div>

        <div class="p-3.5 rounded-2xl ${dogColor.bg} ${dogColor.border} border space-y-1">
          <div class="flex items-center gap-1.5 ${dogColor.strong}">
            <i class="fa-solid fa-dog text-xs"></i>
            <strong class="font-bold uppercase tracking-wide text-[10px]">Canine — ${getRiskLabel(item.dog_risk)}</strong>
          </div>
          <p class="text-[11.5px] leading-relaxed ${dogColor.text} font-medium">${escapeHtml(item.dog_notes || 'No canine-specific data available.')}</p>
        </div>

        <div class="p-3.5 rounded-2xl ${catColor.bg} ${catColor.border} border space-y-1">
          <div class="flex items-center gap-1.5 ${catColor.strong}">
            <i class="fa-solid fa-cat text-xs"></i>
            <strong class="font-bold uppercase tracking-wide text-[10px]">Feline — ${getRiskLabel(item.cat_risk)}</strong>
          </div>
          <p class="text-[11.5px] leading-relaxed ${catColor.text} font-medium">${escapeHtml(item.cat_notes || 'No feline-specific data available.')}</p>
        </div>

        ${item.notes ? `
        <div class="p-3.5 rounded-2xl bg-white border border-[#ebdcd0] space-y-1">
          <strong class="text-[#182811] text-[10.5px] font-bold block uppercase tracking-wide">Overview</strong>
          <p class="text-xs text-[#586754] leading-relaxed">${escapeHtml(item.notes)}</p>
        </div>
        ` : ''}

        ${item.emergency_action ? `
        <div class="p-3.5 rounded-2xl bg-red-50 border border-red-200 space-y-1">
          <strong class="text-red-900 text-[10.5px] font-bold block uppercase tracking-wide">Emergency Action</strong>
          <p class="text-xs text-red-800 leading-relaxed font-semibold">${escapeHtml(item.emergency_action)}</p>
        </div>
        ` : ''}
      </div>
    `;
  }

  function launchComparisonModal() {
    if (selectedCompounds.length < 2 || !compareColsContainer) return;

    const dataA = allIngredients[selectedCompounds[0]];
    const dataB = allIngredients[selectedCompounds[1]];
    if (!dataA || !dataB) return;

    compareColsContainer.innerHTML = renderCompareColumn(dataA) + renderCompareColumn(dataB);
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
  // 11. DOSSIER MODAL (DETAIL VIEW)
  // ==========================================
  const modal = document.getElementById('wikiDossierModal');
  const closeModalBtn = document.getElementById('closeDossierModalBtn');
  const closeModalBtn2 = document.getElementById('closeDossierModalBtn2');

  // Every field renders as its own fully standalone, bold, highlighted box -- not
  // nested inside a shared "Canine Assessment" / "Feline Assessment" container.
  // Each box carries its own species icon + label so it's still clear which
  // species it's about without grouping it under anything. Skipped when empty.
  function dossierField(icon, speciesLabel, color, fieldLabel, value) {
    if (!value) return '';
    return '<div class="p-4 rounded-2xl border-2 ' + color.border + ' ' + color.bg + ' shadow-sm">' +
      '<div class="flex items-center gap-1.5 mb-1">' +
        '<i class="fa-solid ' + icon + ' text-xs ' + color.strong + '"></i>' +
        '<strong class="text-[9.5px] font-extrabold uppercase tracking-wide ' + color.strong + '">' + escapeHtml(speciesLabel) + ' &middot; ' + escapeHtml(fieldLabel) + '</strong>' +
      '</div>' +
      '<p class="text-[11.5px] leading-relaxed whitespace-pre-line text-[#182811]">' + escapeHtml(value) + '</p></div>';
  }

  // A standalone box for the species' overall rating, separate from every other field.
  function dossierRiskBox(icon, speciesLabel, color, risk) {
    return '<div class="p-4 rounded-2xl border-2 ' + color.border + ' ' + color.bg + ' shadow-sm flex items-center justify-between gap-2">' +
      '<div class="flex items-center gap-1.5">' +
        '<i class="fa-solid ' + icon + ' text-sm ' + color.strong + '"></i>' +
        '<strong class="font-extrabold uppercase tracking-wide text-[10.5px] ' + color.strong + '">' + escapeHtml(speciesLabel) + '</strong>' +
      '</div>' +
      '<span class="px-2.5 py-1 rounded-full text-[9.5px] font-extrabold uppercase border ' + color.badgeBg + ' ' + color.badgeBorder + ' ' + color.badgeText + '">' + escapeHtml(getRiskLabel(risk)) + '</span></div>';
  }

  // Builds every standalone box for one species -- every column the database has for
  // that species (not just notes), so nothing documented for an ingredient is left
  // out of what a pet owner can see here.
  function renderSpeciesAssessment(containerId, icon, speciesLabel, hasRow, risk, notes, symptoms, dosage, alternatives, breed, weight) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const color = getRiskColor(risk);
    if (!hasRow) {
      container.innerHTML = dossierRiskBox(icon, speciesLabel, color, risk) +
        '<div class="p-4 rounded-2xl border-2 ' + color.border + ' ' + color.bg + ' shadow-sm sm:col-span-2">' +
        '<p class="text-[11.5px] leading-relaxed italic ' + color.strong + '">This ingredient has not been assessed for this species. Do not assume it is safe.</p></div>';
      return;
    }
    container.innerHTML = dossierRiskBox(icon, speciesLabel, color, risk) +
      dossierField(icon, speciesLabel, color, 'Overview', notes) +
      dossierField(icon, speciesLabel, color, 'Clinical Symptoms', symptoms) +
      dossierField(icon, speciesLabel, color, 'Dosage / Toxic Threshold', dosage) +
      dossierField(icon, speciesLabel, color, 'Vet-Safe Alternatives / Guidance', alternatives) +
      dossierField(icon, speciesLabel, color, 'Breed-Specific Risk', breed) +
      dossierField(icon, speciesLabel, color, 'Weight-Specific Risk', weight);
  }

  function openDossier(ingredientId) {
    const item = allIngredients[ingredientId];
    if (!item || !modal) return;

    document.getElementById('dossierModalTitle').textContent = item.primary_name;
    document.getElementById('dossierModalCategory').textContent = (item.category || 'Ingredient').toUpperCase();
    document.getElementById('dossierModalAliases').textContent = item.aliases || 'No known aliases';

    // Mechanism / Notes
    document.getElementById('dossierModalMechanism').textContent = item.notes || 'No detailed notes available for this ingredient.';

    renderSpeciesAssessment('dossierModalCanine', 'fa-dog', 'Canine', !!item.dog, item.dog_risk,
      item.dog_notes, item.dog_clinical, item.dog_dosage, item.dog_alternatives, item.dog_breed_specific, item.dog_weight_specific);
    renderSpeciesAssessment('dossierModalFeline', 'fa-cat', 'Feline', !!item.cat, item.cat_risk,
      item.cat_notes, item.cat_clinical, item.cat_dosage, item.cat_alternatives, item.cat_breed_specific, item.cat_weight_specific);

    // Emergency action section -- species-specific in the database, so when dogs and
    // cats have different instructions both are shown instead of silently dropping one.
    const altEl = document.getElementById('dossierModalAlternatives');
    const emergencySection = document.getElementById('dossierModalEmergencySection');
    const dogEmergency = item.dog_emergency || '';
    const catEmergency = item.cat_emergency || '';
    if (dogEmergency || catEmergency) {
      if (dogEmergency && catEmergency && dogEmergency !== catEmergency) {
        altEl.innerHTML =
          '<p><strong class="font-bold">For dogs:</strong> ' + escapeHtml(dogEmergency) + '</p>' +
          '<p><strong class="font-bold">For cats:</strong> ' + escapeHtml(catEmergency) + '</p>';
      } else {
        altEl.innerHTML = '<p>' + escapeHtml(dogEmergency || catEmergency) + '</p>';
      }
      if (emergencySection) emergencySection.classList.remove('hidden');
    } else {
      altEl.innerHTML = '';
      if (emergencySection) emergencySection.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  }

  function closeDossier() {
    if (modal) modal.classList.add('hidden');
  }

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


  // ==========================================
  // 12. UTILITY
  // ==========================================
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }


  // ==========================================
  // 13. MOBILE ENTRY COUNT BADGE
  // ==========================================
  function updateMobileCount(count) {
    const el = document.getElementById('mobileEntryCount');
    if (el) el.textContent = count + ' DOSSIERS';
  }

  // ==========================================
  // 14. INIT — LOAD INGREDIENTS FROM API
  // ==========================================
  loadIngredients();

});

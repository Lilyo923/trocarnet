(() => {
  'use strict';

  const APP_VERSION = '1.1.0';
  const STORAGE_KEY = 'trocarnet_data_v1';
  const THEME_KEY = 'trocarnet_theme';
  const SEEN_VERSION_KEY = 'trocarnet_seen_version';
  const ACH_SEEN_KEY = 'trocarnet_achievements_seen';
  const SESSION_KEY = 'trocarnet_session';

  /* Historique des versions affiché dans la fenêtre « Nouveautés ».
     Ajoute une entrée en haut à chaque mise à jour et change APP_VERSION. */
  const CHANGELOG = [
    {
      version: '1.1.0',
      date: 'Octobre 2026',
      items: [
        ['🤝', 'Coopération', 'Crée un lien de session et partage ton carnet avec tes amis. Les brocantes se synchronisent entre vos appareils.'],
        ['🏆', 'Succès', '18 défis à débloquer, de ta première brocante à la Braderie de Lille.'],
        ['📱', 'Icône d\'appli', 'Ajoute Trocarnet à l\'écran d\'accueil de ton téléphone ou au Dock de ton ordi.'],
        ['📜', 'Nouveautés et tuto', 'Cette fenêtre s\'affiche à chaque mise à jour, et un tuto est dispo dans le menu.']
      ]
    },
    {
      version: '1.0.0',
      date: 'Juillet 2026',
      items: [
        ['🏷️', 'Lancement', 'Carnet de brocantes, recherche de ville, filtres, thème sombre et codes de sauvegarde.']
      ]
    }
  ];

  const CATEGORY_LABELS = {
    'brocante': 'Brocante généraliste',
    'vide-grenier': 'Vide-grenier',
    'puces': 'Marché aux puces',
    'specialisee': 'Brocante spécialisée'
  };

  const MONTH_LABELS = {
    '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
    '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
    '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
  };

  /* ---------------------------------------------------------------
     State
     --------------------------------------------------------------- */

  /* state.tombstones garde la trace des brocantes supprimées ({ id: horodatage })
     pour que la suppression se propage aussi aux autres membres d'une session. */
  let state = { entries: [], tombstones: {} };
  let editingId = null;
  let citySearchController = null;
  let selectedCityMeta = null; // { lat, lon } if picked from suggestions

  function normalizeState(raw) {
    const entries = Array.isArray(raw && raw.entries) ? raw.entries : [];
    const tombstones = (raw && raw.tombstones && typeof raw.tombstones === 'object') ? raw.tombstones : {};
    return {
      entries: entries
        .filter((e) => e && typeof e === 'object' && e.id && e.city)
        .map((e) => ({ ...e, updatedAt: Number(e.updatedAt) || Number(e.createdAt) || 0 })),
      tombstones
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.entries)) {
          state = normalizeState(parsed);
          return;
        }
      }
    } catch (err) {
      console.error('Impossible de lire la sauvegarde locale :', err);
    }
    state = { entries: [], tombstones: {} };
  }

  /* Fusionne deux carnets : pour chaque brocante, la version modifiée le plus
     récemment gagne ; une suppression plus récente que la dernière modif l'emporte. */
  function mergeStates(a, b) {
    const A = normalizeState(a);
    const B = normalizeState(b);
    const tombstones = { ...A.tombstones };
    Object.entries(B.tombstones).forEach(([id, t]) => {
      tombstones[id] = Math.max(Number(tombstones[id]) || 0, Number(t) || 0);
    });
    const byId = new Map();
    [...A.entries, ...B.entries].forEach((e) => {
      const current = byId.get(e.id);
      if (!current || e.updatedAt > current.updatedAt) byId.set(e.id, e);
    });
    const entries = Array.from(byId.values()).filter((e) => !(Number(tombstones[e.id]) >= e.updatedAt));
    return { entries, tombstones };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Impossible d\'écrire la sauvegarde locale :', err);
      showToast('La sauvegarde automatique a échoué (stockage plein ?).');
    }
  }

  function uid() {
    return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------------------------------------------------------
     DOM references
     --------------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);

  const menuToggle = $('menuToggle');
  const closeMenuBtn = $('closeMenu');
  const sideMenu = $('sideMenu');
  const overlay = $('overlay');
  const themeToggle = $('themeToggle');
  const themeIcon = $('themeIcon');

  const addBtn = $('addBtn');
  const grid = $('grid');
  const emptyState = $('emptyState');
  const cardTemplate = $('cardTemplate');

  const filterYear = $('filterYear');
  const filterMonth = $('filterMonth');
  const filterCategory = $('filterCategory');
  const sortBy = $('sortBy');

  const entryModal = $('entryModal');
  const entryForm = $('entryForm');
  const modalTitle = $('modalTitle');
  const closeModalBtn = $('closeModal');
  const cancelEntryBtn = $('cancelEntryBtn');
  const deleteEntryBtn = $('deleteEntryBtn');

  const entryIdField = $('entryId');
  const cityLatField = $('cityLat');
  const cityLonField = $('cityLon');
  const citySearch = $('citySearch');
  const citySuggestions = $('citySuggestions');
  const streetInput = $('streetInput');
  const dateInput = $('dateInput');
  const categorySelect = $('categorySelect');
  const exhibitorsRange = $('exhibitorsRange');
  const exhibitorsNumber = $('exhibitorsNumber');
  const bigStampPreview = $('bigStampPreview');
  const neighborhoodRange = $('neighborhoodRange');
  const neighborhoodLabel = $('neighborhoodLabel');
  const commentInput = $('commentInput');

  const statTotal = $('statTotal');
  const generateCodeBtn = $('generateCodeBtn');
  const exportArea = $('exportArea');
  const exportActions = $('exportActions');
  const copyCodeBtn = $('copyCodeBtn');
  const downloadCodeBtn = $('downloadCodeBtn');
  const importArea = $('importArea');
  const loadCodeBtn = $('loadCodeBtn');
  const importFile = $('importFile');

  const toast = $('toast');

  /* ---------------------------------------------------------------
     Theme
     --------------------------------------------------------------- */

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre');
    localStorage.setItem(THEME_KEY, theme);
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ---------------------------------------------------------------
     Side menu
     --------------------------------------------------------------- */

  function openMenu() {
    sideMenu.classList.add('open');
    sideMenu.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('hidden');
    menuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    sideMenu.classList.remove('open');
    sideMenu.setAttribute('aria-hidden', 'true');
    overlay.classList.add('hidden');
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  menuToggle.addEventListener('click', openMenu);
  closeMenuBtn.addEventListener('click', closeMenu);
  overlay.addEventListener('click', () => {
    closeMenu();
    closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sideMenu.classList.contains('open')) closeMenu();
  });

  /* ---------------------------------------------------------------
     Toast
     --------------------------------------------------------------- */

  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  /* ---------------------------------------------------------------
     Filters — populate dynamic options
     --------------------------------------------------------------- */

  function refreshFilterOptions() {
    const years = new Set();
    state.entries.forEach((e) => {
      if (e.date) years.add(e.date.slice(0, 4));
    });
    const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));

    const currentYearValue = filterYear.value;
    filterYear.innerHTML = '<option value="">Toutes les années</option>' +
      sortedYears.map((y) => `<option value="${y}">${y}</option>`).join('');
    if (sortedYears.includes(currentYearValue)) filterYear.value = currentYearValue;
  }

  /* ---------------------------------------------------------------
     Rendering
     --------------------------------------------------------------- */

  function neighborhoodInfo(value) {
    if (value <= 25) return { label: 'Populaire', pct: value };
    if (value <= 50) return { label: 'Mixte', pct: value };
    if (value <= 75) return { label: 'Aisé', pct: value };
    return { label: 'Huppé', pct: value };
  }

  function getFilteredSortedEntries() {
    let list = state.entries.slice();

    if (filterYear.value) list = list.filter((e) => e.date && e.date.slice(0, 4) === filterYear.value);
    if (filterMonth.value) list = list.filter((e) => e.date && e.date.slice(5, 7) === filterMonth.value);
    if (filterCategory.value) list = list.filter((e) => e.category === filterCategory.value);

    const sortValue = sortBy.value;
    list.sort((a, b) => {
      switch (sortValue) {
        case 'date-asc':
          return (a.date || '').localeCompare(b.date || '');
        case 'exhibitors-desc':
          return (b.exhibitors || 0) - (a.exhibitors || 0);
        case 'exhibitors-asc':
          return (a.exhibitors || 0) - (b.exhibitors || 0);
        case 'city-asc':
          return a.city.localeCompare(b.city, 'fr');
        case 'date-desc':
        default:
          return (b.date || '').localeCompare(a.date || '');
      }
    });

    return list;
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Date inconnue';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  }

  function render() {
    refreshFilterOptions();
    statTotal.textContent = state.entries.length;

    const list = getFilteredSortedEntries();
    grid.innerHTML = '';

    if (state.entries.length === 0) {
      emptyState.classList.remove('hidden');
      grid.classList.add('hidden');
      return;
    }
    emptyState.classList.add('hidden');
    grid.classList.remove('hidden');

    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'menu-text-soft';
      p.textContent = 'Aucune brocante ne correspond à ces filtres.';
      grid.appendChild(p);
      return;
    }

    list.forEach((entry) => {
      const node = cardTemplate.content.cloneNode(true);
      const card = node.querySelector('.tag-card');

      node.querySelector('.tag-category').textContent = CATEGORY_LABELS[entry.category] || entry.category;
      node.querySelector('.tag-city').textContent = entry.city;

      const streetEl = node.querySelector('.tag-street');
      if (entry.street) {
        streetEl.textContent = entry.street;
      } else {
        streetEl.remove();
      }

      node.querySelector('.tag-date').textContent = formatDate(entry.date);
      node.querySelector('.tag-exhibitors').textContent = entry.exhibitors > 0 ? `${entry.exhibitors}` : '—';

      const stampEl = node.querySelector('.stamp');
      if (!(entry.exhibitors >= 1000)) stampEl.classList.add('hidden');

      const info = neighborhoodInfo(entry.neighborhood);
      node.querySelector('.gauge-fill').style.width = info.pct + '%';
      node.querySelector('.gauge-label').textContent = `Quartier ${info.label.toLowerCase()}`;

      const commentEl = node.querySelector('.tag-comment');
      if (entry.comment) {
        commentEl.textContent = `« ${entry.comment} »`;
      } else {
        commentEl.remove();
      }

      node.querySelector('.tag-edit-btn').addEventListener('click', () => openModal(entry.id));

      grid.appendChild(node);
    });
  }

  [filterYear, filterMonth, filterCategory, sortBy].forEach((el) => {
    el.addEventListener('change', render);
  });

  /* ---------------------------------------------------------------
     Modal — open / close / reset
     --------------------------------------------------------------- */

  function resetForm() {
    entryForm.reset();
    entryIdField.value = '';
    cityLatField.value = '';
    cityLonField.value = '';
    selectedCityMeta = null;
    citySuggestions.innerHTML = '';
    citySuggestions.classList.add('hidden');
    exhibitorsRange.value = 0;
    exhibitorsNumber.value = 0;
    neighborhoodRange.value = 50;
    updateNeighborhoodLabel();
    updateStampPreview();
    deleteEntryBtn.classList.add('hidden');
  }

  function openModal(id = null) {
    resetForm();
    editingId = id;

    if (id) {
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return;
      modalTitle.textContent = 'Modifier la brocante';
      entryIdField.value = entry.id;
      citySearch.value = entry.city;
      cityLatField.value = entry.lat || '';
      cityLonField.value = entry.lon || '';
      streetInput.value = entry.street || '';
      dateInput.value = entry.date || '';
      categorySelect.value = entry.category || 'brocante';
      exhibitorsRange.value = entry.exhibitors || 0;
      exhibitorsNumber.value = entry.exhibitors || 0;
      neighborhoodRange.value = entry.neighborhood ?? 50;
      commentInput.value = entry.comment || '';
      updateNeighborhoodLabel();
      updateStampPreview();
      deleteEntryBtn.classList.remove('hidden');
    } else {
      modalTitle.textContent = 'Nouvelle brocante';
    }

    if (typeof entryModal.showModal === 'function') {
      entryModal.showModal();
    } else {
      entryModal.setAttribute('open', '');
    }
  }

  function closeModal() {
    if (entryModal.open) entryModal.close();
    editingId = null;
    if (citySearchController) citySearchController.abort();
  }

  addBtn.addEventListener('click', () => openModal(null));
  closeModalBtn.addEventListener('click', closeModal);
  cancelEntryBtn.addEventListener('click', closeModal);
  entryModal.addEventListener('cancel', () => { editingId = null; });
  entryModal.addEventListener('click', (e) => {
    // Voir closeOnBackdrop plus bas : on se fie à la cible, pas aux coordonnées.
    if (e.target === entryModal) closeModal();
  });

  /* ---------------------------------------------------------------
     Exhibitors slider <-> number sync + stamp preview
     --------------------------------------------------------------- */

  function updateStampPreview() {
    const value = Number(exhibitorsNumber.value) || 0;
    bigStampPreview.classList.toggle('hidden', value < 1000);
  }

  exhibitorsRange.addEventListener('input', () => {
    exhibitorsNumber.value = exhibitorsRange.value;
    updateStampPreview();
  });
  exhibitorsNumber.addEventListener('input', () => {
    let value = Number(exhibitorsNumber.value) || 0;
    if (value < 0) value = 0;
    if (value > 5000) value = 5000;
    exhibitorsRange.value = Math.min(value, 2000);
    updateStampPreview();
  });

  function updateNeighborhoodLabel() {
    const info = neighborhoodInfo(Number(neighborhoodRange.value));
    neighborhoodLabel.textContent = info.label;
  }
  neighborhoodRange.addEventListener('input', updateNeighborhoodLabel);

  /* ---------------------------------------------------------------
     City autocomplete (OpenStreetMap Nominatim)
     --------------------------------------------------------------- */

  let citySearchTimer = null;

  citySearch.addEventListener('input', () => {
    selectedCityMeta = null;
    cityLatField.value = '';
    cityLonField.value = '';
    const query = citySearch.value.trim();

    clearTimeout(citySearchTimer);
    if (query.length < 3) {
      citySuggestions.innerHTML = '';
      citySuggestions.classList.add('hidden');
      return;
    }

    citySearchTimer = setTimeout(() => fetchCitySuggestions(query), 400);
  });

  async function fetchCitySuggestions(query) {
    if (citySearchController) citySearchController.abort();
    citySearchController = new AbortController();

    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&accept-language=fr&countrycodes=fr&q=${encodeURIComponent(query)}`;

    try {
      const res = await fetch(url, { signal: citySearchController.signal });
      if (!res.ok) throw new Error('Réponse réseau invalide');
      const data = await res.json();

      const filtered = data.filter((item) => {
        const type = item.type || '';
        const cls = item.class || '';
        return cls === 'place' || cls === 'boundary' || ['city', 'town', 'village', 'municipality', 'hamlet'].includes(type);
      });

      renderCitySuggestions(filtered.length ? filtered : data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Recherche de ville impossible :', err);
        citySuggestions.innerHTML = '<li class="menu-text-soft">Recherche indisponible, tu peux saisir la ville manuellement.</li>';
        citySuggestions.classList.remove('hidden');
      }
    }
  }

  function renderCitySuggestions(items) {
    citySuggestions.innerHTML = '';
    if (!items.length) {
      citySuggestions.classList.add('hidden');
      return;
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      const address = item.address || {};
      const cityName = address.city || address.town || address.village || address.municipality || item.display_name.split(',')[0];
      const context = [address.state, address.country].filter(Boolean).join(', ');

      const strong = document.createElement('span');
      strong.textContent = cityName;
      li.appendChild(strong);

      if (context) {
        const small = document.createElement('small');
        small.textContent = context;
        li.appendChild(small);
      }

      li.addEventListener('click', () => {
        citySearch.value = cityName;
        cityLatField.value = item.lat || '';
        cityLonField.value = item.lon || '';
        selectedCityMeta = { lat: item.lat, lon: item.lon };
        citySuggestions.innerHTML = '';
        citySuggestions.classList.add('hidden');
      });

      citySuggestions.appendChild(li);
    });

    citySuggestions.classList.remove('hidden');
  }

  document.addEventListener('click', (e) => {
    if (!citySuggestions.contains(e.target) && e.target !== citySearch) {
      citySuggestions.classList.add('hidden');
    }
  });

  /* ---------------------------------------------------------------
     Form submit / delete
     --------------------------------------------------------------- */

  entryForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const city = citySearch.value.trim();
    if (!city) {
      citySearch.focus();
      showToast('La ville est obligatoire.');
      return;
    }

    const entryData = {
      city,
      street: streetInput.value.trim(),
      lat: cityLatField.value || null,
      lon: cityLonField.value || null,
      date: dateInput.value || '',
      category: categorySelect.value,
      exhibitors: Number(exhibitorsNumber.value) || 0,
      neighborhood: Number(neighborhoodRange.value),
      comment: commentInput.value.trim()
    };

    const now = Date.now();
    if (editingId) {
      const idx = state.entries.findIndex((e) => e.id === editingId);
      if (idx !== -1) {
        state.entries[idx] = { ...state.entries[idx], ...entryData, updatedAt: now };
        showToast('Brocante mise à jour.');
      }
    } else {
      state.entries.push({ id: uid(), createdAt: now, updatedAt: now, ...entryData });
      showToast('Brocante enregistrée.');
    }

    closeModal();
    afterLocalChange();
  });

  deleteEntryBtn.addEventListener('click', () => {
    if (!editingId) return;
    const entry = state.entries.find((e) => e.id === editingId);
    const confirmed = window.confirm(`Supprimer la brocante « ${entry ? entry.city : ''} » ? Cette action est irréversible.`);
    if (!confirmed) return;
    const removedId = editingId;
    state.entries = state.entries.filter((e) => e.id !== removedId);
    state.tombstones[removedId] = Date.now();
    closeModal();
    afterLocalChange();
    showToast('Brocante supprimée.');
  });

  /* Après chaque ajout / modif / suppression : sauvegarde locale, affichage,
     succès, puis envoi à la session coop si elle existe. */
  function afterLocalChange() {
    saveState();
    render();
    checkAchievements(true);
    if (getSessionId()) syncNow({ silent: true });
  }

  /* ---------------------------------------------------------------
     Export / import save codes
     --------------------------------------------------------------- */

  function encodeUnicodeBase64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
  }

  function decodeUnicodeBase64(str) {
    return decodeURIComponent(
      atob(str)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }

  function generateSaveCode() {
    const payload = { version: APP_VERSION, exportedAt: Date.now(), entries: state.entries, tombstones: state.tombstones };
    return encodeUnicodeBase64(JSON.stringify(payload));
  }

  generateCodeBtn.addEventListener('click', () => {
    const code = generateSaveCode();
    exportArea.value = code;
    exportArea.classList.remove('hidden');
    exportActions.classList.remove('hidden');
  });

  copyCodeBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(exportArea.value);
      showToast('Code copié dans le presse-papiers.');
    } catch (err) {
      exportArea.select();
      showToast('Sélectionne et copie le code manuellement.');
    }
  });

  downloadCodeBtn.addEventListener('click', () => {
    const blob = new Blob([exportArea.value || generateSaveCode()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trocarnet-sauvegarde-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  function importFromCode(rawCode) {
    const code = rawCode.trim();
    if (!code) {
      showToast('Colle un code de sauvegarde avant de charger.');
      return;
    }
    try {
      const json = decodeUnicodeBase64(code);
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error('Format invalide');

      const inSession = Boolean(getSessionId());
      const confirmed = window.confirm(inSession
        ? `Ajouter ${parsed.entries.length} brocante(s) à la session coop ? Elles seront fusionnées avec celles déjà présentes.`
        : `Charger ${parsed.entries.length} brocante(s) ? Cela remplacera tes données actuelles.`);
      if (!confirmed) return;

      // En session, on fusionne (remplacer effacerait le travail des autres).
      state = inSession ? mergeStates(state, parsed) : normalizeState(parsed);
      afterLocalChange();
      showToast('Sauvegarde chargée avec succès.');
      closeMenu();
    } catch (err) {
      console.error('Code de sauvegarde invalide :', err);
      showToast('Ce code de sauvegarde est invalide ou corrompu.');
    }
  }

  loadCodeBtn.addEventListener('click', () => importFromCode(importArea.value));

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importFromCode(String(reader.result || ''));
    reader.onerror = () => showToast('Impossible de lire ce fichier.');
    reader.readAsText(file);
    importFile.value = '';
  });

  /* ---------------------------------------------------------------
     Dialogs (helpers communs)
     --------------------------------------------------------------- */

  function openDialog(dlg) {
    if (dlg.open) return;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeDialog(dlg) {
    if (dlg.open) dlg.close();
  }

  // Clic sur le fond assombri = fermeture. On teste la cible plutôt que les
  // coordonnées : certains navigateurs envoient (0,0) quand on choisit une
  // option dans une liste déroulante, ce qui fermait la fenêtre par erreur.
  function closeOnBackdrop(dlg, onClose) {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) (onClose || (() => closeDialog(dlg)))();
    });
  }

  /* ---------------------------------------------------------------
     Coopération (synchro Firebase Firestore)
     --------------------------------------------------------------- */

  const FIREBASE_VERSION = '12.19.0';
  const SESSION_ID_LENGTH = 24;
  const LAST_SYNC_KEY = 'trocarnet_last_sync';
  const COOP_EVER_KEY = 'trocarnet_coop_ever';

  const coopNotConfigured = $('coopNotConfigured');
  const coopIdle = $('coopIdle');
  const coopActive = $('coopActive');
  const createSessionBtn = $('createSessionBtn');
  const joinInput = $('joinInput');
  const joinBtn = $('joinBtn');
  const sessionCode = $('sessionCode');
  const copyLinkBtn = $('copyLinkBtn');
  const shareLinkBtn = $('shareLinkBtn');
  const syncMenuBtn = $('syncMenuBtn');
  const leaveSessionBtn = $('leaveSessionBtn');
  const syncStatusMenu = $('syncStatusMenu');
  const syncBtn = $('syncBtn');
  const syncChip = $('syncChip');

  let firebaseHandle = null;
  let syncPromise = null;
  let syncQueued = false;

  function firebaseConfigured() {
    const c = window.TROCARNET_FIREBASE_CONFIG;
    return Boolean(c && typeof c.apiKey === 'string' && c.apiKey && !c.apiKey.startsWith('COLLE') && c.projectId);
  }

  function isValidSessionId(id) {
    return typeof id === 'string' && new RegExp(`^[A-Za-z0-9]{${SESSION_ID_LENGTH}}$`).test(id);
  }

  function getSessionId() {
    try {
      const id = localStorage.getItem(SESSION_KEY);
      return isValidSessionId(id) ? id : null;
    } catch (err) {
      return null;
    }
  }

  function setSessionId(id) {
    try {
      if (id) {
        localStorage.setItem(SESSION_KEY, id);
        localStorage.setItem(COOP_EVER_KEY, '1');
      } else {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LAST_SYNC_KEY);
      }
    } catch (err) {
      console.error('Impossible d\'enregistrer la session :', err);
    }
  }

  function generateSessionId() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(SESSION_ID_LENGTH);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  function sessionLink(id) {
    return `${location.origin}${location.pathname}?session=${id}`;
  }

  // Accepte un lien complet ou le code seul.
  function extractSessionId(text) {
    const raw = (text || '').trim();
    const match = raw.match(/[?&]session=([A-Za-z0-9]+)/);
    const candidate = match ? match[1] : raw;
    return isValidSessionId(candidate) ? candidate : null;
  }

  async function getFirebase() {
    if (firebaseHandle) return firebaseHandle;
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appMod, fsMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-firestore-lite.js`)
    ]);
    const app = appMod.initializeApp(window.TROCARNET_FIREBASE_CONFIG);
    const db = fsMod.getFirestore(app);
    const emu = window.TROCARNET_FIRESTORE_EMULATOR;
    if (emu && emu.host && emu.port) fsMod.connectFirestoreEmulator(db, emu.host, emu.port);
    firebaseHandle = { db, fs: fsMod };
    return firebaseHandle;
  }

  // Représentation stable d'un carnet, pour savoir s'il a vraiment changé
  // (et éviter d'écrire sur le serveur pour rien).
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function stateKey(s) {
    const n = normalizeState(s);
    return canonical({ entries: n.entries.slice().sort((a, b) => a.id.localeCompare(b.id)), tombstones: n.tombstones });
  }

  // Firestore refuse les valeurs undefined : on nettoie avant l'envoi.
  function cleanForFirestore(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const today = new Date();
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `aujourd'hui à ${hm}`;
    return `le ${d.toLocaleDateString('fr-FR')} à ${hm}`;
  }

  function setSyncStatus(kind, text) {
    syncStatusMenu.textContent = text;
    syncStatusMenu.dataset.kind = kind;
    syncChip.textContent = kind === 'busy' ? 'Synchro…' : kind === 'error' ? 'Hors ligne' : 'Synchronisé';
    syncChip.dataset.kind = kind;
    syncChip.title = text;
    syncBtn.disabled = kind === 'busy';
    syncMenuBtn.disabled = kind === 'busy';
  }

  function lastSyncText() {
    let ts = null;
    try { ts = Number(localStorage.getItem(LAST_SYNC_KEY)) || null; } catch (err) { ts = null; }
    return ts ? `Dernière synchro ${formatTime(ts)}` : 'Pas encore synchronisé';
  }

  function renderCoop() {
    const sid = getSessionId();
    const configured = firebaseConfigured();
    coopNotConfigured.classList.toggle('hidden', configured);
    coopIdle.classList.toggle('hidden', !configured || Boolean(sid));
    coopActive.classList.toggle('hidden', !configured || !sid);
    syncBtn.classList.toggle('hidden', !configured || !sid);
    syncChip.classList.toggle('hidden', !configured || !sid);
    shareLinkBtn.classList.toggle('hidden', typeof navigator.share !== 'function');
    if (sid) {
      sessionCode.textContent = `${sid.slice(0, 4)}·${sid.slice(4, 8)}…`;
      sessionCode.title = sid;
    }
  }

  function syncNow({ silent = false } = {}) {
    const sid = getSessionId();
    if (!sid || !firebaseConfigured()) return Promise.resolve(false);
    if (syncPromise) {
      syncQueued = true;
      return syncPromise;
    }

    setSyncStatus('busy', 'Synchronisation en cours…');

    syncPromise = (async () => {
      try {
        const { db, fs } = await getFirebase();
        const ref = fs.doc(db, 'sessions', sid);
        const local = { entries: state.entries, tombstones: state.tombstones };

        const merged = await fs.runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const remote = snap.exists() ? snap.data() : { entries: [], tombstones: {} };
          const result = mergeStates(remote, local);
          if (!snap.exists() || stateKey(result) !== stateKey(remote)) {
            tx.set(ref, cleanForFirestore({
              entries: result.entries,
              tombstones: result.tombstones,
              updatedAt: Date.now(),
              appVersion: APP_VERSION
            }));
          }
          return result;
        });

        // Si la session a été quittée pendant la synchro, on ne touche à rien.
        if (getSessionId() !== sid) return false;

        // Re-fusion avec l'état local, au cas où une brocante a été ajoutée
        // pendant que la requête tournait.
        state = mergeStates(merged, state);
        saveState();
        render();
        checkAchievements(true);

        try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch (err) { /* stockage plein */ }
        setSyncStatus('ok', lastSyncText());
        if (!silent) showToast('Carnet synchronisé.');
        return true;
      } catch (err) {
        console.error('Synchronisation impossible :', err);
        const denied = err && (err.code === 'permission-denied' || err.code === 'firestore/permission-denied');
        const msg = denied
          ? 'Le serveur a refusé l\'accès (règles Firestore ?).'
          : 'Synchro impossible. Tes brocantes restent sur cet appareil et partiront à la prochaine synchro.';
        setSyncStatus('error', msg);
        if (!silent) showToast(denied ? 'Accès refusé par le serveur.' : 'Pas de connexion au serveur.');
        return false;
      } finally {
        syncPromise = null;
        if (syncQueued) {
          syncQueued = false;
          syncNow({ silent: true });
        }
      }
    })();

    return syncPromise;
  }

  function joinSession(sid) {
    const current = getSessionId();
    if (current === sid) {
      showToast('Tu es déjà dans cette session.');
      syncNow();
      return;
    }
    const n = state.entries.length;
    const message = current
      ? 'Tu es déjà dans une autre session. La quitter pour rejoindre celle-ci ? Les brocantes de ton carnet seront ajoutées à la nouvelle session.'
      : `Rejoindre cette session coopérative ?${n ? ` Tes ${n} brocante(s) seront ajoutées au carnet commun.` : ''}`;
    if (!window.confirm(message)) return;

    setSessionId(sid);
    renderCoop();
    checkAchievements(true);
    showToast('Session rejointe, synchro en cours…');
    syncNow({ silent: true }).then((ok) => { if (ok) showToast('Session rejointe et synchronisée.'); });
  }

  function handleJoinLink() {
    const params = new URLSearchParams(location.search);
    if (!params.has('session')) return;
    const sid = params.get('session');
    params.delete('session');
    const rest = params.toString();
    try {
      history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
    } catch (err) { /* file:// ou navigateur restrictif */ }

    if (!firebaseConfigured()) {
      showToast('La coopération n\'est pas encore configurée sur ce site.');
      return;
    }
    if (!isValidSessionId(sid)) {
      showToast('Ce lien de session est invalide.');
      return;
    }
    joinSession(sid);
  }

  createSessionBtn.addEventListener('click', () => {
    const sid = generateSessionId();
    setSessionId(sid);
    renderCoop();
    checkAchievements(true);
    syncNow({ silent: true }).then((ok) => {
      showToast(ok ? 'Session créée ! Partage le lien avec tes amis.' : 'Session créée, mais la première synchro a échoué.');
    });
    if (location.protocol === 'file:') {
      showToast('Le lien ne marchera que quand le site sera en ligne (Netlify).');
    }
  });

  joinBtn.addEventListener('click', () => {
    const sid = extractSessionId(joinInput.value);
    if (!sid) {
      showToast('Colle un lien ou un code de session valide.');
      joinInput.focus();
      return;
    }
    joinInput.value = '';
    joinSession(sid);
  });

  copyLinkBtn.addEventListener('click', async () => {
    const sid = getSessionId();
    if (!sid) return;
    try {
      await navigator.clipboard.writeText(sessionLink(sid));
      showToast('Lien copié. Envoie-le à tes amis !');
    } catch (err) {
      window.prompt('Copie ce lien :', sessionLink(sid));
    }
  });

  shareLinkBtn.addEventListener('click', async () => {
    const sid = getSessionId();
    if (!sid || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ title: 'Trocarnet', text: 'Rejoins mon carnet de brocantes sur Trocarnet', url: sessionLink(sid) });
    } catch (err) {
      if (err && err.name !== 'AbortError') showToast('Partage impossible, copie plutôt le lien.');
    }
  });

  syncBtn.addEventListener('click', () => syncNow());
  syncMenuBtn.addEventListener('click', () => syncNow());

  leaveSessionBtn.addEventListener('click', () => {
    if (!getSessionId()) return;
    if (!window.confirm('Quitter la session coop ? Les autres membres garderont le carnet commun.')) return;
    const keep = window.confirm('Garder une copie des brocantes sur cet appareil ?\n\nOK = garder la copie\nAnnuler = vider le carnet de cet appareil');
    setSessionId(null);
    if (!keep) {
      state = { entries: [], tombstones: {} };
      saveState();
    }
    render();
    renderCoop();
    showToast('Tu as quitté la session.');
  });

  /* ---------------------------------------------------------------
     Succès
     --------------------------------------------------------------- */

  const achievementsModal = $('achievementsModal');
  const achievementsGrid = $('achievementsGrid');
  const achievementsCount = $('achievementsCount');
  const achievementsBar = $('achievementsBar');
  const menuAchCount = $('menuAchCount');

  function normCity(city) {
    return String(city || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function buildContext(entries) {
    const cities = new Map();
    const dates = new Map();
    const monthsByYear = new Map();
    const categories = new Set();
    entries.forEach((e) => {
      const c = normCity(e.city);
      cities.set(c, (cities.get(c) || 0) + 1);
      if (e.category) categories.add(e.category);
      if (e.date) {
        dates.set(e.date, (dates.get(e.date) || 0) + 1);
        const y = e.date.slice(0, 4);
        if (!monthsByYear.has(y)) monthsByYear.set(y, new Set());
        monthsByYear.get(y).add(e.date.slice(5, 7));
      }
    });
    return {
      entries,
      count: entries.length,
      cities,
      maxSameCity: Math.max(0, ...cities.values()),
      maxSameDay: Math.max(0, ...dates.values()),
      maxMonthsInYear: Math.max(0, ...Array.from(monthsByYear.values(), (s) => s.size)),
      categories,
      comments: entries.filter((e) => e.comment && e.comment.trim()).length
    };
  }

  function hasCoopEver() {
    try { return Boolean(getSessionId() || localStorage.getItem(COOP_EVER_KEY)); } catch (err) { return false; }
  }

  const ACHIEVEMENTS = [
    { id: 'first', icon: '🏷️', title: 'Première trouvaille', desc: 'Enregistrer ta première brocante.', goal: 1, value: (c) => c.count },
    { id: 'ten', icon: '🧺', title: 'Habitué du dimanche', desc: 'Réaliser 10 brocantes.', goal: 10, value: (c) => c.count },
    { id: 'twentyfive', icon: '🔍', title: 'Chineur confirmé', desc: 'Réaliser 25 brocantes.', goal: 25, value: (c) => c.count },
    { id: 'fifty', icon: '🚶', title: 'Pilier de trottoir', desc: 'Réaliser 50 brocantes.', goal: 50, value: (c) => c.count },
    { id: 'hundred', icon: '👑', title: 'Centurion des puces', desc: 'Réaliser 100 brocantes.', goal: 100, value: (c) => c.count },
    { id: 'giant', icon: '🏟️', title: 'Géante', desc: 'Faire une brocante avec plus de 1000 exposants.', goal: 1, value: (c) => (c.entries.some((e) => e.exhibitors >= 1000) ? 1 : 0) },
    { id: 'lille', icon: '🦁', title: 'Ch\'ti chineur', desc: 'Faire une brocante à Lille.', goal: 1, value: (c) => (c.cities.has('lille') ? 1 : 0) },
    { id: 'tiny', icon: '🪑', title: 'Petit comité', desc: 'Faire une brocante de moins de 30 exposants.', goal: 1, value: (c) => (c.entries.some((e) => e.exhibitors > 0 && e.exhibitors < 30) ? 1 : 0) },
    { id: 'types', icon: '🗂️', title: 'Collection complète', desc: 'Faire chaque type de brocante au moins une fois.', goal: 4, value: (c) => Object.keys(CATEGORY_LABELS).filter((k) => c.categories.has(k)).length },
    { id: 'cities5', icon: '🧭', title: 'Globe-chineur', desc: 'Chiner dans 5 villes différentes.', goal: 5, value: (c) => c.cities.size },
    { id: 'cities15', icon: '🗺️', title: 'Tour de France des puces', desc: 'Chiner dans 15 villes différentes.', goal: 15, value: (c) => c.cities.size },
    { id: 'loyal', icon: '📍', title: 'Fidèle au poste', desc: 'Faire 3 brocantes dans la même ville.', goal: 3, value: (c) => c.maxSameCity },
    { id: 'double', icon: '⚡', title: 'Doublé', desc: 'Faire 2 brocantes le même jour.', goal: 2, value: (c) => c.maxSameDay },
    { id: 'split', icon: '⚖️', title: 'Grand écart', desc: 'Chiner dans un quartier très populaire et dans un quartier très huppé.', goal: 2, value: (c) => (c.entries.some((e) => e.neighborhood <= 15) ? 1 : 0) + (c.entries.some((e) => e.neighborhood >= 85) ? 1 : 0) },
    { id: 'chatty', icon: '✍️', title: 'Carnet bavard', desc: 'Laisser 10 commentaires.', goal: 10, value: (c) => c.comments },
    { id: 'season', icon: '📅', title: 'Saison complète', desc: 'Chiner sur 6 mois différents de la même année.', goal: 6, value: (c) => c.maxMonthsInYear },
    { id: 'winter', icon: '❄️', title: 'Chineur d\'hiver', desc: 'Faire une brocante entre décembre et février.', goal: 1, value: (c) => (c.entries.some((e) => e.date && ['12', '01', '02'].includes(e.date.slice(5, 7))) ? 1 : 0) },
    { id: 'coop', icon: '🤝', title: 'Esprit d\'équipe', desc: 'Créer ou rejoindre une session coop.', goal: 1, value: () => (hasCoopEver() ? 1 : 0) }
  ];

  function readAchSeen() {
    try {
      const raw = localStorage.getItem(ACH_SEEN_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeAchSeen(seen) {
    try { localStorage.setItem(ACH_SEEN_KEY, JSON.stringify(seen)); } catch (err) { /* stockage plein */ }
  }

  // Calcule les succès. Un succès débloqué le reste, même si la brocante
  // concernée est supprimée ensuite.
  function computeAchievements() {
    const ctx = buildContext(state.entries);
    const seen = readAchSeen() || {};
    return ACHIEVEMENTS.map((a) => {
      const value = Math.max(0, Number(a.value(ctx)) || 0);
      const unlockedAt = seen[a.id] || null;
      return { ...a, value: Math.min(value, a.goal), unlocked: value >= a.goal || Boolean(unlockedAt), unlockedAt };
    });
  }

  function checkAchievements(notify) {
    const ctx = buildContext(state.entries);
    const previous = readAchSeen();
    const seen = previous ? { ...previous } : {};
    const fresh = [];
    const now = Date.now();
    ACHIEVEMENTS.forEach((a) => {
      if (!seen[a.id] && (Number(a.value(ctx)) || 0) >= a.goal) {
        seen[a.id] = now;
        fresh.push(a);
      }
    });
    if (fresh.length || previous === null) writeAchSeen(seen);

    // Premier lancement de la v1.1 : on débloque en silence ce qui est déjà acquis.
    if (notify && previous !== null && fresh.length) {
      const msg = fresh.length === 1
        ? `🏆 Succès débloqué : ${fresh[0].title}`
        : `🏆 ${fresh.length} succès débloqués ! Va voir dans le menu.`;
      setTimeout(() => showToast(msg), 350);
    }
    updateAchievementCounters();
  }

  function updateAchievementCounters() {
    const list = computeAchievements();
    const done = list.filter((a) => a.unlocked).length;
    menuAchCount.textContent = `${done}/${list.length}`;
    return { list, done };
  }

  function renderAchievements() {
    const { list, done } = updateAchievementCounters();
    achievementsCount.textContent = `${done} / ${list.length} débloqués`;
    achievementsBar.style.width = `${Math.round((done / list.length) * 100)}%`;
    achievementsGrid.innerHTML = '';

    // Débloqués d'abord, puis les plus avancés.
    const sorted = list.slice().sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (b.value / b.goal) - (a.value / a.goal);
    });

    sorted.forEach((a) => {
      const card = document.createElement('article');
      card.className = `badge${a.unlocked ? ' unlocked' : ''}`;

      const icon = document.createElement('span');
      icon.className = 'badge-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = a.icon;

      const body = document.createElement('div');
      body.className = 'badge-body';

      const title = document.createElement('h3');
      title.className = 'badge-title';
      title.textContent = a.title;

      const desc = document.createElement('p');
      desc.className = 'badge-desc';
      desc.textContent = a.desc;

      body.append(title, desc);

      if (a.unlocked) {
        const when = document.createElement('p');
        when.className = 'badge-when';
        when.textContent = a.unlockedAt ? `Débloqué le ${new Date(a.unlockedAt).toLocaleDateString('fr-FR')}` : 'Débloqué';
        body.appendChild(when);
      } else if (a.goal > 1) {
        const prog = document.createElement('div');
        prog.className = 'badge-progress';
        const bar = document.createElement('div');
        bar.className = 'badge-progress-bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.round((a.value / a.goal) * 100)}%`;
        bar.appendChild(fill);
        const label = document.createElement('span');
        label.className = 'badge-progress-label';
        label.textContent = `${a.value}/${a.goal}`;
        prog.append(bar, label);
        body.appendChild(prog);
      }

      card.setAttribute('aria-label', `${a.title} : ${a.desc} ${a.unlocked ? '(débloqué)' : '(verrouillé)'}`);
      card.append(icon, body);
      achievementsGrid.appendChild(card);
    });
  }

  $('openAchievementsBtn').addEventListener('click', () => {
    renderAchievements();
    closeMenu();
    openDialog(achievementsModal);
  });
  $('closeAchievements').addEventListener('click', () => closeDialog(achievementsModal));
  closeOnBackdrop(achievementsModal);

  /* ---------------------------------------------------------------
     Nouveautés + tuto
     --------------------------------------------------------------- */

  const changelogModal = $('changelogModal');
  const changelogBody = $('changelogBody');
  const tutorialModal = $('tutorialModal');
  const tutoVisual = $('tutoVisual');
  const tutoTitle = $('tutoTitle');
  const tutoText = $('tutoText');
  const tutoDots = $('tutoDots');
  const tutoStepLabel = $('tutoStepLabel');
  const tutoPrev = $('tutoPrev');
  const tutoNext = $('tutoNext');

  const TUTORIAL = [
    { icon: '🏷️', title: 'Bienvenue sur Trocarnet', text: 'Ton carnet de brocantes. Chaque sortie devient une petite étiquette que tu peux retrouver, trier et compter. Tout est sauvegardé automatiquement sur cet appareil.' },
    { icon: '➕', title: 'Ajoute une brocante', text: 'Clique sur « + Nouvelle brocante ». Seule la ville est obligatoire : tape les premières lettres et choisis dans la liste. La rue, la date et le type sont en option.' },
    { icon: '🎚️', title: 'Exposants et quartier', text: 'Fais glisser les curseurs. Au-delà de 1000 exposants, un tampon « +1000 » apparaît sur l\'étiquette. Le second curseur va de populaire à huppé.' },
    { icon: '🗂️', title: 'Trie ton carnet', text: 'Les menus au-dessus des étiquettes filtrent par année, mois ou type, et trient par date, nombre d\'exposants ou ville.' },
    { icon: '☰', title: 'Le menu', text: 'Les trois barres en haut à gauche ouvrent tes stats, tes succès et la sauvegarde par code, pratique pour garder une copie de secours.' },
    { icon: '🤝', title: 'Chine à plusieurs', text: 'Dans le menu, « Coopération » crée un lien. Tes amis l\'ouvrent et vous partagez le même carnet. Ça se synchronise à l\'ouverture du site, après chaque ajout et avec le bouton « Actualiser ».' },
    { icon: '📱', title: 'Installe l\'appli', text: 'iPhone : dans Safari, bouton Partager puis « Sur l\'écran d\'accueil ». Android : menu de Chrome puis « Ajouter à l\'écran d\'accueil ». Mac : dans Safari, menu Fichier puis « Ajouter au Dock ».' }
  ];

  let tutoIndex = 0;

  function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  function markVersionSeen() {
    try { localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION); } catch (err) { /* stockage plein */ }
  }

  function showChangelog(sinceVersion) {
    const releases = CHANGELOG.filter((r) => !sinceVersion || compareVersions(r.version, sinceVersion) > 0);
    const toShow = releases.length ? releases : CHANGELOG.slice(0, 1);
    changelogBody.innerHTML = '';
    toShow.forEach((release) => {
      const section = document.createElement('section');
      section.className = 'release';

      const head = document.createElement('p');
      head.className = 'release-head';
      head.textContent = `Version ${release.version} · ${release.date}`;
      section.appendChild(head);

      const list = document.createElement('ul');
      list.className = 'release-list';
      release.items.forEach(([icon, title, text]) => {
        const li = document.createElement('li');
        const i = document.createElement('span');
        i.className = 'release-icon';
        i.setAttribute('aria-hidden', 'true');
        i.textContent = icon;
        const div = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = title;
        const p = document.createElement('p');
        p.textContent = text;
        div.append(strong, p);
        li.append(i, div);
        list.appendChild(li);
      });
      section.appendChild(list);
      changelogBody.appendChild(section);
    });
    openDialog(changelogModal);
  }

  function renderTutoStep() {
    const step = TUTORIAL[tutoIndex];
    tutoVisual.textContent = step.icon;
    tutoTitle.textContent = step.title;
    tutoText.textContent = step.text;
    tutoStepLabel.textContent = `${tutoIndex + 1} / ${TUTORIAL.length}`;
    tutoPrev.disabled = tutoIndex === 0;
    tutoNext.textContent = tutoIndex === TUTORIAL.length - 1 ? 'Terminer' : 'Suivant';
    tutoDots.innerHTML = '';
    TUTORIAL.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `tuto-dot${i === tutoIndex ? ' active' : ''}`;
      dot.setAttribute('aria-label', `Étape ${i + 1}`);
      if (i === tutoIndex) dot.setAttribute('aria-current', 'step');
      dot.addEventListener('click', () => { tutoIndex = i; renderTutoStep(); });
      tutoDots.appendChild(dot);
    });
  }

  function showTutorial() {
    tutoIndex = 0;
    renderTutoStep();
    openDialog(tutorialModal);
  }

  tutoPrev.addEventListener('click', () => {
    if (tutoIndex > 0) { tutoIndex -= 1; renderTutoStep(); }
  });
  tutoNext.addEventListener('click', () => {
    if (tutoIndex < TUTORIAL.length - 1) { tutoIndex += 1; renderTutoStep(); }
    else closeDialog(tutorialModal);
  });
  tutorialModal.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') tutoNext.click();
    if (e.key === 'ArrowLeft' && !tutoPrev.disabled) tutoPrev.click();
  });
  tutorialModal.addEventListener('close', markVersionSeen);
  $('closeTutorial').addEventListener('click', () => closeDialog(tutorialModal));
  closeOnBackdrop(tutorialModal);

  changelogModal.addEventListener('close', markVersionSeen);
  $('closeChangelog').addEventListener('click', () => closeDialog(changelogModal));
  $('changelogOkBtn').addEventListener('click', () => closeDialog(changelogModal));
  $('changelogTutoBtn').addEventListener('click', () => {
    closeDialog(changelogModal);
    showTutorial();
  });
  closeOnBackdrop(changelogModal);

  $('openChangelogBtn').addEventListener('click', () => { closeMenu(); showChangelog(null); });
  $('openTutorialBtn').addEventListener('click', () => { closeMenu(); showTutorial(); });

  function showOnboarding() {
    let seenVersion = null;
    try { seenVersion = localStorage.getItem(SEEN_VERSION_KEY); } catch (err) { seenVersion = null; }
    if (seenVersion === APP_VERSION) return;
    if (!seenVersion) {
      // Déjà des brocantes = utilisateur de la v1.0.0 → on montre les nouveautés.
      if (state.entries.length) showChangelog('1.0.0');
      else showTutorial();
    } else {
      showChangelog(seenVersion);
    }
  }

  /* ---------------------------------------------------------------
     Init
     --------------------------------------------------------------- */

  function init() {
    initTheme();
    loadState();
    render();
    renderCoop();
    checkAchievements(false);
    handleJoinLink();
    if (getSessionId()) {
      setSyncStatus('ok', lastSyncText());
      syncNow({ silent: true });
    }
    showOnboarding();
  }

  init();
})();

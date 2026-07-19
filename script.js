(() => {
  'use strict';

  const APP_VERSION = '1.0.0';
  const STORAGE_KEY = 'trocarnet_data_v1';
  const THEME_KEY = 'trocarnet_theme';

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

  let state = { entries: [] };
  let editingId = null;
  let citySearchController = null;
  let selectedCityMeta = null; // { lat, lon } if picked from suggestions

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.entries)) {
          state = parsed;
          return;
        }
      }
    } catch (err) {
      console.error('Impossible de lire la sauvegarde locale :', err);
    }
    state = { entries: [] };
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
    const rect = entryModal.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) closeModal();
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

    if (editingId) {
      const idx = state.entries.findIndex((e) => e.id === editingId);
      if (idx !== -1) {
        state.entries[idx] = { ...state.entries[idx], ...entryData };
        showToast('Brocante mise à jour.');
      }
    } else {
      state.entries.push({ id: uid(), createdAt: Date.now(), ...entryData });
      showToast('Brocante enregistrée.');
    }

    saveState();
    render();
    closeModal();
  });

  deleteEntryBtn.addEventListener('click', () => {
    if (!editingId) return;
    const entry = state.entries.find((e) => e.id === editingId);
    const confirmed = window.confirm(`Supprimer la brocante « ${entry ? entry.city : ''} » ? Cette action est irréversible.`);
    if (!confirmed) return;
    state.entries = state.entries.filter((e) => e.id !== editingId);
    saveState();
    render();
    closeModal();
    showToast('Brocante supprimée.');
  });

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
    const payload = { version: APP_VERSION, exportedAt: Date.now(), entries: state.entries };
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

      const confirmed = window.confirm(`Charger ${parsed.entries.length} brocante(s) ? Cela remplacera tes données actuelles.`);
      if (!confirmed) return;

      state = { entries: parsed.entries };
      saveState();
      render();
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
     Init
     --------------------------------------------------------------- */

  function init() {
    initTheme();
    loadState();
    render();
  }

  init();
})();


function updateFilterVisibility() {

  const status = document.getElementById('status');
  const controls = document.getElementById('status-controls');
  const chips = document.getElementById('status-controls-chips');

  const viewConfig = VIEW_CONFIG[currentView];

  // NOT a filter view
  if (!viewConfig || !viewConfig.filters) {

    // Clear any stale UI
    controls.innerHTML = '';
    chips.innerHTML = '';

    // Only show if explicitly enabled (e.g. status message)
    status.style.display = statusVisible ? '' : 'none';

    return;
  }

  // Filter view → show status area
  status.style.display = '';

  // Guard for missing filter config
  if (!viewConfig.filters) {
    controls.innerHTML = '';
    chips.innerHTML = '';
    return;
  }

  // Render filters normally
  renderFilterUI();
  renderFilterChips();
  bindFilterEvents();
}


function buildFilterExpansionPanel(config) {
  const from = config.getDateFrom?.();
  const to = config.getDateTo?.();

  const fromVal = from
    ? new Date(from).toISOString().slice(0, 10)
    : "";

  const toVal = to
    ? new Date(to).toISOString().slice(0, 10)
    : "";

  const storageScope = inventoryFilter.storageScope || "ALL";

  return `
    <div id="filters-panel" class="filter-expansion ${filtersExpanded ? '' : 'hidden'}">

      <div class="filter-inline-group">

        <label>Date:</label>

        <input
          type="date"
          id="dateFrom"
          value="${fromVal}"
          class="filter-date"
        />

        <span class="filter-dash">–</span>

        <input
          type="date"
          id="dateTo"
          value="${toVal}"
          class="filter-date"
        />

        <label class="filter-label-spaced">Storage:</label>

        <select id="storageScopeFilter" class="filter-select-compact">
          <option value="ALL">All</option>
          <option value="UNASSIGNED" ${
            storageScope === "UNASSIGNED" ? "selected" : ""
          }>
            Unassigned
          </option>
        </select>

      </div>

    </div>
  `;
}




function renderFilterUI() {
  const config = VIEW_CONFIG[currentView].filters;

  if (!config) return;

  const value = config.getValue();

  document.getElementById('status-controls').innerHTML = `
    <div class="filters-header-row">
      <span class="filter-label">${config.filters?.label || "Filter"}</span>

      ${config.showFilterExtras ? `
        <button
          class="filters-toggle"
          aria-expanded="${filtersExpanded}"
        >
          ${filtersExpanded ? '▾' : '▸'}
        </button>
      ` : ''}

      <input
        id="filterInput"
        type="text"
        placeholder="${config.placeholder}"
        value="${value}"
      />

      <button id="filterClearBtn">X</button>
    </div>

    ${config.showFilterExtras ? buildFilterExpansionPanel(config) : ''}
  `;
}

function renderFilterChips() {
  const config = VIEW_CONFIG[currentView].filters;
  if (!config?.chips) return;

  const chips = config.chips
    .map( (chip,idx) => {
      const value = chip.getValue();
      if (!value) return null;

      const label = typeof chip.label === 'function'
        ? chip.label(value)
        : chip.label;

      return `
        <span class="chip">
          ${label}
          <button data-chip-index="${idx}">✕</button>
        </span>
      `;
    })
    .filter(Boolean)
    .join('');

  const container = document.getElementById('status-controls-chips');
  container.innerHTML = chips;

  // attach clear handlers (no inline onclick needed)
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = e.currentTarget.dataset.chipIndex;
      const chip = config.chips[idx];

      chip.onClear();
    });
  });
}


function toggleFilters() {
  filtersExpanded = !filtersExpanded;

  const panel = document.getElementById('filters-panel');
  const button = document.querySelector('.filters-toggle');

  if (panel) {
    panel.classList.toggle('hidden', !filtersExpanded);
  }

  if (button) {
    button.textContent = filtersExpanded ? '▾' : '▸';
  }
}


function bindFilterEvents() {
  const config = VIEW_CONFIG[currentView].filters;
  if (!config) return;

  // text input
  const input = document.getElementById('filterInput');
  if (input) {
    input.addEventListener('input', applyTextFilter);
  }

  // clear button
  const clearBtn = document.getElementById('filterClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearTextFilter);
  }

  // toggle button
  const toggleBtn = document.querySelector('.filters-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleFilters);
  }

  // date inputs
  const from = document.getElementById('dateFrom');
  const to = document.getElementById('dateTo');

  if (from) from.addEventListener('change', applyDateFilter);
  if (to) to.addEventListener('change', applyDateFilter);

  const storageSel = document.getElementById("storageScopeFilter");

  if (storageSel) {
    storageSel.addEventListener("change", () => {
      inventoryFilter.storageScope = storageSel.value;
      applyFiltersAndRefresh();
    });
  }
}


function applyFiltersAndRefresh() {
  const config = VIEW_CONFIG[currentView].filters;
  if (!config) return;

  config.onApply();       // update list
  renderFilterChips();    // update chips
}


function applyTextFilter() {
  const config = VIEW_CONFIG[currentView].filters;
  if (!config) return;

  const input = document.getElementById('filterInput');
  const text = input ? input.value.trim().toLowerCase() : '';

  config.setValue(text);
  applyFiltersAndRefresh();
}

function clearTextFilter() {
  const config = VIEW_CONFIG[currentView].filters;
  if (!config) return;

  config.setValue('');

  const input = document.getElementById('filterInput');
  if (input) input.value = '';

  applyFiltersAndRefresh();
}


function applyDateFilter() {
  const config = VIEW_CONFIG[currentView].filters;
  if (!config) return;

  const from = document.getElementById('dateFrom');
  const to = document.getElementById('dateTo');

  inventoryFilter.dateFrom = from?.value
    ? new Date(from.value + 'T00:00:00').getTime()
    : null;

  inventoryFilter.dateTo = to?.value
    ? new Date(to.value + 'T23:59:59').getTime()
    : null;

  applyFiltersAndRefresh();
}

function clearDateInputs() {
  const from = document.getElementById('dateFrom');
  const to = document.getElementById('dateTo');

  if (from) from.value = '';
  if (to) to.value = '';
}

function clearStorageScope() {
  inventoryFilter.storageScope = "ALL";
  const storageSel = document.getElementById("storageScopeFilter");
  if (storageSel) {
    storageSel.value = "ALL";
  }

  applyFiltersAndRefresh();
}

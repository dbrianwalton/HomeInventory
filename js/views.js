/* ------- CONFIGS --------- */

const VIEW_CONFIG = {
  "food-list": {
    type: "list",
    render: renderFoodInstanceList,

    filters: {
      label: "Filter",
      placeholder: "Filter by description or keywords",

      getValue: () => inventoryFilter.text || "",
      setValue: (v) => { inventoryFilter.text = v; },
      onApply: renderFoodInstanceList,

      showDate: true,
      getDateFrom: () => inventoryFilter.dateFrom,
      getDateTo: () => inventoryFilter.dateTo,
      clearDate: () => {
        inventoryFilter.dateFrom = null;
        inventoryFilter.dateTo = null;
      },

      chips: [
        {
          getValue: () => inventoryFilter.text,
          label: (v) => v,
          onClear: () => {
            inventoryFilter.text = '';
            const input = document.getElementById("filterInput");
            if (input) input.value = '';

            renderFoodInstanceList();
            renderFilterChips();
          }
        },
        {
          getValue: () => {
            if (!inventoryFilter.dateFrom && !inventoryFilter.dateTo) return null;
            return {
              from: inventoryFilter.dateFrom,
              to: inventoryFilter.dateTo
            };
          },

          label: (v) => {
            const fmt = (ts) =>
              ts ? new Date(ts).toISOString().slice(0, 10) : "";

            if (v.from && v.to) {
              return `${fmt(v.from)} → ${fmt(v.to)}`;
            }

            if (v.from) {
              return `From ${fmt(v.from)}`;
            }

            if (v.to) {
              return `To ${fmt(v.to)}`;
            }

            return "Date filter";
          },

          onClear: () => {
            inventoryFilter.dateFrom = null;
            inventoryFilter.dateTo = null;

            clearDateInputs();
            applyFiltersAndRefresh();
          }
        }
      ]
    }
  },

  "storage-list": {
    type: "list",
    render: renderStorageList,

    filters: {
      label: "Filter",
      placeholder: "Filter storage",

      getValue: () => storageFilter.text || "",
      setValue: (v) => { storageFilter.text = v; },
      onApply: renderStorageList,

      showDate: false,

      chips: [
        {
          getValue: () => storageFilter.text,
          label: (v) => v,
          onClear: () => {
            clearTextFilter();
          }
        }
      ]
    }
  },

  "food-item": {
    type: "detail",
    render: renderFoodInstanceDetail
  },

  "storage-item": {
    type: "detail",
    render: renderStorageDetail
  }
};

const LABEL_CONFIG = {
  "food-list": {
    getItems: () =>
      window._foodInstanceCache.filter(i => selectedItems.has(i.InstanceID)),

    getId: (item) => item.InstanceID,
    getSupplemental: (item) => item.Date,

    buildQR: (item) => JSON.stringify({ id: item.InstanceID }),
    
    fields: [
      { key: "Label", bold: true, fontSize: 14, maxLines: 2 },

      { key: "Keywords", fontSize: 12, maxLines: 2 },
      { key: "Notes", fontSize: 12, maxLines: 2 },
      { key: "Size", fontSize: 12, maxLines: 1 }
    ]
  },

  "storage-list": {
    getItems: () =>
      window._storageLocationCache.filter(s => selectedItems.has(s.StorageLocationID)),

    getId: (item) => item.StorageLocationID,

    buildQR: (item) => JSON.stringify({ storage: item.StorageLocationID }),

    fields: [
      { key: "Label", bold: true, fontSize: 14, maxLines: 2 },

      { key: "PhysicalLocation", fontSize: 12, maxLines: 2 },
      { key: "Notes", fontSize: 12, maxLines: 3 }
    ]
  }
};


const ENTITY_FIELDS = {
  "food-item": [
    { key: "StorageLocationID", label: "Storage Location", type: "storage-select" },
    { key: "Label", label: "Label", type: "text" },
    { key: "Keywords", label: "Keywords", type: "text" },
    { key: "Notes", label: "Notes", type: "text" },
    { key: "Size", label: "Size", type: "text" },
    { key: "Date", label: "Date", type: "text" },
    {
      key: "StorageType",
      label: "Storage Type",
      type: "select",
      options: ["Freeze-Dried","Frozen","Bottled","Canned","Boxed","Other"]
    }
  ],

  "storage-item": [
    { key: "Label", label: "Label", type: "text" },
    { key: "Notes", label: "Notes", type: "text" },
    { key: "PhysicalLocation", label: "Physical Location", type: "text" }
  ]
};

const DETAIL_ACTIONS = {
  view: [
    { action: "edit", label: "Edit" },
    { action: "close", label: "Close" }
  ],
  edit: [
    { action: "save", label: "Save" },
    { action: "cancel", label: "Cancel" }
  ]
};


/* ------------- RENDERERS -------------- */

function renderView() {
  const config = VIEW_CONFIG[currentView];
  if (!config) return;

  updateFilterVisibility();

  config.render();
}

function showInventory() {
  navStack = [];
  clearSelection();

  activeTab = 'inventory';
  currentView = "food-list";

  document.getElementById("modeButton").style.display = "block";
  
  updateModeButton();
  renderView();
}

function showStorage() {
  navStack = [];
  clearSelection();

  activeTab = 'storage';
  currentView = "storage-list";
  renderView();
}

function showFoodInstance(id) {
  pushView();
  currentView = "food-item";

  document.getElementById("modeButton").style.display = "block";

  const item = window._foodInstanceCache.find(i => i.InstanceID === id);
  if (!item) return;

  originalItem = item;
  currentItem = { ...item };
  itemMode = "view";

  updateModeButton();
  renderView();
}


function showStorageLocation(id) {
  pushView();
  currentView = "storage-item";

  const item = window._storageMap[id];
  if (!item) return;

  currentItem = { ...item };
  originalItem = item;

  itemMode = "view";

  updateModeButton();
  renderView();
}


function pushView() {
  navStack.push({
    currentView,
    currentItem: currentItem ? { ...currentItem } : null,
    itemMode
  });
}


function goBack() {
  if (!navStack.length) {
    if (currentItem?.InstanceID?.startsWith("FI")) {
      showInventory();
      return;
    }

    if (currentItem?.StorageLocationID?.startsWith("SL")) {
      showStorage();
      return;
    }
    
    showInventory();
    return;
  }

  const prev = navStack.pop();

  currentView = prev.currentView;
  currentItem = prev.currentItem;
  itemMode = prev.itemMode;

  updateModeButton();
  renderView();
}

/* ------------ SORTING ----------- */

function handleSort(field) {
  if (inventorySort.field === field) {
    inventorySort.direction = inventorySort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    inventorySort.field = field;
    inventorySort.direction = 'desc';
  }

  renderFoodInstanceList();
}


/* ------ Generic Render Utiltities ------ */

function renderTable({
  container,
  columns,
  rows,
  getRowId,
  onRowClick,
  enableSelection = false
}) {
  const html = `
    <div class="card">
      <div class="table-wrapper">
        <table class="inventory-table">
          <thead>
            <tr>
              ${columns.map((c,idx) => `
                <th data-col-index="${idx}" ${c.field ? 'class="sortable"' : ''}>
                  ${c.label} ${
                    inventorySort.field === c.field
                      ? (inventorySort.direction === 'asc' ? '▲' : '▼')
                      : ''
                  }
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr data-id="${getRowId(r)}">
                ${columns.map(c => `<td>${c.render(r) || ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;

  const thead = container.querySelector("thead");

  thead.addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (!th) return;

    const idx = th.dataset.colIndex;
    if (idx === undefined) return;

    const col = columns[idx];
    if (!col.field) return;

    handleSort(col.field);
  });

  const tbody = container.querySelector("tbody");

  // Row click
  tbody.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    if (isDragging) return;

    const id = row.dataset.id;

    if (!enableSelection) {
      onRowClick?.(e, id);
    } else {
      // Only allow navigation in browse mode
      if (interactionMode === "browse") {
        onRowClick?.(e, id);
      }
    }
  });

  // Selection support only when enabled
  if (enableSelection) {
    tbody.addEventListener("mousedown", (e) => {
      const row = e.target.closest("tr");
      if (!row) return;
      handleRowMouseDown(e, row);
    });

    tbody.addEventListener("mouseover", (e) => {
      const row = e.target.closest("tr");
      if (!row) return;
      handleRowMouseOver(e, row);
    });
  }
}

/* --------- RENDER LISTS ------------ */


function renderFoodInstanceList() {
  let working = window._foodInstanceCache || [];
  const storageMap = window._storageMap || {};

  // ---- TEXT FILTER ----
  if (inventoryFilter.text) {
    const terms = inventoryFilter.text.split(/\s+/);

    working = working.filter(i => {
      const location = storageMap[i.StorageLocationID];
      const haystack = [
        i.Label,
        i.Keywords,
        i.Notes,
        location?.Label || '',
        i.FoodType,
        i.FoodClassification
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ');

      return terms.every(t => haystack.includes(t));
    });
  }

  // ---- DATE FILTER ----
  if (inventoryFilter.dateFrom || inventoryFilter.dateTo) {
    working = working.filter(i => {
      if (!i.Date) return false;

      const d = parseDate(i.Date);
      if (inventoryFilter.dateFrom && d < inventoryFilter.dateFrom) return false;
      if (inventoryFilter.dateTo && d > inventoryFilter.dateTo) return false;

      return true;
    });
  }

  const sorted = [...working].sort((a, b) => {
    let at = a[inventorySort.field];
    let bt = b[inventorySort.field];

    if (inventorySort.field === "Date") {
      at = at ? parseDate(at) : 0;
      bt = bt ? parseDate(bt) : 0;
    }

    if (at < bt) return inventorySort.direction === 'asc' ? -1 : 1;
    if (at > bt) return inventorySort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="list-actions">
      <button onclick="addFoodInstance()">＋</button>
    </div>
    <div id="food-table-container"></div>
  `;

  renderTable({
    container: document.getElementById("food-table-container"),
    rows: sorted,
    getRowId: r => r.InstanceID,
    enableSelection: true,
    onRowClick: (event, id) => {
      if (interactionMode === "browse") {
        showFoodInstance(id);
      }
    },
    columns: [
      {
        label: "Date",
        field: "Date",
        render: r => r.Date || ''
      },
      {
        label: "ID",
        render: r => r.InstanceID
      },
      {
        label: "Description",
        render: r => r.Label
      },
      {
        label: "Storage",
        render: r => window._storageMap?.[r.StorageLocationID]?.Label || '',
        field: "StorageLocationID"
      },
      {
        label: "Status",
        render: r => r.Status
      }
    ]
  });
}

function renderStorageList() {
  let working = window._storageLocationCache || [];

  if (storageFilter.text) {
    const terms = storageFilter.text.split(/\s+/);

    working = working.filter(s => {
      const haystack = [
        s.Label,
        s.Notes,
        s.PhysicalLocation
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return terms.every(t => haystack.includes(t));
    });
  }
  
  const container = document.getElementById("content");

  renderTable({
    container,
    rows: working,
    getRowId: r => r.StorageLocationID,
    enableSelection: true,
    onRowClick: (event, id) => {
      if (interactionMode === "browse") {
        showStorageLocation(id);
      }
    },
    columns: [
      { label: "ID", render: r => r.StorageLocationID },
      { label: "Label", render: r => r.Label },
      { label: "Location", render: r => r.PhysicalLocation }
    ]
  });
}

/* --------- RENDER ITEM DETAIL ---------- */


function renderFoodInstanceDetail() {
  updateFilterVisibility();

  const item = currentItem;
  const isAdd = itemMode === "add";

  let html = `
    <div class="card ${itemMode === "edit" ? "edit-mode" : "view-mode"}">
      <h2>${isAdd ? "New Food Instance" : item.InstanceID}</h2>

      <div style="margin-top: 1rem;">
        ${renderDetailActions()}
      </div>

      ${renderDetailForm("food-item", item)}
    </div>
  `;

  document.getElementById("content").innerHTML = html;

  bindDetailEvents();
}


function renderStorageDetail() {
  updateFilterVisibility();

  const item = currentItem;

  let html = `
    <div class="card ${itemMode === "edit" ? "edit-mode" : "view-mode"}">
      <h2>${item.StorageLocationID}</h2>

      <div style="margin-top: 1rem;">
        ${renderDetailActions()}
      </div>

      ${renderDetailForm("storage-item", item)}

      <div id="related-food"></div>
    </div>
  `;

  document.getElementById("content").innerHTML = html;

  bindDetailEvents();

  // existing related-table render stays as-is
  const related = (window._foodInstanceCache || [])
    .filter(i => i.StorageLocationID === item.StorageLocationID);

  renderTable({
    container: document.getElementById("related-food"),
    rows: related,
    getRowId: r => r.InstanceID,
    enableSelection: false,
    onRowClick: (e, id) => showFoodInstance(id),
    columns: [
      { label: "Date", render: r => r.Date || '' },
      { label: "ID", render: r => r.InstanceID },
      { label: "Description", render: r => r.Label || '' },
      { label: "Status", render: r => r.Status || '' }
    ]
  });
}

/* ---------- NAVIGATION + UI ------------- */


function showStatus(contentHtml = "") {
  const status = document.getElementById('status');

  if (contentHtml) {
    status.innerHTML = contentHtml;
  }

  status.style.display = '';
  statusVisible = true;
}

function hideStatus() {
  const status = document.getElementById('status');

  status.innerHTML = '';
  status.style.display = 'none';

  statusVisible = false;
}



function showEvents() {
  navStack = [];
  clearSelection();
  activeTab = 'events';
  renderEventList();
}

function exitToListView() {
  if (currentView === "food-item") {
    showInventory();
  } else if (currentView === "storage-item") {
    showStorage();
  }
}

/* -------- INTERACTIONS ---------- */

function toggleMode() {

  // Inventory behavior
  if (currentView === "food-list" || currentView === "storage-list") {
    interactionMode = interactionMode === "browse" ? "select" : "browse";
    document.body.classList.toggle("select-mode", interactionMode === "select");
    clearSelection();
    updateModeButton();
  }

  // Item behavior
  if (currentView === "food-item" || currentView === "storage-item") {
    if (itemMode === "edit" && isDirty) {

      const confirmed = confirm(
        "You have unsaved changes.\n\nPress OK to discard the changes, or Cancel to stay in edit mode."
      );

      if (!confirmed) return;

      // Discard changes
      cancelEdit();
      updateModeButton();
      return;
    }

    itemMode = itemMode === "view" ? "edit" : "view";

    switch (currentView) {
      case "food-item":
        renderFoodInstanceDetail();  // re-render fields
        break;
      case "storage-item":
        renderStorageDetail();  // re-render fields
        break;
    }
    updateModeButton();
  }
}


function updateModeButton() {
  const btn = document.getElementById("modeButton");

  if (itemMode === "add") {
    btn.textContent = "➕";
    return;
  }

  if (currentView === "food-list" || currentView === "storage-list") {
    btn.textContent = interactionMode === "select" ? "✅" : "🔍";
  }

  if (currentView === "food-item" || currentView === "storage-item") {
    btn.textContent = itemMode === "edit" ? "✏️" : "👁️";
  }
}

/* -------- SELECTION ----------- */


function resetDragState() {
  isDragging = false;
  dragAction = null;
  didDrag = false;
}
document.addEventListener("mouseup", resetDragState);


function handleRowClick(event, id) {
  if (interactionMode === "browse") {
    if (currentView === "food-list") {
      showFoodInstance(id);
    } else if (currentView === "storage-list") {
      showStorageLocation(id);
    }
    return;
  }
  // In select mode, selection is controlled in other ways.  
}

function handleRowMouseDown(event, rowEl) {
  if (interactionMode !== "select") return;

  isDragging = true;
  didDrag = false;

  const id = rowEl.dataset.id;

  // Determine drag intent ONCE
  if (selectedItems.has(id)) {
    dragAction = "remove";
    removeItemFromSelection(id, rowEl);
  } else {
    dragAction = "add";
    addItemToSelection(id, rowEl);
  }

  updateSelectionUI();
}


function handleRowMouseOver(event, rowEl) {
  if (interactionMode !== "select" || !isDragging || !dragAction) return;

  didDrag = true;

  const id = rowEl.dataset.id;

  if (dragAction === "add") {
    if (!selectedItems.has(id)) {
      addItemToSelection(id, rowEl);
    }
  }

  if (dragAction === "remove") {
    if (selectedItems.has(id)) {
      removeItemFromSelection(id, rowEl);
    }
  }
  updateSelectionUI();
}

function handleTouchStart(event) {
  if (interactionMode !== "select") {
    return;
  }

  isDragging = true;

  const rowEl = event.currentTarget;
  const id = rowEl.dataset.id;

  // same as mousedown logic
  if (selectedItems.has(id)) {
    dragAction = "remove";
    removeItemFromSelection(id, rowEl);
  } else {
    dragAction = "add";
    addItemToSelection(id, rowEl);
  }

  updateSelectionUI();
}

function handleTouchMove(event) {
  if (interactionMode !== "select" || !isDragging || !dragAction) return;

  // find element under finger
  const touch = event.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);

  const rowEl = el?.closest("tr");

  if (!rowEl) return;

  const id = rowEl.dataset.id;
  if (!id) return;

  if (dragAction === "add") {
    if (!selectedItems.has(id)) {
      addItemToSelection(id, rowEl);
    }
  }

  if (dragAction === "remove") {
    if (selectedItems.has(id)) {
      removeItemFromSelection(id, rowEl);
    }
  }
  updateSelectionUI();

  // prevents scrolling while dragging
  event.preventDefault();
}

function handleTouchEnd() {
  isDragging = false;
  dragAction = null;
  clearTimeout(touchTimer);
}


function addItemToSelection(id, row) {
  row = row || document.getElementById(`row-${id}`);
  if (!row) return;

  selectedItems.add(id);
  row.classList.add("selected-row");
}

function removeItemFromSelection(id, row) {
  row = row || document.getElementById(`row-${id}`);
  if (!row) return;

  selectedItems.delete(id);
  row.classList.remove("selected-row");
}

function clearSelection() {
  selectedItems.clear();

  refreshSelectionUI();
  updateSelectionUI();
}


function refreshSelectionUI() {
  document.querySelectorAll('tr[data-id]').forEach(row => {
    const id = row.dataset.id;
    const isSelected = selectedItems.has(id);

    row.classList.toggle('selected-row', isSelected);
  });
}

function updateSelectionUI() {
  const countEl = document.getElementById('selectionCount');
  if (countEl) {
    countEl.textContent = `${selectedItems.size}`;
  }
}

/* --------- ADD ---------- */
function addFoodInstance() {
  pushView();

  currentView = "food-item";
  itemMode = "add";

  currentItem = createEmptyFoodInstance();
  originalItem = null;

  clearDirty();
  updateModeButton();
  renderView();
}

function createEmptyFoodInstance() {
  return {
    Model: "unit",
    Category: "",
    Label: "",
    Keywords: "",
    Notes: "",
    Size: "",
    Date: "",
    StorageLocationID: null
  };
}

/* ---------- FORMS ----------- */


async function saveFoodInstance(addAnother = false) {
  if (itemMode === "add") {
    Object.assign(currentItem, extractFields("food-item"));

    await performSave({
      saveFunction: createFoodInstance,   // your stub ✅
      id: null,
      changes: currentItem,
      updateCache: () => {
        // temporary — push into cache
        window._foodInstanceCache.push(currentItem);
      }
    });

    resetEditState();
    showInventory();

    return;
  }

  Object.assign(currentItem, extractFields("food-item"));
  const changes = getChangedFields(originalItem, currentItem);

  if (!Object.keys(changes).length) {
    alert("No changes to save");
    return;
  }

  await performSave({
    saveFunction: updateFoodInstance,
    id: currentItem.InstanceID,
    changes,

    updateCache: () => {
      const idx = window._foodInstanceCache.findIndex(
        i => i.InstanceID === currentItem.InstanceID
      );
      if (idx !== -1) {
        window._foodInstanceCache[idx] = { ...currentItem };
      }
    }
  });

  resetEditState();
  exitToListView();
}

async function saveStorage() {
  Object.assign(currentItem, extractFields("storage-item"));
  const changes = getChangedFields(originalItem, currentItem);

  if (!Object.keys(changes).length) {
    alert("No changes");
    return;
  }

  await performSave({
    saveFunction: updateStorageLocation,
    id: currentItem.StorageLocationID,
    changes,

    updateCache: () => {
      Object.assign(originalItem, currentItem);
    }
  });

  resetEditState();
  renderView();
}


function renderField(field, item, readOnly) {
  const value = item[field.key] || '';

  // Storage special case
  if (field.type === "storage-select") {
    const storage = window._storageMap?.[value];
    const storageText = storage
      ? `${storage.Label} (${storage.PhysicalLocation})`
      : "Unassigned";

    if (readOnly) {
      return `<button data-storage-link="${value}">
        ${storageText}
      </button>`;
    }

    return `
      <select id="fld-${field.key}" data-field="${field.key}">
        ${(window._storageLocationCache || []).map(s => `
          <option value="${s.StorageLocationID}"
            ${s.StorageLocationID === value ? "selected" : ""}>
            ${s.Label} (${s.PhysicalLocation})
          </option>
        `).join('')}
      </select>
    `;
  }

  // Select (dropdown list)
  if (field.type === "select") {
    if (readOnly) {
      return `<div>${value}</div>`;
    }

    return `
      <select id="fld-${field.key}" data-field="${field.key}">
        ${field.options.map(opt => `
          <option ${opt === value ? "selected" : ""}>${opt}</option>
        `).join('')}
      </select>
    `;
  }

  // Default text
  return `
    <input
      id="${field.key}"
      data-field="${field.key}"
      value="${value}"
      ${readOnly ? "readonly" : ""}
    />
  `;
}

function extractFields(entityType) {
  const fields = ENTITY_FIELDS[entityType];
  const result = {};

  fields.forEach(field => {
    const el = document.getElementById(`fld-${field.key}`);
    if (!el) return;

    result[field.key] = el.value;
  });

  return result;
}



function renderDetailForm(entityType, item) {
  const fields = ENTITY_FIELDS[entityType];

  return fields.map(f => `
    <div class="field-row">
      <label>${f.label}</label>
      ${renderField(f, item, itemMode === "view")}
    </div>
  `).join('');
}

function renderDetailActions() {
  const actions = DETAIL_ACTIONS[itemMode];

  const buttons = actions.map(a =>
    '<button data-action="' + a.action + '">' + a.label + '</button>'
  ).join('');

  return `
    <div class="detail-actions">
      ${buttons}
    </div>
  `;
}

function bindDetailEvents() {
  const container = document.getElementById("content");

  // input / select changes
  container.querySelectorAll("[data-field]").forEach(el => {
    el.addEventListener("input", () => {
      const key = el.dataset.field;
      currentItem[key] = el.value;
      markDirty();
    });

    el.addEventListener("change", () => {
      const key = el.dataset.field;
      currentItem[key] = el.value;
      markDirty();
    });
  });

  // storage link (view mode)
  container.querySelectorAll("[data-storage-link]").forEach(el => {
    el.addEventListener("click", () => {
      showStorageLocation(el.dataset.storageLink);
    });
  });

  // action buttons
  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;

      switch (action) {
        case "edit":
          enterEditMode();
          break;

        case "close":
          goBack();
          break;

        case "save":
          if (currentView === "food-item") {
            saveFoodInstance();
          } else if (currentView === "storage-item") {
            saveStorage();
          }
          break;

        case "cancel":
          cancelEdit();
          break;
      }
    });
  });
}

/* ------------- QR CODE -------------- */

const qrVersion = "1.0";

function toggleQRCode(id) {
  const el = document.getElementById(`qr-code-${id}`);

  if (el.innerHTML) {
    el.innerHTML = "";
    return;
  }

  new QRCode(el, {
    text: JSON.stringify({ appID, id }),
    width: 200,
    height: 200
  });
}

/* ---------- SCANNER ---------- */

let qrScanner = null;

function startScanner() {
  document.getElementById('scanner-panel').style.display = 'block';

  qrScanner = new Html5Qrcode("qr-reader");

  qrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (text) => {
      handleQRCode(text);
      stopScanner();
    }
  );
}

function stopScanner() {
  if (!qrScanner) return;
  qrScanner.stop();
  qrScanner = null;
  document.getElementById('scanner-panel').style.display = 'none';
}

/* ---------- QR HANDLER ---------- */

function handleQRCode(text) {
  try {
    const obj = JSON.parse(text);

    if (!obj.id) return;

    const id = obj.id;

    // STORAGE LOCATION
    if (id.startsWith("SL")) {
      handleStorageScan(id);
      return;
    }

    // FOOD INSTANCE
    if (id.startsWith("FI")) {
      handleFoodScan(id);
      return;
    }

    // Unknown type
    alert("Unrecognized QR code");

  } catch {
    alert("Invalid QR code");
  }
}

async function handleFoodScan(foodID) {
  if (currentView === "storage-item") {
    if (itemMode !== "view") return;

    const confirmed = confirm("Assign item to this location?");
    if (!confirmed) return;

    const food = window._foodInstanceCache.find(f => f.InstanceID === foodID);

    const updated = {
      ...food,
      StorageLocationID: currentItem.StorageLocationID
    };

    const changes = getChangedFields(food, updated);

    await updateFoodInstance(foodID, changes);

    alert("Item assigned to Storage Location");
  }
}

async function handleStorageScan(storageID) {

  /* --- When in FoodInstance view --- */
  if (currentView === "food-item") {
    const currentID = currentItem.StorageLocationID;
    if (currentID === storageID) return;

    // EDIT MODE → apply immediately
    if (itemMode === "edit") {
      currentItem.StorageLocationID = storageID;
      
      renderFoodInstanceDetail();
      setTimeout(() => {
        document.querySelector("#fld-storageLocation")?.classList.add("highlight");
      }, 50);

      markDirty();
      return;
    }

    // VIEW MODE → confirm + save
    if (itemMode === "view") {
      const storage = window._storageMap[storageID];
      const confirmed = confirm(
        `Move item to:\n\n${storage?.Label} (${storage?.PhysicalLocation})?\n`
      );

      if (!confirmed) return;

      // Build updated item (copy)
      const updated = {
        ...currentItem,
        StorageLocationID: storageID
      };

      const changes = getChangedFields(originalItem, updated);

      try {
        await updateFoodInstance(currentItem.InstanceID, changes);
        const idx = window._foodInstanceCache.findIndex(
          i => i.InstanceID === currentItem.InstanceID
        );

        if (idx !== -1) {
          window._foodInstanceCache[idx] = { ...updated };
        }

        currentItem = updated;
        originalItem = { ...updated };

        alert("Storage location updated");
        renderFoodInstanceDetail();

        setTimeout(() => {
          document.querySelector("#fld-storageLocation")?.classList.add("highlight");
        }, 50);

        return;
      } catch (err) {
        alert("Error updating storage location: " + err.message);
      }
    }
  }
}

/* -------------- LABELS ------------ */

function openLabelPanel() {
  document.getElementById("labelPanel").classList.remove("hidden");
  renderLabelGrid();
}

function closeLabelPanel() {
  document.getElementById("labelPanel").classList.add("hidden");
}

function renderLabelGrid() {
  const grid = document.getElementById("labelGrid");
  grid.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const cell = document.createElement("div");
    cell.className = "label-cell";

    if (i < labelStartIndex) {
      cell.classList.add("used");
    }

    if (i === labelStartIndex) {
      cell.classList.add("active");
    }

    cell.textContent = i + 1;

    cell.onclick = () => {
      labelStartIndex = i;
      renderLabelGrid();
    };

    grid.appendChild(cell);
  }
}

function confirmLabelPrint() {
  closeLabelPanel();
  generateLabelsPDF(labelStartIndex);
}




async function generateLabelsPDF(skip=0) {
  const config = LABEL_CONFIG[currentView];
  if (!config) {
    alert("Labels not supported for this view");
    return;
  }

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({
    unit: "in",
    format: "letter"
  });

  const items = config.getItems();

  if (!items.length) {
    alert("No items selected");
    return;
  }

  const labelsPerPage = 10;
  const labelWidth = 4;
  const labelHeight = 2;

  const marginX = 0.1875;
  const marginY = 0.5;
  const hgap = 0.125;

  let index = skip;

  for (let i = 0; i < items.length; i++) {
    const col = index % 2;
    const row = Math.floor(index % labelsPerPage / 2);

    if (i > 0 && index % labelsPerPage === 0) {
      doc.addPage();
      index = 0;
    }

    const x = marginX + col * (labelWidth+hgap);
    const y = marginY + row * labelHeight;

    await drawLabel(doc, items[i], x, y, config);
    
    index++;
  }

  window.open(doc.output("bloburl"));
  // doc.save("labels.pdf");
}

function drawFields(doc, item, config, textX, startY) {
  let textY = startY;

  function drawClipped(text, maxWidth, maxLines = 2) {
    const lines = doc.splitTextToSize(text || "", maxWidth).slice(0, maxLines);

    lines.forEach(line => {
      const dims = doc.getTextDimensions(line);
      doc.text(line, textX, textY + dims.h);
      textY += dims.h + 0.05;
    });

    textY += 0.05;
  }

  config.fields.forEach(field => {
    const value = item[field.key];
    if (!value) return;

    // style handling
    const fontSize = field.fontSize || (field.bold ? 14 : 12);
    const fontStyle = field.bold ? "bold" : "normal";

    doc.setFont(undefined, fontStyle);
    doc.setFontSize(fontSize);

    drawClipped(value, 2.3, field.maxLines || 2);
  });
}


async function drawLabel(doc, item, x, y, config) {
  const padding = 0.125; // 1/8 inch

  const labelWidth = 4;
  const labelHeight = 2;

  if (labelDrawBoundary) {
    // Draw outer label boundary
    doc.setDrawColor(180);   // light gray for debugging
    doc.setLineWidth(0.01);
    doc.rect(x, y, labelWidth, labelHeight);

    // Draw inner printable area (optional, inset by padding)
    doc.setDrawColor(220);
    doc.rect(
      x + padding,
      y + padding,
      labelWidth - (2 * padding),
      labelHeight - (2 * padding)
    );
  }

  const qrSize = 1.2;

  // QR canvas (temporary)
  const qrTemp = document.createElement("div");
  new QRCode(qrTemp, {
    text: config.buildQR(item),
    width: 200,
    height: 200
  });

  const img = qrTemp.querySelector("canvas").toDataURL("image/png");

  // QR LEFT SIDE
  doc.addImage(img,
    "PNG",
    x + padding,
    y + padding,
    qrSize,
    qrSize
  );

  // ID and supplemental info under QR and centered
  doc.setFontSize(12);

  const id = config.getId(item);

  let dims = doc.getTextDimensions(id);
  let textY = y + padding + qrSize + dims.h + 0.1;

  doc.text(
    id,
    x + padding + (qrSize - dims.w)/2,
    textY
  );

  // Supplemental info (e.g. Date)
  const supplement = config.getSupplemental?.(item);
  if (supplement) {
    dims = doc.getTextDimensions(supplement);
    textY += dims.h + 0.05;
    doc.text(
      supplement,
      x + padding + (qrSize - dims.w)/2,
      textY
    );
  }

  // RIGHT SIDE
  const textX = x + 1.5;
  textY = y + padding;

  drawFields(doc, item, config, textX, textY);
}

/* ------- UTILITIES --------- */

function parseDate(value) {
  if (!value) return 0;

  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [mm, dd, yyyy] = value.split('/');
    return new Date(`${yyyy}-${mm}-${dd}`).getTime();
  }

  // MM/YYYY
  if (/^\d{1,2}\/\d{4}$/.test(value)) {
    const [mm, yyyy] = value.split('/');
    return new Date(`${yyyy}-${mm}-01`).getTime();  // use start of month
  }

  // ❗ fallback (shouldn’t really hit now)
  const d = new Date(value);
  return isNaN(d) ? 0 : d.getTime();
}

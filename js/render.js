/* ------------- RENDERERS -------------- */

function renderView() {
  const config = VIEW_CONFIG[currentView];
  if (!config) return;

  updateFilterVisibility();

  config.render();
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
                      ? (inventorySort.direction === 'asc' ? '\u25B2' : '\u25BC')
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



/* --------- RENDER ITEM DETAIL ---------- */



function renderProductDetail() {
  updateFilterVisibility();

  const item = currentItem;
  const isAdd = itemMode === "add";

  const context = item._createContext;
  const contextNote = context?.barcode
    ? `<div class="subtle-note">Barcode: ${context.barcode}</div>`
    : "";

  const html = `
    <div class="card edit-mode">
      <h2>${isAdd ? "New Product" : item.ProductID}</h2>
      ${contextNote}
      <div style="margin-top: 1rem;">
        ${renderDetailActions()}
      </div>
      ${renderDetailForm("product-item", item)}
    </div>
  `;

  document.getElementById("content").innerHTML = html;
  bindDetailEvents();
}


async function saveProduct() {
  const context = currentItem._createContext || {};

  Object.assign(currentItem, extractFields("product-item"));

  if (!currentItem.Label) {
    alert("Label is required");
    return;
  }

  // Strip internal context key before saving
  const { _createContext, ...productData } = currentItem;

  try {
    const newProduct = await createProduct(productData);

    // Link barcode if one was provided
    if (context.barcode) {
      await createFoodBarcode({
        Code: context.barcode,
        ProductID: newProduct.ProductID
      });
    }

    // Assign to the originating food item if the scan came from food-item view
    if (context.currentItem) {
      await updateFoodInstance(context.currentItem.InstanceID, {
        ProductID: newProduct.ProductID
      });

      const cached = window._foodInstanceCache.find(
        i => i.InstanceID === context.currentItem.InstanceID
      );
      if (cached) cached.ProductID = newProduct.ProductID;

      updatePreviousViewItem(prev => { prev.ProductID = newProduct.ProductID; });
    }

    resetEditState();
    goBack();
    renderView();

  } catch (err) {
    console.error(err);
    alert("Error creating product");
  }
}


function renderEntitySelector() {
  const field = currentItem._selectConfig;

  const container = document.getElementById("content");

  container.innerHTML = `
    <div class="card">
      <div style="margin-bottom: 1rem;">
        <button id="selectorBack">Cancel</button>
      </div>

      <h2>Select ${field.label}</h2>

      <input 
        id="selectorSearch" 
        placeholder="Search..." 
        style="width: 100%; margin-bottom: 1rem;"
      />

      <div id="selectorList"></div>
    </div>
  `;
  
  document.getElementById("selectorBack").addEventListener("click", () => {
    goBack();
    renderView();
  });

  const input = document.getElementById("selectorSearch");

  input.value = selectorSearchTerm;

  input.addEventListener("input", (e) => {
    selectorSearchTerm = e.target.value;
    renderEntitySelectorList();   // ✅ only update list
  });

  renderEntitySelectorList();
}

function renderEntitySelectorList() {
  const field = currentItem._selectConfig;
  const fieldKey = currentItem._selectField;

  const list = field.getOptions ? field.getOptions() : [];

  const filtered = list.filter(item => {
    if (!selectorSearchTerm) return true;

    const text = field.getSearchText
      ? field.getSearchText(item)
      : field.getLabel(item).toLowerCase();

    return text.includes(selectorSearchTerm.toLowerCase());
  });

  
  renderTable({
    container: document.getElementById("selectorList"),
    rows: filtered,
    columns: [
      {
        key: "label",
        label: field.label,
        render: (row) => field.getLabel(row)
      }
    ],
    getRowId: field.getId,
    onRowClick: (event, id) => {
      //const id = field.getId(row);

      updatePreviousViewItem(item => {
        item[fieldKey] = id;
      });

      goBack();
      renderView();
    }
  });
}  

function applyEntitySelection(fieldKey, selectedID) {
  updatePreviousViewItem(item => {
    item[fieldKey] = selectedID;
  });

  goBack();
  renderView();
}


function updatePreviousViewItem(updater) {
  const prev = navStack[navStack.length - 1];
  if (prev?.currentItem) {
    updater(prev.currentItem);
  }
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
    btn.textContent = "\u2795";
    return;
  }

  if (currentView === "food-list" || currentView === "storage-list") {
    btn.textContent = interactionMode === "select" ? "✅" : "🔍";
  }

  if (currentView === "food-item" || currentView === "storage-item" || currentView === "product-item") {
    btn.textContent = itemMode === "edit" ? "✏️" : "👁️";
  }
}


function resetNavigation(view, tab) {
  navStack = [];
  if (tab) {
    activeTab = tab;
  }
  currentView = view;
}

/* --------- ACTIONS ------------- */

function showActionPrompt(actions, context) {
  currentActionList = actions;
  currentActionContext = context;

  pushView();
  currentView = "action-prompt";
  renderView();
}

function describeActionContext(context) {
  const lines = [];

  // Describe the item currently being viewed
  if (context.currentItem) {
    const item = context.currentItem;
    const id = item.InstanceID || item.StorageLocationID || "";
    const label = item.Label || "";
    lines.push(`<div class="action-context-row">
      <span class="action-context-label">Viewing:</span>
      <span>${id}${label ? " — " + label : ""}</span>
    </div>`);
  }

  // Describe the scanned entity
  const scan = context.scan;
  if (scan) {
    let scannedDesc = "";

    if (scan.type === "QR_FI") {
      const e = scan.entity;
      scannedDesc = e
        ? `${e.InstanceID} — ${e.Label || ""}`
        : scan.id;
    } else if (scan.type === "QR_SL") {
      const e = scan.entity;
      scannedDesc = e
        ? `${e.StorageLocationID} — ${formatStorageLabel(e)}`
        : scan.id;
    } else if (scan.type === "UPC") {
      scannedDesc = scan.resolved && scan.product
        ? formatProductLabel(scan.product)
        : `Barcode: ${scan.code}`;
    }

    if (scannedDesc) {
      lines.push(`<div class="action-context-row">
        <span class="action-context-label">Scanned:</span>
        <span>${scannedDesc}</span>
      </div>`);
    }
  }

  return lines.length
    ? `<div class="action-context">${lines.join("")}</div>`
    : "";
}

function renderActionPrompt() {
  const container = document.getElementById("content");

  // currentActionList is already condition-filtered by routeScanActions
  const actions = currentActionList;
  const context = currentActionContext;

  let html = `
    <div class="card">
      <h2>Choose Action</h2>

      ${describeActionContext(context)}

      <ul>
  `;

  actions.forEach((action, idx) => {
    html += `
      <li>
        <button data-action-index="${idx}">
          ${action.label}
        </button>
      </li>
    `;
  });

  html += `
      </ul>

      <button id="actionCancel">Cancel</button>
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll("[data-action-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.dataset.actionIndex, 10);
      handleActionSelection(actions[index]);
    });
  });

  document.getElementById("actionCancel").addEventListener("click", () => {
    goBack();
    renderView();
  });
}


function handleActionSelection(action) {
  const context = currentActionContext;

  if (action.riskLevel === "warn") {
    const message = action.warningMessage
      ? action.warningMessage(context)
      : "Are you sure?";

    const confirmed = confirm(message);

    if (!confirmed) return;
  }

  // Execute action
  action.execute(context);
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


function formatProductLabel(p) {
  if (!p) return "(none)";
  return p.Label + (p.Size ? ` (${p.Size})` : "");
}

function formatStorageLabel(storage) {
  if (!storage) return "Unassigned";
  return storage.PhysicalLocation
    ? `${storage.Label} (${storage.PhysicalLocation})`
    : storage.Label;
}


function getAllFoodInstances() {
  return window._foodInstanceCache || [];
}

function getInstancesForProduct(productID) {
  return getAllFoodInstances().filter(
    i => i.ProductID === productID
  );
}


/* ---------- FORMS ----------- */
function normalizeItem(item) {
  const normalized = { ...item };

  Object.keys(normalized).forEach(field => {
    const type = FIELD_TYPES[field] || "text"; // ✅ default

    const value = normalized[field];

    if (value === "") {
      switch (type) {
        case "fk":
        case "optional":
          normalized[field] = null;
          break;

        case "text":
          // leave as ""
          break;

        case "number":
          normalized[field] = null;
          break;

        default:
          break;
      }
    }
  });

  return normalized;
}


function renderField(field, item, readOnly) {
  const value = item[field.key] || '';
  const isEmpty = !value;

  const editable =
    typeof field.isEditable === "function"
      ? field.isEditable(item)
      : true;

  // Storage special case
  if (field.type === "storage-select") {
    const storage = window._storageMap?.[value];
    const storageText = formatStorageLabel(storage);

    if (readOnly || !editable) {
      return `<button data-storage-link="${value}">
        ${storageText}
      </button>`;
    }

    return `
      <select id="fld-${field.key}" data-field="${field.key}">
        <option value="" ${!value ? "selected" : ""}>
          -- Unassigned --
        </option>

        ${(window._storageLocationCache || []).map(s => `
          <option value="${s.StorageLocationID}"
            ${s.StorageLocationID === value ? "selected" : ""}>
            ${formatStorageLabel(s)}
          </option>
        `).join('')}
      </select>
    `;
  }

  // Select (dropdown list)
  if (field.type === "select") {
    if (readOnly || !editable) {
      return `<div>${value}</div>`;
    }

    return `
      <select
        id="fld-${field.key}"
        data-field="${field.key}"
        class="${isEmpty ? 'empty' : ''}"
      >
        ${field.options.map(opt => `
          <option ${opt === value ? "selected" : ""}>${opt}</option>
        `).join('')}
      </select>
    `;
  }

  if (field.type === "entity-select") {
    const value = item[field.key];

    const display =
      field.getDisplay
        ? field.getDisplay(item, value)
        : (value || "(none)");

    if (readOnly) {
      return `<div>${display}</div>`;
    }

    return `
      <div>
        <span>${display}</span>
        <button data-select-field="${field.key}">Change</button>
      </div>
    `;
  }

  // Default text
  return `
    <input
      id="${field.key}"
      data-field="${field.key}"
      value="${value}"
      class="${isEmpty ? 'empty' : ''}"
      ${readOnly || !editable ? "readonly" : ""}
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


function openEntitySelector(fieldKey) {
  const field = ENTITY_FIELDS[currentView].find(f => f.key === fieldKey);
  if (!field) return;

  pushView();

  currentItem._selectField = fieldKey;
  currentItem._selectConfig = field;

  selectorSearchTerm = ""; // ✅ reset

  currentView = "entity-select";
  renderView();
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

      el.classList.toggle("empty", !el.value);

      markDirty();
    });

    el.addEventListener("change", () => {
      const key = el.dataset.field;
      currentItem[key] = el.value;
      markDirty();

      if (key === "Model") {
        updateInventoryUI();
      }
    });
  });

  // storage link (view mode)  
  container.querySelectorAll("[data-storage-link]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.storageLink;

      if (!id) {
        resetNavigation("food-list", "inventory");
        inventoryFilter.storageScope = "UNASSIGNED";
        renderView();
        return;
      }

      showStorageLocation(id);
    });
  });

  // select field
  container.querySelectorAll("[data-select-field]").forEach(btn => {
    btn.addEventListener("click", () => {
      const fieldKey = btn.dataset.selectField;

      openEntitySelector(fieldKey);
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
          } else if (currentView === "product-item") {
            saveProduct();
          }
          break;

        case "save-close":
          if (currentView === "product-item") {
            saveProduct();
          } else {
            saveFoodInstance("close");
          }
          break;

        case "save-add":
          if (currentView === "product-item") {
            saveProduct();
          } else {
            saveFoodInstance("addAnother");
          }
          break;

        case "cancel":
          cancelEdit();
          break;
      }
    });
  });

  container.querySelectorAll("[data-inv-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      let type;

      if (btn.dataset.invAction === "add") type = "ADD";
      else if (btn.dataset.invAction === "remove") type = "REMOVE";
      else if (btn.dataset.invAction === "inventory") type = "INVENTORY";

      if (!type) return;

      openEventModal(type);
    });
  });
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

/* ------------- RENDERERS -------------- */

function renderView() {
  const config = VIEW_CONFIG[currentView];
  if (!config) return;

  updateFilterVisibility();

  config.render();

  renderNavTabs();
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

    if (currentItem?.ProductID?.startsWith("PR")) {
      showProducts();
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

function renderProductList() {
  let rows = (window._productCache || []).map(p => ({
    ...p,
    _instanceCount: (window._foodInstanceCache || []).filter(i => i.ProductID === p.ProductID).length,
    _barcodeCount: (window._barcodeCache || []).filter(b => b.ProductID === p.ProductID).length
  }));

  if (productFilter.text) {
    const terms = productFilter.text.toLowerCase().split(/\s+/);
    rows = rows.filter(p => {
      const haystack = [p.Label, p.Brand].filter(Boolean).join(' ').toLowerCase();
      return terms.every(t => haystack.includes(t));
    });
  }

  const container = document.getElementById("content");
  renderTable({
    container,
    rows,
    getRowId: r => r.ProductID,
    onRowClick: (_, id) => showProduct(id),
    columns: [
      { label: "ID",      field: "ProductID", render: r => r.ProductID },
      { label: "Label",   field: "Label",     render: r => r.Label || "" },
      { label: "Size",    field: "Size",      render: r => r.Size || "" },
      { label: "Items",                        render: r => r._instanceCount },
      { label: "Barcodes",                     render: r => r._barcodeCount }
    ]
  });
}


// Stub — replaced when ProductionEvents are implemented.
function renderProductionEventList() {
  document.getElementById("content").innerHTML =
    '<div class="card"><p>Production Events not yet implemented.</p></div>';
}

/* --------- RENDER ITEM DETAIL ---------- */

function renderProductDetail() {
  updateFilterVisibility();
  const item = currentItem;
  const isAdd = itemMode === "add";
  const isView = itemMode === "view";
  const isEdit = itemMode === "edit";

  const linkedInstances = (window._foodInstanceCache || []).filter(i => i.ProductID === item.ProductID).length;
  const linkedBarcodes  = (window._barcodeCache || []).filter(b => b.ProductID === item.ProductID).length;

  const contextNote = item._createContext?.barcode
    ? `<div class="subtle-note">Barcode: ${item._createContext.barcode}</div>`
    : "";

  const warningBanner = isEdit && (linkedInstances > 0 || linkedBarcodes > 0)
    ? `<div class="edit-warning">Warning: ${linkedInstances} food item(s) and ${linkedBarcodes} barcode(s) are linked to this product.</div>`
    : "";

  // Sub-tables (view mode only)
  const subTables = isView && !isAdd ? `
    <div class="sub-tables" style="margin-top:1.5rem;">
      <div class="sub-tab-bar">
        <button class="sub-tab active" data-subtab="instances">Food Items (${linkedInstances})</button>
        <button class="sub-tab" data-subtab="barcodes">Barcodes (${linkedBarcodes})</button>
      </div>
      <div id="subtab-instances" class="subtab-panel">
        ${renderLinkedInstancesTable(item.ProductID)}
      </div>
      <div id="subtab-barcodes" class="subtab-panel" style="display:none;">
        ${renderLinkedBarcodesTable(item.ProductID)}
      </div>
    </div>
  ` : "";

  const html = `
    <div class="card ${isEdit ? 'edit-mode' : isView ? 'view-mode' : 'edit-mode'}">
      <h2>${isAdd ? "New Product" : (item.Label || item.ProductID)}</h2>
      ${contextNote}
      ${warningBanner}
      <div style="margin-top: 1rem;">${renderDetailActions()}</div>
      ${renderDetailForm("item-product", item)}
      ${subTables}
    </div>
  `;

  document.getElementById("content").innerHTML = html;
  bindDetailEvents();

  // Sub-tab toggle
  document.querySelectorAll(".sub-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const which = btn.dataset.subtab;
      document.getElementById("subtab-instances").style.display = which === "instances" ? "" : "none";
      document.getElementById("subtab-barcodes").style.display  = which === "barcodes"  ? "" : "none";
    });
  });

  // Linked instance rows are tappable → navigate to item-food
  document.querySelectorAll(".linked-row[data-fi-id]").forEach(row => {
    row.addEventListener("click", () => showFoodInstance(row.dataset.fiId));
  });
}

function renderLinkedInstancesTable(productID) {
  const rows = (window._foodInstanceCache || []).filter(i => i.ProductID === productID);
  if (!rows.length) return '<p style="color:#888">None</p>';
  return rows.map(i => `
    <div class="linked-row" data-fi-id="${i.InstanceID}">
      <span class="linked-id">${i.InstanceID}</span>
      <span>${i.Label || ""}</span>
      <span class="linked-secondary">${window._storageMap?.[i.StorageLocationID]?.Label || ""}</span>
    </div>
  `).join('');
}

function renderLinkedBarcodesTable(productID) {
  const rows = (window._barcodeCache || []).filter(b => b.ProductID === productID);
  if (!rows.length) return '<p style="color:#888">None</p>';
  return rows.map(b => `
    <div class="linked-row">
      <span class="linked-id">${b.BarcodeID}</span>
      <span>${b.Code || ""}</span>
    </div>
  `).join('');
}

function showProduct(id) {
  pushView();
  currentView = "item-product";
  const item = window._productCache.find(p => p.ProductID === id);
  if (!item) return;
  currentItem = { ...item };
  originalItem = item;
  itemMode = "view";
  updateModeButton();
  renderView();
}

async function assignProductToInstance(instance, product) {
  try {
    await updateFoodInstance(instance.InstanceID, { ProductID: product.ProductID });
    const cached = window._foodInstanceCache.find(i => i.InstanceID === instance.InstanceID);
    if (cached) cached.ProductID = product.ProductID;
    alert(`Assigned "${product.Label}" to ${instance.Label || instance.InstanceID}.`);
    renderView(); // refresh sub-tables
  } catch (err) {
    console.error(err);
    alert("Error assigning product");
  }
}

async function linkBarcodeToProduct(scan, product) {
  try {
    if (scan.resolved && scan.product) {
      // Reassign existing barcode record
      const existing = window._barcodeCache.find(b => b.ProductID === scan.product.ProductID
        && normalizeBarcode(b.Code) === normalizeBarcode(scan.code));
      if (existing) {
        await updateFoodBarcode(existing.BarcodeID, { ProductID: product.ProductID });
        existing.ProductID = product.ProductID;
        const norm = normalizeBarcode(scan.code);
        barcodeProductMap[norm] = product.ProductID;
      }
    } else {
      // Create new barcode record
      await createFoodBarcode({ Code: scan.code, ProductID: product.ProductID });
    }
    renderView(); // refresh sub-tables
  } catch (err) {
    console.error(err);
    alert("Error linking barcode");
  }
}

async function saveProduct() {
  Object.assign(currentItem, extractFields("item-product"));

  if (!currentItem.Label) {
    alert("Label is required");
    return;
  }

  // --- EDIT branch ---
  if (itemMode === "edit") {
    const linkedInstances = (window._foodInstanceCache || []).filter(i => i.ProductID === currentItem.ProductID).length;
    const linkedBarcodes  = (window._barcodeCache || []).filter(b => b.ProductID === currentItem.ProductID).length;

    if (linkedInstances > 0 || linkedBarcodes > 0) {
      const ok = confirm(`${linkedInstances} food item(s) and ${linkedBarcodes} UPC code(s) are linked to this product. Save changes?`);
      if (!ok) return;
    }

    const changes = getChangedFields(originalItem, currentItem);
    if (!Object.keys(changes).length) {
      alert("No changes to save");
      return;
    }

    try {
      await updateProduct(currentItem.ProductID, changes);
      const cached = window._productCache.find(p => p.ProductID === currentItem.ProductID);
      if (cached) Object.assign(cached, changes);
      productMap[currentItem.ProductID] = { ...cached };
      originalItem = { ...currentItem };
      resetEditState();
      renderProductDetail();
    } catch (err) {
      console.error(err);
      alert("Error saving product");
    }
    return;
  }

  // --- ADD branch ---
  const context = currentItem._createContext || {};
  const { _createContext, ...productData } = currentItem;

  try {
    const newProduct = await createProduct(productData);

    if (context.barcode) {
      await createFoodBarcode({ Code: context.barcode, ProductID: newProduct.ProductID });
    }

    if (context.currentItem) {
      await updateFoodInstance(context.currentItem.InstanceID, { ProductID: newProduct.ProductID });
      const cached = window._foodInstanceCache.find(i => i.InstanceID === context.currentItem.InstanceID);
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


function showProducts() {
  navStack = [];
  clearSelection();
  activeTab = 'products';
  currentListEntity = "product";
  currentView = "list-product";
  renderView();
}


function showEvents() {
  navStack = [];
  clearSelection();
  activeTab = 'events';
  currentListEntity = "event";
  currentView = "list-event";
  renderView();
}

function exitToListView() {
  if (currentView === "item-food") {
    showInventory();
  } else if (currentView === "item-storage") {
    showStorage();
  } else if (currentView === "item-product") {
    showProducts();
  }
}

/* -------- INTERACTIONS ---------- */

function toggleMode() {

  // Inventory behavior
  if (currentView === "item-food" ||
      currentView === "item-storage" ||
      currentView === "item-product") {
    interactionMode = interactionMode === "browse" ? "select" : "browse";
    document.body.classList.toggle("select-mode", interactionMode === "select");
    clearSelection();
    updateModeButton();
  }

  // Item behavior
  if (currentView === "item-food" ||
      currentView === "item-storage" ||
      currentView === "item-product") {
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
      case "item-food":
        renderFoodInstanceDetail();  // re-render fields
        break;
      case "item-storage":
        renderStorageDetail();  // re-render fields
        break;
      case "item-product":
        renderProductDetail();
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

  if (currentView === "list-food" || currentView === "list-storage") {
    btn.textContent = interactionMode === "select" ? "✅" : "🔍";
  }

  if (currentView === "item-food" || currentView === "item-storage" || currentView === "item-product") {
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
    if (currentView === "list-food") {
      showFoodInstance(id);
    } else if (currentView === "list-storage") {
      showStorageLocation(id);
    } else if (currentView === "list-product") {
      showProduct(id);
    }    return;
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
        resetNavigation("list-food", "inventory");
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
          if (currentView === "item-food") {
            saveFoodInstance();
          } else if (currentView === "item-storage") {
            saveStorage();
          } else if (currentView === "item-product") {
            saveProduct();
          }
          break;

        case "save-close":
          if (currentView === "item-product") {
            saveProduct();
          } else {
            saveFoodInstance("close");
          }
          break;

        case "save-add":
          if (currentView === "item-product") {
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


/* ---------- NAV TAB UI ---------- */

function renderNavTabs() {
  const isListView = currentView.startsWith("list-");
  // Sub-views (entity-select, action-prompt) are inside the item tab
  const isItemContext = currentView.startsWith("item-")
    || currentView === "entity-select"
    || currentView === "action-prompt";

  // List tab active state
  const tabList = document.getElementById("tab-list");
  if (tabList) {
    tabList.classList.toggle("active", isListView);
  }

  // Entity selector sync
  const selector = document.getElementById("listEntitySelector");
  if (selector) selector.value = currentListEntity;

  // Item tab visibility and label
  const tabItem = document.getElementById("tab-item");
  const tabItemBtn = document.getElementById("tab-item-btn");
  if (tabItem) {
    if (isItemContext) {
      tabItem.classList.remove("hidden");
      tabItem.classList.toggle("active", isItemContext);
      if (tabItemBtn) tabItemBtn.textContent = getItemTabLabel();
    } else {
      tabItem.classList.add("hidden");
    }
  }
}

function getItemTabLabel() {
  if (!currentItem) return "Item";
  const id = currentItem.InstanceID
    || currentItem.StorageLocationID
    || currentItem.ProductID
    || "";
  const label = currentItem.Label || "";
  if (id && label) return id + " \u2014 " + label;
  return id || label || "Item";
}

// Clicking the List tab while on an item: navigate back to the list.
// Clicking while already on a list: no-op.
function handleListTabClick() {
  if (!currentView.startsWith("list-")) {
    navStack = [];
    currentItem = null;
    itemMode = "view";
    clearDirty();
    clearSelection();
    currentView = "list-" + currentListEntity;
    renderView();
  }
}

// Clicking the Item tab while already on an item view: no-op.
function handleItemTabClick() {
  // Already on the item — nothing to do.
  // (Future: could pop back to the top-level item if in a sub-view.)
}

// × button on the item tab: discard item and return to list.
function closeItemTab() {
  navStack = [];
  currentItem = null;
  itemMode = "view";
  clearDirty();
  clearSelection();
  currentView = "list-" + currentListEntity;
  renderView();
}

// Entity-type selector in the List tab changed.
function handleEntityChange(value) {
  currentListEntity = value;
  navStack = [];
  currentItem = null;
  itemMode = "view";
  clearDirty();
  clearSelection();
  currentView = "list-" + value;
  renderView();
}


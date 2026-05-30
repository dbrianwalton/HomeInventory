
function handleSort(field) {
  if (inventorySort.field === field) {
    inventorySort.direction = inventorySort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    inventorySort.field = field;
    inventorySort.direction = 'desc';
  }

  renderFoodInstanceList();
}

function showInventory() {

  navStack = [];
  clearSelection();

  activeTab = 'inventory';
  currentListEntity = "food";
  currentView = "list-food";

  document.getElementById("modeButton").style.display = "block";
  
  updateModeButton();
  renderView();
}

function showFoodInstance(id) {
  pushView();
  currentView = "item-food";

  document.getElementById("modeButton").style.display = "block";

  const item = window._foodInstanceCache.find(i => i.InstanceID === id);
  if (!item) return;

  originalItem = item;
  currentItem = { ...item };
  itemMode = "view";

  updateModeButton();
  renderView();
}


function showInstancesForProduct(product) {
  const instances = getInstancesForProduct(product.ProductID);

  let html = `
    <div class="card">
      <h3>${product.Label}</h3>
      <ul>
  `;

  instances.forEach(i => {
    html += `
      <li>
        <button onclick="showFoodInstance('${i.InstanceID}')">
          ${i.Label}
        </button>
      </li>
    `;
  });

  html += `
      </ul>
      <button onclick="createInstanceFromProduct('${product.ProductID}')">
        + Create New Instance
      </button>
    </div>
  `;

  document.getElementById("content").innerHTML = html;
}


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

  // ----- STORAGE SCOPE FILTER ----
  if (inventoryFilter.storageScope === "UNASSIGNED") {
    working = working.filter(i => !i.StorageLocationID);
  }

  // ---- STATUS FILTER ----
  const statusFilter = inventoryFilter.statusFilter;
  if (statusFilter && statusFilter.size > 0) {
    working = working.filter(i => statusFilter.has(i.Status || ""));
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
      <button onclick="addFoodInstance()">\uFF0B</button>
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
        label: "Qty",
        render: r => {
          if (r.Model !== "inventory") return "";
          const state = computeInventoryState(r.InstanceID);
          return formatInventoryQuantity(state);
        }
      },
      {
        label: "Storage",
        render: r => window._storageMap?.[r.StorageLocationID]?.Label || '',
        field: "StorageLocationID"
      },
      {
        label: "Status",
        render: r => r.Status || "Active"
      }
    ]
  });
}




function renderFoodInstanceDetail() {
  updateFilterVisibility();

  const item = currentItem;
  const isAdd = itemMode === "add";
  const isEditable = itemMode === "edit" || itemMode === "add";

  showAllEvents = false;

  const canUseInventory =
    itemMode === "view" && currentItem.Model === "inventory";

  const disabledAttr = canUseInventory ? "" : "disabled";

  const inventoryActions = `
      <div class="inventory-actions ${item.Model !== "inventory" ? "hidden" : ""}">
        <button data-inv-action="add" ${disabledAttr}>\u2795</button>
        <button data-inv-action="remove" ${disabledAttr}>\u2796</button>
        <button data-inv-action="inventory" ${disabledAttr}>\u{1F7F0}</button>
      </div>
    `;
      
  let html = `
    <div class="card ${isEditable ? "edit-mode" : "view-mode"}">
      <h2>
        ${isAdd ? "New Food Instance" : item.InstanceID}
        ${
          item.Model === "inventory"
            ? `<span class="inventory-qty">(${formatInventoryQuantity(computeInventoryState(item.InstanceID))})</span>`
            : ""
        }
      </h2>
      <div id="new-item-note" class="subtle-note"></div>
      ${inventoryActions}
      <div style="margin-top: 1rem;">
        ${renderDetailActions()}
      </div>

      ${renderDetailForm("item-food", item)}

      <div id="event-table-container"></div>
    </div>
  `;

  document.getElementById("content").innerHTML = html;
  renderEventTable(currentItem.InstanceID);

  bindDetailEvents();
}


function updateInventoryUI() {
  const panel = document.querySelector(".inventory-actions");
  if (!panel) return;

  if (currentItem.Model === "inventory") {
    panel.classList.remove("hidden");
  } else {
    panel.classList.add("hidden");
  }
}


function renderEventTable(instanceID) {
  const events = getEventsForInstance(instanceID);

  if (!events.length) {
    document.getElementById('event-table-container').innerHTML = '<div class="card">No events</div>';
    return;
  }

  let working = events.filter(e => e.Active !== false);
  working.sort((a, b) => b.Timestamp - a.Timestamp);
  const anchorIndex = working.findIndex(e => e.EventType === 'INVENTORY');

  if (!showAllEvents && anchorIndex !== -1) {
    working = working.slice(0, anchorIndex + 1);
  }

  const html = `
    <div class="card">
      <div style="margin-bottom:0.5rem;">
        <button id="toggleEventHistory">${showAllEvents ? 'Show Current Only' : 'Show Full History'}</button>
      </div>
      <table class="inventory-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
        ${working.map((e, idx) => {
          const isHistorical =
            showAllEvents && anchorIndex !== -1 && idx > anchorIndex;
          return `
            <tr data-event-id="${e.EventID}" class="${isHistorical ? 'event-historical' : 'event-current'}">
              <td>${new Date(e.Timestamp).toLocaleString()}</td>
              <td>${e.EventType}</td>
              <td>${e.Quantity != null ? e.Quantity : ''}</td>
              <td>${e.Notes || ''}</td>
              <td><button data-edit-event="${e.EventID}">\u270E</button></td>
            </tr>
          `;
        }).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('event-table-container').innerHTML = html;

  document.getElementById('toggleEventHistory').addEventListener('click', () => {
    showAllEvents = !showAllEvents;
    renderEventTable(instanceID);
  });

  document.querySelectorAll('[data-edit-event]').forEach(btn => {
    btn.addEventListener('click', () => openEventNoteEdit(btn.dataset.editEvent, instanceID));
  });
}

function openEventNoteEdit(eventID, instanceID) {
  const ev = window._foodInstanceEventCache.find(e => e.EventID === eventID);
  if (!ev) return;

  const row = document.querySelector(`tr[data-event-id="${eventID}"]`);
  if (!row) return;

  row.innerHTML = `
    <td colspan="5">
      <div style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.25rem 0;">
        <textarea id="edit-notes-${eventID}" rows="2" style="flex:1;">${ev.Notes || ""}</textarea>
        <button data-save-event="${eventID}">Save</button>
        <button data-cancel-event="${eventID}">Cancel</button>
      </div>
    </td>
  `;

  document.querySelector(`[data-save-event="${eventID}"]`).addEventListener('click', async () => {
    const notes = document.getElementById(`edit-notes-${eventID}`).value;
    try {
      await updateFoodInstanceEvent(eventID, { Notes: notes });
      renderEventTable(instanceID);
    } catch (err) {
      console.error(err);
      alert("Error saving notes");
    }
  });

  document.querySelector(`[data-cancel-event="${eventID}"]`).addEventListener('click', () => {
    renderEventTable(instanceID);
  });
}




/* --------- ADD ---------- */
function addFoodInstance() {
  pushView();

  currentView = "item-food";
  itemMode = "add";

  currentItem = createEmptyFoodInstance();
  originalItem = null;

  clearDirty();
  updateModeButton();
  renderView();
}

function addFoodInstanceForProduct(productID) {
  pushView();
  currentView = "item-food";
  itemMode = "add";
  currentItem = createEmptyFoodInstance();
  currentItem.ProductID = productID;
  const product = productMap[productID];
  if (product && !currentItem.Label) {
    currentItem.Label = product.Label;
  }
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

function createInstanceFromProduct(productID) {
  const product = productMap[productID];

  currentItem = createEmptyFoodInstance();

  currentItem.ProductID = productID;

  // Only fill label if blank
  if (!currentItem.Label) {
    currentItem.Label = product.Label;
  }

  currentView = "item-food";
  itemMode = "add";

  renderView();
}




async function saveFoodInstance(mode = "close") {
  if (itemMode === "add") {

    Object.assign(currentItem, extractFields("item-food"));
    currentItem = normalizeItem(currentItem);

    // Create item and capture returned object and update cache
    const created = await createFoodInstance(currentItem);
    currentItem = created;
    window._foodInstanceCache.push(created);

    if (mode === "addAnother") {
      const previous = { ...currentItem };

      currentItem = createEmptyFoodInstance();

      // prefill logic later (Step 6.5)
      itemMode = "add";
      clearDirty();
      renderView();

      setTimeout(
        () => {
          Object.assign(currentItem, previous);
          renderView();
        }, 500);
      setTimeout(
        () => {
          document.querySelector(".card")?.classList.add("new-item-flash");

          setTimeout(
            () => {
              document.querySelector(".card")?.classList.remove("new-item-flash");
            }, 1000);
        }, 0);
    } else {
      resetEditState();
      showInventory();
    }

    return;
  }

  Object.assign(currentItem, extractFields("item-food"));
  currentItem = normalizeItem(currentItem);

const changes = getChangedFields(originalItem, currentItem);

  if (!Object.keys(changes).length) {
    alert("No changes to save");
    return;
  }

  // Auto-create lifecycle event if Status changed
  if ("Status" in changes) {
    const statusEventMap = {
      "Consumed": "CONSUMED",
      "Discarded": "DISCARDED",
      "Removed": "REMOVED",
      "": "RETURNED"
    };
    const eventType = statusEventMap[changes.Status];
    if (eventType) {
      await createFoodInstanceEvent({
        InstanceID: currentItem.InstanceID,
        EventType: eventType,
        Quantity: 0,
        CreatedBy: currentUserID || ""
      });
    }
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


async function markFoodInstanceStatus(instanceID, status) {
  const statusEventMap = {
    "Consumed": "CONSUMED",
    "Discarded": "DISCARDED",
    "Removed": "REMOVED",
    "": "RETURNED"
  };
  const eventType = statusEventMap[status];
  if (eventType) {
    await createFoodInstanceEvent({
      InstanceID: instanceID,
      EventType: eventType,
      Quantity: 0,
      CreatedBy: currentUserID || ""
    });
  }
  await updateFoodInstance(instanceID, { Status: status });
  const cached = (window._foodInstanceCache || []).find(i => i.InstanceID === instanceID);
  if (cached) cached.Status = status;
}


/* ------- EVENT LIST (Events tab) -------- */

function renderEventList() {
  const events = window._foodInstanceEventCache || [];

  // Sort newest first by default
  const sorted = [...events]
    .filter(e => e.Active !== false)
    .sort((a, b) => b.Timestamp - a.Timestamp);

  const content = document.getElementById('content');

  content.innerHTML = `
    <div id="event-list-container"></div>
  `;

  renderTable({
    container: document.getElementById('event-list-container'),
    rows: sorted,
    getRowId: r => r.EventID,
    enableSelection: false,
    onRowClick: (event, id) => {
      // Navigate to the food instance this event belongs to
      const ev = sorted.find(e => e.EventID === id);
      if (ev?.InstanceID) showFoodInstance(ev.InstanceID);
    },
    columns: [
      {
        label: "Timestamp",
        field: "Timestamp",
        render: r => r.Timestamp
          ? new Date(r.Timestamp).toLocaleString()
          : ''
      },
      {
        label: "Instance",
        render: r => r.InstanceID || ''
      },
      {
        label: "Type",
        render: r => r.EventType || ''
      },
      {
        label: "Qty",
        render: r => r.Quantity != null ? r.Quantity : ''
      },
      {
        label: "Notes",
        render: r => r.Notes || ''
      }
    ]
  });
}

/* ------- FOOD EVENTS -------- */

let pendingEventType = null;


function openEventModal(type) {
  pendingEventType = type;

  let title = "New Event";
  if (type === "ADD") title = "Add Inventory";
  else if (type === "REMOVE") title = "Remove Inventory";
  else if (type === "INVENTORY") title = "Inventory Count";

  document.getElementById("eventModalTitle").textContent = title;

  document.getElementById("eventQuantity").value = "";
  document.getElementById("eventNotes").value = "";

  document.getElementById("eventModal").classList.remove("hidden");
}

function closeEventModal() {
  document.getElementById("eventModal").classList.add("hidden");
}

async function confirmEvent() {
  const raw = document.getElementById("eventQuantity").value;
  const qty = Number(raw);
  const notes = document.getElementById("eventNotes").value;

  if (isNaN(qty)) {
    alert("Quantity must be a number");
    return;
  }

  if (pendingEventType === "ADD" && qty <= 0) {
    alert("Add quantity must be greater than 0");
    return;
  }

  if (pendingEventType === "REMOVE" && qty <= 0) {
    alert("Remove quantity must be greater than 0");
    return;
  }

  if (pendingEventType === "INVENTORY" && qty < 0) {
    alert("Inventory count cannot be negative");
    return;
  }

  await createFoodInstanceEvent({
    InstanceID: currentItem.InstanceID,
    EventType: pendingEventType,
    Quantity: qty,
    Notes: notes
  });

  closeEventModal();

  renderFoodInstanceDetail();
}



function getEventsForInstance(instanceID) {
  return foodInstanceEventMap[instanceID] || [];
}

function computeInventoryState(instanceID) {
  const events = getEventsForInstance(instanceID);

  if (!events.length) {
    return {
      quantity: null,
      isAnchored: false,
      hasEvents: false
    };
  }

  // Step 1: filter active only
  const activeEvents = events.filter(e => e.Active !== false);

  if (!activeEvents.length) {
    return {
      quantity: null,
      isAnchored: false,
      hasEvents: false
    };
  }

  // Step 2: sort newest → oldest
  const sorted = [...activeEvents].sort((a, b) => b.Timestamp - a.Timestamp);

  // Step 3: find last INVENTORY (first in this order)
  let anchorIndex = sorted.findIndex(e => e.EventType === "INVENTORY");

  let slice;

  if (anchorIndex !== -1) {
    slice = sorted.slice(0, anchorIndex + 1);
  } else {
    slice = sorted;
  }

  // Step 4: compute (iterate oldest → newest for clarity)
  let total = 0;

  const chronological = [...slice].reverse();

  const hasAnchor = anchorIndex !== -1;

  chronological.forEach(e => {
    if (e.EventType === "INVENTORY") {
      total = e.Quantity;    
    } else if (e.EventType === "ADD") {
      total += e.Quantity;
    } else if (e.EventType === "REMOVE") {
      total -= e.Quantity;
    }
  });

  return {
    quantity: total,
    isAnchored: hasAnchor,
    hasEvents: true
  };
}

function formatInventoryQuantity(state) {
  if (!state.hasEvents || state.quantity === null) {
    return "-";
  }

  if (state.quantity < 0) {
    return `<span class="inventory-count-negative">0 ⚠</span>`;
  }

  if (!state.isAnchored) {
    return state.quantity + "+";
  }

  return String(state.quantity);
}

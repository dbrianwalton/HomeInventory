
function showStorage() {
  navStack = [];
  clearSelection();

  activeTab = 'storage';
  currentListEntity = "storage";
  currentView = "list-storage";
  updateModeButton();
  renderView();
}


function showStorageLocation(id) {
  pushView();
  currentView = "item-storage";

  const item = window._storageMap[id];
  if (!item) return;

  currentItem = { ...item };
  originalItem = item;

  itemMode = "view";

  updateModeButton();
  renderView();
}



function showStorageUnassigned() {
  pushView();

  currentView = "list-food";
  activeTab = "storage"; // if you use tabs

  // ✅ apply filter
  storageFilter = storageFilter || {};
  storageFilter.unassigned = true;

  renderStorageList();
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
  container.innerHTML = `
    <div class="list-actions">
      <button onclick="addStorageLocation()">\uFF0B</button>
    </div>
    <div id="storage-table-container"></div>
  `;

  renderTable({
    container: document.getElementById("storage-table-container"),
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


function addStorageLocation() {
  pushView();
  currentView = "item-storage";
  itemMode = "add";
  currentItem = { StorageLocationID: "(new)", Label: "", PhysicalLocation: "", Notes: "" };
  originalItem = {};
  updateModeButton();
  renderView();
}


function renderStorageDetail() {
  const isAdd = itemMode === "add";
  const isAssign = itemMode === "assign";
  const isEditable = itemMode === "edit" || itemMode === "add";

  updateFilterVisibility();

  const item = currentItem;

  const assignBanner = isAssign ? `
    <div class="assign-mode-banner">
      Scan items to assign to this location
      <button onclick="exitAssignMode()">Stop</button>
    </div>` : "";

  const assignButton = !isEditable && !isAssign ? `
    <div style="margin-top: 0.75rem;">
      <button onclick="startAssignMode()">Assign Items</button>
    </div>` : "";

  let html = `
    <div class="card ${isEditable ? "edit-mode" : "view-mode"}">
      <h2>${item.StorageLocationID}</h2>

      ${assignBanner}

      <div style="margin-top: 1rem;">
        ${renderDetailActions()}
      </div>

      ${assignButton}

      ${renderDetailForm("item-storage", item)}

      <div id="related-food"></div>
    </div>
  `;

  document.getElementById("content").innerHTML = html;

  bindDetailEvents();

  const related = (window._foodInstanceCache || [])
    .filter(i => i.StorageLocationID === item.StorageLocationID);

  renderTable({
    container: document.getElementById("related-food"),
    rows: related,
    getRowId: r => r.InstanceID,
    enableSelection: false,
    onRowClick: (event, id) => showFoodInstance(id),
    columns: [
      { label: "Date", render: r => r.Date || '' },
      { label: "ID", render: r => r.InstanceID },
      { label: "Description", render: r => r.Label || '' },
      { label: "Status", render: r => r.Status || '' }
    ]
  });
}



async function saveStorage() {
  Object.assign(currentItem, extractFields("item-storage"));
  currentItem = normalizeItem(currentItem);

  if (itemMode === "add") {
    const newItem = await createStorageLocation(currentItem);
    window._storageLocationCache.push(newItem);
    window._storageMap[newItem.StorageLocationID] = newItem;
    currentItem = { ...newItem };
    originalItem = newItem;
    itemMode = "view";
    updateModeButton();
    renderView();
    return;
  }

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


function startAssignMode() {
  itemMode = "assign";
  pendingAssignment = null;
  renderView();
  startScanner();
}

function exitAssignMode() {
  stopScanner();
  itemMode = "view";
  pendingAssignment = null;
  hideAssignOverlay();
  renderView();
}

function showAssignOverlay(foodInstance) {
  const slLabel = currentItem.Label || currentItem.StorageLocationID;
  const slID = currentItem.StorageLocationID;
  document.getElementById("assignOverlayMessage").innerHTML =
    `Assign <strong>${foodInstance.instanceLabel} (${foodInstance.instanceID})</strong> to <strong>${slLabel} (${slID})</strong>?`;
  document.getElementById("assignOverlay").style.display = "flex";
  document.getElementById("assignConfirmBtn").onclick = confirmAssignment;
  document.getElementById("assignCancelBtn").onclick = cancelAssignment;
}

function hideAssignOverlay() {
  document.getElementById("assignOverlay").style.display = "none";
}

async function confirmAssignment() {
  if (!pendingAssignment) return;
  const { instanceID, instanceLabel } = pendingAssignment;
  const slID = currentItem.StorageLocationID;

  try {
    await updateFoodInstance(instanceID, { StorageLocationID: slID });

    // update cache
    const cached = (window._foodInstanceCache || []).find(i => i.InstanceID === instanceID);
    if (cached) cached.StorageLocationID = slID;

    showStatus(`Assigned ${instanceLabel}`);
    setTimeout(hideStatus, 2000);
  } catch (e) {
    showStatus(`Error: ${e.message}`);
  }

  pendingAssignment = null;
  hideAssignOverlay();
  renderView();
  startScanner();
}

function cancelAssignment() {
  exitAssignMode();
}

function openAssignEntitySelect(instances) {
  const slID = currentItem.StorageLocationID;

  pushView();
  currentItem = {
    ...currentItem,
    _selectConfig: {
      label: "Item to Assign",
      getOptions: () => instances,
      getLabel: (r) => {
        const loc = r.StorageLocationID
          ? (r.StorageLocationID === slID
              ? "<em>\u2190 here</em>"
              : (window._storageMap[r.StorageLocationID] || {}).Label || r.StorageLocationID)
          : "\u2014";
        return `${r.Label || r.InstanceID} <span style="color:#888;font-size:0.85em">${loc}</span>`;
      },
      getSearchText: (r) => (r.Label || r.InstanceID).toLowerCase(),
      getId: (r) => r.InstanceID,
      onSelect: (selectedID) => {
        const inst = (window._foodInstanceCache || []).find(i => i.InstanceID === selectedID);
        if (!inst) return;
        pendingAssignment = { instanceID: selectedID, instanceLabel: inst.Label || selectedID };
        goBack();
        showAssignOverlay(pendingAssignment);
      }
    }
  };

  currentView = "entity-select";
  renderView();
}
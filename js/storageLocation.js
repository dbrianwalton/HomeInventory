
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
  const isEditable = itemMode === "edit" || itemMode === "add";

  updateFilterVisibility();

  const item = currentItem;

  let html = `
    <div class="card ${isEditable ? "edit-mode" : "view-mode"}">
      <h2>${item.StorageLocationID}</h2>

      <div style="margin-top: 1rem;">
        ${renderDetailActions()}
      </div>

      ${renderDetailForm("item-storage", item)}

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
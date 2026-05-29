
function showStorage() {
  navStack = [];
  clearSelection();

  activeTab = 'storage';
  currentView = "storage-list";
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



function showStorageUnassigned() {
  pushView();

  currentView = "food-list";
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
  Object.assign(currentItem, extractFields("storage-item"));
  currentItem = normalizeItem(currentItem);

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

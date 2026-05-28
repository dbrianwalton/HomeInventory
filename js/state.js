let currentView = "food-list"; // "inventory" | "item"
let currentItem = null;
let originalItem = null;

let itemMode = "view"; // "view" | "edit" | "add"
let isDirty = false;

let statusVisible = false;

let activeTab = "inventory";

let navStack = [];

let inventoryFilter = {
  text: '',
  dateFrom: null,
  dateTo: null,
  storageScope: "ALL"
};
let storageFilter = {
  text: ''
};

let foodInstanceEventMap = {};

let interactionMode = "browse";  // "browse" | "select"

let isDragging = false;
let didDrag = false;
let dragAction = null;  // "add" | "remove" | null

let inventorySort = {
  field: 'Date',
  direction: 'desc'
};
let showAllEvents = false;

let filtersExpanded = false;
let selectorSearchTerm = "";

let selectedItems = new Set();

let labelStartIndex = 0;
let labelDrawBoundary = false;

let touchTimer;

let productMap = {};
let barcodeMap = {};
let barcodeToProductMap = {};

/* ---------------------- */


function markDirty() {
  isDirty = true;
  document.getElementById("modeButton")?.classList.add("dirty");
}

function clearDirty() {
  isDirty = false;
  document.getElementById("modeButton")?.classList.remove("dirty");
}

function enterEditMode() {
  itemMode = "edit";
  clearDirty();
  updateModeButton();
  switch (currentView) {
    case "food-item":
      renderFoodInstanceDetail();
      break;
    case "storage-item":
      renderStorageDetail();
      break;
  }
  
}

function cancelEdit() {

  if (itemMode === "add") {
    // No original item — abandon and leave
    currentItem = null;
    originalItem = null;

    itemMode = "view";
    clearDirty();

    goBack();
    return;
  }
  
  itemMode = "view";
  clearDirty(); 
  updateModeButton();
  
  // reload original
  let original;
  switch (currentView) {
    case "food-item":
      original = window._foodInstanceCache.find(i => i.InstanceID === currentItem.InstanceID);
      currentItem = { ...original };
      renderFoodInstanceDetail();
      break;
    case "storage-item":
      original = window._storageLocationCache.find(i => i.StorageLocationID === currentItem.StorageLocationID);
      currentItem = { ...original };
      renderStorageDetail();
      break;
  } 
}

function resetEditState() {
  itemMode = "view";
  clearDirty();
  updateModeButton();
}


function getChangedFields(original, updated) {
  const changes = {};

  Object.keys(updated).forEach(key => {
    if (updated[key] !== original[key]) {
      changes[key] = updated[key];
    }
  });

  return changes;
}

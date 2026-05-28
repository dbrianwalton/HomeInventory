window.onload = async () => {
  if (!getSheetId()) {
    openSettings();
    return;
  }

  await initAuth();  // OAuth from external JS

  await loadAllData();
  renderView();
};

/* ------------ LOCAL STORAGE ---------- */

function promptForSheetId() {
  const raw = prompt("Enter your Google Sheet URL or ID:");
  const id = extractSheetId(raw);

  if (!id) {
    alert("A valid Sheet ID is required.");
    return;
  }

  localStorage.setItem("sheetId", id.trim());

  location.reload();
}

/* ---------- SETTINGS ---------- */

function getSheetId() {
  return localStorage.getItem("sheetId");
}

function openSettings() {
  const panel = document.getElementById("settingsPanel");

  // preload current values
  document.getElementById("settings-sheetId").value =
    getSheetId() || "";

  panel.classList.remove("hidden");
}

function closeSettings() {
  document.getElementById("settingsPanel").classList.add("hidden");
}

function extractSheetId(input) {
  const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : input;
}

function saveSettings() {
  const raw = document.getElementById("settings-sheetId").value;

  const sheetId = extractSheetId(raw);

  if (!sheetId) {
    alert("Sheet ID is required");
    return;
  }

  localStorage.setItem("sheetId", sheetId);

  closeSettings();
  location.reload();
}

function clearSettings() {
  localStorage.removeItem("sheetId");
  location.reload();
}

/* -------- GLOBAL INTERFACE --------- */
window.addEventListener("beforeunload", (e) => {
  if (itemMode === "edit" && isDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------- PREFIXES ------------- */

const ID_CONFIG = {
  FoodInstance: "FI",
  StorageLocation: "SL",
  FoodInstanceEvent: "EV",
  ProductionEvent: "PE",
  Product: "PR",
  FoodBarcode: "FB"
};

const PREFIX_TO_ENTITY = Object.fromEntries(
  Object.entries(ID_CONFIG).map(([entity, prefix]) => [prefix, entity])
);

const ENTITY_RESOLVERS = {
  FoodInstance: findFoodInstance,
  StorageLocation: findStorageLocation,
  //FoodInstanceEvent: findFoodInstanceEvent,
  //ProductionEvent: findProductionEvent
};

/* ---------- ENTITY RESOLVERS ---------- */

function findFoodInstance(id) {
  return (window._foodInstanceCache || []).find(i => i.InstanceID === id) || null;
}

function findStorageLocation(id) {
  return window._storageMap?.[id] || null;
}

/* ---------- MANUAL SCAN INPUT ---------- */

// Called by the "Scan" button next to the barcode text input in index.html.
// Detects whether the entered text is one of our entity IDs (treat as QR)
// or an external barcode (treat as UPC).
function handleScanInput() {
  const input = document.getElementById('barcodeInput');
  const text = input.value.trim();
  if (!text) return;

  // If the text parses as one of our entity IDs, treat it as a QR scan.
  // Also handle the JSON envelope format that our QR labels use.
  let idCandidate = text;
  try {
    const envelope = JSON.parse(text);
    idCandidate = envelope.id || text;
  } catch (e) { /* not JSON */ }

  const format = parseID(idCandidate) ? "QR_CODE" : "BARCODE";

  handleScan(text, { result: { format: { formatName: format } } });
  input.value = '';
}

/* ---------- SCAN-TRIGGERED MUTATIONS ---------- */

// Assigns a storage location to a food instance.
// Called from VIEW_CONFIG onScan when a QR_SL is scanned in the food-item view.
async function assignLocation(item, locationId) {
  try {
    await updateFoodInstance(item.InstanceID, { StorageLocationID: locationId });

    // Update cache
    const cached = window._foodInstanceCache.find(i => i.InstanceID === item.InstanceID);
    if (cached) cached.StorageLocationID = locationId;

    // Patch the navStack snapshot so goBack() restores the updated item
    updatePreviousViewItem(prev => { prev.StorageLocationID = locationId; });
    goBack();
    renderView();
  } catch (err) {
    console.error(err);
    alert("Error assigning location");
  }
}

// Assigns a product to a food instance.
// Called from VIEW_CONFIG onScan when a known UPC is scanned in the food-item view.
async function assignProduct(item, product) {
  try {
    await updateFoodInstance(item.InstanceID, { ProductID: product.ProductID });

    // Update cache
    const cached = window._foodInstanceCache.find(i => i.InstanceID === item.InstanceID);
    if (cached) cached.ProductID = product.ProductID;

    // Patch the navStack snapshot so goBack() restores the updated item
    updatePreviousViewItem(prev => { prev.ProductID = product.ProductID; });
    goBack();
    renderView();
  } catch (err) {
    console.error(err);
    alert("Error assigning product");
  }
}

/* ---------- PRODUCT CREATION ---------- */

// Opens the product-creation flow. Entry points: unknown UPC scan.
// Called while currentView === "action-prompt", which already pushed the calling view
// (food-item or food-list) onto navStack via showActionPrompt. We navigate directly to
// product-item without an additional pushView() so goBack() returns to the right place.
function openCreateProduct(context) {
  currentView = "product-item";
  itemMode = "add";
  currentItem = {
    Label: "",
    Size: "",
    _createContext: context
  };
  originalItem = null;
  clearDirty();
  updateModeButton();
  renderView();
}

/* ---------- PHASE 3 STUB ---------- */

// Transfers inventory quantity from sourceItem to targetItem.
// TODO Phase 3: show quantity prompt, create REMOVE on source + ADD on target.
function startTransfer(sourceItem, targetItem) {
  alert("Transfer: coming in Phase 3.\nFrom: " + sourceItem.InstanceID + "\nTo: " + targetItem.InstanceID);
}

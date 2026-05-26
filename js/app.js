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
  ProductionEvent: "PE"
  // add more types here as needed
};

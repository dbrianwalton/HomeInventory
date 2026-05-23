/* ---------- CONFIG ---------- */

const CLIENT_ID = "364484300168-cjutfpntqunv3sv7ailg2nv51v8581kj.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const SHEET_ID = "1jJlqRGXN93MxOVB2kokgls_qCWaErrnx-kvytYDeeU4";

/* ---------- STATE ---------- */

let accessToken = null;

window._foodInstanceCache = null;
window._storageLocationCache = null;
window._eventCache = null;

/* ---------- AUTH ---------- */

async function initAuth() {
  return new Promise((resolve) => {

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {

        // If token came back
        if (response.access_token) {
          accessToken = response.access_token;
          resolve();
        } else {
          console.warn("Token missing — retrying with consent");

          // Fallback: force consent prompt
          tokenClient.requestAccessToken({ prompt: "consent" });
        }
      }
    });

    // FIRST: try silent
    tokenClient.requestAccessToken({ prompt: "" });
  });
}


/* ---------- API FETCH ---------- */

async function sheetFetch(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await res.json();
  return rowsToObjects(data.values);
}

/* ---------- TRANSFORM ---------- */

function rowsToObjects(rows) {
  const [headers, ...data] = rows;

  return data.map(r =>
    Object.fromEntries(headers.map((h, i) => [h, r[i]]))
  );
}

/* ---------- LOADERS ---------- */

async function loadInventory() {
  if (window._foodInstanceCache) return;
  window._foodInstanceCache = await sheetFetch("FoodInstances!A1:Z");
}

async function loadStorage() {
  if (window._storageLocationCache) return;
  window._storageLocationCache = await sheetFetch("StorageLocations!A1:Z");

  window._storageMap = {};
  window._storageLocationCache.forEach(s => {
    window._storageMap[s.StorageLocationID] = s;
  });
}

async function loadEvents() {
  if (window._eventCache) return;
  window._eventCache = await sheetFetch("Events!A1:Z");
}

async function loadAllData() {
  await Promise.all([
    loadInventory(),
    loadStorage(),
    loadEvents()
  ]);
}

/* ------------ SAVERS ---------------- */

async function updateFoodInstance(instanceID, changes) {
  // Find row index
  const rows = await sheetFetch("FoodInstances!A1:Z");

  const index = rows.findIndex(r => r.InstanceID === instanceID);
  if (index === -1) {
    throw new Error("Instance not found");
  }

  const headers = Object.keys(rows[0]);
  const row = rows[index];

  // Apply only changed fields
  Object.entries(changes).forEach(([key, value]) => {
    row[key] = value;
  });

  // Rebuild row in column order
  const values = headers.map(h => row[h] || "");

  const rowNumber = index + 2; // +2 (header + 1-based)

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/FoodInstances!A${rowNumber}:Z${rowNumber}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [values]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }

  return res.json();
}

async function updateStorageLocation(id, changes) {
  // Find row index
  const rows = await sheetFetch("StorageLocations!A1:Z");

  const index = rows.findIndex(r => r.StorageLocationID === id);
  if (index === -1) {
    throw new Error("Location not found");
  }

  const headers = Object.keys(rows[0]);
  const row = rows[index];

  // Apply only changed fields
  Object.entries(changes).forEach(([key, value]) => {
    row[key] = value;
  });

  // Rebuild row in column order
  const values = headers.map(h => row[h] || "");

  const rowNumber = index + 2; // +2 (header + 1-based)

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/StorageLocations!A${rowNumber}:Z${rowNumber}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [values]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }

  return res.json();
}
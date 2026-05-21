/* ---------- CONFIG ---------- */

const CLIENT_ID = "364484300168-cjutfpntqunv3sv7ailg2nv51v8581kj.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";
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
        accessToken = response.access_token;
        resolve();
      }
    });

    tokenClient.requestAccessToken();
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
}

async function loadEvents() {
  if (window._eventCache) return;
  window._eventCache = await sheetFetch("Events!A1:Z");
}
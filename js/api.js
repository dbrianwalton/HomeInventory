/* ---------- CONFIG ---------- */
const appID = "BTM-Inventory";

const CLIENT_ID = "364484300168-cjutfpntqunv3sv7ailg2nv51v8581kj.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

/* ---------- STATE ---------- */

let accessToken = null;

window._foodInstanceCache = null;
window._storageLocationCache = null;
window._foodInstanceEventCache = null;

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

async function sheetFetchRaw(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}/values/${range}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await res.json();

  return data.values || [];
}


async function sheetFetch(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}/values/${range}`;

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

async function loadCounters() {
  if (window._countersCache) return;

  const rows = await sheetFetchRaw("Counters!A1:B");

  if (!rows.length) {
    window._countersCache = {};
    return;
  }

  const headers = rows[0]; // ["Key", "Value"]
  const dataRows = rows.slice(1);

  const map = {};

  dataRows.forEach(row => {
    const key = row[0];
    const value = parseInt(row[1] || "0", 10);

    if (key) {
      map[key] = value;
    }
  });

  window._countersCache = map;
}

async function incrementCounter(key) {
  // ALWAYS fetch fresh data
  const rows = await sheetFetchRaw("Counters!A1:B");

  let rowIndex = -1;
  let current = 0;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      rowIndex = i + 1;        // sheet row (1-based)
      current = parseInt(rows[i][1] || "0", 10);
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error(`Counter key '${key}' not found`);
  }

  const next = current + 1;

  // ✅ Write updated value
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}/values/Counters!B${rowIndex}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [[next]]
    })
  });

  if (!res.ok) {
    throw new Error("Failed to update counter");
  }

  return next;
}



async function loadAllData() {
  await Promise.all([
    loadInventory(),
    loadStorageLocations(),
    loadFoodInstanceEvents(),
    loadProducts(),
    loadFoodBarcodes()
  ]);
}


async function loadInventory() {
  if (window._foodInstanceCache) return;

  const rows = await sheetFetchRaw("FoodInstances!A1:Z");

  if (!rows.length) {
    window._foodInstanceHeaders = [];
    window._foodInstanceCache = [];
    return;
  }

  // ✅ Extract headers
  const headers = rows[0];
  window._foodInstanceHeaders = headers;

  // ✅ Convert remaining rows
  const dataRows = rows.slice(1);
  window._foodInstanceCache = rowsToObjects([headers, ...dataRows]);
}


async function loadStorageLocations() {
  if (window._storageLocationCache) return;
  window._storageLocationCache = await sheetFetch("StorageLocations!A1:Z");

  window._storageMap = {};
  window._storageLocationCache.forEach(s => {
    window._storageMap[s.StorageLocationID] = s;
  });
}


async function loadFoodInstanceEvents() {
  if (window._foodInstanceEventCache) return;

  const rows = await sheetFetchRaw("FoodInstanceEvents!A1:Z");

  if (!rows.length) {
    window._foodInstanceEventHeaders = [];
    window._foodInstanceEventCache = [];
    return;
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  window._foodInstanceEventHeaders = headers;
  window._foodInstanceEventCache =
    rowsToObjects([headers, ...dataRows]).
    map(e => ({
      ...e,
      Quantity: e.Quantity
        ? Number(String(e.Quantity).replace(/,/g, ""))
        : 0,

      Timestamp: e.Timestamp
        ? Number(String(e.Timestamp).replace(/,/g, ""))
        : 0,
      Active: (e.Active === false || e.Active === "FALSE") ? false : true
    }));
  buildFoodInstanceEventMap();
}

function buildFoodInstanceEventMap() {
  foodInstanceEventMap = {};

  (window._foodInstanceEventCache || []).forEach(e => {
    if (!e.InstanceID) return;

    if (!foodInstanceEventMap[e.InstanceID]) {
      foodInstanceEventMap[e.InstanceID] = [];
    }

    foodInstanceEventMap[e.InstanceID].push(e);
  });
}

async function loadProducts() {
  if (window._productCache) return;

  const rows = await sheetFetchRaw("Products!A1:Z");

  if (!rows.length) {
    window._productHeaders = [];
    window._productCache = [];
    return;
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  window._productHeaders = headers;

  window._productCache = rowsToObjects([headers, ...dataRows]);

  buildProductMap();
}

function buildProductMap() {
  productMap = {};

  (window._productCache || []).forEach(p => {
    productMap[p.ProductID] = p;
  });
}


async function loadFoodBarcodes() {
  if (window._barcodeCache) return;

  const rows = await sheetFetchRaw("FoodBarcodes!A1:Z");

  if (!rows.length) {
    window._barcodeHeaders = [];
    window._barcodeCache = [];
    return;
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  window._barcodeHeaders = headers;

  window._barcodeCache = rowsToObjects([headers, ...dataRows]);

  buildBarcodeMaps();
}


function buildBarcodeMaps() {
  barcodeMap = {};
  barcodeToProductMap = {};

  (window._barcodeCache || []).forEach(b => {
    barcodeMap[b.BarcodeID] = b;

    if (b.Code) {
      const normalized = normalizeBarcode(b.Code);
      barcodeToProductMap[normalized] = b.ProductID;
    }
  });
}


function normalizeBarcode(code) {
  return String(code).replace(/[^0-9A-Za-z]/g, "");
}


function findProductByBarcode(code) {
  const normalized = normalizeBarcode(code);
  const productID = barcodeToProductMap[normalized];

  if (!productID) return null;

  return productMap[productID] || null;
}


/* ----------- CREATORS --------------- */

async function getNextID(type) {
  if (!ID_CONFIG[type]) {
    throw new Error(`Unknown ID type: ${type}`);
  }

  const next = await incrementCounter(type);

  const prefix = ID_CONFIG[type];

  return prefix + "-" + String(next).padStart(5, "0");
}



async function createFoodInstance(item) {
  const headers = window._foodInstanceHeaders;

  if (!headers || !headers.length) {
    throw new Error("Headers not loaded — cannot create item");
  }

  const newID = await getNextID("FoodInstance");

  const newItem = {
    ...item,
    InstanceID: newID
  };

  // ✅ Call your existing API write method
  await appendFoodInstanceRow(newItem);

  return newItem;
}

async function appendFoodInstanceRow(item) {
  const headers = window._foodInstanceHeaders;

  const row = headers.map(h => item[h] ?? "");

  await appendRowToSheet("FoodInstances", row);
}

async function createFoodInstanceEvent(event) {
  const headers = window._foodInstanceEventHeaders;

  if (!headers?.length) {
    throw new Error("Headers not loaded — cannot create event");
  }

  const newID = await getNextID("FoodInstanceEvent");

  const base = {};
  headers.forEach(h => {
      base[h] = event[h] ?? "";
    });

  const fullEvent = {
    ...base,
    EventID: newID,
    Timestamp: Date.now(),
    Active: true,
    Quantity: base.Quantity ? Number(base.Quantity) : 0
  };

  await appendFoodInstanceEventRow(fullEvent);

  // update cache immediately
  window._foodInstanceEventCache.push(fullEvent);
  if (!foodInstanceEventMap[fullEvent.InstanceID]) {
    foodInstanceEventMap[fullEvent.InstanceID] = [];
  }
  foodInstanceEventMap[fullEvent.InstanceID].push(fullEvent);

  return fullEvent;
}

async function appendFoodInstanceEventRow(event) {
  const headers = window._foodInstanceEventHeaders;

  const row = headers.map(h => event[h] ?? "");

  await appendRowToSheet("FoodInstanceEvents", row);
}


async function createProduct(product) {
  const headers = window._productHeaders;

  if (!headers?.length) {
    throw new Error("Product headers not loaded");
  }

  const newID = await getNextID("Product");

  const base = {};
  headers.forEach(h => {
    base[h] = product[h] ?? "";
  });

  const fullProduct = {
    ...base,
    ProductID: newID
  };

  await appendProductRow(fullProduct);

  window._productCache.push(fullProduct);
  productMap[newID] = fullProduct;

  return fullProduct;
}


async function appendProductRow(product) {
  const headers = window._productHeaders;

  const row = headers.map(h => product[h] ?? "");

  await appendRowToSheet("Products", row);
}


async function createFoodBarcode(barcode) {
  const headers = window._barcodeHeaders;

  if (!headers?.length) {
    throw new Error("Barcode headers not loaded");
  }

  const newID = await getNextID("FoodBarcode");

  const base = {};
  headers.forEach(h => {
    base[h] = barcode[h] ?? "";
  });

  const fullBarcode = {
    ...base,
    BarcodeID: newID
  };

  await appendFoodBarcodeRow(fullBarcode);

  window._barcodeCache.push(fullBarcode);

  const normalized = normalizeBarcode(fullBarcode.Code);
  barcodeToProductMap[normalized] = fullBarcode.ProductID;

  return fullBarcode;
}


async function appendFoodBarcodeRow(barcode) {
  const headers = window._barcodeHeaders;

  const row = headers.map(h => barcode[h] ?? "");

  await appendRowToSheet("FoodBarcodes", row);
}

/* ------------ SAVERS ---------------- */

async function appendRowToSheet(sheetName, rowArray) {
  const sheetId = getSheetId();

  const range = `${sheetName}!A:Z`;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [rowArray]
    })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Append failed:", data);
    throw new Error(data.error?.message || "Failed to append row");
  }

  return data;
}


async function performSave({
  saveFunction,
  id,
  changes,
  updateCache,
  afterSave
}) {
  try {
    await saveFunction(id, changes);

    updateCache?.();

    afterSave?.();

  } catch (err) {
    console.error(err);
    alert("Error saving data");
  }
}


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

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}/values/FoodInstances!A${rowNumber}:Z${rowNumber}?valueInputOption=USER_ENTERED`;

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

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}/values/StorageLocations!A${rowNumber}:Z${rowNumber}?valueInputOption=USER_ENTERED`;

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
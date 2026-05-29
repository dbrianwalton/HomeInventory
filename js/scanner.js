/* ---------- SCANNER ---------- */

function parseID(value) {
  if (!value || typeof value !== "string") return null;

  const parts = value.split("-");
  if (parts.length < 2) return null;

  const prefix = parts[0];
  const entityType = PREFIX_TO_ENTITY[prefix];

  if (!entityType) return null;

  return {
    entityType,
    id: value
  };
}

function handleScan(decodedText, decodedResult) {
  const format = decodedResult?.result?.format?.formatName;

  const scan = resolveScan(decodedText, format);

  if (!scan) {
    alert("Unrecognized scan");
    return;
  }

  dispatchScan(scan);
}


function resolveScan(text, format) {
  const normalized = normalizeBarcode(text);

  // QR handling
  if (format === "QR_CODE") {
    // QR codes are JSON envelopes: {"id":"FI-00001"} or {"storage":"SL-00001"}
    // or {"appID":"BTM-Inventory","id":"FI-00001"}.
    // Fall back to treating raw text as a plain ID for backward compatibility.
    let idString = text;
    try {
      const envelope = JSON.parse(text);
      // "id" is the canonical key for all entity types.
      // The entity type is determined by the ID prefix (FI-, SL-, etc.).
      idString = envelope.id || text;
    } catch (e) {
      // not JSON — use raw text as-is
    }

    const parsed = parseID(idString);

    if (parsed) {
      const resolver = ENTITY_RESOLVERS[parsed.entityType];

      return {
        type: `QR_${ID_CONFIG[parsed.entityType]}`,
        id: parsed.id,
        entityType: parsed.entityType,
        entity: resolver ? resolver(parsed.id) : null
      };
    }

    return { type: "QR_UNKNOWN", raw: text };
  }

  // UPC handling
  const product = findProductByBarcode(normalized);

  return {
    type: "UPC",
    code: normalized,
    product: product || null,
    resolved: !!product
  };
}


function dispatchScan(scan) {
  const viewConfig = VIEW_CONFIG[currentView];

  if (!viewConfig?.onScan) return;

  const context = {
    currentItem,
    currentView
  };

  const actions = viewConfig.onScan({
    ...context,
    scan
  }) || [];

  routeScanActions(actions, context, scan);
}


function routeScanActions(actions, context = {}, scan = null) {
  if (!actions.length) return;

  // Filter by condition before deciding on auto-execute
  const available = actions.filter(a => !a.condition || a.condition(context));

  if (!available.length) return;

  // Always close the scanner before any action fires. The scanner panel covers
  // the full interface, so it must be closed before the action-prompt or a new
  // view is rendered. Repeat-mode actions are responsible for reopening it.
  stopScanner();

  if (available.length === 1 && available[0].riskLevel === "safe") {
    available[0].execute();
    return;
  }

  showActionPrompt(available, { ...context, scan });
}

/* --- Scanner state --- */
let qrScanner = null;
let scanLastCode = null;
let scanDebounceTimer = null;
let scanCooldownUntil = 0;

let scanGlowTimer = null;

function onScanSuccess(decodedText, decodedResult) {
  const now = Date.now();

  // Flash green glow on the video wrapper every frame a code is visible
  const wrapper = document.querySelector('.scanner-video-wrapper');
  if (wrapper) {
    wrapper.classList.add('code-detected');
    clearTimeout(scanGlowTimer);
    scanGlowTimer = setTimeout(() => wrapper.classList.remove('code-detected'), 400);
  }

  // Show detected value immediately
  const statusEl = document.getElementById('scanner-status');
  if (statusEl) statusEl.textContent = decodedText;

  // Within cooldown for the same code — ignore
  if (decodedText === scanLastCode && now < scanCooldownUntil) return;

  // New code detected — reset debounce
  if (decodedText !== scanLastCode) {
    scanLastCode = decodedText;
    clearTimeout(scanDebounceTimer);
    scanDebounceTimer = setTimeout(() => {
      scanCooldownUntil = Date.now() + 2000;
      handleScan(decodedText, decodedResult);
    }, 300);
  }
  // Same code, debounce already running — do nothing
}

function drawScanHighlight(location) {
  const canvas = document.getElementById('scanner-overlay');
  if (!canvas || !location) return;

  const video = document.querySelector('#qr-reader video');
  if (!video || !video.videoWidth) return;

  // Size the canvas buffer to match the video's display size
  const dw = video.clientWidth;
  const dh = video.clientHeight;
  if (canvas.width !== dw)  canvas.width  = dw;
  if (canvas.height !== dh) canvas.height = dh;

  const scaleX = dw / video.videoWidth;
  const scaleY = dh / video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, dw, dh);

  // Build point list — QR gives 4 named corners; 1D barcodes may give the same shape
  const pts = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ].filter(Boolean);

  if (pts.length < 2) return;

  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 8;
  ctx.shadowColor = '#16a34a';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
  }
  ctx.closePath();
  ctx.stroke();
}

function startScanner() {
  document.getElementById('scanner-panel').style.display = 'block';

  const formats = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
  ];

  qrScanner = new Html5Qrcode("qr-reader", { formatsToSupport: formats });

  qrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    onScanSuccess
  );
}

function stopScanner() {
  if (!qrScanner) return;

  clearTimeout(scanDebounceTimer);
  clearTimeout(scanGlowTimer);
  scanDebounceTimer = null;
  scanGlowTimer = null;
  scanLastCode = null;
  scanCooldownUntil = 0;

  const wrapper = document.querySelector('.scanner-video-wrapper');
  if (wrapper) wrapper.classList.remove('code-detected');
  const statusEl = document.getElementById('scanner-status');
  if (statusEl) statusEl.textContent = '';

  qrScanner.stop();
  qrScanner = null;
  document.getElementById('scanner-panel').style.display = 'none';
}

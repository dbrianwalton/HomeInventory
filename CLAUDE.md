# CLAUDE.md — BTM Inventory System

This file is the persistent context document for AI-assisted development sessions.
Update it whenever significant design decisions are made or the codebase changes meaningfully.

---

## Project Overview

A client-side HTML/JS web app for food inventory management, hosted on GitHub Pages.
Google Sheets is the backend database (no server). Uses Google OAuth (GIS implicit flow)
for Sheets API access. Supports QR and UPC scanning for navigation and inventory actions.

**Repo / hosting:** GitHub Pages (branch: main)
**OAuth client:** Registered in Google Cloud Console. Authorized JavaScript origin must
include the GitHub Pages URL. The client ID is embedded in `js/api.js` (CLIENT_ID const).
**Sheet ID:** Stored per-user in localStorage (key: `sheetId`). Each user pastes their own
Sheet URL or ID into Settings. The same OAuth client works for all users against their own
sheets.

---

## File Structure

```
index.html               — Single-page shell. All panels (settings, labels, events modal)
                           are hidden divs toggled by JS. Loads scripts in dependency order.
js/state.js              — All mutable global state and simple state-mutating helpers
                           (markDirty, cancelEdit, getChangedFields, etc.)
js/api.js                — Google Sheets API layer: auth, loaders, creators, updaters.
js/foodInstance.js       — food-item and food-list view logic, including the events list
                           and inventory quantity calculation from events.
js/storageLocation.js    — storage-item and storage-list view logic.
js/filters.js            — Filter bar rendering, chip rendering, filter event binding.
                           Reads VIEW_CONFIG from config.js; writes to inventoryFilter /
                           storageFilter in state.js.
js/render.js             — Generic view functions and utilities: renderDetailForm,
                           renderField, extractFields, entity selector, action prompt,
                           renderView dispatcher, and other shared render helpers.
js/scanner.js            — Camera/scanner setup, scan debounce, canvas overlay,
                           handleScan / resolveScan / dispatchScan / routeScanActions.
js/labels.js             — Label PDF generation (generateLabelsPDF, buildQR helpers).
js/config.js             — VIEW_CONFIG, LABEL_CONFIG, ENTITY_FIELDS, DETAIL_ACTIONS.
js/app.js                — window.onload bootstrap, settings panel, ID_CONFIG,
                           PREFIX_TO_ENTITY, ENTITY_RESOLVERS.
btm-inventory.css        — All styles.
manifest.json            — PWA manifest (installed on iOS/Android home screen).
```

Script load order in index.html:
state.js → api.js → foodInstance.js → storageLocation.js → filters.js → render.js → scanner.js → labels.js → config.js → app.js

---

## Architecture: Key Patterns

### CONFIG-Driven Design
New entities and views are added via config objects, not by scattering new conditionals
throughout the code.

- **`VIEW_CONFIG`** (views.js): One entry per view. Each entry has `render`, optional
  `filters`, and optional `onScan`. The scan dispatcher reads `onScan` from the current
  view to get context-sensitive actions.
- **`ENTITY_FIELDS`** (views.js): Field definitions per entity type used by the generic
  `renderDetailForm` / `renderField` / `extractFields` functions.
- **`LABEL_CONFIG`** (views.js): Per-view label layout config used by `generateLabelsPDF`.
- **`DETAIL_ACTIONS`** (views.js): Button sets for view/edit/add modes.
- **`ID_CONFIG`** (app.js): Maps entity type names to ID prefixes (e.g. FoodInstance → FI).
- **`ENTITY_RESOLVERS`** (app.js): Maps entity type names to lookup functions.

### Action System
Scans and other triggers produce **action objects** rather than executing directly:
```js
{
  label: "Assign to Location",
  condition: (context) => ...,   // optional — filters actions shown
  riskLevel: "safe" | "warn",
  warningMessage: (context) => "...",  // shown in confirm() for warn actions
  execute: (context) => ...
}
```
`routeScanActions(actions)`:
- 0 actions → silent no-op
- 1 safe action → execute immediately
- otherwise → push to "action-prompt" view for user selection

### Navigation
`navStack` (state.js) is a stack of `{ currentView, currentItem, itemMode }` snapshots.
`pushView()` saves current state; `goBack()` pops it. Tab buttons (Inventory / Storage /
Events) reset the stack entirely.

### Mutating currentItem from a sub-view (entity selector / action prompt)
When a sub-view (entity-select, action-prompt) needs to update a field on the item in
the parent view, it must patch the **navStack snapshot** via `updatePreviousViewItem`,
not `currentItem` directly. `goBack()` then restores the patched snapshot as the new
`currentItem`, and `renderView()` reflects the change.

```js
updatePreviousViewItem(item => { item.StorageLocationID = locationId; });
goBack();
renderView();
```

This is the same pattern used by the entity selector. For async mutations (e.g.
`assignLocation`, `assignProduct`) the `updatePreviousViewItem` + `goBack()` +
`renderView()` calls belong inside the `try` block after the `await`, so navigation
only happens on success. The execute function owns the navigation — `handleActionSelection`
does not call `goBack()` separately.

### Scan Dispatch Flow
```
Camera / handleScanInput()
  → handleScan(decodedText, decodedResult)
  → resolveScan(text, format)        ← produces a scan object
  → dispatchScan(scan)               ← reads VIEW_CONFIG[currentView].onScan
  → routeScanActions(actions)        ← executes or prompts
```

**resolveScan** returns:
- QR scan: `{ type: "QR_FI"|"QR_SL"|"QR_UNKNOWN", id, entityType, entity }`
- UPC scan: `{ type: "UPC", code, product, resolved }`

### Per-View Scan Behavior

Each view defines its own `onScan` in VIEW_CONFIG. Actions that depend on `currentItem`
belong only in detail views (`food-item`, `storage-item`), not in list views.

| View | QR_FI | QR_SL | UPC resolved | UPC unresolved |
|---|---|---|---|---|
| `food-list` | Open Item | Open Storage Location | — | Create Product |
| `food-item` | Open Item / Transfer (if both inventory) | Assign to Location | Assign Product (if unassigned) | Create Product |
| `storage-list` | Open Item | Open Storage Location | — | — |
| `storage-item` | Open Item | — | — | — |

### Product Creation Flow

Entry points: unknown UPC scan from `food-list` or `food-item`. Selector "+ Create" deferred.

`openCreateProduct(context)` is called while in `action-prompt` view. Because
`showActionPrompt` already called `pushView()` to save the calling view (food-item or
food-list) onto navStack, `openCreateProduct` does NOT call `pushView()` again — it
sets `currentView = "product-item"` directly. The context `{ source, barcode, currentItem }`
is stored in `currentItem._createContext` for `saveProduct()` to use.

**On save (`saveProduct()`):**
1. `createProduct()` — writes Product row, updates cache
2. If `context.barcode`: `createFoodBarcode()` — links barcode to new product
3. If `context.currentItem`: update server + cache + `updatePreviousViewItem` to set
   `ProductID` on the navStack snapshot, then `goBack()` + `renderView()` — returns to
   food-item with product already assigned
4. If no `currentItem`: `goBack()` + `renderView()` — returns to food-list

**Cancel:** `goBack()` → returns to calling view with no changes.

---

## QR Code Format

**IMPORTANT:** QR codes are stored as JSON objects, not plain ID strings.

`"id"` is the canonical key for all entity types. The entity type is determined
by parsing the ID prefix (FI-, SL-, etc.) — there is no separate key per entity type.

Label generator (`LABEL_CONFIG.buildQR`) encodes:
- Food instances: `{"id": "FI-00001"}`
- Storage locations: `{"id": "SL-00001"}`

`toggleQRCode` (inline QR in UI) encodes:
- `{"appID": "BTM-Inventory", "id": "FI-00001"}`

**`resolveScan` must parse JSON first, extract `envelope.id`, then call `parseID`.**
Fall back to treating raw text as a plain ID if JSON.parse fails (backward compat).
The JSON wrapper is intentional: it allows richer QR payloads in the future while
keeping the ID lookup logic unchanged.

**Note:** Food instance labels are in use in the field. Storage location labels have not
yet been printed, so `{"id": ...}` was established as the uniform format before any
storage labels were produced.

---

## Data Model

All data lives in named sheets in the user's Google Sheet.

| Sheet | Key field | Description |
|---|---|---|
| FoodInstances | InstanceID (FI-xxxxx) | Physical items or inventory containers |
| StorageLocations | StorageLocationID (SL-xxxxx) | Where items are stored |
| FoodInstanceEvents | EventID (EV-xxxxx) | ADD / REMOVE / INVENTORY events |
| Products | ProductID (PR-xxxxx) | Abstract product types |
| FoodBarcodes | BarcodeID (FB-xxxxx) | Barcode → Product mappings |
| Counters | Key / Value | Auto-increment counters per entity type |

**FoodInstance.Model**: `"unit"` (a single item) or `"inventory"` (a quantity-tracked container).
Inventory quantity is computed from events: find the most recent INVENTORY event as anchor,
then sum ADD/REMOVE events after it.

**Relationships:**
- FoodInstance →(optional FK)→ Product
- FoodInstance →(optional FK)→ StorageLocation
- FoodBarcode →(FK)→ Product
- FoodInstance →(1:N)→ FoodInstanceEvents

---

## Runtime Caches

All data is loaded once at startup into window globals and kept in sync manually after writes:

| Cache | Map |
|---|---|
| `window._foodInstanceCache` | array |
| `window._storageLocationCache` | array |
| `window._storageMap` | StorageLocationID → object |
| `window._foodInstanceEventCache` | array |
| `window._productCache` | array |
| `window._barcodeCache` | array |
| `foodInstanceEventMap` | InstanceID → events[] (state.js) |
| `productMap` | ProductID → product (state.js) |
| `barcodeMap` | BarcodeID → barcode (state.js) |
| `barcodeProductMap` | normalized barcode → ProductID (state.js) |

After any write, update the relevant cache + derived maps immediately so the UI reflects
changes without a reload.

---

## ID System

`getNextID(type)` calls `incrementCounter(type)` on the Counters sheet (always fetches
fresh to avoid race conditions), then formats: `PREFIX-NNNNN` (zero-padded to 5 digits).

ID_CONFIG (app.js):
```js
FoodInstance     → FI
StorageLocation  → SL
FoodInstanceEvent → EV
ProductionEvent  → PE
Product          → PR   (note: getNextID("Product") must match a Counters row key)
FoodBarcode      → FB   (same)
```

`parseID(value)` splits on `-`, looks up prefix in PREFIX_TO_ENTITY, returns
`{ entityType, id }` or null.

---

## Google Sheets API

All API calls use Bearer token auth (`accessToken` in api.js).
- **Read:** `GET /v4/spreadsheets/{id}/values/{range}` → `sheetFetch` / `sheetFetchRaw`
- **Append:** `POST .../values/{range}:append?valueInputOption=USER_ENTERED`
- **Update row:** `PUT .../values/{range}?valueInputOption=USER_ENTERED`

`updateFoodInstance` and `updateStorageLocation` re-fetch the sheet to find the row index
before writing. This is safe but slow — acceptable for current scale.

---

## Auth Model

Uses Google Identity Services (GIS) `initTokenClient` with implicit/token flow.
- Tries silent token first (`prompt: ""`); falls back to consent prompt.
- `accessToken` is an in-memory variable; expires after ~1 hour (GIS handles refresh on
  next operation if the page is still open, but a full reload re-auths cleanly).
- The OAuth client ID is public (embedded in source) — this is correct and expected for
  browser-only OAuth.
- Each user supplies their own Sheet ID. The app never touches any sheet except the one
  the user configured.
- Sharing the app with others: they authorize against their own Google account, use their
  own Sheet. The consent screen will show the developer's Google Cloud project name.

---

## Current Implementation Status

### Working
- Full CRUD for FoodInstances and StorageLocations
- FoodInstanceEvent creation (ADD / REMOVE / INVENTORY)
- Inventory quantity computation with INVENTORY event anchoring
- Product and FoodBarcode creation (API layer + product-item add form complete)
- Product creation flow: unknown UPC scan → product-item form → save creates Product + FoodBarcode + optionally assigns to FoodInstance
- QR scanner (html5-qrcode), UPC scanning
- Scan dispatch + action prompt system
- CONFIG-driven field rendering, entity selector, form validation
- Label PDF generation (jsPDF + QRCode.js), 2×4 10-up layout
- Filter bar (text, date range, storage scope), filter chips
- Select mode with drag-to-select, label printing from selection
- PWA manifest (installable)

### Missing / Stubbed (as of session 2026-05-28)
- `startTransfer(source, target)` — lower priority, stubbed
- Product-item edit/view mode (add mode works; view/edit of existing products deferred)
- Product-list view (no browse entry point exists yet)
- Navigation/tab UI redesign (see roadmap below)
- ProductionEvents + PreparedFood data model and UI (see roadmap below)

### Scanner UX — Debounce + Canvas Overlay

`onScanSuccess` fires every frame a code is in view (~10×/sec). Two enhancements:

1. **Barcode format support:** `Html5Qrcode` constructor takes `{ formatsToSupport: [...] }` using
   `Html5QrcodeSupportedFormats` enum. Include QR_CODE, UPC_A, UPC_E, EAN_13, EAN_8, CODE_128.

2. **Debounce:** Three scanner state variables track debounce: `_scanLastCode`, `_scanDebounceTimer`,
   `_scanCooldownUntil`. On first detection of a new code, show detected text in `#scanner-status`
   and start a 600ms timer. If the same code is still seen when the timer fires, call `handleScan`.
   After firing, impose a 2-second cooldown before the same code can fire again. Different code resets
   immediately.

3. **Canvas overlay:** A `<canvas id="scanner-overlay">` is absolutely positioned over `#qr-reader`.
   `drawScanHighlight(location, formatName)` draws a green polygon each frame using
   `decodedResult.result.location` corner points, scaled from camera resolution to display size via
   `video.clientWidth / video.videoWidth`. Canvas is cleared in `stopScanner()`.

4. **`stopScanner()`** clears `_scanDebounceTimer` and resets `_scanLastCode` / `_scanCooldownUntil`.

HTML: `#scanner-panel` wraps a `position:relative` container holding `#qr-reader` and the overlay
canvas, plus a `#scanner-status` text div below.

### Scanner Action Modes — Navigate vs. Repeat

The scanner panel covers the full interface. This drives the close/reopen model:

**`stopScanner()` is always called inside `routeScanActions` before any action fires** — whether
auto-executing a single safe action or routing to the action-prompt. The camera is never kept open
while the action-prompt is visible.

Each action object declares `scanMode: "navigate" | "repeat"` (all current actions are `"navigate"`).

- **Navigate mode**: camera closes, user lands in a new view. No special handling needed after close.
- **Repeat mode**: camera closes for any action-prompt, then the action's `execute()` function is
  responsible for reopening the scanner (via `startScanner()`) after setting up the session context.
  `handleActionSelection` does NOT reopen the camera — that is the execute function's responsibility.

`scanMode` is available as a signal for UI labeling (e.g. action-prompt could style repeat-mode
buttons differently) but it is NOT used as routing logic — the close is always unconditional.

### Repeat-Scan Sessions — Roadmap (not yet implemented)

Two repeat-scan session types are planned, both anchored to a storage location:

**`inventory-check`**: User scans each FoodInstance QR in a physical storage tub to verify contents.
Items in the storage location's cache are shown as a checklist. Scanning an item checks it off.
Items without QR labels can be tapped manually on the checklist.

**`assign-items`**: User scans multiple FoodInstance QR codes to assign them all to the current
storage location in bulk.

**Entry points (two paths):**

1. **Camera arrival** — scanning a storage location QR presents an action-prompt:
   `[ View Storage | Inventory Check | Assign Items ]`.
   "View Storage" is navigate mode. The other two are repeat mode and reopen the scanner after
   navigating to storage-item.

2. **Manual arrival** — buttons on the storage-item detail view launch the same sessions directly,
   opening the scanner in repeat mode without requiring an initial QR scan.

**Session state** (to be added to state.js when implemented):
```js
let repeatScanSession = null;
// active session shape:
// { type: "inventory-check"|"assign-items", storageLocationID, processedItems: Set }
```

While a session is active, `storage-item` renders a session UI overlay (checklist + Done button).
Ending the session clears `repeatScanSession` and stops the scanner.

### Navigation / Tab UI Redesign — Roadmap

Current nav uses plain buttons (Inventory / Storage / Events). Design goals:

1. **Visual tabs** — restyle the nav bar to look like real tabs (CSS: active tab elevated,
   border-bottom removed on active, matching background to content area).

2. **Unified list view with record-type selector** — rather than separate list views per entity
   type, a single list panel with a dropdown (or tab-within-tab) to switch between:
   Inventory | Storage | Products | Production Events
   The selected type drives which VIEW_CONFIG list renderer is used and which filters appear.
   Individual items are still navigated to via their own detail views.

3. **Items remain navigable from both list and from related items** — e.g. a FoodInstance can
   be reached from the inventory list or from a PreparedFood detail; a Product can be reached
   from product list or from a FoodInstance field.

This redesign should be done before adding ProductionEvents to avoid retrofitting nav twice.

---

### Product View/Edit — Roadmap

**What needs to be built:**
- `renderProductDetail` must respect `itemMode` (view/edit/add) using the same pattern as
  `renderFoodInstanceDetail` and `renderStorageDetail`.
- `saveProduct` needs an edit branch (currently only handles "add").
- `updateProduct(id, changes)` needs to be added to `api.js` (parallel to `updateFoodInstance`).
- A `"product-list"` entry in VIEW_CONFIG with text filter, navigates to `product-item`.

**Edit guardrails:**
When saving edits to a Product, count associated records before writing:
- `linkedInstances` = `_foodInstanceCache.filter(i => i.ProductID === id).length`
- `linkedBarcodes` = `_barcodeCache.filter(b => b.ProductID === id).length`

If either count > 0, show a confirm dialog:
`"[N] food items and [M] UPC codes are linked to this product. Save changes anyway?"`

User must confirm before the update proceeds.

---

### ProductionEvents — Data Model and Roadmap

**Motivation:** Track food processing steps (freeze-drying, home-canning, dehydrating, freezing)
that produce the stored FoodInstances. A single processing run (e.g. a freeze-dry cycle) may
process multiple food types simultaneously, and each food type may yield multiple packages.

**Three-level hierarchy:**

```
ProcessingEvent (one per batch run)
  └─ PreparedFood (one per food type in that batch)
       └─ FoodInstance (one per output package / container)
```

**`ProcessingEvents` sheet** — batch-level record:
| Field | Notes |
|---|---|
| EventID (PE-xxxxx) | primary key |
| EventType | freeze-dry \| home-can \| dehydrate \| freeze |
| Date | processing date |
| Description | short label for the run |
| Notes | free text |
| *Type-specific fields (sparse)* | see below |

Type-specific columns (unused cells left blank):
- **freeze-dry**: PreFreeze, FreezeTemp, FreezeTime, DryTemp, DryTime
- **home-can**: CanMethod (water-bath \| pressure), Pressure, ProcessTime
- **dehydrate**: DehydrateTemp, DehydrateTime
- **freeze**: FreezeTemp

**`PreparedFoods` sheet** — per-food-type record within a batch:
| Field | Notes |
|---|---|
| PreparedFoodID (PF-xxxxx) | primary key |
| ProcessingEventID | FK → ProcessingEvents |
| Description | food type name (e.g. "Blueberries") |
| PrepNotes | preparation details specific to this food |
| PrepMethod | optional (e.g. sliced, blanched) |

**FoodInstance** gains an optional `PreparedFoodID` FK field pointing to its PreparedFood record.
(Replaces any direct link to ProcessingEvent — instances link to PreparedFood, which links to
ProcessingEvent.)

**UX:** ProcessingEvent detail shows all PreparedFoods for that run; PreparedFood detail shows
all linked FoodInstances. From a FoodInstance, the PreparedFood and its parent ProcessingEvent
are navigable as related items.

**ID_CONFIG additions needed:**
```js
PreparedFood: "PF"
// ProcessingEvent already has ProductionEvent: "PE" — rename key to ProcessingEvent: "PE"
```

**New sheets needed:** ProcessingEvents, PreparedFoods
(FoodInstances sheet gains a PreparedFoodID column)

This feature should be built after the navigation redesign and product view/edit are complete.

---

### Known Tech Debt
- `updateFoodInstance` / `updateStorageLocation` re-fetch sheet on every save (could use
  cached row index)
- `goBack()` heuristic fallback is fragile
- Some prefix coupling outside the ID layer
- `renderFilterUI` references `config.filters?.label` but the key is just `config.label`
  (minor bug in filter label display)

---

## Development Notes

- **Multi-machine workflow:** Use git (main branch) to sync code. No local test server
  for OAuth — test via GitHub Pages deploy.
- **No build step:** Plain JS, no bundler. Edit files directly.
- **Testing:** Manual only currently.
- **CSS:** Single file `btm-inventory.css`. No framework.
- **Unicode characters in JS:** Always use `\uXXXX` escape sequences (or `\u{XXXXX}` for
  code points above U+FFFF) for non-ASCII characters in `.js` files. Literal Unicode
  characters in JS source are sensitive to how the local HTTP server declares charset in
  its response headers. Emoji and symbols that live directly in `index.html` are fine as
  literals since the `<meta charset="UTF-8">` declaration covers the HTML parser.

## AI-Assisted Development Workflow

Every change follows three explicit stages. Do not skip or combine stages.

**Stage 1 — Discussion**
Analyze the problem, propose approaches, debate tradeoffs. No files are modified.
This stage continues until the human confirms the plan.

**Stage 2 — Update CLAUDE.md**
Before touching any source code, update this file to reflect the agreed design decision,
new conventions, or roadmap changes. Trigger phrase: natural language confirmation such
as "go ahead", "implement", or "make the changes" moves us to Stage 2 first.
If CLAUDE.md looks wrong after writing it down, that's a signal to return to Stage 1.

**Stage 3 — Implementation**
Code changes, guided by what is now recorded in CLAUDE.md. One confirmation covers the
full agreed plan. However, if a change is large (touches multiple files non-trivially,
or produces a diff too large to review quickly in one pass), break it into layers and
pause for review between each layer before continuing.

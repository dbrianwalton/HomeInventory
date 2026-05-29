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
js/foodInstance.js       — item-food and list-food view logic, including the events list
                           and inventory quantity calculation from events.
js/storageLocation.js    — item-storage and list-storage view logic.
js/filters.js            — Filter bar rendering, chip rendering, filter event binding.
                           Reads VIEW_CONFIG from config.js; writes to inventoryFilter /
                           storageFilter in state.js.
js/render.js             — Generic view functions and utilities: renderDetailForm,
                           renderField, extractFields, entity selector, action prompt,
                           renderView dispatcher, nav tab UI, product list/item/scan
                           handlers, and other shared render helpers.
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
belong only in detail views (`item-food`, `item-storage`, `item-product`), not in list views.

| View | QR_FI | QR_SL | UPC resolved | UPC unresolved |
|---|---|---|---|---|
| `list-food` | Open Item | Open Storage Location | — | Create Product |
| `item-food` | Open Item / Transfer (if both inventory) | Assign to Location | Assign Product (if unassigned) | Create Product |
| `list-storage` | Open Item | Open Storage Location | — | — |
| `item-storage` | Open Item | — | — | — |
| `list-product` | — | — | — | — |
| `item-product` | Assign this product to FoodInstance (see below) | — | Link UPC to this product (see below) | Link UPC to this product (new barcode) |

**Scan from `item-product`:**

*QR_FI scan:*
- If `FoodInstance.ProductID` is empty: `confirm("Assign [ProductName] to [InstanceName]?")` → on confirm, `updateFoodInstance` + cache update. Stay on item-product.
- If `FoodInstance.ProductID === currentItem.ProductID`: toast "Already assigned."
- If `FoodInstance.ProductID` is a different product: `confirm("This item already has product [X]. Reassign to [this product]?")` → on confirm, `updateFoodInstance` + cache update.

*UPC scan (resolved — barcode already maps to a product):*
- If mapped to this product: toast "Already linked."
- If mapped to a different product: strong `confirm("Barcode [code] is already linked to [OtherProductName]. Reassign to [this product]?")` → on confirm, `updateFoodBarcode` + cache update.

*UPC scan (unresolved — no barcode record exists):*
- `confirm("Link barcode [code] to [ProductName]?")` → on confirm, `createFoodBarcode` + cache update. Stay on item-product.

### Product Creation Flow

Entry points: unknown UPC scan from `list-food` or `item-food`. Selector "+ Create" deferred.

`openCreateProduct(context)` is called while in `action-prompt` view. Because
`showActionPrompt` already called `pushView()` to save the calling view (item-food or
list-food) onto navStack, `openCreateProduct` does NOT call `pushView()` again — it
sets `currentView = "item-product"` directly. The context `{ source, barcode, currentItem }`
is stored in `currentItem._createContext` for `saveProduct()` to use.

**On save (`saveProduct()`):**
1. `createProduct()` — writes Product row, updates cache
2. If `context.barcode`: `createFoodBarcode()` — links barcode to new product
3. If `context.currentItem`: update server + cache + `updatePreviousViewItem` to set
   `ProductID` on the navStack snapshot, then `goBack()` + `renderView()` — returns to
   item-food with product already assigned
4. If no `currentItem`: `goBack()` + `renderView()` — returns to list-food

**Cancel:** `goBack()` → returns to calling view with no changes.

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

`updateFoodInstance`, `updateStorageLocation`, `updateProduct`, and `updateFoodBarcode`
all re-fetch their sheet to find the row index before writing. Safe but slow — acceptable
for current scale.

---

## Current Implementation Status

### Working
- Full CRUD for FoodInstances and StorageLocations
- FoodInstanceEvent creation (ADD / REMOVE / INVENTORY)
- Inventory quantity computation with INVENTORY event anchoring
- Full product CRUD: list view with computed counts, item view with view/edit/add modes,
  edit guardrails (inline warning + confirm), sub-tables (linked FoodInstances + Barcodes)
- Product creation flow: unknown UPC scan → item-product form → save creates Product +
  FoodBarcode + optionally assigns to FoodInstance
- Scan from item-product: QR_FI assigns/reassigns product to instance; UPC creates or
  reassigns barcode mapping
- Two-tab navigation UI: List tab (with entity-type selector) + Item tab (with × close)
- View naming convention: `list-{entity}` / `item-{entity}` throughout
- `showInventory()` / `showStorage()` / `showProducts()` as parallel top-level nav functions
- `goBack()` fallback dispatches to the correct show* function based on currentItem type
- QR scanner (html5-qrcode), UPC scanning
- Scan dispatch + action prompt system
- CONFIG-driven field rendering, entity selector, form validation
- Label PDF generation (jsPDF + QRCode.js), 2×4 10-up layout
- Filter bar (text, date range, storage scope), filter chips; product list has text filter
- Select mode with drag-to-select, label printing from selection
- PWA manifest (installable)

### Missing / Stubbed (as of session 2026-05-28)
- `startTransfer(source, target)` — lower priority, stubbed
- `list-event` / `item-event` — stub shown; awaits ProductionEvents implementation
- ProductionEvents + PreparedFood data model and UI (see roadmap below)

### Scanner UX — Debounce + Canvas Overlay

Details in a second file. Request if details needed.

---

### Navigation / Tab UI

**Status: complete (session 2026-05-28)**

#### View naming convention

All view keys use two-segment kebab: `{mode}-{entity}`.

```
list-food      list-storage   list-product   list-event (stub)
item-food      item-storage   item-product   item-event (stub)
```

#### Tab model

Two visual tabs in the nav bar:

1. **List tab** — always present. A `<select>` dropdown in the tab switches `currentListEntity`
   between `food | storage | product | event`, setting `currentView = "list-{entity}"` and
   calling `renderView()`. State variable: `currentListEntity` (state.js).

2. **Item tab** — visible only when `currentView` is `item-*`, `entity-select`, or
   `action-prompt`. Label shows the current item's ID + Label. An × button calls
   `closeItemTab()` which clears navStack and returns to the list.

#### Top-level navigation functions (parallel pattern)

```js
showInventory()   // sets currentListEntity="food",    currentView="list-food"
showStorage()     // sets currentListEntity="storage", currentView="list-storage"
showProducts()    // sets currentListEntity="product", currentView="list-product"
```

All three clear navStack and selection, set activeTab, and call `renderView()`.

`goBack()` fallback (empty navStack) dispatches to the correct show* based on `currentItem`:
- `InstanceID.startsWith("FI")` → `showInventory()`
- `StorageLocationID.startsWith("SL")` → `showStorage()`
- `ProductID.startsWith("PR")` → `showProducts()`
- default → `showInventory()`

---

### Product List and Item Views

**Status: complete (session 2026-05-28)**

#### `list-product` view

`renderProductList()` in `js/render.js`. Uses `renderTable` with computed columns
`_instanceCount` and `_barcodeCount` derived from caches at render time. Text filter
on Label/Brand via `productFilter` (state.js), wired into VIEW_CONFIG filters (same
pattern as food/storage). Clicking a row calls `showProduct(id)`.

#### `item-product` view

`renderProductDetail()` in `js/render.js` handles all three modes:
- **view**: read-only fields + sub-tables (Food Items / Barcodes toggle)
- **edit**: editable fields + inline warning banner if linked records exist +
  confirm dialog on save if linked counts > 0
- **add**: create new product, optionally link barcode + assign to FoodInstance

`saveProduct()` branches on `itemMode`: edit calls `updateProduct()` (api.js);
add calls `createProduct()` with the existing context flow.

`updateProduct()` and `updateFoodBarcode()` added to `api.js` (parallel to
`updateFoodInstance`/`updateStorageLocation`).

#### Scan from `item-product` (implemented)

- **QR_FI**: assign product to instance (confirm), or reassign with warn confirm
- **UPC resolved**: reassign barcode to this product (warn confirm)
- **UPC unresolved**: create new FoodBarcode record linking to this product

Handlers: `assignProductToInstance()`, `linkBarcodeToProduct()` in `js/render.js`.

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

Details are saved in a separate file. Request if needed.
---

### Known Tech Debt
- `updateFoodInstance` / `updateStorageLocation` / `updateProduct` / `updateFoodBarcode`
  all re-fetch sheet on every save (could use cached row index)
- Some prefix coupling outside the ID layer
- `renderFilterUI` references `config.filters?.label` but the key is just `config.label`
  (minor bug in filter label display)
- `activeTab` state variable is written but never read — vestigial from old nav design

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
Rather than editing files directly, describe the change location and provide the new code
block to insert or replace. The human applies the changes. If a change is large, break it
into layers and pause for review between each layer before continuing.

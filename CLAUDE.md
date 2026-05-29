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

`updateFoodInstance` and `updateStorageLocation` re-fetch the sheet to find the row index
before writing. This is safe but slow — acceptable for current scale.

---

## Current Implementation Status

### Working
- Full CRUD for FoodInstances and StorageLocations
- FoodInstanceEvent creation (ADD / REMOVE / INVENTORY)
- Inventory quantity computation with INVENTORY event anchoring
- Product and FoodBarcode creation (API layer + item-product add form complete)
- Product creation flow: unknown UPC scan → item-product form → save creates Product + FoodBarcode + optionally assigns to FoodInstance
- QR scanner (html5-qrcode), UPC scanning
- Scan dispatch + action prompt system
- CONFIG-driven field rendering, entity selector, form validation
- Label PDF generation (jsPDF + QRCode.js), 2×4 10-up layout
- Filter bar (text, date range, storage scope), filter chips
- Select mode with drag-to-select, label printing from selection
- PWA manifest (installable)

### Missing / Stubbed (as of session 2026-05-28)
- `startTransfer(source, target)` — lower priority, stubbed
- Product-item edit/view mode (add mode works; view/edit of existing products — in progress)
- Product-list view (in progress)
- Navigation/tab UI redesign (in progress — see below)
- ProductionEvents + PreparedFood data model and UI (see roadmap below)

### Scanner UX — Debounce + Canvas Overlay

Details in a second file. Request if details needed.

---

### Navigation / Tab UI Redesign

**Status: in progress (session 2026-05-28)**

#### View naming convention

All view keys use two-segment kebab: `{mode}-{entity}`.

```
list-food      list-storage   list-product   list-event
item-food      item-storage   item-product   item-event
```

Old names (`list-food`, `item-food`, `list-storage`, `item-storage`) are replaced
globally (VIEW_CONFIG keys, all push/set-currentView call sites, navStack references).

#### Tab model

Two visual tabs in the nav bar:

1. **List tab** — always present. Shows a unified list panel. An entity-type selector
   (segment control or dropdown) at the top switches between:
   `FoodInstance | StorageLocation | Product | ProductionEvent`
   Switching the selector updates `currentView` to the corresponding `list-*` key and
   re-renders the filter bar and table. The selector choice is persisted in a state
   variable (`currentListEntity`).

2. **Item tab** — appears only when an item is open (navStack depth ≥ 1 from a list view).
   Label shows entity type and a short identifier (e.g. "FI-00042" or "Oats"). An × button
   on the item tab calls `goBack()` all the way to the list (clears navStack to list depth).
   Sub-views (entity-select, action-prompt, item-product create flow) do NOT create a new
   tab — they render inside the item tab slot using the existing navStack push/pop pattern.

Clicking the List tab while an item is open: navigates back to the list (equivalent to ×
on item tab). The list restores to the same entity type and scroll position.

#### CSS approach

- Active tab: elevated appearance, border-bottom removed, background matches content area.
- Inactive tab: slightly recessed, muted color.
- Item tab only rendered when `navStack.length > 0` (or `currentView` is an `item-*` view).

---

### Product List and Item Views

**Status: in progress (session 2026-05-28)**

#### `list-product` view

Rendered by `renderProductList` (new function in `js/product.js` or `js/render.js`).
Uses `renderTable` with columns derived from all Product fields plus two computed columns
appended to each row object before the table call:

- `_instanceCount` — `_foodInstanceCache.filter(i => i.ProductID === row.ProductID).length`
- `_barcodeCount` — `_barcodeCache.filter(b => b.ProductID === row.ProductID).length`

Column headers: "Items", "Barcodes". Clicking a row navigates to `item-product`.

Filter: text filter on Name, Brand fields (same pattern as food/storage list filters).

#### `item-product` view

`renderProductDetail` respects `itemMode` (`view` / `edit` / `add`) using the same
pattern as `renderFoodInstanceDetail`:
- **view**: read-only field display + Edit button + two sub-tables (see below)
- **edit**: editable fields + Save/Cancel buttons + inline warning (see edit guardrails)
- **add**: existing behavior (create new product, optionally link barcode + food instance)

`saveProduct` gains an edit branch that calls `updateProduct(id, changes)` (new in api.js,
parallel to `updateFoodInstance`).

**Edit guardrails:**
- On entering edit mode: compute `linkedInstances` and `linkedBarcodes` counts.
  If either > 0, render an inline warning banner at top of form:
  `"Warning: [N] food items and [M] barcodes are linked to this product."`
- On Save: if either count > 0, `confirm("[N] food items and [M] UPC codes linked. Save changes?")`.
  Only proceed on confirm.

#### Sub-tables in view mode

Below the detail form, a two-tab toggle: `[Food Items (N)] [Barcodes (M)]`.
Only one sub-table visible at a time (CSS toggle, no re-render needed).

- **Food Items tab**: table of FoodInstances where `ProductID === currentItem.ProductID`.
  Columns: InstanceID, Name, StorageLocation, Quantity (if inventory model). Rows are
  tappable → `pushView()` + navigate to `item-food`.
- **Barcodes tab**: table of FoodBarcodes where `ProductID === currentItem.ProductID`.
  Columns: BarcodeID, Barcode (UPC), notes if any. Read-only display.

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

**Stage 3 — Implementation (Diffs)**
Rather than editing files directly, produce unified diffs (`diff -u` format) for the
human to review and apply. If a change is large, break it into layers (one diff per file
or logical unit) and pause for review between each layer before continuing.

Diff format rules:
- Use standard unified diff (`--- a/path`, `+++ b/path`, `@@ ... @@` hunks)
- Include enough context lines (≥3) for unambiguous application
- One diff block per file changed
- After all diffs for a layer are shown, wait for explicit approval before producing the next layer

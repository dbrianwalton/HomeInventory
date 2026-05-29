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

## QR Code Format

**IMPORTANT:** QR codes are stored as JSON objects, not plain ID strings.

`"id"` is the canonical key for all entity types. The entity type is determined
by parsing the ID prefix (FI-, SL-, etc.) — there is no separate key per entity type.

Label generator (`LABEL_CONFIG.buildQR`) encodes:
- Food instances: `{"id": "FI-00001"}`
- Storage locations: `{"id": "SL-00001"}`

**`resolveScan` must parse JSON first, extract `envelope.id`, then call `parseID`.**
Fall back to treating raw text as a plain ID if JSON.parse fails (backward compat).
The JSON wrapper is intentional: it allows richer QR payloads in the future while
keeping the ID lookup logic unchanged.

**Note:** Food instance labels are in use in the field. Storage location labels have not
yet been printed, so `{"id": ...}` was established as the uniform format before any
storage labels were produced.


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
   navigating to item-storage.

2. **Manual arrival** — buttons on the item-storage detail view launch the same sessions directly,
   opening the scanner in repeat mode without requiring an initial QR scan.

**Session state** (to be added to state.js when implemented):
```js
let repeatScanSession = null;
// active session shape:
// { type: "inventory-check"|"assign-items", storageLocationID, processedItems: Set }
```

While a session is active, `item-storage` renders a session UI overlay (checklist + Done button).
Ending the session clears `repeatScanSession` and stops the scanner.


/* ------- CONFIGS --------- */

const VIEW_CONFIG = {
  "list-food": {
    type: "list",
    render: renderFoodInstanceList,

    filters: {
      label: "Filter",
      placeholder: "Filter by description or keywords",

      getValue: () => inventoryFilter.text || "",
      setValue: (v) => { inventoryFilter.text = v; },
      onApply: renderFoodInstanceList,

      showFilterExtras: true,

      getDateFrom: () => inventoryFilter.dateFrom,
      getDateTo: () => inventoryFilter.dateTo,
      clearDate: () => {
        inventoryFilter.dateFrom = null;
        inventoryFilter.dateTo = null;
      },

      getStorageScope: () => inventoryFilter.storageScope || "ALL",
      setStorageScope: (v) => { inventoryFilter.storageScope = v; },
      onStorageChange: renderFoodInstanceList,      

      chips: [
        {
          getValue: () => inventoryFilter.text,
          label: (v) => v,
          onClear: () => {
            inventoryFilter.text = '';
            const input = document.getElementById("filterInput");
            if (input) input.value = '';

            renderFoodInstanceList();
            renderFilterChips();
          }
        },
        {
          getValue: () => {
            if (!inventoryFilter.dateFrom && !inventoryFilter.dateTo) return null;
            return {
              from: inventoryFilter.dateFrom,
              to: inventoryFilter.dateTo
            };
          },

          label: (v) => {
            const fmt = (ts) =>
              ts ? new Date(ts).toISOString().slice(0, 10) : "";

            if (v.from && v.to) {
              return `${fmt(v.from)} → ${fmt(v.to)}`;
            }

            if (v.from) {
              return `From ${fmt(v.from)}`;
            }

            if (v.to) {
              return `To ${fmt(v.to)}`;
            }

            return "Date filter";
          },

          onClear: () => {
            inventoryFilter.dateFrom = null;
            inventoryFilter.dateTo = null;

            clearDateInputs();
            applyFiltersAndRefresh();
          }
        },
        {
          getValue: () => {
            return inventoryFilter.storageScope === "UNASSIGNED"
              ? "UNASSIGNED"
              : null;
          },

          label: () => "Unassigned",
          onClear: clearStorageScope
        }
      ]
    },

    onScan: ({ scan }) => {
      // List view: navigation only. currentItem-dependent actions live in item-food.
      if (scan.type === "QR_FI") {
        return [
          {
            label: "Open Item",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => showFoodInstance(scan.id)
          }
        ];
      }

      if (scan.type === "QR_SL") {
        return [
          {
            label: "Open Storage Location",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => showStorageLocation(scan.id)
          }
        ];
      }

      if (scan.type === "UPC") {
        if (!scan.resolved) {
          return [
            {
              label: "Create Product",
              scanMode: "navigate",
              riskLevel: "safe",
              execute: () => openCreateProduct({ source: "scan", barcode: scan.code })
            }
          ];
        }
        // Known UPC from list view — no action defined yet
        return [];
      }

      return [];
    }
  },

  "list-storage": {
    type: "list",
    render: renderStorageList,

    filters: {
      label: "Filter",
      placeholder: "Filter storage",

      getValue: () => storageFilter.text || "",
      setValue: (v) => { storageFilter.text = v; },
      onApply: renderStorageList,

      showDate: false,

      chips: [
        {
          getValue: () => storageFilter.text,
          label: (v) => v,
          onClear: () => {
            clearTextFilter();
          }
        }
      ]
    },

    onScan: ({ scan }) => {
      if (scan.type === "QR_FI") {
        return [
          {
            label: "Open Item",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => showFoodInstance(scan.id)
          }
        ];
      }

      if (scan.type === "QR_SL") {
        return [
          {
            label: "Open Storage Location",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => showStorageLocation(scan.id)
          }
        ];
      }

      return [];
    }
  },

  "item-food": {
    type: "detail",
    render: renderFoodInstanceDetail,

    onScan: ({ currentItem, scan }) => {
      if (scan.type === "QR_SL") {
        return [
          {
            label: "Assign to Location",
            scanMode: "navigate",
            riskLevel: "warn",
            warningMessage: () => "Change storage location?",
            execute: () => assignLocation(currentItem, scan.id)
          }
        ];
      }

      if (scan.type === "QR_FI") {
        const scannedItem = scan.entity;
        return [
          {
            label: "Open Item",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => showFoodInstance(scan.id)
          },
          {
            label: "Transfer Inventory",
            scanMode: "navigate",
            condition: () =>
              currentItem?.Model === "inventory" &&
              scannedItem?.Model === "inventory",
            riskLevel: "warn",
            warningMessage: () => "Transfer inventory?",
            execute: () => startTransfer(currentItem, scannedItem)
          }
        ];
      }

      if (scan.type === "UPC") {
        if (scan.resolved) {
          return [
            {
              label: "Assign Product",
              scanMode: "navigate",
              condition: () => !currentItem.ProductID,
              riskLevel: "warn",
              warningMessage: () => "Assign this product?",
              execute: () => assignProduct(currentItem, scan.product)
            }
          ];
        }

        // Unknown UPC — offer to create a product and link the barcode
        return [
          {
            label: "Create Product",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => openCreateProduct({
              source: "scan",
              barcode: scan.code,
              currentItem
            })
          }
        ];
      }

      return [];
    }
  },

  "item-storage": {
    type: "detail",
    render: renderStorageDetail,

    onScan: ({ scan }) => {
      if (scan.type === "QR_FI") {
        return [
          {
            label: "Open Item",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => showFoodInstance(scan.id)
          }
        ];
      }

      return [];
    }
  },

  "item-product": {
    type: "detail",
    render: renderProductDetail
  },

  "list-product": {
    type: "list",
    render: renderProductList
  },

  "list-event": {
    type: "list",
    render: renderProductionEventList
  },

  "entity-select": {
    render: renderEntitySelector
  },

  "action-prompt": {
    render: renderActionPrompt
  }
};

const LABEL_CONFIG = {
  "list-food": {
    getItems: () =>
      window._foodInstanceCache.filter(i => selectedItems.has(i.InstanceID)),

    getId: (item) => item.InstanceID,
    getSupplemental: (item) => item.Date,

    buildQR: (item) => JSON.stringify({ id: item.InstanceID }),
    
    fields: [
      { key: "Label", bold: true, fontSize: 14, maxLines: 2 },

      { key: "Keywords", fontSize: 12, maxLines: 2 },
      { key: "Notes", fontSize: 12, maxLines: 2 },
      { key: "Size", fontSize: 12, maxLines: 1 }
    ]
  },

  "list-storage": {
    getItems: () =>
      window._storageLocationCache.filter(s => selectedItems.has(s.StorageLocationID)),

    getId: (item) => item.StorageLocationID,

    buildQR: (item) => JSON.stringify({ id: item.StorageLocationID }),

    fields: [
      { key: "Label", bold: true, fontSize: 14, maxLines: 2 },

      { key: "PhysicalLocation", fontSize: 12, maxLines: 2 },
      { key: "Notes", fontSize: 12, maxLines: 3 }
    ]
  }
};


const ENTITY_FIELDS = {
  "item-food": [
    { key: "Model", label: "Model",
      type: "select",
      options: ["unit", "inventory"],
      isEditable: (item) => {
        const events = getEventsForInstance(item.InstanceID);
        return !events || events.length === 0;
      }
    },
    {
      key: "Category", label: "Category",
      type: "select",
      options: ["freeze-dried","frozen","canned","home-canned","packaged","bulk"]
    },
    { key: "Label", label: "Label", type: "text" },
    {
      key: "ProductID",
      label: "Product",
      type: "entity-select",

      getOptions: () => window._productCache || [],
      getDisplay: (item, value) => {
        const p = productMap[value];
        return formatProductLabel(p);
      },
      getLabel: (entityItem) => formatProductLabel(entityItem),
      getId: (entityItem) => entityItem.ProductID,
      getSearchText: e => {
        return `${e.Label} ${e.Size || ""}`.toLowerCase();
      }
    },
    { key: "Keywords", label: "Keywords", type: "text" },
    { key: "Notes", label: "Notes", type: "text" },
    { key: "Size", label: "Size", type: "text" },
    { key: "Date", label: "Date", type: "text" },
    { key: "StorageLocationID", label: "Storage Location", type: "storage-select" }
  ],

  "item-storage": [
    { key: "Label", label: "Label", type: "text" },
    { key: "Notes", label: "Notes", type: "text" },
    { key: "PhysicalLocation", label: "Physical Location", type: "text" }
  ],

  "item-product": [
    { key: "Label", label: "Label", type: "text" },
    { key: "Size",  label: "Size",  type: "text" }
  ]
};

const DETAIL_ACTIONS = {
  view: [
    { action: "edit", label: "Edit" },
    { action: "close", label: "Close" }
  ],
  edit: [
    { action: "save", label: "Save" },
    { action: "cancel", label: "Cancel" }
  ],

  add: [
    { action: "save-close", label: "Save & Close" },
    { action: "save-add", label: "Save & Add New" },
    { action: "cancel", label: "Cancel" }
  ]
};


const FIELD_TYPES = {
  InstanceID: "fk",
  StorageLocationID: "fk",
  EventID: "fk",
  ReplaceEventID: "fk",
  Date: "optional",
  Quantity: "number",
  Active: "boolean",
  Timestamp: "system"
};


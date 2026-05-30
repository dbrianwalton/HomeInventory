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
      if (scan.type === "QR_FI") {
        const entity = scan.entity;
        if (!entity) return [];

        if (entity.Model === "inventory") {
          return [
            {
              label: "Add",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); openEventModal("ADD"); }
            },
            {
              label: "Remove",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); openEventModal("REMOVE"); }
            },
            {
              label: "Inventory Count",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); openEventModal("INVENTORY"); }
            },
            {
              label: "Mark Removed",
              riskLevel: "warn",
              warningMessage: () => `Mark ${entity.Label || scan.id} as Removed?`,
              execute: async () => {
                await markFoodInstanceStatus(scan.id, "Removed");
                goBack();
                renderView();
              }
            },
            {
              label: "View",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); }
            },
            {
              label: "Edit",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); enterEditMode(); }
            }
          ];
        }

        // unit item
        return [
          {
            label: "Mark Consumed",
            riskLevel: "warn",
            warningMessage: () => `Mark ${entity.Label || scan.id} as Consumed?`,
            execute: async () => {
              await markFoodInstanceStatus(scan.id, "Consumed");
              goBack();
              renderView();
            }
          },
          {
            label: "Mark Discarded",
            riskLevel: "warn",
            warningMessage: () => `Mark ${entity.Label || scan.id} as Discarded?`,
            execute: async () => {
              await markFoodInstanceStatus(scan.id, "Discarded");
              goBack();
              renderView();
            }
          },
          {
            label: "Mark Removed",
            riskLevel: "warn",
            warningMessage: () => `Mark ${entity.Label || scan.id} as Removed?`,
            execute: async () => {
              await markFoodInstanceStatus(scan.id, "Removed");
              goBack();
              renderView();
            }
          },
          {
            label: "View",
            riskLevel: "safe",
            execute: () => { goBack(); showFoodInstance(scan.id); }
          },
          {
            label: "Edit",
            riskLevel: "safe",
            execute: () => { goBack(); showFoodInstance(scan.id); enterEditMode(); }
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
        if (scan.resolved) {
          return [
            {
              label: "Go to Item",
              scanMode: "navigate",
              riskLevel: "safe",
              execute: () => routeUPCToFoodInstance(scan.product)
            }
          ];
        }
        return [
          {
            label: "Select Product",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => { goBack(); openProductSelector(); }
          },
          {
            label: "Create Product",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => openCreateProduct({ source: "scan", barcode: scan.code })
          }
        ];
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
        const entity = scan.entity;
        if (!entity) return [];

        if (entity.Model === "inventory") {
          return [
            {
              label: "Add",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); openEventModal("ADD"); }
            },
            {
              label: "Remove",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); openEventModal("REMOVE"); }
            },
            {
              label: "Inventory Count",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); openEventModal("INVENTORY"); }
            },
            {
              label: "Mark Removed",
              riskLevel: "warn",
              warningMessage: () => `Mark ${entity.Label || scan.id} as Removed?`,
              execute: async () => {
                await markFoodInstanceStatus(scan.id, "Removed");
                goBack();
                renderView();
              }
            },
            {
              label: "View",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); }
            },
            {
              label: "Edit",
              riskLevel: "safe",
              execute: () => { goBack(); showFoodInstance(scan.id); enterEditMode(); }
            }
          ];
        }

        // unit item
        return [
          {
            label: "Mark Consumed",
            riskLevel: "warn",
            warningMessage: () => `Mark ${entity.Label || scan.id} as Consumed?`,
            execute: async () => {
              await markFoodInstanceStatus(scan.id, "Consumed");
              goBack();
              renderView();
            }
          },
          {
            label: "Mark Discarded",
            riskLevel: "warn",
            warningMessage: () => `Mark ${entity.Label || scan.id} as Discarded?`,
            execute: async () => {
              await markFoodInstanceStatus(scan.id, "Discarded");
              goBack();
              renderView();
            }
          },
          {
            label: "Mark Removed",
            riskLevel: "warn",
            warningMessage: () => `Mark ${entity.Label || scan.id} as Removed?`,
            execute: async () => {
              await markFoodInstanceStatus(scan.id, "Removed");
              goBack();
              renderView();
            }
          },
          {
            label: "View",
            riskLevel: "safe",
            execute: () => { goBack(); showFoodInstance(scan.id); }
          },
          {
            label: "Edit",
            riskLevel: "safe",
            execute: () => { goBack(); showFoodInstance(scan.id); enterEditMode(); }
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
        if (scan.resolved) {
          return [
            {
              label: "Go to Item",
              scanMode: "navigate",
              riskLevel: "safe",
              execute: () => routeUPCToFoodInstance(scan.product)
            }
          ];
        }
        return [
          {
            label: "Select Product",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => { goBack(); openProductSelector(); }
          },
          {
            label: "Create Product",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => openCreateProduct({ source: "scan", barcode: scan.code })
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

        // Unknown UPC — offer to select or create a product
        return [
          {
            label: "Select Product",
            scanMode: "navigate",
            riskLevel: "safe",
            execute: () => openProductSelector()
          },
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
    render: renderProductDetail,

    onScan: ({ currentItem, scan }) => {
      if (scan.type === "QR_FI") {
        const instance = scan.entity;
        if (!instance) return [];
        return [
          {
            label: instance.ProductID
              ? (instance.ProductID === currentItem.ProductID
                  ? "Already assigned to this product"
                  : `Reassign from ${productMap[instance.ProductID]?.Label || instance.ProductID}`)
              : `Assign ${currentItem.Label} to ${instance.Label || instance.InstanceID}`,
            riskLevel: instance.ProductID && instance.ProductID !== currentItem.ProductID ? "warn" : "safe",
            condition: () => instance.ProductID !== currentItem.ProductID,
            warningMessage: () =>
              `This item already has product "${productMap[instance.ProductID]?.Label || instance.ProductID}". Reassign to "${currentItem.Label}"?`,
            execute: () => assignProductToInstance(instance, currentItem)
          }
        ];
      }

      if (scan.type === "UPC") {
        return [
          {
            label: scan.resolved
              ? (scan.product?.ProductID === currentItem.ProductID
                  ? "Barcode already linked to this product"
                  : `Reassign barcode from "${scan.product?.Label || ''}"`)
              : `Link barcode ${scan.code} to ${currentItem.Label}`,
            riskLevel: scan.resolved && scan.product?.ProductID !== currentItem.ProductID ? "warn" : "safe",
            condition: () => !(scan.resolved && scan.product?.ProductID === currentItem.ProductID),
            warningMessage: () =>
              `Barcode ${scan.code} is already linked to "${scan.product?.Label}". Reassign to "${currentItem.Label}"?`,
            execute: () => linkBarcodeToProduct(scan, currentItem)
          }
        ];
      }

      return [];
    }
  },

  "list-product": {
    type: "list",
    render: renderProductList,
    filters: {
      label: "Filter",
      placeholder: "Filter by name or brand",
      getValue: () => productFilter.text || "",
      setValue: (v) => { productFilter.text = v; },
      onApply: renderProductList,
      chips: [
        {
          getValue: () => productFilter.text,
          label: (v) => v,
          onClear: () => {
            productFilter.text = '';
            const input = document.getElementById("filterInput");
            if (input) input.value = '';
            renderProductList();
            renderFilterChips();
          }
        }
      ]
    }
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
    {
      key: "Status",
      label: "Status",
      type: "select",
      options: (item) => item.Model === "inventory"
        ? ["", "Removed"]
        : ["", "Consumed", "Discarded", "Removed"],
      displayValue: (value) => value || "Active"
    },
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


/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/
import { GoodsReceipt, GoodsReceiptItem, PurchaseOrder, Supplier, SupplierReturn, SupplierReturnItem, SupplierActivityLog } from "../models/index.js";

const INVENTORY_API_BASE = process.env.INVENTORY_API_URL || "http://localhost:3001";
const REQUEST_TIMEOUT_MS = 3000;

// Standard fallback restaurant catalog when peer Inventory service is offline
const FALLBACK_INVENTORY_CATALOG = [
  { id: 1, name: "Premium Ground Beef Patty (150g)", sku: "INV-BEEF-001", unit: "kg", category: "Meat & Poultry", minStock: 20, currentStock: 45 },
  { id: 2, name: "Brioche Burger Buns", sku: "INV-BUN-002", unit: "pcs", category: "Bakery", minStock: 100, currentStock: 320 },
  { id: 3, name: "Cheddar Cheese Slices", sku: "INV-CHSE-003", unit: "packs", category: "Dairy", minStock: 15, currentStock: 30 },
  { id: 4, name: "Fresh Romaine Lettuce", sku: "INV-VEG-004", unit: "kg", category: "Produce", minStock: 10, currentStock: 25 },
  { id: 5, name: "Cooking Oil 20L Drum", sku: "INV-OIL-005", unit: "drums", category: "Pantry", minStock: 5, currentStock: 2 }, // Low stock!
  { id: 6, name: "French Fry Cut Potatoes", sku: "INV-POT-006", unit: "kg", category: "Frozen", minStock: 50, currentStock: 140 },
  { id: 7, name: "Signature BBQ Sauce 5L", sku: "INV-SAU-007", unit: "bottles", category: "Condiments", minStock: 6, currentStock: 4 }, // Low stock!
  { id: 8, name: "Food Grade Takeout Boxes", sku: "INV-PKG-008", unit: "boxes", category: "Packaging", minStock: 200, currentStock: 500 }
];

export const inventoryService = {
  /**
   * 1. Access official product catalog from Inventory System.
   * Gracefully falls back to restaurant standard catalog if Inventory API is offline.
   */
  fetchMasterCatalog: async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(`${INVENTORY_API_BASE}/api/v1/inventory/products`, {
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return { source: "inventory_live_api", products: data.products || data.data || [] };
      }
    } catch (err) {
      // Peer service offline or timed out
    }

    return {
      source: "cached_fallback",
      message: "Inventory API offline; serving localized restaurant catalog cache.",
      products: FALLBACK_INVENTORY_CATALOG
    };
  },

  /**
   * 2. Send accepted delivered products to Inventory for stock-in.
   * RULE: Only accepted quantity qualifies (Delivered - Damaged = Accepted). Damaged goods NEVER enter usable stock.
   */
  syncStockIn: async (goodsReceiptId) => {
    try {
      const receipt = await GoodsReceipt.findByPk(goodsReceiptId, {
        include: [
          { model: GoodsReceiptItem, as: "Items" },
          { model: PurchaseOrder, as: "PurchaseOrder", include: [{ model: Supplier, as: "Supplier" }] }
        ]
      });

      if (!receipt) {
        throw new Error(`Goods receipt #${goodsReceiptId} not found.`);
      }

      // Filter only accepted stock-in items
      const stockInItems = (receipt.Items || []).map(item => ({
        goodsReceiptItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        deliveredQuantity: parseFloat(item.deliveredQuantity || 0),
        damagedQuantity: parseFloat(item.damagedQuantity || 0),
        acceptedQuantity: parseFloat(item.acceptedQuantity || (item.deliveredQuantity - item.damagedQuantity)),
        batchLot: item.batchLotNumber || null,
        expiryDate: item.expiryDate || null
      })).filter(i => i.acceptedQuantity > 0);

      const payload = {
        receiptNumber: receipt.receiptNumber,
        purchaseOrderNumber: receipt.PurchaseOrder?.poNumber || null,
        supplierName: receipt.PurchaseOrder?.Supplier?.name || "Unknown Vendor",
        receivedAt: receipt.receivedDate,
        receiverNotes: receipt.notes,
        items: stockInItems
      };

      let syncSuccessful = false;
      let externalSyncRef = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(`${INVENTORY_API_BASE}/api/v1/inventory/stock-in`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const resData = await response.json();
          syncSuccessful = true;
          externalSyncRef = resData.stockInReference || `INV-STK-${Date.now()}`;
        }
      } catch (networkErr) {
        // Inventory system not reachable
        console.warn(`[InventoryService] Peer Inventory API not reachable: ${networkErr.message}. Queuing stock-in sync.`);
      }

      if (syncSuccessful) {
        await receipt.update({ inventorySyncStatus: "Synced" });
      } else {
        // Fallback: Marked as Pending sync
        await receipt.update({ inventorySyncStatus: "Pending" });
      }

      // Audit Log
      await SupplierActivityLog.create({
        module: "InventorySync",
        action: syncSuccessful ? "SyncSuccess" : "SyncQueued",
        entityId: receipt.id,
        details: {
          receiptNumber: receipt.receiptNumber,
          itemsCount: stockInItems.length,
          externalSyncRef: externalSyncRef || "Queued offline",
          syncStatus: syncSuccessful ? "Synced" : "Pending"
        }
      }).catch(() => {});

      return {
        success: true,
        synced: syncSuccessful,
        status: syncSuccessful ? "Synced" : "Pending",
        stockInReference: externalSyncRef,
        itemsCount: stockInItems.length
      };
    } catch (error) {
      console.error("[InventoryService] Error syncing stock-in:", error);
      await GoodsReceipt.update(
        { inventorySyncStatus: "Failed" },
        { where: { id: goodsReceiptId } }
      ).catch(() => {});
      return { success: false, error: error.message };
    }
  },

  /**
   * 3. Send return-to-supplier adjustment to Inventory (deduct unusable or returned stock).
   */
  syncReturnStockAdjustment: async (supplierReturnId) => {
    try {
      const ret = await SupplierReturn.findByPk(supplierReturnId, {
        include: [
          { model: SupplierReturnItem, as: "Items" },
          { model: Supplier, as: "Supplier" }
        ]
      });

      if (!ret) throw new Error("Supplier return record not found.");

      const payload = {
        returnNumber: ret.returnNumber,
        supplierName: ret.Supplier?.name || "Unknown Supplier",
        reason: ret.reason,
        items: (ret.Items || []).map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantityReturned: parseFloat(item.quantity || 0),
          unit: item.unit
        }))
      };

      let syncSuccessful = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(`${INVENTORY_API_BASE}/api/v1/inventory/stock-adjust`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) syncSuccessful = true;
      } catch (e) {
        // Peer offline
      }

      await SupplierActivityLog.create({
        module: "InventoryReturnSync",
        action: syncSuccessful ? "ReturnAdjusted" : "ReturnAdjustQueued",
        entityId: ret.id,
        details: { returnNumber: ret.returnNumber, syncSuccessful }
      }).catch(() => {});

      return { success: true, synced: syncSuccessful };
    } catch (error) {
      console.error("[InventoryService] Error syncing return deduction:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 4. Fetch low-stock alerts from Inventory System.
   */
  fetchLowStockAlerts: async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(`${INVENTORY_API_BASE}/api/v1/inventory/low-stock-alerts`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        return { success: true, alerts: data.alerts || data.data || [] };
      }
    } catch (e) {
      // Offline fallback
    }

    // Default simulation for restaurant pantry items that need restocking
    const simulatedAlerts = FALLBACK_INVENTORY_CATALOG
      .filter(item => item.currentStock <= item.minStock)
      .map(item => ({
        productId: item.id,
        productName: item.name,
        category: item.category,
        currentStock: item.currentStock,
        minStock: item.minStock,
        unit: item.unit,
        severity: item.currentStock === 0 ? "Critical" : "Warning"
      }));

    return { success: true, source: "simulated_cache", alerts: simulatedAlerts };
  }
};
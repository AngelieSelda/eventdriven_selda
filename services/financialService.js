/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/
import { SupplierInvoice, Supplier, PurchaseOrder, SupplierReturn, SupplierActivityLog } from "../models/index.js";

const FINANCIAL_API_BASE = process.env.FINANCIAL_API_URL || "http://localhost:3002";
const REQUEST_TIMEOUT_MS = 3000;

export const financialService = {
  /**
   * 1. Send supplier invoice payable voucher to Financial System.
   * Creates an official Accounts Payable record in DJYum Financial.
   */
  dispatchPayable: async (supplierInvoiceId) => {
    try {
      const invoice = await SupplierInvoice.findByPk(supplierInvoiceId, {
        include: [
          { model: Supplier, as: "Supplier" },
          { model: PurchaseOrder, as: "PurchaseOrder" }
        ]
      });

      if (!invoice) throw new Error(`Supplier invoice #${supplierInvoiceId} not found.`);

      const payload = {
        sourceSystem: "SupplierManagementSystem",
        supplierInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.Supplier?.name || "Unknown Vendor",
        supplierCode: invoice.Supplier?.supplierCode || null,
        purchaseOrderNumber: invoice.PurchaseOrder?.poNumber || null,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: parseFloat(invoice.invoiceTotal || 0),
        currency: "PHP",
        paymentTerms: invoice.Supplier?.paymentTerms || "Net 30"
      };

      let syncSuccess = false;
      let financialReference = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const res = await fetch(`${FINANCIAL_API_BASE}/api/v1/financial/purchase-payables`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const resData = await res.json();
          syncSuccess = true;
          financialReference = resData.voucherNumber || resData.reference || `FIN-AP-${Date.now()}`;
        }
      } catch (e) {
        console.warn(`[FinancialService] Financial API offline: ${e.message}. Queuing payable sync.`);
      }

      const syncStatus = syncSuccess ? "Synced" : "Pending";
      const referenceToSave = financialReference || `QUEUED-AP-${Date.now()}`;

      await invoice.update({
        financialSyncStatus: syncStatus,
        financialReference: referenceToSave
      });

      await SupplierActivityLog.create({
        module: "FinancialSync",
        action: syncSuccess ? "PayableDispatched" : "PayableQueued",
        entityId: invoice.id,
        details: {
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.invoiceTotal,
          reference: referenceToSave,
          syncStatus
        }
      }).catch(() => {});

      return {
        success: true,
        synced: syncSuccess,
        status: syncStatus,
        financialReference: referenceToSave
      };
    } catch (error) {
      console.error("[FinancialService] Error dispatching payable:", error);
      await SupplierInvoice.update(
        { financialSyncStatus: "Failed" },
        { where: { id: supplierInvoiceId } }
      ).catch(() => {});
      return { success: false, error: error.message };
    }
  },

  /**
   * 2. Receive payment status webhook from Financial Management System.
   * CRITICAL ARCHITECTURAL RULE:
   * The Supplier System must NEVER independently mark invoices paid.
   * Payment transactions and verifications are strictly mastered by the Financial System.
   */
  processPaymentWebhook: async (webhookData) => {
    try {
      const { 
        invoiceNumber, 
        amountPaid, 
        paymentDate, 
        paymentMethod, 
        referenceNumber, 
        notes 
      } = webhookData;

      if (!invoiceNumber || amountPaid === undefined) {
        return { success: false, message: "Missing invoiceNumber or amountPaid in payment confirmation payload." };
      }

      const invoice = await SupplierInvoice.findOne({
        where: { invoiceNumber: invoiceNumber.trim() },
        include: [{ model: Supplier, as: "Supplier" }]
      });

      if (!invoice) {
        return { success: false, message: `Invoice #${invoiceNumber} not found in Supplier System.` };
      }

      const invoiceTotal = parseFloat(invoice.invoiceTotal || 0);
      const newAmountPaid = parseFloat(amountPaid || 0);
      const outstandingBalance = Math.max(0, invoiceTotal - newAmountPaid);

      let newPaymentStatus = "Pending";
      if (outstandingBalance <= 0.009) {
        newPaymentStatus = "Paid";
      } else if (newAmountPaid > 0) {
        newPaymentStatus = "Partially Paid";
      }

      await invoice.update({
        amountPaid: newAmountPaid,
        outstandingBalance: outstandingBalance,
        paymentStatus: newPaymentStatus,
        financialSyncStatus: "Synced",
        financialReference: referenceNumber || invoice.financialReference
      });

      // Audit log the incoming financial confirmation
      await SupplierActivityLog.create({
        module: "PaymentSync",
        action: "PaymentConfirmed",
        entityId: invoice.id,
        details: {
          invoiceNumber: invoice.invoiceNumber,
          amountPaid: newAmountPaid,
          outstandingBalance,
          paymentStatus: newPaymentStatus,
          paymentMethod: paymentMethod || "Bank Transfer",
          financialRef: referenceNumber,
          paymentDate: paymentDate || new Date()
        }
      }).catch(() => {});

      return {
        success: true,
        message: `Payment update confirmed for Invoice ${invoiceNumber}. Status updated to ${newPaymentStatus}.`,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountPaid: newAmountPaid,
          outstandingBalance,
          paymentStatus: newPaymentStatus
        }
      };
    } catch (error) {
      console.error("[FinancialService] Error processing payment webhook:", error);
      return { success: false, message: error.message };
    }
  },

  /**
   * 3. Send Credit Memo to Financial System for accepted return-to-supplier items.
   */
  dispatchCreditMemo: async (supplierReturnId) => {
    try {
      const ret = await SupplierReturn.findByPk(supplierReturnId, {
        include: [{ model: Supplier, as: "Supplier" }]
      });

      if (!ret) throw new Error("Supplier return not found.");

      const payload = {
        returnNumber: ret.returnNumber,
        supplierName: ret.Supplier?.name,
        refundAmount: parseFloat(ret.refundAmount || 0),
        resolutionType: ret.resolutionType,
        reason: ret.reason
      };

      let success = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(`${FINANCIAL_API_BASE}/api/v1/financial/credit-memos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) success = true;
      } catch (e) {
        // Peer offline
      }

      await SupplierActivityLog.create({
        module: "CreditMemoSync",
        action: success ? "Dispatched" : "Queued",
        entityId: ret.id,
        details: { returnNumber: ret.returnNumber, refundAmount: ret.refundAmount, success }
      }).catch(() => {});

      return { success: true, dispatched: success };
    } catch (error) {
      console.error("[FinancialService] Error dispatching credit memo:", error);
      return { success: false, error: error.message };
    }
  }
};
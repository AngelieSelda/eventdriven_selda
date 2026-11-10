/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/
import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';

export const SupplierReturn = sequelize.define('SupplierReturn', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  returnNumber: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true
  },
  supplierId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  purchaseOrderId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  goodsReceiptId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  returnDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  returnReason: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('Pending', 'Approved', 'Returned to Supplier', 'Replaced', 'Refunded', 'Rejected'),
    allowNull: false,
    defaultValue: 'Pending'
  },
  inventoryAdjustmentStatus: {
    type: DataTypes.ENUM('Not Needed', 'Pending', 'Synced', 'Failed'),
    allowNull: false,
    defaultValue: 'Not Needed'
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  paranoid: true,
  tableName: 'supplier_returns'
});

export { sequelize };

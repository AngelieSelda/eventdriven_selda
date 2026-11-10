/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/
import { Sequelize } from "sequelize";
import bcrypt from "bcrypt";
import {
  sequelize,
  User,
  Supplier,
  Department,
  SupplierProduct,
  PurchaseRequest,
  PurchaseRequestItem,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  SupplierReturn,
  SupplierReturnItem,
  SupplierInvoice,
  SupplierActivityLog
} from "./models/index.js";

const dbName = process.env.DB_NAME || 'Supplier';
const dbUser = process.env.DB_USER || 'root';
const dbPass = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 3306;

console.log("🚀 Starting Safe Database Migration for DJYUM Supplier System...");

try {
  // 1. Ensure database exists
  const rootSequelize = new Sequelize(`mysql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/`, {
    logging: false
  });
  await rootSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await rootSequelize.close();
  console.log(`✅ Database '${dbName}' verified / created.`);

  // 2. Connect to the application database
  await sequelize.authenticate();
  console.log("✅ Authenticated with MySQL database!");

  // 3. Safe Schema Sync (alter: true creates new tables/columns without dropping existing data)
  await sequelize.sync({ alter: true });
  console.log("✅ All 13 models synchronized successfully (alter: true, non-destructive)!");

  // 4. Data Backfill & Seeding

  // A. Seed Default Admin User if no users exist
  const userCount = await User.count();
  if (userCount === 0) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await User.create({
      name: "DJ's System Administrator",
      email: "admin@gmail.com",
      password: hashedPassword,
      role: "admin"
    });
    console.log("🌱 Default admin created: admin@gmail.com / admin123");
  }

  // B. Seed Standard Restaurant Departments if none exist
  const deptCount = await Department.count();
  if (deptCount === 0) {
    await Department.bulkCreate([
      { code: "KIT", name: "Kitchen", departmentHead: "Executive Chef Marco", description: "Food preparation & recipe inventory requisitions", status: "Active" },
      { code: "PUR", name: "Purchasing", departmentHead: "Purchasing Officer Sarah", description: "Supplier procurement, purchase orders & vendor relations", status: "Active" },
      { code: "INV", name: "Inventory", departmentHead: "Warehouse Manager Alex", description: "Stock-in receiving, quality inspection & storeroom storage", status: "Active" },
      { code: "FIN", name: "Finance", departmentHead: "Finance Head Elena", description: "Payables disbursement, invoice auditing & accounting", status: "Active" },
      { code: "ADM", name: "Administration", departmentHead: "General Manager David", description: "Executive administration & management approvals", status: "Active" }
    ]);
    console.log("🌱 Standard restaurant departments seeded (Kitchen, Purchasing, Inventory, Finance, Administration).");
  }

  // C. Backfill supplier codes for existing suppliers missing a code
  const suppliers = await Supplier.findAll({ where: { supplierCode: null }, paranoid: false });
  for (let i = 0; i < suppliers.length; i++) {
    const code = `SUP-${String(i + 1).padStart(4, '0')}`;
    await suppliers[i].update({ supplierCode: code });
  }
  if (suppliers.length > 0) {
    console.log(`🔄 Backfilled supplier codes for ${suppliers.length} existing supplier(s).`);
  }

  // D. Seed default Suppliers if none exist
  const supplierCount = await Supplier.count();
  if (supplierCount === 0) {
    const s1 = await Supplier.create({
      supplierCode: "SUP-0001",
      name: "Fresh Harvest Farms Co.",
      contactPerson: "Mang Juan Dela Cruz",
      phone: "+63 917 123 4567",
      email: "orders@freshharvest.ph",
      address: "Brgy. San Jose, Calapan City, Oriental Mindoro",
      paymentTerms: "Net 15",
      description: "Primary farm-to-table vegetable, root crop, and spice supplier.",
      status: "Active"
    });

    const s2 = await Supplier.create({
      supplierCode: "SUP-0002",
      name: "Metro Meat & Poultry Supply",
      contactPerson: "Carlos Santos",
      phone: "+63 920 987 6543",
      email: "carlos@metromeat.com",
      address: "Tandang Sora, Quezon City, Metro Manila",
      paymentTerms: "Net 30",
      description: "HACCP-certified pork, beef, and whole chicken cuts.",
      status: "Active"
    });

    const s3 = await Supplier.create({
      supplierCode: "SUP-0003",
      name: "Ocean Bounty Seafoods",
      contactPerson: "Elena Reyes",
      phone: "+63 918 555 1234",
      email: "elena@oceanbounty.ph",
      address: "Navotas Fish Port Complex, Navotas City",
      paymentTerms: "COD",
      description: "Fresh daily catch: black tiger prawns, bangus, and squid.",
      status: "Active"
    });

    // Seed Supplier Products
    await SupplierProduct.bulkCreate([
      { supplierId: s1.id, productId: 101, productName: "Yellow Onions", supplierPrice: 120.00, minOrderQty: 10.00, unit: "kg", availability: true, isPrimarySupplier: true },
      { supplierId: s1.id, productId: 102, productName: "Garlic Bulbs", supplierPrice: 160.00, minOrderQty: 5.00, unit: "kg", availability: true, isPrimarySupplier: true },
      { supplierId: s1.id, productId: 103, productName: "Ripe Tomatoes", supplierPrice: 85.00, minOrderQty: 10.00, unit: "kg", availability: true, isPrimarySupplier: true },
      { supplierId: s2.id, productId: 104, productName: "Ground Pork (70/30)", supplierPrice: 280.00, minOrderQty: 10.00, unit: "kg", availability: true, isPrimarySupplier: true },
      { supplierId: s2.id, productId: 105, productName: "Beef Brisket Cuts", supplierPrice: 420.00, minOrderQty: 5.00, unit: "kg", availability: true, isPrimarySupplier: true },
      { supplierId: s3.id, productId: 106, productName: "Fresh Tiger Prawns", supplierPrice: 650.00, minOrderQty: 3.00, unit: "kg", availability: true, isPrimarySupplier: true }
    ]);
    console.log("🌱 Seeded initial suppliers and supplier product catalog offerings.");
  }

  console.log("\n========================================================");
  console.log("🎉 SAFE MIGRATION & SEEDING COMPLETED SUCCESSFULLY!");
  console.log("========================================================");

} catch (error) {
  console.error("❌ Migration encountered an error:", error);
} finally {
  process.exit(0);
}

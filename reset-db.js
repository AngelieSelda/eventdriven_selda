/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/
import bcrypt from "bcrypt";
import { sequelize, User, Department } from "./models/index.js";

console.log("===============================================================");
console.log("🧹 RESETTING & CLEARING DATABASE FOR DJYUM SUPPLIER SYSTEM");
console.log("===============================================================\n");

try {
  await sequelize.authenticate();
  console.log("✅ Connected to MySQL database.\n");

  // 1. Temporarily disable foreign key checks for clean truncation
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 0;");

  const tablesToTruncate = [
    "supplier_activity_logs",
    "supplier_invoices",
    "supplier_return_items",
    "supplier_returns",
    "goods_receipt_items",
    "goods_receipts",
    "purchase_order_items",
    "purchase_orders",
    "purchase_request_items",
    "purchase_requests",
    "supplier_products",
    "suppliers",
    "departments",
    "users"
  ];

  for (const table of tablesToTruncate) {
    try {
      await sequelize.query(`TRUNCATE TABLE \`${table}\`;`);
      console.log(`  🗑️  Cleared table: ${table}`);
    } catch (err) {
      console.warn(`  ⚠️  Table ${table} could not be truncated directly: ${err.message}`);
    }
  }

  // 2. Re-enable foreign key checks
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 1;");
  console.log("\n✅ All transaction and operational data cleared to 0 records!");

  // 3. Re-seed default Administrator Account
  console.log("\n--- Seeding Default Admin Account ---");
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const admin = await User.create({
    name: "DJ's System Administrator",
    email: "admin@gmail.com",
    password: hashedPassword,
    role: "admin"
  });
  console.log(`  👤 Admin User created: ${admin.email} (Password: admin123)`);

  // 4. Re-seed Standard Restaurant Departments
  console.log("\n--- Seeding Standard Restaurant Departments ---");
  await Department.bulkCreate([
    { code: "KIT", name: "Kitchen", departmentHead: "Executive Chef Marco", description: "Food preparation, recipes & kitchen stock requisitions", status: "Active" },
    { code: "PUR", name: "Purchasing", departmentHead: "Purchasing Officer Sarah", description: "Supplier procurement, purchase orders & vendor relations", status: "Active" },
    { code: "INV", name: "Inventory", departmentHead: "Warehouse Manager Alex", description: "Stock-in receiving, quality inspection & storeroom storage", status: "Active" },
    { code: "FIN", name: "Finance", departmentHead: "Finance Head Elena", description: "Payables disbursement, invoice auditing & accounting", status: "Active" },
    { code: "ADM", name: "Administration", departmentHead: "General Manager David", description: "Executive administration & management approvals", status: "Active" }
  ]);
  console.log("  🏢 Seeded 5 standard departments: Kitchen (KIT), Purchasing (PUR), Inventory (INV), Finance (FIN), Administration (ADM).");

  console.log("\n===============================================================");
  console.log("🎉 DATABASE IS NOW FRESH & READY FOR MANUAL TESTING!");
  console.log("   - Suppliers: 0 (Fresh)");
  console.log("   - Products: 0 (Fresh)");
  console.log("   - Purchase Requests: 0 (Fresh)");
  console.log("   - Purchase Orders: 0 (Fresh)");
  console.log("   - Goods Receipts: 0 (Fresh)");
  console.log("   - Returns: 0 (Fresh)");
  console.log("   - Invoices: 0 (Fresh)");
  console.log("===============================================================\n");

} catch (error) {
  console.error("❌ Reset encountered an error:", error);
} finally {
  process.exit(0);
}

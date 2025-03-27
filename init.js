// init.js - Initialization script for database migration and seeding
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

console.log("====== Starting initialization script ======");
console.log("Current working directory:", process.cwd());
console.log("Node.js version:", process.version);
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "Not set");

try {
  // Check prisma directory and binary files
  console.log("Checking Prisma environment...");
  const prismaBin = path.join(process.cwd(), "node_modules/.bin/prisma");
  const prismaExists = fs.existsSync(prismaBin);
  console.log("Prisma CLI exists:", prismaExists);
  
  if (prismaExists && process.env.DATABASE_URL) {
    // Execute database migration
    console.log("\nExecuting database migration...");
    try {
      const output = execSync(`npx prisma migrate deploy`, { encoding: "utf8" });
      console.log("Migration output:", output.trim());
    } catch (migrationError) {
      console.error("Database migration failed:", migrationError.message);
      // Continue execution, don't terminate on migration failure
    }

    // Execute data seeding
    console.log("\nExecuting data seeding...");
    try {
      // Execute seed.js using node directly
      const seedOutput = execSync(`node seed.js`, { encoding: "utf8" });
      console.log("Seed output:", seedOutput.trim());
      console.log("Data seeding completed successfully");
    } catch (seedError) {
      console.error("Data seeding failed:", seedError.message);
    }
  } else if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL environment variable not set, skipping database operations");
  }

  // Start application
  console.log("\nStarting application server...");
  try {
    // Execute server.js using node directly
    execSync(`node server.js`, { stdio: 'inherit' });
  } catch (serverError) {
    console.error("Server failed to start:", serverError.message);
    process.exit(1);
  }
} catch (error) {
  console.error("Error during initialization:", error);
  process.exit(1);
} 
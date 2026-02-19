#!/usr/bin/env node

/**
 * Generate a bcrypt password hash for NextAuth
 * 
 * Usage:
 *   node scripts/hash-password.js yourpassword
 *   npm run hash-password yourpassword
 */

const bcrypt = require("bcryptjs");

const password = process.argv[2];

if (!password) {
  console.error("❌ Error: Please provide a password");
  console.log("\nUsage:");
  console.log("  node scripts/hash-password.js yourpassword");
  console.log("  npm run hash-password yourpassword");
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log("\n✅ Password hash generated:\n");
  console.log(hash);
  console.log("\nAdd this to your .env file:");
  console.log(`AUTH_USER_PASSWORD_HASH="${hash}"`);
  console.log();
});

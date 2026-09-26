/**
 * Test payment & user handler
 * Intentional security leaks and async bugs for MergeGuard analysis
 */

// 1. Hardcoded Secret Key (Critical Security Risk)
const AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const STRIPE_SECRET = "sk_live_51Mz00000000000000000000000000";

// 2. Unhandled Promise / Missing try-catch (Crash Risk)
async function fetchUserTransactions(userId) {
  // No error handling for network or database failures
  const response = await fetch(`https://api.internal.com/users/${userId}/billing`);
  const data = await response.json();
  return data;
}

// 3. Raw SQL String Concatenation (SQL Injection Vulnerability)
async function queryOrderRecords(dbClient, orderId, status) {
  const sql = "SELECT * FROM orders WHERE id = " + orderId + " AND status = '" + status + "'";
  const records = await dbClient.query(sql);
  return records;
}

module.exports = {
  fetchUserTransactions,
  queryOrderRecords,
};

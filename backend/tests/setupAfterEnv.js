const pool = require("../db");

afterAll(async () => {
  try {
    await pool.end();
  } catch {
    // ignore close errors in test teardown
  }
});

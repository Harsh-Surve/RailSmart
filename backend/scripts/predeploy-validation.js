require("dotenv").config();

const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "local_validation_secret";
}

const app = createApp();

function pass(name, details) {
  console.log(`✅ ${name}${details ? ` — ${details}` : ""}`);
}

function fail(name, details) {
  console.error(`❌ ${name}${details ? ` — ${details}` : ""}`);
}

async function run() {
  let hasFailure = false;

  const noCookie = await request(app).get("/api/admin/audit-logs");
  if (noCookie.statusCode === 401) {
    pass("RBAC unauthenticated", "401 returned for /api/admin/audit-logs without cookie");
  } else {
    fail("RBAC unauthenticated", `expected 401, got ${noCookie.statusCode}`);
    hasFailure = true;
  }

  const userToken = jwt.sign(
    { id: 2, email: "user@test.com", role: "user" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const userCookie = await request(app)
    .get("/api/admin/audit-logs")
    .set("Cookie", `token=${userToken}`);

  if (userCookie.statusCode === 403) {
    pass("RBAC non-admin", "403 returned for normal user token");
  } else {
    fail("RBAC non-admin", `expected 403, got ${userCookie.statusCode}`);
    hasFailure = true;
  }

  const adminToken = jwt.sign(
    { id: 1, email: "admin@test.com", role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const adminCookie = await request(app)
    .get("/api/admin/audit-logs")
    .set("Cookie", `token=${adminToken}`);

  if (adminCookie.statusCode === 200) {
    pass("RBAC admin", "200 returned for admin token");
  } else {
    fail("RBAC admin", `expected 200, got ${adminCookie.statusCode}`);
    hasFailure = true;
  }

  const health = await request(app).get("/api/health");
  if (health.statusCode === 200 && health.body?.checks?.database === "connected") {
    pass("Health endpoint", "server and DB reported healthy");
  } else {
    fail(
      "Health endpoint",
      `expected 200 + db connected, got ${health.statusCode} + ${health.body?.checks?.database || "unknown"}`
    );
    hasFailure = true;
  }

  const metrics = await request(app).get("/api/metrics");
  const metricsValid =
    metrics.statusCode === 200 &&
    typeof metrics.body?.uptime !== "undefined" &&
    typeof metrics.body?.memory?.heapUsed !== "undefined" &&
    typeof metrics.body?.cpu?.user !== "undefined";

  if (metricsValid) {
    pass("Metrics endpoint", "uptime/memory/cpu payload present");
  } else {
    fail("Metrics endpoint", `unexpected payload/status (${metrics.statusCode})`);
    hasFailure = true;
  }

  if (hasFailure) {
    console.error("\nPre-deployment validation finished with failures.");
    process.exit(1);
  }

  console.log("\nPre-deployment validation passed.");
}

run().catch((error) => {
  console.error("❌ Validation script error", error);
  process.exit(1);
});

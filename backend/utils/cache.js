const NodeCache = require("node-cache");

const stdTTL = Number.parseInt(String(process.env.CACHE_TTL_SECONDS || "60"), 10);
const checkperiod = Number.parseInt(String(process.env.CACHE_CHECK_PERIOD_SECONDS || "120"), 10);

const cache = new NodeCache({
  stdTTL: Number.isFinite(stdTTL) ? stdTTL : 60,
  checkperiod: Number.isFinite(checkperiod) ? checkperiod : 120,
  useClones: false,
});

module.exports = cache;
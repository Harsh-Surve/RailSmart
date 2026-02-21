const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const requireAdmin = require("../middleware/requireAdmin");

router.get("/kpi", requireAdmin, analyticsController.getKPIOverview);
router.get("/revenue-route", requireAdmin, analyticsController.getRevenueByRoute);
router.get("/revenue", requireAdmin, analyticsController.getRevenueByRange);
router.get("/revenue-trend", requireAdmin, analyticsController.getRevenueTrend);
router.get("/occupancy", requireAdmin, analyticsController.getOccupancyStats);
router.get("/peak-bookings", requireAdmin, analyticsController.getPeakBookings);
router.get("/top-routes", requireAdmin, analyticsController.getTopRoutes);

module.exports = router;

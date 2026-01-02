const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    downloadSalesReport,
    downloadComplaintReport,
    downloadOrderReport
} = require('../controllers/reportController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/dashboard').get(protect, admin, getDashboardStats);
router.route('/sales/download').get(protect, admin, downloadSalesReport);
router.route('/complaints/download').get(protect, admin, downloadComplaintReport);
router.route('/orders/download').get(protect, admin, downloadOrderReport);

module.exports = router;

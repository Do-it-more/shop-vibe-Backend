const express = require('express');
const router = express.Router();
const { createCoupon, validateCoupon, getCoupons, deleteCoupon } = require('../controllers/couponController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, admin, createCoupon)
    .get(protect, admin, getCoupons);

router.route('/:id').delete(protect, admin, deleteCoupon);

router.post('/validate', protect, validateCoupon);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
    createComplaint,
    getMyComplaints,
    getComplaints,
    getComplaintById,
    updateComplaint
} = require('../controllers/complaintController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, createComplaint)
    .get(protect, admin, getComplaints);

router.route('/mycomplaints').get(protect, getMyComplaints);

router.route('/:id')
    .get(protect, getComplaintById)
    .put(protect, admin, updateComplaint);

module.exports = router;

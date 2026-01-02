const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Complaint = require('../models/Complaint');

// Helper to convert JSON to CSV
const convertToCSV = (data, fields) => {
    const csvRows = [];
    // Header
    csvRows.push(fields.join(','));

    // Rows
    for (const row of data) {
        const values = fields.map(field => {
            const val = row[field];
            return `"${String(val).replace(/"/g, '""')}"`; // Escape quotes
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
};

// @desc    Get dashboard stats
// @route   GET /api/reports/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
    const orders = await Order.find({ isPaid: true });
    const totalRevenue = orders.reduce((acc, order) => acc + order.totalPrice, 0);
    const orderCount = await Order.countDocuments();
    const paidOrders = orders.length;
    const deliveredOrders = await Order.countDocuments({ isDelivered: true });
    const userCount = await User.countDocuments();
    const productCount = await Product.countDocuments();

    const dailyOrders = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: new Date(new Date() - 7 * 60 * 60 * 24 * 1000) }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                sales: { $sum: "$totalPrice" },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const ordersByStatus = {
        paid: paidOrders,
        delivered: deliveredOrders,
        pending: orderCount - paidOrders
    };

    res.json({
        totalRevenue,
        orderCount,
        userCount,
        productCount,
        dailyOrders,
        ordersByStatus
    });
});

// @desc    Download Sales Report
// @route   GET /api/reports/sales/download
// @access  Private/Admin
const downloadSalesReport = asyncHandler(async (req, res) => {
    // Current Month Sales
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const orders = await Order.find({
        createdAt: { $gte: startOfMonth },
        isPaid: true
    }).populate('user', 'name email');

    const mappedData = orders.map(o => ({
        OrderID: o._id,
        Customer: o.user ? o.user.name : 'Unknown',
        Email: o.user ? o.user.email : 'N/A',
        Amount: o.totalPrice,
        Date: o.createdAt.toISOString().split('T')[0],
        Status: o.isDelivered ? 'Delivered' : 'Paid'
    }));

    const csv = convertToCSV(mappedData, ['OrderID', 'Customer', 'Email', 'Amount', 'Date', 'Status']);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment(`Monthly_Sales_Report_${new Date().getMonth() + 1}.csv`);
    res.status(200).send(csv);
});

// @desc    Download Complaint Report
// @route   GET /api/reports/complaints/download
// @access  Private/Admin
const downloadComplaintReport = asyncHandler(async (req, res) => {
    const complaints = await Complaint.find({}).populate('user', 'name email').populate('order', '_id');

    const mappedData = complaints.map(c => ({
        ComplaintID: c._id,
        OrderID: c.order ? c.order._id : 'N/A',
        Customer: c.user ? c.user.name : 'Unknown',
        Subject: c.subject,
        Status: c.status,
        Date: c.createdAt.toISOString().split('T')[0]
    }));

    const csv = convertToCSV(mappedData, ['ComplaintID', 'OrderID', 'Customer', 'Subject', 'Status', 'Date']);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment(`Complaints_Report.csv`);
    res.status(200).send(csv);
});

// @desc    Download Order Report
// @route   GET /api/reports/orders/download
// @access  Private/Admin
const downloadOrderReport = asyncHandler(async (req, res) => {
    const orders = await Order.find({}).populate('user', 'name email');

    const mappedData = orders.map(o => ({
        OrderID: o._id,
        Customer: o.user ? o.user.name : 'Unknown',
        Amount: o.totalPrice,
        Paid: o.isPaid ? 'Yes' : 'No',
        Delivered: o.isDelivered ? 'Yes' : 'No',
        Date: o.createdAt.toISOString().split('T')[0]
    }));

    const csv = convertToCSV(mappedData, ['OrderID', 'Customer', 'Amount', 'Paid', 'Delivered', 'Date']);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment(`All_Orders_Report.csv`);
    res.status(200).send(csv);
});

module.exports = {
    getDashboardStats,
    downloadSalesReport,
    downloadComplaintReport,
    downloadOrderReport
};

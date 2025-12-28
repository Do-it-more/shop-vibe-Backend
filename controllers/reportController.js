const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// @desc    Get dashboard stats
// @route   GET /api/reports/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
    // 1. Total Revenue
    const orders = await Order.find({ isPaid: true });
    const totalRevenue = orders.reduce((acc, order) => acc + order.totalPrice, 0);

    // 2. Order Counts
    const orderCount = await Order.countDocuments();
    const paidOrders = orders.length;
    const deliveredOrders = await Order.countDocuments({ isDelivered: true });

    // 3. User Count
    const userCount = await User.countDocuments();

    // 4. Product Count
    const productCount = await Product.countDocuments();

    // 5. Daily Sales (Last 7 days)
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

    // 6. Orders by Status
    const ordersByStatus = {
        paid: paidOrders,
        delivered: deliveredOrders,
        pending: orderCount - paidOrders // Roughly
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

module.exports = { getDashboardStats };

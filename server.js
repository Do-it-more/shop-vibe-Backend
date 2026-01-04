const express = require('express');
const dotenv = require('dotenv');
// Load env vars FIRST
dotenv.config();

const compression = require('compression');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { initializeFirebaseAdmin } = require('./config/firebaseAdmin');

// Initialize Firebase
initializeFirebaseAdmin();

const app = express();

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/users', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/test-email', require('./routes/testEmailRoute'));

// Root route
app.get('/', (req, res) => {
    res.send('API is running...');
});

// Error handler (MUST be last)
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

// Start server ONLY after DB connects
const PORT = process.env.PORT || 5001;

const startServer = async () => {
    await connectDB(); // ⬅️ if this fails, server will NOT start

    app.listen(PORT, () => {
        console.log(
            `🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
        );
    });
};

startServer();

module.exports = app;

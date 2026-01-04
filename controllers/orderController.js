const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Stripe = require('stripe');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const addOrderItems = asyncHandler(async (req, res) => {
    const {
        orderItems,
        shippingAddress,
        paymentMethod,
        itemsPrice,
        taxPrice,
        shippingPrice,
        totalPrice
    } = req.body;

    if (orderItems && orderItems.length === 0) {
        res.status(400);
        throw new Error('No order items');
    } else {
        // 1. Verify stock availability for all items before creating order
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            if (!product) {
                res.status(404);
                throw new Error(`Product not found: ${item.name}`);
            }
            if (product.countInStock < item.qty) {
                res.status(400);
                throw new Error(`Insufficient stock for ${item.name}. Available: ${product.countInStock}`);
            }
        }

        // Generate Short Invoice Number: INV-XXXXX (9 chars total)
        const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
        const invoiceNumber = `INV-${randomStr}`;

        const order = new Order({
            orderItems,
            user: req.user._id,
            invoiceNumber,
            shippingAddress,
            paymentMethod,
            itemsPrice,
            taxPrice,
            shippingPrice,
            totalPrice
        });

        const createdOrder = await order.save();
        res.status(201).json(createdOrder);
    }
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
        .populate('user', 'name email phoneNumber');

    if (order) {
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
const nodemailer = require('nodemailer');

// ... existing imports ...

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
const updateOrderToPaid = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'email name');

    if (order) {
        if (order.isPaid) {
            res.status(400);
            throw new Error('Order is already marked as paid');
        }
        order.isPaid = true;
        order.paidAt = Date.now();
        // Payment result comes from body (from Stripe or mocked UPI)
        order.paymentResult = {
            id: req.body.id,
            status: req.body.status,
            update_time: req.body.update_time,
            email_address: req.body.payer?.email_address || req.user.email,
        };

        const updatedOrder = await order.save();

        // ⬇️ ATOMIC STOCK REDUCTION WITH CONCURRENCY CHECK ⬇️
        // Using Promise.all with atomic updates to ensure speed and consistency
        try {
            const stockUpdates = updatedOrder.orderItems.map(async (item) => {
                const result = await Product.updateOne(
                    {
                        _id: item.product,
                        countInStock: { $gte: item.qty } // Atomic check: only update if enough stock exists
                    },
                    {
                        $inc: { countInStock: -item.qty } // Atomic decrement
                    }
                );

                if (result.matchedCount === 0) {
                    throw new Error(`Stock mismatch for ${item.name}. It may have sold out while you were paying.`);
                }

                // Get updated product to log/verify
                const updatedProduct = await Product.findById(item.product);
                console.log(`[Atomic Stock] Decreased ${item.name} by ${item.qty}. New stock: ${updatedProduct.countInStock}`);
                return updatedProduct;
            });

            await Promise.all(stockUpdates);
        } catch (stockError) {
            // Log the error. In a more complex system, we might trigger a refund here.
            console.error("CRITICAL STOCK ERROR:", stockError.message);
            // Optionally: Mark order as 'Stock Error' if needed
            throw new Error(stockError.message);
        }

        const generateInvoicePDF = require('../utils/generateInvoice');

        // ... existing code ...

        // --- SEND RECEIPT EMAIL WITH PDF ---
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;

        if (emailUser && emailPass && !emailUser.includes('your_email')) {
            try {
                // Generate Invoice PDF
                const invoiceBuffer = await generateInvoicePDF(updatedOrder, order.user);

                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: emailUser,
                        pass: emailPass
                    }
                });

                const mailOptions = {
                    from: `"Barlina Fashion Design Support" <${emailUser}>`,
                    to: order.user.email,
                    subject: `Order Confirmation & Invoice: #${updatedOrder.invoiceNumber || updatedOrder._id}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #4F46E5;">Thank you for your order, ${order.user.name}!</h2>
                            <p>We are excited to confirm your order <strong>#${updatedOrder.invoiceNumber || updatedOrder._id}</strong> has been successfully placed and paid for.</p>
                            
                            <p><strong>Please find your official invoice attached to this email.</strong></p>

                            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eee;">Order Total</td>
                                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;"><strong>Rs. ${updatedOrder.totalPrice.toFixed(2)}</strong></td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px;">Payment Method</td>
                                    <td style="padding: 10px; text-align: right;">${updatedOrder.paymentMethod}</td>
                                </tr>
                            </table>

                            <p style="margin-top: 20px;">
                                We will notify you when your items are shipped to:<br/>
                                <strong>${order.shippingAddress.address}, ${order.shippingAddress.city}</strong>
                            </p>

                            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                                Need help? Reply to this email.
                            </p>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: `invoice-${updatedOrder.invoiceNumber || updatedOrder._id}.pdf`,
                            content: invoiceBuffer,
                            contentType: 'application/pdf'
                        }
                    ]
                };

                transporter.sendMail(mailOptions).then(() => {
                    console.log(`Receipt email with Invoice PDF sent to ${order.user.email}`);
                }).catch(err => {
                    console.error("Failed to send receipt email asynchronously:", err);
                });
            } catch (error) {
                console.error("Failed to prepare email/invoice:", error);
            }
        } else {
            console.log("⚠️ Skipped sending email: Credentials not set.");
        }

        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Create payment intent (Stripe)
// @route   POST /api/orders/create-payment-intent
// @access  Private
const createPaymentIntent = asyncHandler(async (req, res) => {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
    });

    res.send({
        clientSecret: paymentIntent.client_secret,
    });
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id });
    res.json(orders);
});

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({}).populate('user', 'id name');
    res.json(orders);
});

// @desc    Update order to delivered
// @route   PUT /api/orders/:id/deliver
// @access  Private/Admin
const updateOrderToDelivered = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        order.isDelivered = true;
        order.deliveredAt = Date.now();

        const updatedOrder = await order.save();

        // --- SEND DELIVERY EMAIL ---
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;

        if (emailUser && emailPass && !emailUser.includes('your_email')) {
            try {
                // Fetch user email if not populated
                const populatedOrder = await Order.findById(updatedOrder._id).populate('user', 'name email');

                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: emailUser,
                        pass: emailPass
                    }
                });

                const mailOptions = {
                    from: `"Barlina Fashion Design Team" <${emailUser}>`,
                    to: populatedOrder.user.email,
                    subject: `Order Delivered: #${updatedOrder.invoiceNumber || updatedOrder._id}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #10B981;">Your Order Has Been Delivered!</h2>
                            <p>Hi ${populatedOrder.user.name},</p>
                            <p>Good news! Your order <strong>#${updatedOrder.invoiceNumber || updatedOrder._id}</strong> has been delivered.</p>
                            
                            <p>We hope you love your purchase. If you have any feedback or issues, please don't hesitate to reach out.</p>

                            <p style="margin-top: 20px;">
                                <a href="http://localhost:5173/order/${updatedOrder._id}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Order Details</a>
                            </p>

                            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                                Thank you for shopping with Barlina Fashion.
                            </p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log(`Delivery email sent to ${populatedOrder.user.email}`);
            } catch (error) {
                console.error("Failed to send delivery email:", error);
            }
        }

        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (order) {
        if (order.isDelivered) {
            res.status(400);
            throw new Error('Cannot cancel an order that has been shipped or delivered');
        }

        if (order.isCancelled) {
            res.status(400);
            throw new Error('Order is already cancelled');
        }

        order.isCancelled = true;
        order.cancelledAt = Date.now();

        const updatedOrder = await order.save();

        // Restore Stock
        const stockRestoration = order.orderItems.map(async (item) => {
            const product = await Product.findById(item.product);
            if (product) {
                product.countInStock += item.qty;
                await product.save();
            }
        });

        await Promise.all(stockRestoration);

        // --- SEND CANCELLATION EMAIL ---
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;

        if (emailUser && emailPass && !emailUser.includes('your_email')) {
            try {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: emailUser,
                        pass: emailPass
                    }
                });

                const mailOptions = {
                    from: `"Barlina Fashion Design Support" <${emailUser}>`,
                    to: order.user.email,
                    subject: `Order Cancelled: #${updatedOrder.invoiceNumber || updatedOrder._id}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #EF4444;">Order Cancelled</h2>
                            <p>Hi ${order.user.name},</p>
                            <p>Your order <strong>#${updatedOrder.invoiceNumber || updatedOrder._id}</strong> has been successfully cancelled as per your request.</p>
                            
                            <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0;">
                                <p style="margin: 0; color: #B91C1C; font-weight: bold;">Refund Information</p>
                                <p style="margin: 10px 0 0 0; color: #7F1D1D;">
                                    Your payment of <strong>Rs. ${updatedOrder.totalPrice.toFixed(2)}</strong> will be refunded to your original payment method within the next <strong>7 working days</strong>.
                                </p>
                            </div>

                            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                                If you did not request this cancellation or have any questions, please reply to this email immediately.
                            </p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log(`Cancellation email sent to ${order.user.email}`);
            } catch (error) {
                console.error("Failed to send cancellation email:", error);
            }
        }

        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Get order by invoice number or ID
// @route   GET /api/orders/invoice/:invoiceNumber
// @access  Private/Admin
const getOrderByInvoiceNumber = asyncHandler(async (req, res) => {
    const term = req.params.invoiceNumber;

    // 1. Try finding by Invoice Number first
    let order = await Order.findOne({ invoiceNumber: term })
        .populate('user', 'name email phoneNumber');

    // 2. If not found, try partial ID match (at least 6 characters)
    if (!order && term.length >= 6) {
        // Find all orders and filter by start of ID string (since we can't regex the ObjectId type easily)
        const allOrders = await Order.find({}).populate('user', 'name email phoneNumber');
        order = allOrders.find(o => o._id.toString().startsWith(term.toLowerCase()));
    }

    // 3. Fallback: Full ObjectId match
    if (!order && mongoose.Types.ObjectId.isValid(term)) {
        order = await Order.findById(term)
            .populate('user', 'name email phoneNumber');
    }

    if (order) {
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Order not found with this Invoice number or ID');
    }
});

module.exports = {
    addOrderItems,
    getOrderById,
    updateOrderToPaid,
    updateOrderToDelivered,
    cancelOrder,
    getMyOrders,
    getOrders,
    getOrderByInvoiceNumber,
    createPaymentIntent
};

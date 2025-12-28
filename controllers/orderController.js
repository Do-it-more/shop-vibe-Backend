const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
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
        return;
    } else {
        const order = new Order({
            orderItems,
            user: req.user._id,
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
    const order = await Order.findById(req.params.id).populate(
        'user',
        'name email'
    );

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

        // --- SEND RECEIPT EMAIL ---
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
                    from: `"ShopVibe Support" <${emailUser}>`,
                    to: order.user.email,
                    subject: `Order Receipt: #${updatedOrder._id}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #4F46E5;">Thank you for your order, ${order.user.name}!</h2>
                            <p>Here is your receipt for <strong>Order #${updatedOrder._id}</strong>.</p>
                            
                            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                                <tr style="background-color: #f3f4f6;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Description</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Amount</th>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eee;">Order Total</td>
                                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">$${updatedOrder.totalPrice.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px;"><strong>Payment Method</strong></td>
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
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log(`Receipt sent to ${order.user.email}`);
            } catch (error) {
                console.error("Failed to send receipt email:", error);
                // Don't fail the request, just log it
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

module.exports = {
    addOrderItems,
    getOrderById,
    updateOrderToPaid,
    getMyOrders,
    createPaymentIntent
};

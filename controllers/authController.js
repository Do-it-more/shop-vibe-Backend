const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const User = require('../models/User');

// @desc    Register new user
// @route   POST /api/users
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Please add all fields');
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    // Hash password handled in User model pre-save hook

    // Create user
    const user = await User.create({
        name,
        email,
        password
    });

    if (user) {
        res.status(201).json({
            _id: user.id,
            name: user.name,
            email: user.email,
            profilePhoto: user.profilePhoto,
            role: user.role,
            token: generateToken(user._id)
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    const { email, password, rememberMe } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        // user asks for "expiry adjust"
        // standard: 1d, rememberMe: 30d
        const expiresIn = rememberMe ? '30d' : '1d';

        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            profilePhoto: user.profilePhoto, // Return profile photo on login
            role: user.role,
            token: generateToken(user._id, expiresIn)
        });
    } else {
        res.status(400);
        throw new Error('Invalid credentials');
    }
});

// @desc    Forgot Password - Send OTP
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        res.status(400);
        throw new Error('Please provide an email');
    }

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Save OTP and expiry
    user.otp = hashedOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    // Check for email credentials - DEV MODE FALLBACK
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    // Check if credentials are still default or missing
    const isDevMode = !emailUser || !emailPass || emailUser.includes('your_email');

    if (isDevMode) {
        console.log('================================================');
        console.log('⚠️  DEV MODE: EMAIL CREDENTIALS INVALID ⚠️');
        console.log(`Current User: ${emailUser}`);
        console.log(`Tip: Restart server if you just updated .env`);
        console.log(`OTP for ${email}: ${otp}`);
        console.log('================================================');

        res.status(200).json({ message: 'OTP generated (Check Server Console)' });
        return;
    }

    // Explicit Nodemailer Config for Gmail
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Built-in transport for Gmail
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });

    try {
        console.log(`Attempting to send OTP to ${email} from ${emailUser}...`);

        await transporter.verify(); // Verify connection configuration
        console.log('SMTP Connection established successfully');

        await transporter.sendMail({
            from: `"Berlina Fashion Design" <${emailUser}>`,
            to: email,
            subject: 'Berlina Fashion Design Password Reset OTP',
            text: `Your Verification Code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you requested this, please ignore this email.`
        });

        console.log('Email sent successfully');
        res.status(200).json({ message: 'OTP sent to email' });
    } catch (error) {
        console.error("Nodemailer Error:", error);

        // Detailed error logging
        if (error.code === 'EAUTH') {
            console.log('❌ Auth Error: Check your Email and App Password in .env');
        }

        // Fallback log
        console.log('================================================');
        console.log('⚠️  EMAIL FAILED - FALLBACK OTP ⚠️');
        console.log(`OTP for ${email}: ${otp}`);
        console.log('================================================');

        // Still return success to frontend so user isn't stuck
        res.status(200).json({ message: 'Email failed, check console for OTP' });
    }
});


// @desc    Verify OTP
// @route   POST /api/users/verify-otp
// @access  Public
const verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        res.status(400);
        throw new Error('Please provide email and OTP');
    }

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (user.otpExpires < Date.now()) {
        res.status(400);
        throw new Error('OTP expired');
    }

    const isMatch = await bcrypt.compare(otp, user.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    res.status(200).json({ message: 'OTP verified' });
});

// @desc    Reset Password
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        res.status(400);
        throw new Error('Please provide all fields');
    }

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (user.otpExpires < Date.now()) {
        res.status(400);
        throw new Error('OTP expired');
    }

    const isMatch = await bcrypt.compare(otp, user.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    // Hash new password - User model handles hashing in pre-save, but only if modified.
    // We can assign directly and .save() will trigger pre-save hash.
    user.password = newPassword;

    // Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    res.status(200).json({ message: 'Password reset successful' });
});

// @desc    Get user data
// @route   GET /api/users/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
    res.status(200).json(req.user);
});

// @desc    Update user profile photo
// @route   PUT /api/users/profile-photo
// @access  Private
const updateProfilePhoto = asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('Please upload a file');
    }

    // Fix: Use relative URL path, not absolute file system path
    const imagePath = `/uploads/${req.file.filename}`;

    const user = await User.findById(req.user._id);

    if (user) {
        user.profilePhoto = imagePath;
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            profilePhoto: updatedUser.profilePhoto,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.name = req.body.name || user.name;
        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            profilePhoto: updatedUser.profilePhoto,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Toggle item in wishlist
// @route   POST /api/users/wishlist/:id
// @access  Private
const toggleWishlist = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    const productId = req.params.id;

    if (user) {
        const isListed = user.wishlist.includes(productId);

        if (isListed) {
            user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
            await user.save();
            res.json({ message: 'Product removed from wishlist', wishlist: user.wishlist });
        } else {
            user.wishlist.push(productId);
            await user.save();
            res.json({ message: 'Product added to wishlist', wishlist: user.wishlist });
        }
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Get user wishlist
// @route   GET /api/users/wishlist
// @access  Private
const getWishlist = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('wishlist');

    if (user) {
        res.json(user.wishlist);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});


// Generate JWT
// Generate JWT
const generateToken = (id, expiresIn = '30d') => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn,
    });
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    updateProfilePhoto,
    updateUserProfile,
    forgotPassword,
    verifyOtp,
    resetPassword,
    toggleWishlist,
    getWishlist
};

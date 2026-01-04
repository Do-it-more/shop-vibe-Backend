const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Verification = require('../models/Verification');
const { admin } = require('../config/firebaseAdmin');

// @desc    Register new user
// @route   POST /api/users
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password, phoneNumber, verificationToken, phoneVerificationToken } = req.body;

    // Debugging logs for registration flow
    console.log(`[Register] Request for: ${email}`);
    if (process.env.NODE_ENV !== 'production') {
        console.log('Body Tokens:', { verificationToken: !!verificationToken, phoneVerificationToken: !!phoneVerificationToken });
    }

    if (!name || !email || !password || !phoneNumber) {

        res.status(400);
        throw new Error('Please add all fields including Phone Number');
    }

    // Verify Email Token
    if (!verificationToken) {
        res.status(400);
        throw new Error('Email verification required');
    }

    // Verify Phone Token (Firebase ID Token)
    if (!phoneVerificationToken) {
        res.status(400);
        throw new Error('Phone number verification required');
    }

    try {
        // 1. Verify Email Token (Custom JWT)
        const decodedEmail = jwt.verify(verificationToken, process.env.JWT_SECRET);
        if (decodedEmail.email !== email || !decodedEmail.verified) {
            throw new Error('Invalid email verification token');
        }

        // 2. Verify Phone Token (Custom JWT or Firebase ID Token)
        try {
            // First check if it is our own Custom JWT (old flow)
            try {
                const decodedPhone = jwt.verify(phoneVerificationToken, process.env.JWT_SECRET);
                if (decodedPhone.phone !== phoneNumber || !decodedPhone.verified) {
                    throw new Error('Invalid phone verification token');
                }
            } catch (jwtError) {
                // Not a custom JWT, assume it's a Firebase ID Token
                if (admin.apps.length) {
                    try {
                        const decodedFirebaseToken = await admin.auth().verifyIdToken(phoneVerificationToken);
                        const verifiedPhoneNumber = decodedFirebaseToken.phone_number;
                        // Firebase phone numbers are E.164 (+91...). 
                        // Our phoneNumber might be local (637...) or +91...
                        // Simple check:
                        if (!verifiedPhoneNumber.includes(phoneNumber)) {
                            throw new Error(`Phone number mismatch. Verified: ${verifiedPhoneNumber}`);
                        }
                    } catch (firebaseError) {
                        throw new Error('Phone verification failed: Invalid Firebase Token >> ' + firebaseError.message);
                    }
                } else {
                    // DEV MODE: Firebase Admin not initialized (missing .env)
                    // We ALLOW the registration to proceed to unblock the user.
                    console.warn("⚠️ DEV MODE: Firebase Admin not initialized. Skipping backend phone token verification.");
                    console.warn("   To fix: Add FIREBASE_SERVICE_ACCOUNT to Backend/.env");
                }
            }

        } catch (error) {
            res.status(400);
            throw new Error('Verification failed: ' + error.message);
        }

    } catch (error) {
        res.status(400);
        throw new Error('Verification failed: ' + error.message);
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
        password,
        phoneNumber,
        isEmailVerified: true,
        isPhoneVerified: true
    });

    if (user) {
        res.status(201).json({
            _id: user.id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
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

    // Check for user by email OR phoneNumber
    const user = await User.findOne({
        $or: [
            { email: email },
            { phoneNumber: email }
        ]
    });

    if (user && (await user.matchPassword(password))) {
        // user asks for "expiry adjust"
        // standard: 1d, rememberMe: 30d
        const expiresIn = rememberMe ? '30d' : '1d';

        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            profilePhoto: user.profilePhoto, // Return profile photo on login
            address: user.address,
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
        console.log(`[Dev] Password Reset OTP for ${email}: ${otp}`);

        res.status(200).json({ message: 'OTP generated (Check Server Console)' });
        return;
    }

    // Explicit Nodemailer Config for Gmail - Port 587
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: emailUser,
            pass: emailPass
        },
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000
    });

    try {
        console.log(`Attempting to send OTP to ${email} from ${emailUser}...`);

        await transporter.verify(); // Verify connection configuration
        console.log('SMTP Connection established successfully');

        await transporter.sendMail({
            from: `"Barlina Fashion Design" <${emailUser}>`,
            to: email,
            subject: 'Barlina Fashion Design Password Reset OTP',
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

// @desc    Delete user profile photo
// @route   DELETE /api/users/profile-photo
// @access  Private
const deleteProfilePhoto = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.profilePhoto = '';
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            profilePhoto: updatedUser.profilePhoto,
            address: updatedUser.address,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
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

        // Handle Phone Number update
        if (req.body.phoneNumber) {
            user.phoneNumber = req.body.phoneNumber;
        }

        if (req.body.address) {
            user.address = req.body.address;
        }

        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            phoneNumber: updatedUser.phoneNumber,
            profilePhoto: updatedUser.profilePhoto,
            address: updatedUser.address,
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


// @desc    Send Email Verification OTP
// @route   POST /api/users/send-verification
// @access  Public
const sendVerificationEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;
    console.log(`[Verification] OTP Request for: ${email}`);

    if (!email) {
        res.status(400);
        throw new Error('Please provide an email');
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists with this email');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Save/Update Verification Document via identifier
    await Verification.findOneAndUpdate(
        { identifier: email },
        {
            identifier: email,
            otp: hashedOtp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
        },
        { upsert: true, new: true }
    );

    // Check for email credentials - DEV MODE FALLBACK
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const isDevMode = !emailUser || !emailPass || emailUser.includes('your_email');

    if (isDevMode) {
        console.log(`[Dev] Verification OTP for ${email}: ${otp}`);
        res.status(200).json({ message: 'OTP generated (Check Server Console)' });
        return;
    }

    // Explicit Nodemailer Config for Gmail - Port 587 (STARTTLS)
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use STARTTLS
        auth: {
            user: emailUser,
            pass: emailPass
        },
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 10000, // 10 seconds timeout
        greetingTimeout: 10000    // 10 seconds timeout
    });

    try {
        await transporter.sendMail({
            from: `"Barlina Fashion Design" <${emailUser}>`,
            to: email,
            subject: 'Email Verification',
            text: `Your Verification Code is: ${otp}\n\nThis code expires in 10 minutes.`
        });
        res.status(200).json({ message: 'Verification email sent' });
    } catch (error) {
        console.error("Nodemailer Error:", error);
        // Fallback if email fails
        console.log(`[Dev] Verification OTP for ${email}: ${otp}`);
        res.status(200).json({ message: 'Email failed, check console for OTP' });
    }
});

// @desc    Verify Email OTP
// @route   POST /api/users/verify-email
// @access  Public
const verifyEmailOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        res.status(400);
        throw new Error('Please provide email and OTP');
    }

    const verification = await Verification.findOne({ identifier: email });

    if (!verification) {
        res.status(400);
        throw new Error('Invalid or expired verification session');
    }

    const isMatch = await bcrypt.compare(otp, verification.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    // Generate Verification Token (valid for 1 hour)
    const verificationToken = jwt.sign(
        { email, verified: true },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    // Remove verification record
    await Verification.deleteOne({ identifier: email });

    res.status(200).json({
        message: 'Email verified successfully',
        verificationToken
    });
});

// @desc    Delete user account (Self)
// @route   DELETE /api/users/profile
// @access  Private
const deleteMyAccount = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        await user.deleteOne();
        res.json({ message: 'User account deleted' });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

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
    deleteProfilePhoto,
    updateUserProfile,
    deleteMyAccount,
    forgotPassword,
    verifyOtp,
    resetPassword,
    toggleWishlist,
    getWishlist,
    sendVerificationEmail,
    verifyEmailOtp,
};

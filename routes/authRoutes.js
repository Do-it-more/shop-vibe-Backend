const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    getMe,
    updateProfilePhoto,
    updateUserProfile,
    forgotPassword,
    verifyOtp,
    resetPassword,
    toggleWishlist,
    getWishlist,
    sendVerificationEmail,
    verifyEmailOtp,
    sendPhoneVerification,
    verifyPhoneOtp,
    deleteProfilePhoto
} = require('../controllers/authController');
const {
    getUsers,
    deleteUser,
    getUserById,
    updateUser,
    createUser
} = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// =======================
// PUBLIC ROUTES
// =======================
router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/', registerUser); // Alias for consistency
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/send-verification', sendVerificationEmail);
router.post('/verify-email', verifyEmailOtp);
router.post('/send-phone-verification', sendPhoneVerification);
router.post('/verify-phone', verifyPhoneOtp);

// =======================
// PROTECTED ROUTES
// =======================
router.get('/me', protect, getMe);
router.put('/profile', protect, updateUserProfile);
router.put('/profile-photo', protect, upload.single('image'), updateProfilePhoto);
router.delete('/profile-photo', protect, deleteProfilePhoto);
router.get('/wishlist', protect, getWishlist);
router.post('/wishlist/:id', protect, toggleWishlist);

// =======================
// ADMIN ROUTES
// =======================
router.get('/', protect, admin, getUsers);
router.post('/admin/create', protect, admin, createUser);
router.route('/:id')
    .get(protect, admin, getUserById)
    .put(protect, admin, updateUser)
    .delete(protect, admin, deleteUser);

module.exports = router;

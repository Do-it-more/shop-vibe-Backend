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
    getWishlist
} = require('../controllers/authController');
const {
    getUsers,
    deleteUser,
    getUserById,
    updateUser
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

// =======================
// PROTECTED ROUTES
// =======================
router.get('/me', protect, getMe);
router.put('/profile', protect, updateUserProfile);
router.put('/profile-photo', protect, upload.single('image'), updateProfilePhoto);
router.get('/wishlist', protect, getWishlist);
router.post('/wishlist/:id', protect, toggleWishlist);

// =======================
// ADMIN ROUTES
// =======================
router.get('/', protect, admin, getUsers);
router.route('/:id')
    .get(protect, admin, getUserById)
    .put(protect, admin, updateUser)
    .delete(protect, admin, deleteUser);

module.exports = router;

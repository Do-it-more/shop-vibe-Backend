const express = require('express');
const router = express.Router();
const {
    getProducts,
    getProductById,
    createProduct,
    deleteProduct,
    updateProduct,
    getTopProducts,
    createProductReview
} = require('../controllers/productController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').get(protect, getProducts).post(protect, admin, createProduct);
router.get('/top', getTopProducts);
router
    .route('/:id')
    .get(protect, getProductById)
    .delete(protect, admin, deleteProduct)
    .put(protect, admin, updateProduct);

router.route('/:id/reviews').post(protect, createProductReview);

module.exports = router;

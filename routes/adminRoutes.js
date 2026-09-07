const express = require('express');
const router = express.Router();
const {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  getAllShops,
  createShop,
  updateShop,
  updateShopVisibility,
  getAllOrders,
  getAllShoppers,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  updateUserStatus,
  updateShopStatus,
  updateOrderStatus,
  cancelOrderWithReason,
  updateShopperStatus,
  deleteUser,
  deleteShop,
  deletePersonalShopper,
  verifyShopper,
  getAnalytics,
  getShopRevenue,
  getConvenienceProfit,
  getAppSettings,
  updateAppSettings,
} = require('../controllers/adminController');
const { adminProtect } = require('../middleware/authMiddleware');
const {
  getClosureStatus,
  closeAllShops,
  reopenAllShops,
} = require('../controllers/globalClosureController');

// Import bulk product routes
const bulkProductRoutes = require('./bulkProductRoutes');

// Public admin routes
router.post('/login', adminLogin);
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// Protected admin routes
router.get('/dashboard', adminProtect, getDashboardStats);
router.get('/users', adminProtect, getAllUsers);
router.get('/shops', adminProtect, getAllShops);
router.post('/shops', adminProtect, createShop);
router.get('/products', adminProtect, getAllProducts);
router.post('/products', adminProtect, createProduct);
router.get('/orders', adminProtect, getAllOrders);
router.get('/shoppers', adminProtect, getAllShoppers);

// Shopper performance analytics
const {
  getShopperPerformance,
  getShopperDetailedPerformance,
} = require('../controllers/shopperPerformanceController');
router.get('/shoppers/performance', adminProtect, getShopperPerformance);
router.get('/shoppers/:shopperId/performance', adminProtect, getShopperDetailedPerformance);
router.get('/analytics', adminProtect, getAnalytics);
router.get('/revenue', adminProtect, getShopRevenue);

// Global shop closure (must be registered before :shopId routes to avoid conflict)
router.get('/profit', adminProtect, getConvenienceProfit);
router.get('/settings', adminProtect, getAppSettings);
router.put('/settings', adminProtect, updateAppSettings);

router.get('/shops/closure', adminProtect, getClosureStatus);
router.post('/shops/closure', adminProtect, closeAllShops);
router.delete('/shops/closure', adminProtect, reopenAllShops);

// Update operations
router.put('/users/:userId/status', adminProtect, updateUserStatus);
router.put('/shops/:shopId', adminProtect, updateShop);
router.put('/shops/:shopId/status', adminProtect, updateShopStatus);
router.put('/shops/:shopId/visibility', adminProtect, updateShopVisibility);
router.put('/orders/:orderId/cancel', adminProtect, cancelOrderWithReason);
router.put('/orders/:orderId/status', adminProtect, updateOrderStatus);
router.put('/shoppers/:shopperId/verify', adminProtect, verifyShopper);
router.put('/shoppers/:shopperId', adminProtect, updateShopperStatus);
router.put('/products/:productId', adminProtect, updateProduct);

// Delete operations
router.delete('/users/:userId', adminProtect, deleteUser);
router.delete('/shops/:shopId', adminProtect, deleteShop);
router.delete('/products/:productId', adminProtect, deleteProduct);
router.delete('/shoppers/:shopperId', adminProtect, deletePersonalShopper);

// Bulk product operations
router.use('/products', bulkProductRoutes);

// Terms and Conditions management is exposed under /api/terms via dedicated routes
// Admin routes for terms management are handled in that module; keep admin routes focused.

module.exports = router;

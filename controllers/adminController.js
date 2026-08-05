const User = require('../models/User');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');
const PersonalShopper = require('../models/PersonalShopper');
const TermsAndConditions = require('../models/TermsAndConditions');
const mongoose = require('mongoose');
const { sendOrderBill } = require('../utils/mailer');

// Admin login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for the built-in system admin, configured via environment variables.
    // Both ADMIN_EMAIL and ADMIN_PASSWORD must be set for this path to be usable —
    // an unconfigured deployment cannot be bypassed with empty credentials.
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword && email === adminEmail && password === adminPassword) {
      const adminUser = {
        _id: 'admin',
        name: 'System Admin',
        email: adminEmail,
        role: 'admin',
      };

      const jwt = require('jsonwebtoken');
      const tokenPayload = { id: 'admin', role: 'admin', isSystemAdmin: true };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

      console.log('✅ Admin login successful for system admin');
      console.log('🔍 Token payload:', tokenPayload);
      console.log('🔍 JWT Secret exists:', !!process.env.JWT_SECRET);

      return res.json({
        success: true,
        message: 'Admin login successful',
        data: {
          user: adminUser,
          token,
        },
      });
    }

    // Check for regular admin users
    const user = await User.findOne({ email, role: 'admin' }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials',
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials',
      });
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({
      success: true,
      message: 'Admin login successful',
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Admin login failed',
    });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const { date, shopperPeriod } = req.query;
    let today, tomorrow;

    if (date) {
      // Convert provided date to IST
      const inputDate = new Date(date);
      const istOffset = 5.5 * 60 * 60 * 1000;
      today = new Date(inputDate.getTime() + istOffset);
      today.setUTCHours(0, 0, 0, 0);
      tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    } else {
      // Get current IST date
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      today = new Date(now.getTime() + istOffset);
      today.setUTCHours(0, 0, 0, 0);
      tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    }

    const [
      totalUsers,
      totalShops,
      totalProducts,
      totalOrders,
      totalShoppers,
      recentOrders,
      monthlyStats,
      dailyOrders,
      deliveredOrders,
      cancelledOrders,
      dailyInquiries,
      shopperStats,
      pendingShoppersCount,
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      Shop.countDocuments(),
      Product.countDocuments(),
      Order.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        {
          $match: {
            'customer.email': {
              $nin: ['meetnp007@gmail.com', 'ayupro916@gmail.com', 'ce230004015@iiti.ac.in'],
            },
          },
        },
        {
          $count: 'total',
        },
      ]).then((result) => result[0]?.total || 0),
      PersonalShopper.countDocuments(),
      Order.find()
        .populate('customerId', 'name email')
        .populate('shopId', 'name')
        .populate('personalShopperId', 'name')
        .sort({ createdAt: -1 })
        .limit(10),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            revenue: { $sum: '$orderValue.total' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Daily orders count (excluding test email)
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        {
          $match: {
            'customer.email': {
              $nin: ['meetnp007@gmail.com', 'ayupro916@gmail.com', 'ce230004015@iiti.ac.in'],
            },
          },
        },
        {
          $count: 'total',
        },
      ]).then((result) => result[0]?.total || 0),
      // Daily delivered orders count (excluding test email)
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            status: 'delivered',
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        {
          $match: {
            'customer.email': {
              $nin: ['meetnp007@gmail.com', 'ayupro916@gmail.com', 'ce230004015@iiti.ac.in'],
            },
          },
        },
        {
          $count: 'total',
        },
      ]).then((result) => result[0]?.total || 0),
      // Daily cancelled orders count (excluding test email)
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            status: 'cancelled',
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        {
          $match: {
            'customer.email': {
              $nin: ['meetnp007@gmail.com', 'ayupro916@gmail.com', 'ce230004015@iiti.ac.in'],
            },
          },
        },
        {
          $count: 'total',
        },
      ]).then((result) => result[0]?.total || 0),
      // Shopper performance stats (total by default)
      Order.aggregate([
        {
          $match: {
            personalShopperId: { $exists: true },
            status: 'delivered',
          },
        },
        {
          $group: {
            _id: '$personalShopperId',
            totalOrders: { $sum: 1 },
            totalEarnings: { $sum: '$shopperCommission' },
          },
        },
        {
          $lookup: {
            from: 'personalshoppers',
            localField: '_id',
            foreignField: '_id',
            as: 'shopper',
          },
        },
        { $unwind: '$shopper' },
        { $sort: { totalOrders: -1 } },
      ]),
      // Daily inquiries count
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            'timeline.status': 'inquiry_made',
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
        {
          $match: {
            'customer.email': {
              $nin: ['meetnp007@gmail.com', 'ayupro916@gmail.com', 'ce230004015@iiti.ac.in'],
            },
          },
        },
        {
          $unwind: '$timeline',
        },
        {
          $match: {
            'timeline.status': 'inquiry_made',
            'timeline.timestamp': { $gte: today, $lt: tomorrow },
          },
        },
        {
          $count: 'total',
        },
      ]).then((result) => result[0]?.total || 0),
      PersonalShopper.countDocuments({ 'verification.isVerified': false }),
    ]);

    // Calculate revenue stats
    const revenueStats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$orderValue.total' },
          deliveredRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'delivered'] }, '$orderValue.total', 0],
            },
          },
          averageOrderValue: { $avg: '$orderValue.total' },
        },
      },
    ]);

    const revenue = revenueStats[0] || {
      totalRevenue: 0,
      deliveredRevenue: 0,
      averageOrderValue: 0,
    };

    // Order status distribution
    const orderStatusStats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get shopper stats based on period
    let shopperStatsFiltered = shopperStats;
    if (shopperPeriod === 'today') {
      shopperStatsFiltered = await Order.aggregate([
        {
          $match: {
            personalShopperId: { $exists: true },
            status: 'delivered',
            createdAt: { $gte: today, $lt: tomorrow },
          },
        },
        {
          $group: {
            _id: '$personalShopperId',
            totalOrders: { $sum: 1 },
            totalEarnings: { $sum: '$shopperCommission' },
          },
        },
        {
          $lookup: {
            from: 'personalshoppers',
            localField: '_id',
            foreignField: '_id',
            as: 'shopper',
          },
        },
        { $unwind: '$shopper' },
        { $sort: { totalOrders: -1 } },
      ]);
    } else if (shopperPeriod === 'date' && date) {
      // Convert selected date to IST
      const inputDate = new Date(date);
      const istOffset = 5.5 * 60 * 60 * 1000;
      const selectedDate = new Date(inputDate.getTime() + istOffset);
      selectedDate.setUTCHours(0, 0, 0, 0);
      const nextDay = new Date(selectedDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      shopperStatsFiltered = await Order.aggregate([
        {
          $match: {
            personalShopperId: { $exists: true },
            status: 'delivered',
            createdAt: { $gte: selectedDate, $lt: nextDay },
          },
        },
        {
          $group: {
            _id: '$personalShopperId',
            totalOrders: { $sum: 1 },
            totalEarnings: { $sum: '$shopperCommission' },
          },
        },
        {
          $lookup: {
            from: 'personalshoppers',
            localField: '_id',
            foreignField: '_id',
            as: 'shopper',
          },
        },
        { $unwind: '$shopper' },
        { $sort: { totalOrders: -1 } },
      ]);
    }

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalShops,
          totalProducts,
          totalOrders,
          totalShoppers,
          pendingShoppersCount,
          dailyOrders,
          dailyDeliveredOrders: deliveredOrders,
          dailyCancelledOrders: cancelledOrders,
          dailyInquiries,
          totalRevenue: Math.round(revenue.totalRevenue),
          deliveredRevenue: Math.round(revenue.deliveredRevenue),
          averageOrderValue: Math.round(revenue.averageOrderValue),
        },
        recentOrders,
        monthlyStats,
        orderStatusStats,
        shopperStats: shopperStatsFiltered,
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
    });
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = { role: { $ne: 'admin' } };

    if (role && role !== 'all') {
      filter.role = role;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
    });
  }
};

// Get all shops
exports.getAllShops = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, isActive, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { 'address.state': { $regex: search, $options: 'i' } },
      ];
    }

    const shops = await Shop.find(filter)
      .populate('vendorId', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Shop.countDocuments(filter);

    // Add product count for each shop
    const shopsWithStats = await Promise.all(
      shops.map(async (shop) => {
        const productCount = await Product.countDocuments({ shopId: shop._id });
        const orderCount = await Order.countDocuments({ shopId: shop._id });

        return {
          ...shop.toObject(),
          productCount,
          orderCount,
        };
      })
    );

    res.json({
      success: true,
      data: {
        shops: shopsWithStats,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error('Get all shops error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shops',
    });
  }
};

// Create shop (Admin)
exports.createShop = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      address,
      contact,
      images,
      operatingHours,
      tags,
      deliveryFee,
      minOrderValue,
      maxOrderValue,
      vendorId,
      hasTax,
      taxRate,
      hasPackaging,
      packagingCharges,
    } = req.body;

    // Validate required fields
    if (!name || !category || !address || !vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, address, and vendor ID are required',
      });
    }

    // Handle admin-created shops or validate vendor
    let validVendorId = null;
    if (vendorId && vendorId !== 'admin-created') {
      const vendor = await User.findById(vendorId);
      if (!vendor || vendor.role !== 'vendor') {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor ID',
        });
      }
      validVendorId = vendorId;
    }

    // Validate address structure
    if (!address.street || !address.city || !address.state) {
      return res.status(400).json({
        success: false,
        message: 'Complete address is required',
      });
    }

    // Create shop
    const shopData = {
      name,
      description,
      category,
      address,
      contact: contact || {},
      images: images || [],
      operatingHours: operatingHours || {},
      tags: tags || [],
      deliveryFee: deliveryFee || 0,
      minOrderValue: minOrderValue || 0,
      maxOrderValue: maxOrderValue || 10000,
      hasTax: hasTax === true || hasTax === 'on' || hasTax === 'true',
      taxRate: hasTax === true || hasTax === 'on' || hasTax === 'true' ? taxRate || 5 : 5,
      hasPackaging: hasPackaging === true || hasPackaging === 'on' || hasPackaging === 'true',
      packagingCharges:
        hasPackaging === true || hasPackaging === 'on' || hasPackaging === 'true'
          ? parseFloat(packagingCharges) || 10
          : 10,
      isActive: true,
      createdBy: 'admin',
    };

    // Set vendorId
    shopData.vendorId = validVendorId;

    const shop = new Shop(shopData);

    await shop.save();

    // Don't populate vendor for admin-created shops
    if (vendorId && vendorId !== 'admin-created') {
      await shop.populate('vendorId', 'name email phone');
    }

    console.log('✅ Shop created by admin:', shop.name);

    res.status(201).json({
      success: true,
      message: 'Shop created successfully',
      data: shop,
    });
  } catch (error) {
    console.error('❌ Error creating shop:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + errors.join(', '),
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create shop: ' + error.message,
      error: error.message,
    });
  }
};

// Get all orders
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [{ orderNumber: { $regex: search, $options: 'i' } }];
    }

    const orders = await Order.find(filter)
      .populate('customerId', 'name email phone')
      .populate('shopId', 'name category')
      .populate('personalShopperId', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
    });
  }
};

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, shopId, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (shopId) {
      filter.shopId = shopId;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const products = await Product.find(filter)
      .populate('shopId', 'name category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(filter);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
    });
  }
};

// Get all personal shoppers
exports.getAllShoppers = async (req, res) => {
  try {
    const { page = 1, limit = 20, isOnline, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};

    if (isOnline !== undefined) {
      filter.isOnline = isOnline === 'true';
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const shoppers = await PersonalShopper.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PersonalShopper.countDocuments(filter);

    res.json({
      success: true,
      data: {
        shoppers,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error('Get all shoppers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch personal shoppers',
    });
  }
};

// Update user status
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(userId, { isActive }, { new: true });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user },
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
    });
  }
};

// Update shop status
exports.updateShopStatus = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { isActive } = req.body;

    const shop = await Shop.findByIdAndUpdate(shopId, { isActive }, { new: true });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found',
      });
    }

    res.json({
      success: true,
      message: `Shop ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { shop },
    });
  } catch (error) {
    console.error('Update shop status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shop status',
    });
  }
};

// Update shop visibility (Admin only)
exports.updateShopVisibility = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { isVisible } = req.body;

    // Validate shop ID
    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shop ID',
      });
    }

    // Validate isVisible parameter
    if (typeof isVisible !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isVisible must be a boolean value',
      });
    }

    // Find and update the shop
    const shop = await Shop.findByIdAndUpdate(
      shopId,
      { isVisible },
      { new: true, runValidators: true }
    );

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found',
      });
    }

    console.log(`✅ Shop visibility updated: ${shop.name} - ${isVisible ? 'Visible' : 'Hidden'}`);

    res.json({
      success: true,
      message: `Shop ${isVisible ? 'shown to' : 'hidden from'} customers successfully`,
      data: {
        shop: {
          _id: shop._id,
          name: shop.name,
          isVisible: shop.isVisible,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error updating shop visibility:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};

// Update shop (Admin only)
exports.updateShop = async (req, res) => {
  const updateData = req.body;
  try {
    const { shopId } = req.params;

    // Validate shop ID
    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shop ID',
      });
    }

    // Find the shop
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found',
      });
    }

    // Validate coordinates if provided
    if (updateData.address?.coordinates) {
      const { lat, lng } = updateData.address.coordinates;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coordinates',
        });
      }
    }

    // Update fields
    if (updateData.name) shop.name = updateData.name.trim();
    if (updateData.description !== undefined) shop.description = updateData.description?.trim();
    if (updateData.category) shop.category = updateData.category;
    if (updateData.deliveryFee !== undefined)
      shop.deliveryFee = parseFloat(updateData.deliveryFee) || 0;
    if (updateData.deliveryFeeMode !== undefined) shop.deliveryFeeMode = updateData.deliveryFeeMode;
    if (updateData.feePerKm !== undefined) shop.feePerKm = parseFloat(updateData.feePerKm) || 10;
    if (updateData.hasTax !== undefined)
      shop.hasTax =
        updateData.hasTax === true || updateData.hasTax === 'on' || updateData.hasTax === 'true';
    if (updateData.taxRate !== undefined) shop.taxRate = parseFloat(updateData.taxRate) || 5;
    if (updateData.hasPackaging !== undefined) {
      shop.hasPackaging =
        updateData.hasPackaging === true ||
        updateData.hasPackaging === 'on' ||
        updateData.hasPackaging === 'true';
    }
    if (updateData.packagingCharges !== undefined) {
      shop.packagingCharges = parseFloat(updateData.packagingCharges) || 10;
    }
    if (updateData.inquiryAvailableTime !== undefined) {
      const inquiryTime = parseInt(updateData.inquiryAvailableTime);
      if (inquiryTime >= 5 && inquiryTime <= 120) {
        shop.inquiryAvailableTime = inquiryTime;
      }
    }

    // Update address if provided
    if (updateData.address) {
      if (updateData.address.street) shop.address.street = updateData.address.street;
      if (updateData.address.city) shop.address.city = updateData.address.city;
      if (updateData.address.state) shop.address.state = updateData.address.state;
      if (updateData.address.zipCode) shop.address.zipCode = updateData.address.zipCode;
      if (updateData.address.coordinates) {
        shop.address.coordinates = {
          lat: parseFloat(updateData.address.coordinates.lat),
          lng: parseFloat(updateData.address.coordinates.lng),
        };
      }
    }

    // Update operating hours if provided
    if (updateData.operatingHours) {
      Object.keys(updateData.operatingHours).forEach((day) => {
        if (shop.operatingHours[day]) {
          shop.operatingHours[day] = {
            ...shop.operatingHours[day],
            ...updateData.operatingHours[day],
          };
        }
      });
    }

    // Save the updated shop
    await shop.save();

    console.log('✅ Admin updated shop:', shop.name);

    res.json({
      success: true,
      message: 'Shop updated successfully',
      data: shop,
    });
  } catch (error) {
    console.error('Admin update shop error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      shopId: req.params.shopId,
      updateData,
    });

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update shop',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Update order status (Admin override)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, note } = req.body;

    const order = await Order.findById(orderId)
      .populate('customerId', 'name email')
      .populate('shopId', 'name');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Handle cancellation by admin
    if (status === 'cancelled') {
      order.status = status;
      order.cancelledBy = 'admin';
      order.reason = note || 'Cancelled by admin';
      order.timeline.push({
        status,
        timestamp: new Date(),
        note: note || `Order cancelled by admin`,
        updatedBy: 'admin',
      });
    } else {
      order.status = status;
      order.timeline.push({
        status,
        timestamp: new Date(),
        note: note || `Status updated by admin`,
        updatedBy: 'admin',
      });
    }

    await order.save();

    // Emit socket events
    const io = req.app.get('io');

    // Notify customer
    io.to(`customer_${order.customerId._id || order.customerId}`).emit('orderStatusUpdate', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      message: order.getStatusMessage(),
      updatedBy: 'admin',
    });

    // Notify shopper if assigned
    if (order.personalShopperId) {
      io.to(`shopper_${order.personalShopperId}`).emit('orderStatusUpdate', {
        orderId: order._id,
        status: order.status,
        message: `Order ${order.orderNumber} status updated by admin`,
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order },
    });
  } catch (error) {
    console.error('Admin update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
    });
  }
};

// Cancel order with reason (Admin only)
exports.cancelOrderWithReason = async (req, res) => {
  console.log('🔄 Admin cancel order request received');
  console.log('🔄 Order ID:', req.params.orderId);
  console.log('🔄 Request body:', req.body);

  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required',
      });
    }

    const order = await Order.findById(orderId)
      .populate('customerId', 'name email')
      .populate('shopId', 'name');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if order can be cancelled
    if (order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel delivered orders',
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled',
      });
    }

    // Update order with cancellation details
    order.status = 'cancelled';
    order.cancelledBy = 'admin';
    order.cancellationReason = reason.trim();
    order.cancelledAt = new Date();

    order.timeline.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: `Order cancelled by admin: ${reason.trim()}`,
      updatedBy: 'admin',
    });

    await order.save();

    // Emit socket events
    const io = req.app.get('io');

    // Notify customer
    io.to(`customer_${order.customerId._id || order.customerId}`).emit('orderCancelled', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      reason: reason.trim(),
      cancelledBy: 'admin',
    });

    // Notify shopper if assigned
    if (order.personalShopperId) {
      io.to(`shopper_${order.personalShopperId}`).emit('orderCancelled', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        reason: reason.trim(),
        cancelledBy: 'admin',
      });
    }

    // Send automated cancellation email
    sendOrderBill(order, 'cancelled').catch((err) =>
      console.error('Cancellation email error:', err)
    );

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order: {
          _id: order._id,
          status: order.status,
          cancellationReason: order.cancellationReason,
          cancelledBy: order.cancelledBy,
          cancelledAt: order.cancelledAt,
        },
      },
    });
  } catch (error) {
    console.error('Admin cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
    });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user has active orders
    const activeOrders = await Order.countDocuments({
      customerId: userId,
      status: { $nin: ['delivered', 'cancelled', 'refunded'] },
    });

    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user with active orders',
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // If user is a vendor, unlink their shops so they can be claimed by a new vendor.
    // Shops are admin-managed assets and must NOT be deleted along with the vendor account.
    if (user.role === 'vendor') {
      await Shop.updateMany({ vendorId: userId }, { $unset: { vendorId: '' } });
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
    });
  }
};

// Verify personal shopper (approve/reject)
exports.verifyShopper = async (req, res) => {
  try {
    const { shopperId } = req.params;
    const { isVerified } = req.body;

    const shopper = await PersonalShopper.findByIdAndUpdate(
      shopperId,
      {
        'verification.isVerified': isVerified,
        'verification.verifiedAt': isVerified ? new Date() : null,
      },
      { new: true }
    );

    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: 'Personal shopper not found',
      });
    }

    console.log(`📡 Admin ${isVerified ? 'approved' : 'unverified'} shopper ${shopper.name}`);

    res.json({
      success: true,
      message: `Shopper ${isVerified ? 'approved' : 'unverified'} successfully`,
      data: { shopper },
    });
  } catch (error) {
    console.error('Verify shopper error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify shopper',
    });
  }
};

// Update shopper status
exports.updateShopperStatus = async (req, res) => {
  try {
    const { shopperId } = req.params;
    const { isOnline } = req.body;

    const shopper = await PersonalShopper.findByIdAndUpdate(shopperId, { isOnline }, { new: true });

    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: 'Personal shopper not found',
      });
    }

    // Emit Socket.IO event to force shopper status update
    const io = req.app.get('io');
    if (io) {
      // Notify the specific shopper about status change
      io.to(`shopper_${shopperId}`).emit('adminStatusUpdate', {
        isOnline,
        message: isOnline ? 'Admin set you online' : 'Admin set you offline',
        forceStatus: true,
      });

      // Also notify all connected clients about shopper status change
      io.emit('shopperStatusChanged', {
        shopperId,
        isOnline,
        shopperName: shopper.name,
      });

      console.log(`📡 Admin ${isOnline ? 'enabled' : 'disabled'} shopper ${shopper.name}`);
    }

    res.json({
      success: true,
      message: `Shopper status updated successfully`,
      isOnline: shopper.isOnline,
      data: { shopper },
    });
  } catch (error) {
    console.error('Update shopper status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shopper status',
    });
  }
};

// Delete personal shopper
exports.deletePersonalShopper = async (req, res) => {
  try {
    const { shopperId } = req.params;

    // Check if shopper has active orders
    const activeOrders = await Order.countDocuments({
      personalShopperId: shopperId,
      status: { $nin: ['delivered', 'cancelled', 'refunded'] },
    });

    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete shopper with active orders',
      });
    }

    const shopper = await PersonalShopper.findByIdAndDelete(shopperId);

    if (!shopper) {
      return res.status(404).json({
        success: false,
        message: 'Personal shopper not found',
      });
    }

    res.json({
      success: true,
      message: 'Personal shopper deleted successfully',
    });
  } catch (error) {
    console.error('Delete personal shopper error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete personal shopper',
    });
  }
};

// Delete shop
exports.deleteShop = async (req, res) => {
  try {
    const { shopId } = req.params;

    // Check if shop has active orders
    const activeOrders = await Order.countDocuments({
      shopId,
      status: { $nin: ['delivered', 'cancelled', 'refunded'] },
    });

    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete shop with active orders',
      });
    }

    const shop = await Shop.findByIdAndDelete(shopId);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found',
      });
    }

    // Delete all products under this shop
    await Product.deleteMany({ shopId });

    res.json({
      success: true,
      message: 'Shop and its products deleted successfully',
    });
  } catch (error) {
    console.error('Delete shop error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete shop',
    });
  }
};

// Create a new product (Admin only)
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      shopId,
      category,
      price,
      originalPrice,
      discount,
      images,
      stockQuantity,
      unit,
      tags,
      nutritionalInfo,
    } = req.body;

    // Validate required fields
    if (!name || !shopId || !category || !price) {
      return res.status(400).json({
        success: false,
        message: 'Name, shop ID, category, and price are required',
      });
    }

    // Verify shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found',
      });
    }

    // Check if product with same name exists in this shop
    const existingProduct = await Product.findOne({
      shopId,
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product with this name already exists in this shop',
      });
    }

    // Create product with retry logic for SKU conflicts
    let product;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        product = new Product({
          name: name.trim(),
          description: description?.trim(),
          shopId,
          category,
          price: parseFloat(price),
          originalPrice: originalPrice ? parseFloat(originalPrice) : null,
          discount: discount || 0,
          images: images || [],
          stockQuantity: stockQuantity || 0,
          unit: unit || 'piece',
          tags: tags || [],
          nutritionalInfo: nutritionalInfo || {},
          inStock: (stockQuantity || 0) > 0,
        });

        await product.save();
        break; // Success, exit retry loop
      } catch (error) {
        if (error.code === 11000 && attempts < maxAttempts - 1) {
          // Duplicate key error, retry with a small delay
          console.log(`SKU conflict detected, retrying... (attempt ${attempts + 1})`);
          await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
          attempts++;
          continue;
        } else {
          throw error; // Re-throw if not a duplicate key error or max attempts reached
        }
      }
    }

    // Populate shop info for response
    await product.populate('shopId', 'name');

    console.log('✅ Admin created product:', product.name);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    console.error('Admin create product error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + errors.join(', '),
        errors,
      });
    }

    // Handle duplicate key errors (including SKU duplicates)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      return res.status(400).json({
        success: false,
        message: `A product with this ${field} already exists. Please try again.`,
        error: `Duplicate ${field}: ${value}`,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Update a product (Admin only)
exports.updateProduct = async (req, res) => {
  const { productId } = req.params;
  const updateData = req.body;

  try {
    // Validate product ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
    }

    // Find the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Update fields
    if (updateData.name) product.name = updateData.name.trim();
    if (updateData.description !== undefined) product.description = updateData.description?.trim();
    if (updateData.category) product.category = updateData.category;
    if (updateData.price !== undefined) product.price = parseFloat(updateData.price);
    if (updateData.originalPrice !== undefined) {
      product.originalPrice = updateData.originalPrice
        ? parseFloat(updateData.originalPrice)
        : null;
    }
    if (updateData.discount !== undefined) product.discount = parseFloat(updateData.discount) || 0;
    if (updateData.stockQuantity !== undefined) {
      product.stockQuantity = parseInt(updateData.stockQuantity) || 0;
    }
    if (updateData.unit) {
      // Validate unit against allowed values
      const allowedUnits = [
        'piece',
        'kg',
        'gram',
        'liter',
        'ml',
        'dozen',
        'pack',
        'box',
        'bottle',
        'can',
        'strip',
      ];
      const unitLower = updateData.unit.toLowerCase();
      if (allowedUnits.includes(unitLower)) {
        product.unit = unitLower;
      } else {
        // If unit is not allowed, default to 'piece' and log warning
        console.warn(`Invalid unit "${updateData.unit}" provided, defaulting to 'piece'`);
        product.unit = 'piece';
      }
    }
    if (updateData.tags !== undefined) {
      product.tags = Array.isArray(updateData.tags) ? updateData.tags : [];
    }
    if (updateData.inStock !== undefined) {
      product.inStock = updateData.inStock;
    }

    // Update inStock based on stockQuantity if not explicitly set
    if (updateData.stockQuantity !== undefined && updateData.inStock === undefined) {
      product.inStock = product.stockQuantity > 0;
    }

    // Save the updated product
    await product.save();

    // Populate shop info for response
    await product.populate('shopId', 'name');

    console.log('✅ Admin updated product:', product.name);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    console.error('Admin update product error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      productId,
      updateData,
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Delete product (Admin)
exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findByIdAndDelete(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
    });
  }
};

// Get system analytics
exports.getAnalytics = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [userGrowth, orderTrends, revenueAnalytics, topShops, topShoppers] = await Promise.all([
      // User growth over time
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            role: { $ne: 'admin' },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              role: '$role',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),

      // Order trends
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),

      // Revenue analytics
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered',
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$orderValue.total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Top performing shops
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered',
          },
        },
        {
          $group: {
            _id: '$shopId',
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$orderValue.total' },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'shops',
            localField: '_id',
            foreignField: '_id',
            as: 'shop',
          },
        },
        { $unwind: '$shop' },
      ]),

      // Top performing shoppers
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered',
            personalShopperId: { $exists: true },
          },
        },
        {
          $group: {
            _id: '$personalShopperId',
            totalOrders: { $sum: 1 },
            totalEarnings: { $sum: '$shopperCommission' },
          },
        },
        { $sort: { totalOrders: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'personalshoppers',
            localField: '_id',
            foreignField: '_id',
            as: 'shopper',
          },
        },
        { $unwind: '$shopper' },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        userGrowth,
        orderTrends,
        revenueAnalytics,
        topShops,
        topShoppers,
        period: days,
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
    });
  }
};
// GET Shop-wise Revenue by Month & Day (Admin only)
exports.getShopRevenue = async (req, res) => {
  try {
    console.log('📊 Admin revenue aggregation request received');

    const testShopIds = [
      new mongoose.Types.ObjectId('670940cc247be91357f12bc8'), // Sample Test shop
      new mongoose.Types.ObjectId('672be9c530e3770de238690f'), // Sample Test Shop
    ];

    // 1. Get total partnered shops (excluding test shops)
    const totalShops = await Shop.countDocuments({ _id: { $nin: testShopIds } });

    // Commission is calculated on the shop's own sales only: product subtotal
    // plus taxes (taxes are already 0 on orders from shops without hasTax
    // enabled). Delivery fee goes to the shopper and packaging charges are a
    // pass-through cost, so neither counts toward the shop's revenue here.
    const commissionableRevenueExpr = {
      $add: ['$orderValue.subtotal', { $ifNull: ['$orderValue.taxes', 0] }],
    };

    // 2. Global statistics (delivered orders only, excluding test shops)
    const globalStats = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          shopId: { $nin: testShopIds },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: commissionableRevenueExpr },
          totalOrders: { $sum: 1 },
        },
      },
    ]);

    // 3. Time-based statistics (Current Month, Today, Yesterday)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const now = new Date();
    const nowIST = new Date(now.getTime() + istOffset);

    // Month stats
    const startOfMonth = new Date(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1);
    const startOfMonthUTC = new Date(startOfMonth.getTime() - istOffset);

    // Day stats
    const todayStartIST = new Date(nowIST);
    todayStartIST.setUTCHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setUTCDate(todayEndIST.getUTCDate() + 1);

    const yesterdayStartIST = new Date(todayStartIST);
    yesterdayStartIST.setUTCDate(yesterdayStartIST.getUTCDate() - 1);

    const todayStartUTC = new Date(todayStartIST.getTime() - istOffset);
    const todayEndUTC = new Date(todayEndIST.getTime() - istOffset);
    const yesterdayStartUTC = new Date(yesterdayStartIST.getTime() - istOffset);
    const yesterdayEndUTC = todayStartUTC;

    const [monthStats, todayStats, yesterdayStats] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            status: 'delivered',
            shopId: { $nin: testShopIds },
            createdAt: { $gte: startOfMonthUTC },
          },
        },
        {
          $group: { _id: null, revenue: { $sum: commissionableRevenueExpr }, orders: { $sum: 1 } },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            status: 'delivered',
            shopId: { $nin: testShopIds },
            createdAt: { $gte: todayStartUTC, $lt: todayEndUTC },
          },
        },
        {
          $group: { _id: null, revenue: { $sum: commissionableRevenueExpr }, orders: { $sum: 1 } },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            status: 'delivered',
            shopId: { $nin: testShopIds },
            createdAt: { $gte: yesterdayStartUTC, $lt: yesterdayEndUTC },
          },
        },
        {
          $group: { _id: null, revenue: { $sum: commissionableRevenueExpr }, orders: { $sum: 1 } },
        },
      ]),
    ]);

    // 4. Per-shop detailed breakdown (all-time + monthly, excluding test shops)
    const revenueByShop = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          shopId: { $nin: testShopIds },
        },
      },
      {
        $group: {
          _id: {
            shopId: '$shopId',
            year: { $year: { $add: ['$createdAt', istOffset] } },
            month: { $month: { $add: ['$createdAt', istOffset] } },
          },
          monthlyRevenue: { $sum: commissionableRevenueExpr },
          monthlyOrders: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.shopId',
          allTimeRevenue: { $sum: '$monthlyRevenue' },
          allTimeOrders: { $sum: '$monthlyOrders' },
          monthlyBreakdown: {
            $push: {
              year: '$_id.year',
              month: '$_id.month',
              revenue: '$monthlyRevenue',
              orders: '$monthlyOrders',
            },
          },
        },
      },
    ]);

    // 5. Per-shop daily breakdown (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyRevenueByShop = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          shopId: { $nin: testShopIds },
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            shopId: '$shopId',
            date: {
              $dateToString: { format: '%Y-%m-%d', date: { $add: ['$createdAt', istOffset] } },
            },
          },
          dailyRevenue: { $sum: commissionableRevenueExpr },
          dailyOrders: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.shopId',
          dailyBreakdown: {
            $push: {
              date: '$_id.date',
              revenue: '$dailyRevenue',
              orders: '$dailyOrders',
            },
          },
        },
      },
    ]);

    // Merge daily into main revenue data
    const dailyMap = new Map(
      dailyRevenueByShop.map((item) => [item._id.toString(), item.dailyBreakdown])
    );

    // 6. Fetch shop info and finalize list
    const activeShops = await Shop.find(
      { _id: { $nin: testShopIds } },
      { name: 1, _id: 1, isVisible: 1, hasTax: 1 }
    );
    const revenueMap = new Map(revenueByShop.map((item) => [item._id.toString(), item]));

    const finalShops = activeShops.map((shop) => {
      const idStr = shop._id.toString();
      const revData = revenueMap.get(idStr) || {
        allTimeRevenue: 0,
        allTimeOrders: 0,
        monthlyBreakdown: [],
      };
      const dailyData = dailyMap.get(idStr) || [];

      // Sort breakdowns
      revData.monthlyBreakdown.sort((a, b) =>
        b.year !== a.year ? b.year - a.year : b.month - a.month
      );
      dailyData.sort((a, b) => b.date.localeCompare(a.date));

      return {
        shopId: shop._id,
        shopName: shop.name,
        isVisible: shop.isVisible,
        hasTax: !!shop.hasTax,
        allTimeRevenue: revData.allTimeRevenue,
        allTimeOrders: revData.allTimeOrders,
        monthlyBreakdown: revData.monthlyBreakdown,
        dailyBreakdown: dailyData,
      };
    });

    // Sort by visibility (Visible first) and then by name
    finalShops.sort((a, b) => {
      if (a.isVisible !== b.isVisible) {
        return a.isVisible ? -1 : 1;
      }
      return a.shopName.localeCompare(b.shopName);
    });

    console.log(`✅ Revenue data aggregated and filtered with sorting.`);

    res.json({
      success: true,
      data: {
        summary: {
          partnerShops: totalShops,
          totalRevenue: globalStats[0]?.totalRevenue || 0,
          totalOrders: globalStats[0]?.totalOrders || 0,
          currentMonthRevenue: monthStats[0]?.revenue || 0,
          currentMonthOrders: monthStats[0]?.orders || 0,
          todayRevenue: todayStats[0]?.revenue || 0,
          todayOrders: todayStats[0]?.orders || 0,
          yesterdayRevenue: yesterdayStats[0]?.revenue || 0,
          yesterdayOrders: yesterdayStats[0]?.orders || 0,
        },
        shops: finalShops,
      },
    });
  } catch (error) {
    console.error('❌ Get shop revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop revenue details',
    });
  }
};

// Terms and Conditions Management

// Get current active terms
exports.getCurrentTerms = async (req, res) => {
  try {
    const terms = await TermsAndConditions.getCurrentTerms();

    if (!terms) {
      return res.json({
        success: true,
        data: { terms: null },
      });
    }

    // Check if current user has accepted these terms
    let hasAccepted = false;
    if (req.user) {
      hasAccepted = terms.hasUserAccepted(req.user._id);
    }

    res.json({
      success: true,
      data: {
        terms: {
          _id: terms._id,
          title: terms.title,
          content: terms.content,
          version: terms.version,
          createdAt: terms.createdAt,
          hasAccepted,
        },
      },
    });
  } catch (error) {
    console.error('Get current terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms and conditions',
    });
  }
};

// Accept terms (for customers)
exports.acceptTerms = async (req, res) => {
  try {
    const { termsId } = req.body;
    const userId = req.user._id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    if (!termsId) {
      return res.status(400).json({
        success: false,
        message: 'Terms ID is required',
      });
    }

    const terms = await TermsAndConditions.findById(termsId);

    if (!terms || !terms.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found or inactive',
      });
    }

    // Check if user already accepted
    if (terms.hasUserAccepted(userId)) {
      return res.json({
        success: true,
        message: 'Terms already accepted',
      });
    }

    // Add acceptance
    await terms.addAcceptance(userId, ipAddress, userAgent);

    // Emit real-time update to admin
    if (req.io) {
      req.io.emit('termsAcceptanceUpdate', {
        termsId: terms._id,
        acceptanceCount: terms.acceptanceCount,
        newAcceptance: {
          userId,
          acceptedAt: new Date(),
        },
      });
    }

    res.json({
      success: true,
      message: 'Terms and conditions accepted successfully',
    });
  } catch (error) {
    console.error('Accept terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept terms and conditions',
    });
  }
};

// Admin: Create new terms
exports.createTerms = async (req, res) => {
  try {
    const { title, content, version } = req.body;

    console.log('📝 Create terms request:', { title, version });
    console.log('🔍 Admin user:', { id: req.user?._id, name: req.user?.name });

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required',
      });
    }

    if (!req.user) {
      console.error('❌ Create terms error: req.user is undefined');
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      });
    }

    // Deactivate previous terms
    await TermsAndConditions.updateMany({ isActive: true }, { isActive: false });

    // Create new terms - handle both system admin (string id) and database admins (ObjectId)
    let createdById = req.user._id;

    // If system admin (id === 'admin'), create a temporary ObjectId for reference
    if (createdById === 'admin') {
      createdById = new mongoose.Types.ObjectId();
    }

    const terms = new TermsAndConditions({
      title: title.trim(),
      content: content.trim(),
      version: version?.trim() || '1.0',
      createdBy: createdById,
      isActive: true,
    });

    await terms.save();

    console.log('✅ Terms created:', { id: terms._id, title: terms.title });

    // Emit real-time notification to all customers
    if (req.io) {
      req.io.emit('newTermsCreated', {
        termsId: terms._id,
        title: terms.title,
        version: terms.version,
        createdAt: terms.createdAt,
      });
      console.log('📡 Socket event emitted: newTermsCreated');
    }

    res.status(201).json({
      success: true,
      message: 'Terms and conditions created successfully',
      data: { terms },
    });
  } catch (error) {
    console.error('❌ Create terms error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create terms and conditions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Admin: Get all terms with acceptance stats
exports.getAllTerms = async (req, res) => {
  try {
    const terms = await TermsAndConditions.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    const termsWithStats = terms.map((term) => ({
      _id: term._id,
      title: term.title,
      content: term.content,
      version: term.version,
      isActive: term.isActive,
      acceptanceCount: term.acceptanceCount,
      createdBy: term.createdBy,
      createdAt: term.createdAt,
      updatedAt: term.updatedAt,
    }));

    res.json({
      success: true,
      data: { terms: termsWithStats },
    });
  } catch (error) {
    console.error('Get all terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms and conditions',
    });
  }
};

// Admin: Get detailed acceptance data for specific terms
exports.getTermsAcceptanceDetails = async (req, res) => {
  try {
    const { termsId } = req.params;

    const terms = await TermsAndConditions.findById(termsId)
      .populate('acceptedBy.userId', 'name email phone')
      .populate('createdBy', 'name email');

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found',
      });
    }

    res.json({
      success: true,
      data: { terms },
    });
  } catch (error) {
    console.error('Get terms acceptance details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch acceptance details',
    });
  }
};

// Admin: Get live acceptance count
exports.getLiveAcceptanceCount = async (req, res) => {
  try {
    const { termsId } = req.params;

    const terms = await TermsAndConditions.findById(termsId);

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: 'Terms and conditions not found',
      });
    }

    res.json({
      success: true,
      data: {
        termsId: terms._id,
        acceptanceCount: terms.acceptanceCount,
        isActive: terms.isActive,
      },
    });
  } catch (error) {
    console.error('Get live acceptance count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch acceptance count',
    });
  }
};

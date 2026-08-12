// backend/server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const socketIo = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Loads .env.development locally (NODE_ENV=development) or .env / Render vars otherwise.
require('./config/loadEnv');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000', // Customer app
  'http://localhost:3001', // Admin app
  'http://localhost:3002', // Personal Shopper app
  'http://localhost:3003', // Shop Owner app
  'https://mangaloo-customer.vercel.app',
  'https://mangaloo-shopper.vercel.app',
  'https://mangaloo-admin.vercel.app',
  'https://mangaloo-customer-7bkrhol3p-meet-patels-projects-9dfa4870.vercel.app',
  'https://www.mangaloo.com',
  'https://admin.mangaloo.com',
  'https://shopper.mangaloo.com',
  'https://shopkeeper.mangaloo.com',
  'https://stagging.mangaloo.com',
  'https://stagging.admin.mangaloo.com',
  'https://stagging.admin.mangaloo.com',
  'capacitor://localhost',
  'http://localhost', // For Android/iOS
  'https://localhost', // For Android Production Build
  'http://10.0.2.2', // For Android Emulator
  'https://mangaloo-shop-owner.vercel.app',
  process.env.FRONTEND_URL,
  process.env.ADMIN_FRONTEND_URL,
  process.env.SHOPPER_FRONTEND_URL,
  process.env.SHOPKEEPER_FRONTEND_URL,
].filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

// Make io accessible in routes
app.set('io', io);

// Stripe webhook must be registered before body parsers
app.use('/api/webhook', require('./routes/webhook'));

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check exact matches first
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      }
      // Allow any Vercel deployment URLs for your projects
      else if (
        origin &&
        ((origin.includes('mangaloo-customer') && origin.includes('vercel.app')) ||
          (origin.includes('mangaloo-shopper') && origin.includes('vercel.app')) ||
          (origin.includes('mangaloo-admin') && origin.includes('vercel.app')) ||
          (origin.includes('mangaloo-shop-owner') && origin.includes('vercel.app')))
      ) {
        console.log('✅ CORS allowed Vercel deployment:', origin);
        callback(null, true);
      } else {
        console.log('❌ CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-File-Name',
    ],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  })
);

// Handle preflight requests explicitly
app.options('*', cors());

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware to pass io instance to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

/* ------------------------------------------------------------------ */
/*  Socket.IO logic                                                   */
/* ------------------------------------------------------------------ */
io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  // Generic join room handler
  socket.on('join', (roomName) => {
    socket.join(roomName);
    console.log(`✅ Socket ${socket.id} joined room: ${roomName}`);
  });

  // Legacy handlers for backward compatibility
  socket.on('authenticate', ({ userId }) => {
    socket.join(userId);
    console.log(`✅ User ${userId} joined room ${userId}`);
  });

  socket.on('registerCustomer', (customerId) => {
    socket.join(customerId);
    socket.join(`customer_${customerId}`);
    console.log(`👤 Customer ${customerId} joined their socket rooms`);
  });

  socket.on('registerPersonalShopper', (shopperId) => {
    socket.join('personalShoppers');
    socket.join(`shopper_${shopperId}`);
    console.log(`🛒 Personal Shopper ${shopperId} joined shopper rooms`);
  });

  // Handle Shopper Location Updates
  socket.on('shopperLocationUpdate', async (data) => {
    try {
      const { shopperId, location } = data;
      // console.log(`📍 Location update from Shopper ${shopperId}`);

      // Find all active orders for this shopper
      const Order = require('./models/Order');
      const activeOrders = await Order.find({
        personalShopperId: shopperId,
        status: {
          $in: [
            'accepted_by_shopper',
            'shopper_at_shop',
            'shopping_in_progress',
            'shopper_revised_order',
            'customer_reviewing_revision',
            'customer_approved_revision',
            'final_shopping',
            'picked_up',
            'out_for_delivery',
          ],
        },
      }).select('customerId _id');

      // Relay location to each customer
      activeOrders.forEach((order) => {
        if (order.customerId) {
          io.to(`customer_${order.customerId}`).emit('shopperLocationUpdate', {
            orderId: order._id,
            shopperId: shopperId,
            location: location,
          });
        }
      });

      // DEBUG BROADCAST: Help us debug why it might fail
      const debugInfo = {
        msg: 'Server received loc update',
        shopperId,
        ordersFound: activeOrders.length,
        customers: activeOrders.map((o) => o.customerId),
      };
      io.emit('debug_server_msg', debugInfo); // Broadcast to all for easy debugging
    } catch (error) {
      console.error('Error relaying location:', error);
      io.emit('debug_server_msg', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

/* ------------------------------------------------------------------ */
/*  MongoDB & routes                                                  */
/* ------------------------------------------------------------------ */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');

    // API Routes
    app.use('/api/auth', require('./routes/authRoutes'));
    app.use('/api/shops', require('./routes/shopRoutes'));
    app.use('/api/shop-owner', require('./routes/shopOwnerRoutes'));
    app.use('/api/products', require('./routes/productRoutes'));
    app.use('/api/orders', require('./routes/orderRoutes'));
    app.use('/api/payment', require('./routes/paymentRoutes'));
    app.use('/api/shopper/auth', require('./routes/shopperAuthRoutes'));
    app.use('/api/shopper', require('./routes/shopperOrderRoutes'));
    app.use('/api/admin', require('./routes/adminRoutes'));
    app.use('/api/contact', require('./routes/contactRoutes'));
    app.use('/api/notices', require('./routes/noticeRoutes'));
    app.use('/api/terms', require('./routes/termsRoutes'));
    app.use('/api/delivery', require('./routes/deliveryRoutes'));

    // Notice refresh job removed - using real-time notices instead

    app.get('/', (req, res) => {
      res.send('Mangaloo Backend API Running ✅');
    });

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`🚀 Server running with Socket.IO on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
  });

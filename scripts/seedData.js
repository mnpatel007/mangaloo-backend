const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const User = require('../models/User');
const PersonalShopper = require('../models/PersonalShopper');
require('../config/loadEnv');

const DEV_PASSWORD = 'Test@1234';

const devUsers = [
  { name: 'Dev Customer', email: 'customer@dev.com', phone: '9999900001', role: 'customer' },
  { name: 'Dev Vendor', email: 'vendor@dev.com', phone: '9999900002', role: 'vendor' },
  { name: 'Dev Admin', email: 'admin@dev.com', phone: '9999900003', role: 'admin' },
];

const sampleShops = [
  {
    name: 'Fresh Mart Grocery',
    description: 'Your neighborhood grocery store with fresh produce and daily essentials',
    category: 'grocery',
    address: {
      street: '123 Main Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400001',
      coordinates: {
        lat: 19.076,
        lng: 72.8777,
      },
    },
    contact: {
      phone: '9876543210',
      email: 'freshmart@example.com',
    },
    images: [],
    tags: ['grocery', 'fresh', 'vegetables', 'fruits'],
    deliveryFee: 0,
    minOrderValue: 200,
    isActive: true,
    operatingHours: {
      monday: { open: '08:00', close: '22:00', closed: false },
      tuesday: { open: '08:00', close: '22:00', closed: false },
      wednesday: { open: '08:00', close: '22:00', closed: false },
      thursday: { open: '08:00', close: '22:00', closed: false },
      friday: { open: '08:00', close: '22:00', closed: false },
      saturday: { open: '08:00', close: '22:00', closed: false },
      sunday: { open: '09:00', close: '21:00', closed: false },
    },
  },
  {
    name: 'MedPlus Pharmacy',
    description: 'Trusted pharmacy with medicines and health products',
    category: 'pharmacy',
    address: {
      street: '456 Health Avenue',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400002',
      coordinates: {
        lat: 19.0896,
        lng: 72.8656,
      },
    },
    contact: {
      phone: '9876543211',
      email: 'medplus@example.com',
    },
    images: [],
    tags: ['pharmacy', 'medicines', 'health'],
    deliveryFee: 25,
    minOrderValue: 100,
    isActive: true,
    operatingHours: {
      monday: { open: '09:00', close: '21:00', closed: false },
      tuesday: { open: '09:00', close: '21:00', closed: false },
      wednesday: { open: '09:00', close: '21:00', closed: false },
      thursday: { open: '09:00', close: '21:00', closed: false },
      friday: { open: '09:00', close: '21:00', closed: false },
      saturday: { open: '09:00', close: '21:00', closed: false },
      sunday: { open: '10:00', close: '20:00', closed: false },
    },
  },
  {
    name: 'TechZone Electronics',
    description: 'Latest gadgets and electronics at competitive prices',
    category: 'electronics',
    address: {
      street: '789 Tech Park',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400003',
      coordinates: {
        lat: 19.1136,
        lng: 72.8697,
      },
    },
    contact: {
      phone: '9876543212',
      email: 'techzone@example.com',
    },
    images: [],
    tags: ['electronics', 'gadgets', 'mobile', 'laptop'],
    deliveryFee: 50,
    minOrderValue: 500,
    isActive: true,
    operatingHours: {
      monday: { open: '10:00', close: '20:00', closed: false },
      tuesday: { open: '10:00', close: '20:00', closed: false },
      wednesday: { open: '10:00', close: '20:00', closed: false },
      thursday: { open: '10:00', close: '20:00', closed: false },
      friday: { open: '10:00', close: '20:00', closed: false },
      saturday: { open: '10:00', close: '20:00', closed: false },
      sunday: { open: '11:00', close: '19:00', closed: false },
    },
  },
  {
    name: 'Fashion Hub',
    description: 'Trendy clothing and accessories for all ages',
    category: 'clothing',
    address: {
      street: '321 Fashion Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400004',
      coordinates: {
        lat: 19.0544,
        lng: 72.832,
      },
    },
    contact: {
      phone: '9876543213',
      email: 'fashionhub@example.com',
    },
    images: [],
    tags: ['clothing', 'fashion', 'accessories'],
    deliveryFee: 30,
    minOrderValue: 300,
    isActive: true,
    operatingHours: {
      monday: { open: '10:00', close: '21:00', closed: false },
      tuesday: { open: '10:00', close: '21:00', closed: false },
      wednesday: { open: '10:00', close: '21:00', closed: false },
      thursday: { open: '10:00', close: '21:00', closed: false },
      friday: { open: '10:00', close: '22:00', closed: false },
      saturday: { open: '10:00', close: '22:00', closed: false },
      sunday: { open: '11:00', close: '21:00', closed: false },
    },
  },
  {
    name: 'Spice Garden Restaurant',
    description: 'Authentic Indian cuisine with home-style cooking',
    category: 'restaurant',
    address: {
      street: '654 Food Court',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400005',
      coordinates: {
        lat: 19.033,
        lng: 72.857,
      },
    },
    contact: {
      phone: '9876543214',
      email: 'spicegarden@example.com',
    },
    images: [],
    tags: ['restaurant', 'indian', 'food', 'spicy'],
    deliveryFee: 40,
    minOrderValue: 250,
    isActive: true,
    operatingHours: {
      monday: { open: '11:00', close: '23:00', closed: false },
      tuesday: { open: '11:00', close: '23:00', closed: false },
      wednesday: { open: '11:00', close: '23:00', closed: false },
      thursday: { open: '11:00', close: '23:00', closed: false },
      friday: { open: '11:00', close: '23:30', closed: false },
      saturday: { open: '11:00', close: '23:30', closed: false },
      sunday: { open: '12:00', close: '22:00', closed: false },
    },
  },
];

const sampleProducts = [
  // Fresh Mart Grocery Products
  {
    name: 'Fresh Bananas',
    description: 'Fresh yellow bananas - 1 dozen',
    category: 'fruits',
    price: 60,
    images: [],
    inStock: true,
    stockQuantity: 50,
    unit: 'dozen',
    tags: ['fresh', 'fruits', 'healthy'],
  },
  {
    name: 'Basmati Rice',
    description: 'Premium quality basmati rice - 5kg pack',
    category: 'grains',
    price: 450,
    images: [],
    inStock: true,
    stockQuantity: 25,
    unit: 'pack',
    tags: ['rice', 'grains', 'staple'],
  },
  {
    name: 'Fresh Milk',
    description: 'Fresh cow milk - 1 liter',
    category: 'dairy',
    price: 55,
    images: [],
    inStock: true,
    stockQuantity: 30,
    unit: 'liter',
    tags: ['milk', 'dairy', 'fresh'],
  },

  // MedPlus Pharmacy Products
  {
    name: 'Paracetamol Tablets',
    description: 'Pain relief tablets - 10 tablets strip',
    category: 'medicines',
    price: 25,
    images: [],
    inStock: true,
    stockQuantity: 100,
    unit: 'pack',
    tags: ['medicine', 'painkiller', 'fever'],
  },
  {
    name: 'Hand Sanitizer',
    description: 'Alcohol-based hand sanitizer - 500ml',
    category: 'hygiene',
    price: 120,
    images: [],
    inStock: true,
    stockQuantity: 40,
    unit: 'bottle',
    tags: ['sanitizer', 'hygiene', 'health'],
  },

  // TechZone Electronics Products
  {
    name: 'Wireless Earbuds',
    description: 'Bluetooth wireless earbuds with charging case',
    category: 'audio',
    price: 2500,
    originalPrice: 3000,
    discount: 17,
    images: [],
    inStock: true,
    stockQuantity: 15,
    unit: 'piece',
    tags: ['earbuds', 'wireless', 'bluetooth', 'audio'],
  },
  {
    name: 'Phone Charger',
    description: 'Fast charging USB-C cable and adapter',
    category: 'accessories',
    price: 800,
    images: [],
    inStock: true,
    stockQuantity: 35,
    unit: 'piece',
    tags: ['charger', 'usb-c', 'fast-charging'],
  },

  // Fashion Hub Products
  {
    name: 'Cotton T-Shirt',
    description: 'Comfortable cotton t-shirt - Various colors',
    category: 'clothing',
    price: 599,
    originalPrice: 799,
    discount: 25,
    images: [],
    inStock: true,
    stockQuantity: 20,
    unit: 'piece',
    tags: ['t-shirt', 'cotton', 'casual', 'comfortable'],
  },
  {
    name: 'Denim Jeans',
    description: 'Classic blue denim jeans - All sizes',
    category: 'clothing',
    price: 1299,
    images: [],
    inStock: true,
    stockQuantity: 12,
    unit: 'piece',
    tags: ['jeans', 'denim', 'casual', 'blue'],
  },

  // Spice Garden Restaurant Products
  {
    name: 'Butter Chicken',
    description: 'Creamy butter chicken with rice and naan',
    category: 'main-course',
    price: 320,
    images: [],
    inStock: true,
    stockQuantity: 999,
    unit: 'piece',
    tags: ['chicken', 'curry', 'indian', 'spicy'],
  },
  {
    name: 'Vegetable Biryani',
    description: 'Aromatic vegetable biryani with raita',
    category: 'main-course',
    price: 280,
    images: [],
    inStock: true,
    stockQuantity: 999,
    unit: 'piece',
    tags: ['biryani', 'vegetarian', 'rice', 'spicy'],
  },
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Old placeholder account, superseded by the named dev accounts below.
    await User.deleteOne({ email: 'vendor@example.com' });

    // Create/reset the fixed dev login accounts (see backend/DEV_SETUP.md).
    // Re-running the seed always resets these to a known password so login
    // never drifts out of sync with the docs.
    const createdUsers = {};
    for (const accountData of devUsers) {
      let user = await User.findOne({ email: accountData.email });
      if (!user) {
        user = new User(accountData);
      } else {
        Object.assign(user, accountData);
      }
      user.password = DEV_PASSWORD;
      user.isVerified = true;
      await user.save();
      createdUsers[accountData.role] = user;
      console.log(`Dev account ready: ${accountData.email} (${accountData.role})`);
    }
    const vendor = createdUsers.vendor;

    // Personal Shopper has no User-model password hook, so hash manually
    // (matches how shopperAuthController.registerShopper does it).
    const shopperPasswordHash = await bcrypt.hash(DEV_PASSWORD, 12);
    let shopper = await PersonalShopper.findOne({ email: 'shopper@dev.com' });
    if (!shopper) {
      shopper = new PersonalShopper({
        name: 'Dev Shopper',
        email: 'shopper@dev.com',
        phone: '9999900004',
      });
    }
    shopper.password = shopperPasswordHash;
    shopper.verification = { isVerified: true, verifiedAt: new Date() };
    await shopper.save();
    console.log('Dev account ready: shopper@dev.com (personalshopper)');

    // Clear existing data
    await Shop.deleteMany({});
    await Product.deleteMany({});
    console.log('Cleared existing shops and products');

    // Create shops
    const createdShops = [];
    for (const shopData of sampleShops) {
      const shop = new Shop({
        ...shopData,
        vendorId: vendor._id,
      });
      await shop.save();
      createdShops.push(shop);
      console.log(`Created shop: ${shop.name}`);
    }

    // Create products for each shop
    for (let i = 0; i < createdShops.length; i++) {
      const shop = createdShops[i];
      const productsForShop = sampleProducts.slice(i * 2, i * 2 + 2); // 2 products per shop

      for (const productData of productsForShop) {
        const product = new Product({
          ...productData,
          shopId: shop._id,
        });
        await product.save();
        console.log(`Created product: ${product.name} for ${shop.name}`);
      }
    }

    console.log('✅ Database seeded successfully!');
    console.log(`Created ${createdShops.length} shops and ${sampleProducts.length} products`);
    console.log('\n🔑 Dev login credentials (all use password: ' + DEV_PASSWORD + '):');
    console.log('customer@dev.com  -> client-customer');
    console.log('vendor@dev.com    -> client-shop-owner (owns the seeded shops)');
    console.log('admin@dev.com     -> client-admin');
    console.log('shopper@dev.com   -> client-shopper');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the seed function
seedDatabase();

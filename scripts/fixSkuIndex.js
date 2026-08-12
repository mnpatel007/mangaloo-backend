const mongoose = require('mongoose');
require('dotenv').config();

async function fixSkuIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mangaloo');
    console.log('Connected to MongoDB');

    // Get the products collection
    const db = mongoose.connection.db;
    const productsCollection = db.collection('products');

    // Drop the existing unique index on sku
    try {
      await productsCollection.dropIndex('sku_1');
      console.log('✅ Dropped unique index on sku field');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  Index sku_1 does not exist, nothing to drop');
      } else {
        console.error('Error dropping index:', error);
      }
    }

    // Create a new non-unique index on sku for better performance
    try {
      await productsCollection.createIndex({ sku: 1 }, { unique: false });
      console.log('✅ Created non-unique index on sku field');
    } catch (error) {
      console.error('Error creating index:', error);
    }

    console.log('✅ SKU index fix completed successfully');
  } catch (error) {
    console.error('Error fixing SKU index:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
fixSkuIndex();

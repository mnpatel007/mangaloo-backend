const Shop = require('../models/Shop');
const AppSettings = require('../models/AppSettings');

/**
 * Calculate delivery fee based on distance
 * @param {number} distance - Distance in kilometers
 * @returns {number} Delivery fee in rupees
 */
const calculateDeliveryFee = (distance) => {
  // Base delivery fee structure
  const baseFee = 30; // Base fee for up to 2km
  const perKmRate = 15; // Additional fee per km after 2km
  const maxFee = 150; // Maximum delivery fee cap

  if (distance <= 2) {
    return baseFee;
  } else if (distance <= 10) {
    return Math.min(baseFee + (distance - 2) * perKmRate, maxFee);
  } else {
    // For distances over 10km, add a premium
    return Math.min(baseFee + 8 * perKmRate + (distance - 10) * 20, 200);
  }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate complete order pricing with flexible delivery fees
 * @param {Array} items - Array of order items with price and quantity
 * @param {string} shopId - Shop ID to get coordinates
 * @param {Object} deliveryAddress - Delivery address with coordinates
 * @returns {Object} Complete pricing breakdown
 */
const calculateOrderPricing = async (items, shopId, deliveryAddress) => {
  try {
    const { calculateDeliveryFee: calculateLocationBasedFee } = require('./locationUtils');

    // Calculate subtotal from items
    const subtotal = items.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    // Get shop details with coordinates
    const shop = await Shop.findById(shopId);
    if (!shop || !shop.address.coordinates) {
      throw new Error('Shop not found or missing coordinates');
    }

    // Calculate delivery fee based on shop's mode
    const deliveryFeeCalculation = calculateLocationBasedFee(
      shop.address.coordinates.lat,
      shop.address.coordinates.lng,
      deliveryAddress.coordinates.lat,
      deliveryAddress.coordinates.lng,
      shop.deliveryFeeMode || 'fixed',
      shop.deliveryFee || 30,
      shop.feePerKm || 10
    );

    console.log('🏪 SHOP DEBUG:');
    console.log('  Shop name:', shop.name);
    console.log('  Delivery mode:', shop.deliveryFeeMode);
    console.log('  Fixed delivery fee:', shop.deliveryFee);
    console.log('  Fee per 500m:', shop.feePerKm);
    console.log('  Shop coordinates:', shop.address.coordinates);
    console.log('  Customer coordinates:', deliveryAddress.coordinates);
    console.log('💰 FEE CALCULATION RESULT:', deliveryFeeCalculation);

    const deliveryFee = deliveryFeeCalculation.totalFee;

    // Apply delivery discount
    const DeliveryDiscount = require('../models/DeliveryDiscount');
    // FIX: Pass shopId to findBestDiscount to ensure shop-specific discounts are found
    const discountResult = await DeliveryDiscount.findBestDiscount(deliveryFee, subtotal, shopId);
    const finalDeliveryFee = discountResult.finalFee;
    const deliveryDiscountAmount = discountResult.discountAmount;

    console.log('💰 Delivery Discount Applied:', {
      original: deliveryFee,
      discount: deliveryDiscountAmount,
      final: finalDeliveryFee,
      applied: discountResult.discountApplied?.name,
    });

    // Calculate taxes based on shop settings
    let taxes = 0;
    if (shop.hasTax && shop.taxRate > 0) {
      taxes = Math.round((subtotal * shop.taxRate) / 100);
      console.log(`Tax applied: ${shop.taxRate}% on subtotal ${subtotal} = ${taxes}`);
    } else {
      console.log('No tax applied - shop hasTax:', shop.hasTax, 'taxRate:', shop.taxRate);
    }

    // Calculate packaging charges based on shop settings
    let packagingCharges = 0;
    if (shop.hasPackaging && shop.packagingCharges > 0) {
      packagingCharges = shop.packagingCharges;
      console.log(`Packaging charges applied: ₹${shop.packagingCharges}`);
    } else {
      console.log('No packaging charges applied - shop hasPackaging:', shop.hasPackaging);
    }

    // Service fee is removed as per new requirements
    const serviceFee = 0;

    // Platform-wide flat convenience charge, set by admins. Applied per
    // order on top of everything else and deliberately NOT taxed, since
    // taxes here are calculated on the item subtotal only.
    const convenienceCharge = await AppSettings.getConvenienceCharge();

    // Calculate total (subtotal + delivery fee + taxes + packaging + convenience)
    const total = subtotal + finalDeliveryFee + taxes + packagingCharges + convenienceCharge;

    return {
      subtotal: Math.round(subtotal),
      taxes,
      packagingCharges,
      convenienceCharge,
      deliveryFee: finalDeliveryFee,
      originalDeliveryFee: deliveryFee,
      deliveryDiscount: deliveryDiscountAmount,
      deliveryDiscountApplied: discountResult.discountApplied,
      serviceFee,
      discount: 0, // Product discount (if any)
      total: Math.round(total),
      distance: deliveryFeeCalculation.distance, // Distance from shop in meters
      distanceKm: deliveryFeeCalculation.distanceKm, // Distance in km for display
      deliveryMode: deliveryFeeCalculation.mode,
      locationMessage: deliveryFeeCalculation.message,
      shopperEarning: finalDeliveryFee, // Shopper earns the discounted delivery fee
      deliveryFeeBreakdown: {
        baseFee: deliveryFeeCalculation.baseFee,
        distanceFee: deliveryFeeCalculation.distanceFee,
        segments: deliveryFeeCalculation.segments,
        discount: deliveryDiscountAmount,
      },
    };
  } catch (error) {
    console.error('Error calculating order pricing:', error);
    throw error;
  }
};

/**
 * Recalculate pricing when order is revised
 * @param {Array} revisedItems - Revised items array
 * @param {Object} originalPricing - Original pricing object
 * @param {Object} shop - Shop object with delivery fee
 * @returns {Object} Revised pricing breakdown
 */
const recalculateRevisedPricing = async (revisedItems, originalPricing, shop = null) => {
  // Calculate new subtotal from revised items
  const subtotal = revisedItems.reduce((sum, item) => {
    if (item.isAvailable !== false && (item.revisedQuantity > 0 || item.quantity > 0)) {
      const price = item.revisedPrice !== undefined ? item.revisedPrice : item.price;
      const quantity = item.revisedQuantity !== undefined ? item.revisedQuantity : item.quantity;
      return sum + price * quantity;
    }
    return sum;
  }, 0);

  // Calculate taxes based on shop settings
  let taxes = 0;
  if (shop && shop.hasTax && shop.taxRate > 0) {
    taxes = Math.round((subtotal * shop.taxRate) / 100);
  }

  // Calculate packaging charges based on shop settings
  let packagingCharges = 0;
  if (shop && shop.hasPackaging && shop.packagingCharges > 0) {
    packagingCharges = shop.packagingCharges;
  }

  // Always use shop's delivery fee (default to original if shop not provided)
  // Note: If shop is provided, we use its base delivery fee, but we should ideally recalculate based on location if we had coordinates.
  // For revision, we usually assume location hasn't changed, so we stick to the original fee logic or shop's fixed fee.
  // However, we MUST re-apply the discount based on the new subtotal.

  let baseDeliveryFee = originalPricing.originalDeliveryFee || originalPricing.deliveryFee;
  if (shop && shop.deliveryFee !== undefined) {
    // If shop object is passed, we might want to use its fee, but originalPricing.originalDeliveryFee is safer if it was distance based.
    // If originalPricing has originalDeliveryFee, use it.
  }

  // Apply delivery discount
  const DeliveryDiscount = require('../models/DeliveryDiscount');
  // FIX: Pass shop._id if available
  const discountResult = await DeliveryDiscount.findBestDiscount(
    baseDeliveryFee,
    subtotal,
    shop ? shop._id : null
  );
  const finalDeliveryFee = discountResult.finalFee;
  const deliveryDiscountAmount = discountResult.discountAmount;

  // The convenience charge is a flat per-order fee, so it survives a
  // revision unchanged - removing items must not remove it.
  const convenienceCharge = await AppSettings.getConvenienceCharge();

  // Calculate new total (subtotal + delivery fee + taxes + packaging + convenience)
  const total = subtotal + finalDeliveryFee + taxes + packagingCharges + convenienceCharge;

  return {
    subtotal: Math.round(subtotal),
    taxes,
    packagingCharges,
    convenienceCharge,
    deliveryFee: finalDeliveryFee,
    originalDeliveryFee: baseDeliveryFee,
    deliveryDiscount: deliveryDiscountAmount,
    deliveryDiscountApplied: discountResult.discountApplied,
    discount: 0,
    total: Math.round(total),
    distance: originalPricing.distance,
    shopperEarning: finalDeliveryFee, // Shopper earns exactly the delivery fee
  };
};

module.exports = {
  calculateDeliveryFee,
  calculateDistance,
  calculateOrderPricing,
  recalculateRevisedPricing,
};

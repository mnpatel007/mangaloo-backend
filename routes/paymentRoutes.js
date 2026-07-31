const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');

router.post('/create-checkout-session', protect, restrictTo('customer'), async (req, res) => {
  try {
    const { items, address, deliveryCharge } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid items in request' });
    }

    let itemTotal = 0;
    const shopSet = new Set();

    const lineItems = items.map((item) => {
      if (!item.product || !item.product.name || !item.product.price || !item.quantity) {
        throw new Error('Invalid product structure in items');
      }

      itemTotal += item.product.price * item.quantity;
      shopSet.add(item.product.shopId);

      return {
        price_data: {
          currency: 'inr',
          product_data: {
            name: item.product.name,
          },
          unit_amount: Math.round(item.product.price * 100),
        },
        quantity: item.quantity,
      };
    });

    // CRITICAL: never take payment for a closed shop / globally closed platform.
    const GlobalShopClosure = require('../models/GlobalShopClosure');
    const activeClosure = await GlobalShopClosure.getActiveClosure();
    if (activeClosure) {
      return res.status(400).json({
        error: 'All shops are currently closed. Please try again later.',
        shopClosed: true,
      });
    }
    const Shop = require('../models/Shop');
    for (const sid of shopSet) {
      const shop = await Shop.findById(sid);
      if (!shop || !shop.isActive || !shop.isOpenNow()) {
        return res.status(400).json({
          error: `${shop?.name || 'This shop'} is currently closed. Please try again later.`,
          shopClosed: true,
        });
      }
    }

    // NO TAXES - ONLY delivery fee
    const finalDeliveryCharge = deliveryCharge || 30;

    // Delivery
    lineItems.push({
      price_data: {
        currency: 'inr',
        product_data: { name: 'Delivery Charge' },
        unit_amount: Math.round(finalDeliveryCharge * 100),
      },
      quantity: 1,
    });

    const formattedItems = items.map((i) => ({
      productId: i.product._id,
      quantity: i.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: `${process.env.FRONTEND_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cart`,
      metadata: {
        customData: JSON.stringify({
          items: formattedItems,
          address,
          userId: req.user.id,
        }),
      },
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe session error:', err.message);
    res.status(500).json({ error: 'Payment session failed' });
  }
});

// Get session details for success page
router.get('/session/:sessionId', protect, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Parse the custom data from metadata
    const customData = JSON.parse(session.metadata.customData);

    // Try to find the actual order created by webhook
    let actualOrder = null;

    if (session.payment_intent) {
      actualOrder = await Order.findOne({ paymentIntentId: session.payment_intent });
    }

    const responseData = {
      sessionId: session.id,
      orderId: actualOrder ? actualOrder._id : session.id,
      totalAmount: session.amount_total / 100, // Convert from cents
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email,
      ...customData,
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({ message: 'Failed to retrieve session details' });
  }
});

router.post('/refund/:orderId', protect, restrictTo('vendor'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (!order.paymentIntentId) {
      return res.status(400).json({ message: 'No payment intent associated with this order' });
    }

    const refund = await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
    });

    console.log(`✅ Refund processed for PaymentIntent: ${order.paymentIntentId}`);

    order.status = 'cancelled';
    order.reason = 'Refund issued by vendor';
    await order.save();

    res.json({ message: 'Refund issued and order cancelled', refund });
  } catch (err) {
    console.error('❌ Error processing refund:', err.message);
    res.status(500).json({ message: 'Refund failed' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const AppSettings = require('../models/AppSettings');

// Public: the storefront needs the convenience charge to show an accurate
// total before the order is placed. Only non-sensitive values are exposed.
router.get('/', async (req, res) => {
  try {
    const convenienceCharge = await AppSettings.getConvenienceCharge();
    res.json({ success: true, data: { convenienceCharge } });
  } catch (error) {
    console.error('Get public settings error:', error);
    // Never block checkout on this - fall back to no charge.
    res.json({ success: true, data: { convenienceCharge: 0 } });
  }
});

module.exports = router;

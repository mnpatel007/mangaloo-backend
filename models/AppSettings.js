const mongoose = require('mongoose');

// Platform-wide settings that admins control from the admin portal.
// Single document, addressed by a fixed key - same pattern as GlobalShopClosure.
const appSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: 'global',
      unique: true,
      index: true,
    },
    // Flat amount added to EVERY order, on top of subtotal, delivery fee,
    // taxes and packaging. Not taxed (taxes are computed on subtotal only)
    // and it does not affect shopper commission, which is the delivery fee.
    convenienceCharge: {
      type: Number,
      default: 0,
      min: [0, 'Convenience charge cannot be negative'],
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Always returns a settings document, creating the default one on first use so
// callers never have to null-check.
appSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ singletonKey: 'global' });
  if (!doc) {
    doc = await this.create({ singletonKey: 'global' });
  }
  return doc;
};

// Convenience charge as a safe number. Used by the pricing calculator, which
// must never blow up or silently add NaN to an order total.
appSettingsSchema.statics.getConvenienceCharge = async function () {
  try {
    const doc = await this.getSettings();
    const value = Number(doc?.convenienceCharge);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (err) {
    console.error('Could not read convenience charge, defaulting to 0:', err.message);
    return 0;
  }
};

module.exports = mongoose.model('AppSettings', appSettingsSchema);

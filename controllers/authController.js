const User = require('../models/User');
const TermsAndConditions = require('../models/TermsAndConditions');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { sendMail } = require('../utils/mailer');
const crypto = require('crypto');
const https = require('https');

// Utility function to sanitize log inputs
const sanitizeForLog = (input) => {
  if (typeof input === 'string') {
    return encodeURIComponent(input).replace(/[\r\n]/g, '');
  }
  return JSON.stringify(input).replace(/[\r\n]/g, '');
};

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Signup
exports.signup = async (req, res) => {
  try {
    const { name, email, password, phone, role = 'customer' } = req.body;

    // Validate required fields
    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and phone are required',
      });
    }

    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Validate phone format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit phone number',
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'phone number';
      return res.status(409).json({
        success: false,
        message: `User with this ${field} already exists`,
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user (password will be hashed by pre-save middleware)
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone.trim(),
      role,
      verificationToken,
      isVerified: process.env.NODE_ENV === 'development', // Auto-verify in development
    });

    await user.save();

    if (role === 'vendor' && req.body.shopId) {
      const Shop = require('../models/Shop');
      const shop = await Shop.findById(req.body.shopId);
      if (shop && !shop.vendorId) {
        shop.vendorId = user._id;
        await shop.save();
      }
    }

    // Send verification email if not in development
    if (process.env.NODE_ENV !== 'development') {
      try {
        console.log('📧 Attempting to send verification email...');
        console.log('📧 Target email:', email);
        console.log('📧 Gmail User:', process.env.GMAIL_USER ? 'Set' : 'Not Set');
        console.log('📧 Gmail Pass:', process.env.GMAIL_PASS ? 'Set' : 'Not Set');
        console.log('📧 Gmail User Value:', process.env.GMAIL_USER);
        console.log(
          '📧 Gmail Pass Length:',
          process.env.GMAIL_PASS ? process.env.GMAIL_PASS.length : 0
        );

        const frontendURL =
          role === 'vendor'
            ? process.env.SHOPKEEPER_FRONTEND_URL || 'https://shopkeeper.mangaloo.com'
            : process.env.FRONTEND_URL;

        const verificationLink = `${frontendURL}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
        console.log('📧 Verification link:', verificationLink);

        // Send verification email via standard mailer
        const emailHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Verify your email</title>
                        <style>
                            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                            body { font-family: 'Inter', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
                            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
                            .header { background: linear-gradient(135deg, #4f46e5, #3730a3); color: #ffffff; padding: 40px 30px; text-align: center; }
                            .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
                            .header p { margin: 10px 0 0; font-size: 15px; opacity: 0.9; }
                            .content { padding: 40px 30px; text-align: center; }
                            .greeting { font-size: 18px; font-weight: 600; color: #111827; margin-top: 0; margin-bottom: 20px; }
                            .message { color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 30px; }
                            .btn { display: inline-block; background: linear-gradient(135deg, #4f46e5, #4338ca); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3); transition: transform 0.2s; }
                            .link-box { margin-top: 30px; background: #f9fafb; padding: 15px; border-radius: 8px; font-size: 13px; color: #6b7280; word-break: break-all; }
                            .warning { color: #dc2626; font-size: 14px; font-weight: 600; margin-top: 20px; }
                            .footer { background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb; }
                            .disclaimer { font-size: 12px; color: #9ca3af; margin: 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>Welcome to Mangaloo!</h1>
                                <p>We're thrilled to have you here.</p>
                            </div>
                            
                            <div class="content">
                                <p class="greeting">Hi ${user.name || 'there'},</p>
                                <p class="message">Thank you for signing up. Please verify your email address to complete your registration and start discovering amazing local stores.</p>
                                
                                <a href="${verificationLink}" class="btn" style="color: #ffffff !important; text-decoration: none;">Verify Email Address</a>
                                
                                <div class="link-box">
                                    If the button doesn't work, copy and paste this link into your browser:<br><br>
                                    <a href="${verificationLink}" style="color: #4f46e5;">${verificationLink}</a>
                                </div>
                                
                                <p class="warning">📧 Can't find this email? Please check your spam/junk folder!</p>
                            </div>
                            
                            <div class="footer">
                                <p class="disclaimer">This link will expire in 24 hours. If you didn't create an account, please ignore this email.</p>
                                <p class="disclaimer" style="margin-top: 10px;">&copy; ${new Date().getFullYear()} Mangaloo. All rights reserved.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `;
        const emailText = `Welcome to Mangaloo!\n\nThank you for signing up. Please verify your email address to complete your registration.\n\nVerify using this link:\n${verificationLink}\n\nThis link will expire in 24 hours. If you didn't create an account, please ignore this email.`;

        await sendMail({
          to: email,
          subject: 'Verify your email - Mangaloo',
          text: emailText,
          html: emailHtml,
        });

        console.log('✅ Verification email sent successfully to:', sanitizeForLog(email));
      } catch (emailError) {
        console.error('📧 Email sending failed:', emailError);
        console.error('📧 Error details:', emailError.message);
        // Don't fail signup if email fails
      }
    }

    res.status(201).json({
      success: true,
      message:
        process.env.NODE_ENV === 'development'
          ? 'Account created successfully. You can now log in.'
          : "Account created successfully! Please check your email to verify your account. If you don't see it, check your spam/junk folder.",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
        },
      },
    });
  } catch (error) {
    console.error('Signup error:', error);

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
      message: 'Account creation failed. Please try again.',
    });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message:
          'Account temporarily locked due to too many failed login attempts. Please try again later.',
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message:
          'Please verify your email before logging in. Check your inbox for verification link.',
      });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    // Remove sensitive data from response
    const userResponse = user.toJSON();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
    });
  }
};

// Verify email
exports.verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: 'Token and email are required',
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      verificationToken: token,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification link',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified',
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    console.log('✅ Email verified successfully for:', sanitizeForLog(user.email));

    res.json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
        },
      },
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed. Please try again.',
    });
  }
};

// Google login/signup
exports.googleLogin = async (req, res) => {
  try {
    const { email, name, googleId, role = 'customer' } = req.body;

    if (!email || !name || !googleId) {
      return res.status(400).json({
        success: false,
        message: 'Email, name, and Google ID are required',
      });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (user) {
      // User exists, check role compatibility
      if (user.role !== role) {
        return res.status(400).json({
          success: false,
          message: `This email is registered as ${user.role}. Please use the correct app.`,
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      const token = generateToken(user);
      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: user.toJSON(),
          token,
        },
      });
    }

    // User doesn't exist - create new user
    const randomPassword = crypto.randomBytes(16).toString('hex');

    user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: randomPassword,
      phone: '0000000000', // Placeholder, user can update later
      role,
      isVerified: true, // Google accounts are pre-verified
    });

    await user.save();

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Google login failed. Please try again.',
    });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address',
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    // Send reset email
    try {
      const frontendURL =
        user.role === 'vendor'
          ? process.env.SHOPKEEPER_FRONTEND_URL || 'https://shopkeeper.mangaloo.com'
          : process.env.FRONTEND_URL;

      const resetLink = `${frontendURL}/reset-password?token=${resetToken}&email=${email}`;

      const resetHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Password Reset Request</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                        body { font-family: 'Inter', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
                        .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
                        .header { background: linear-gradient(135deg, #4f46e5, #3730a3); color: #ffffff; padding: 40px 30px; text-align: center; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
                        .header p { margin: 10px 0 0; font-size: 15px; opacity: 0.9; }
                        .content { padding: 40px 30px; text-align: center; }
                        .greeting { font-size: 18px; font-weight: 600; color: #111827; margin-top: 0; margin-bottom: 20px; }
                        .message { color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 30px; }
                        .btn { display: inline-block; background: linear-gradient(135deg, #4f46e5, #4338ca); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3); transition: transform 0.2s; }
                        .link-box { margin-top: 30px; background: #f9fafb; padding: 15px; border-radius: 8px; font-size: 13px; color: #6b7280; word-break: break-all; }
                        .footer { background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb; }
                        .disclaimer { font-size: 12px; color: #9ca3af; margin: 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Password Reset</h1>
                            <p>Secure Account Recovery</p>
                        </div>
                        
                        <div class="content">
                            <p class="greeting">Hi ${user.name || 'there'},</p>
                            <p class="message">We received a request to reset the password for your Mangaloo account. Click the button below to choose a new password.</p>
                            
                            <a href="${resetLink}" class="btn" style="color: #ffffff !important; text-decoration: none;">Reset Password</a>
                            
                            <div class="link-box">
                                If the button doesn't work, copy and paste this link into your browser:<br><br>
                                <a href="${resetLink}" style="color: #4f46e5;">${resetLink}</a>
                            </div>
                        </div>
                        
                        <div class="footer">
                            <p class="disclaimer">This link will expire in 30 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
                            <p class="disclaimer" style="margin-top: 10px;">&copy; ${new Date().getFullYear()} Mangaloo. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
      const resetText = `Password Reset Request\n\nYou requested a password reset for your Mangaloo account.\nReset using this link:\n${resetLink}\n\nThis link will expire in 30 minutes. If you didn't request this reset, please ignore this email.`;

      await sendMail({
        to: email,
        subject: 'Password Reset - Mangaloo',
        text: resetText,
        html: resetHtml,
      });

      console.log('📧 Password reset email sent successfully to:', sanitizeForLog(email));
    } catch (emailError) {
      console.error('📧 Password reset email failed:', emailError);
      // Reset the token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again.',
      });
    }

    res.json({
      success: true,
      message: 'Password reset email sent. Please check your inbox.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset request failed. Please try again.',
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token, email, and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
    }

    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // Reset login attempts if any
    user.loginAttempts = 0;
    user.lockUntil = undefined;

    await user.save();

    console.log('✅ Password reset successful for:', sanitizeForLog(user.email));

    res.json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed. Please try again.',
    });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: { user: user.toJSON() },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, countryCode, address } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update allowed fields
    if (name) user.name = name.trim();
    if (countryCode) user.countryCode = countryCode.trim();
    if (phone) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit phone number',
        });
      }
      user.phone = phone.trim();
    }
    if (address) {
      if (!user.address) {
        user.address = {};
      }
      if (address.street !== undefined) user.address.street = address.street;
      if (address.city !== undefined) user.address.city = address.city;
      if (address.state !== undefined) user.address.state = address.state;
      if (address.zipCode !== undefined) user.address.zipCode = address.zipCode;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: user.toJSON() },
    });
  } catch (error) {
    console.error('Update profile error:', error);

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
      message: 'Profile update failed. Please try again.',
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password change failed. Please try again.',
    });
  }
};
//Customer Terms and Conditions

// Get current active terms for customers
exports.getCurrentTermsForCustomer = async (req, res) => {
  try {
    const terms = await TermsAndConditions.getCurrentTerms();

    if (!terms) {
      return res.json({
        success: true,
        data: { terms: null },
      });
    }

    // Check if terms are in testing mode
    if (terms.isTesting) {
      const allowedEmails = [
        'meetnp007@gmail.com',
        'ayupro916@gmail.com',
        'ce230004015@iiti.ac.in',
      ];
      const userEmail = req.user.email;

      if (!allowedEmails.includes(userEmail)) {
        return res.json({
          success: true,
          data: { terms: null },
        });
      }
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

// Accept terms for customers
exports.acceptTermsForCustomer = async (req, res) => {
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

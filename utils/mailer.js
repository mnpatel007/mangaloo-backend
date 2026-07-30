const nodemailer = require('nodemailer');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');

async function sendMail({ to, subject, text, html, replyTo, attachments }) {
  const from =
    process.env.MAIL_FROM || `DelhiveryWay <${process.env.GMAIL_USER || 'delhiveryway@gmail.com'}>`;

  // Priority 1: Generic SMTP settings (if you upgrade hosting in the future)
  if (process.env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            }
          : undefined,
    });
    return await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      replyTo,
      attachments,
    });
  }

  // Priority 2: Use Gmail REST API over HTTP to bypass Render's SMTP block
  if (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  ) {
    const oAuth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    try {
      const { token } = await oAuth2Client.getAccessToken();

      // 1. Generate raw MIME string using nodemailer's stream transport
      const streamTransporter = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
      });

      const info = await streamTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
        replyTo,
        attachments,
      });

      // 2. Format it to base64url for the Gmail API
      const encodedMessage = info.message
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // 3. Send over HTTP (port 443 allows bypass of Render SMTP block)
      const response = await axios.post(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        { raw: encodedMessage },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Email successfully sent via Gmail API over HTTP!');
      return response.data;
    } catch (error) {
      console.error('CRITICAL: Gmail API HTTP Error:', error?.response?.data || error.message);
      throw error;
    }
  }

  throw new Error(
    'Email transport not configured. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN or SMTP_HOST.'
  );
}

async function sendOrderBill(order, status) {
  if (!order || !order.customerId || !order.customerId.email) {
    console.error('Cannot send bill: Missing customer email');
    return;
  }

  const { orderNumber, orderValue, items, shopId, customerId } = order;
  const isCancelled = status === 'cancelled';

  const subject = isCancelled
    ? `Order Cancelled - ${orderNumber}`
    : `Your Receipt from DelhiveryWay - ${orderNumber}`;

  const headerColor = isCancelled ? '#ef4444' : '#4f46e5'; // Red for cancel, Indigo for success
  const headerTitle = isCancelled ? 'Order Cancelled' : 'Order Delivered';
  const headerSubtitle = isCancelled
    ? 'We are sorry to see this order go, but we hope to serve you again soon.'
    : 'Thank you for shopping with us! Here is your receipt.';

  const tableRows = items
    .map((item) => {
      const qty = item.revisedQuantity !== undefined ? item.revisedQuantity : item.quantity;
      const price = item.revisedPrice !== undefined ? item.revisedPrice : item.price;
      if (qty === 0 && !isCancelled) return ''; // Skip unavailable items if delivered

      return `
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 14px;">
                    ${item.name || 'Item'} ${qty === 0 ? '<span style="color:#ef4444;font-size:12px;">(Unavailable)</span>' : ''}
                </td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
                    x${qty}
                </td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #111827; font-weight: bold; font-size: 14px;">
                    ₹${price * qty}
                </td>
            </tr>
        `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Receipt</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body { font-family: 'Inter', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
            .header { background: linear-gradient(135deg, ${headerColor}, #3730a3); color: #ffffff; padding: 40px 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
            .header p { margin: 10px 0 0; font-size: 15px; opacity: 0.9; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 18px; font-weight: 600; color: #111827; margin-top: 0; }
            .order-meta { background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; flex-wrap: wrap; }
            .meta-item { margin-bottom: 10px; }
            .meta-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; display: block; margin-bottom: 4px; }
            .meta-value { font-size: 15px; color: #111827; font-weight: 600; margin: 0; }
            .receipt-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .receipt-table th { text-align: left; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
            .receipt-table th.right { text-align: right; }
            .receipt-table th.center { text-align: center; }
            .summary { margin-left: auto; width: 250px; }
            .summary-row { display: flex; justify-content: space-between; padding: 8px 0; color: #4b5563; font-size: 14px; }
            .summary-row.total { border-top: 2px solid #e5e7eb; margin-top: 8px; padding-top: 16px; color: #111827; font-size: 18px; font-weight: 700; }
            .footer { background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
            .socials { margin: 20px 0; }
            .socials a { display: inline-block; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; margin: 0 5px; color: #ffffff; }
            .btn-insta { background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); }
            .btn-fb { background-color: #1877f2; }
            .disclaimer { font-size: 12px; color: #9ca3af; margin: 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${headerTitle}</h1>
                <p>${headerSubtitle}</p>
            </div>
            
            <div class="content">
                <p class="greeting">Hi ${customerId.name || 'Customer'},</p>
                
                <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                    <tr>
                        <td width="50%" valign="top">
                            <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; display: block; margin-bottom: 4px;">Order Number</span>
                            <strong style="font-size: 15px; color: #111827; margin: 0; display: block;">${orderNumber}</strong>
                        </td>
                        <td width="50%" valign="top">
                            <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; display: block; margin-bottom: 4px;">Shop</span>
                            <strong style="font-size: 15px; color: #111827; margin: 0; display: block;">${shopId?.name || 'Local Store'}</strong>
                        </td>
                    </tr>
                </table>

                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th class="center">Qty</th>
                            <th class="right">Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td width="30%"></td>
                        <td width="70%">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Subtotal</td>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px; text-align: right;">₹${orderValue?.subtotal || 0}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Delivery Fee</td>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px; text-align: right;">+ ₹${orderValue?.deliveryFee || 0}</td>
                                </tr>
                                ${
                                  orderValue?.serviceFee
                                    ? `
                                <tr>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Service Fee</td>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px; text-align: right;">+ ₹${orderValue.serviceFee}</td>
                                </tr>`
                                    : ''
                                }
                                ${
                                  orderValue?.taxes
                                    ? `
                                <tr>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Taxes</td>
                                    <td style="padding: 8px 0; color: #4b5563; font-size: 14px; text-align: right;">+ ₹${orderValue.taxes}</td>
                                </tr>`
                                    : ''
                                }
                                ${
                                  (orderValue?.discount || 0) > 0
                                    ? `
                                <tr>
                                    <td style="padding: 8px 0; color: #10b981; font-size: 14px;">Discount</td>
                                    <td style="padding: 8px 0; color: #10b981; font-size: 14px; text-align: right;">- ₹${orderValue.discount}</td>
                                </tr>`
                                    : ''
                                }
                                <tr>
                                    <td style="border-top: 2px solid #e5e7eb; padding-top: 16px; margin-top: 8px; color: #111827; font-size: 18px; font-weight: 700;">Total</td>
                                    <td style="border-top: 2px solid #e5e7eb; padding-top: 16px; margin-top: 8px; color: #111827; font-size: 18px; font-weight: 700; text-align: right;">₹${orderValue?.total || 0}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="footer">
                <h3 style="margin-top:0; color:#374151; font-size: 16px;">Love DelhiveryWay?</h3>
                <p style="color:#6b7280; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">Join our community online and never miss an update on incredible discoveries from your local stores.</p>
                <div class="socials">
                    <a href="https://instagram.com/delhiveryway" class="btn-insta">Follow Instagram</a>
                    <a href="https://facebook.com/delhiveryway" class="btn-fb">Like Facebook</a>
                </div>
                <p class="disclaimer">You are receiving this email because you placed an order via the DelhiveryWay app.</p>
            </div>
        </div>
    </body>
    </html>
    `;

  const text = `${headerTitle}\n\nOrder: ${orderNumber}\nTotal: ₹${orderValue?.total || 0}\n\nThank you for shopping with DelhiveryWay!`;

  try {
    await sendMail({
      to: customerId.email,
      subject,
      text,
      html,
    });
    console.log(`✅ Bill email sent successfully for order ${orderNumber} (${status})`);
  } catch (err) {
    console.error('Failed to send bill email:', err);
  }
}

module.exports = { sendMail, sendOrderBill };

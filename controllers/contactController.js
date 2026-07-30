const { sendMail } = require('../utils/mailer');

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase());
}

const safe = (v) => String(v || '').replace(/[<>]/g, '');

// ---- Complaint email (from "Report an order issue") -------------------------
function complaintEmail({ name, email, category, orderNumber, message, hasPhoto }) {
  const cat = safe(category) || 'Order issue';
  const ord = safe(orderNumber);
  const when = new Date().toLocaleString();

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f5f7;padding:24px;color:#1f2430;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#ff7a2f,#e5541a);color:#fff;padding:24px 28px;">
          <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.9;">Customer Complaint</div>
          <h1 style="margin:6px 0 0;font-size:22px;">⚠️ ${cat}</h1>
          ${ord ? `<div style="margin-top:8px;font-size:14px;opacity:.95;">Order #${ord}</div>` : ''}
        </div>
        <div style="padding:24px 28px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#8a92a1;width:120px;">Customer</td><td style="padding:6px 0;font-weight:600;">${safe(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#8a92a1;">Email</td><td style="padding:6px 0;"><a href="mailto:${safe(email)}" style="color:#e5541a;">${safe(email)}</a></td></tr>
            ${ord ? `<tr><td style="padding:6px 0;color:#8a92a1;">Order</td><td style="padding:6px 0;font-weight:600;">#${ord}</td></tr>` : ''}
            <tr><td style="padding:6px 0;color:#8a92a1;">Category</td><td style="padding:6px 0;">${cat}</td></tr>
            <tr><td style="padding:6px 0;color:#8a92a1;">Received</td><td style="padding:6px 0;">${when}</td></tr>
          </table>
          <div style="margin-top:18px;">
            <div style="color:#8a92a1;font-size:13px;margin-bottom:6px;">What the customer says</div>
            <div style="background:#fff5f0;border-left:4px solid #e5541a;border-radius:8px;padding:14px 16px;white-space:pre-wrap;font-size:15px;line-height:1.6;">${safe(message)}</div>
          </div>
          <div style="margin-top:16px;padding:10px 14px;background:#f4f5f7;border-radius:8px;font-size:14px;">
            ${hasPhoto ? '📎 A photo is attached to this email.' : 'No photo was attached.'}
          </div>
          <div style="margin-top:20px;font-size:13px;color:#8a92a1;">Reply directly to this email to respond to ${safe(name)}.</div>
        </div>
        <div style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eee;font-size:12px;color:#9aa1ad;">DelhiveryWay · Complaint submitted via the Help assistant</div>
      </div>
    </div>`;

  const text = `NEW CUSTOMER COMPLAINT
Category: ${cat}
${ord ? `Order: #${ord}\n` : ''}Customer: ${name}
Email: ${email}
Received: ${when}

What the customer says:
${message}

${hasPhoto ? 'A photo is attached to this email.' : 'No photo was attached.'}

Reply to this email to respond to the customer.`;

  const subject = `⚠️ Order Complaint — ${cat}${ord ? ` · Order #${ord}` : ''}`;
  return { subject, html, text };
}

// ---- General contact email (from the Contact page / "Something else") -------
function contactEmail({ name, email, subject, message }) {
  const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111">
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${safe(name)}</p>
        <p><strong>Email:</strong> ${safe(email)}</p>
        <hr style="border:none;border-top:1px solid #ddd" />
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap">${safe(message)}</p>
        <br/>
        <p style="color:#666;font-size:12px">Sent from DelhiveryWay Customer Portal</p>
      </div>`;
  const text = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\n--\nSent from DelhiveryWay Customer Portal`;
  const finalSubject = `[Contact] ${subject && subject.trim() ? subject.trim() : 'New message from customer'}`;
  return { subject: finalSubject, html, text };
}

exports.sendContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message, image, imageName, type, category, orderNumber } =
      req.body || {};

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ success: false, message: 'Name, email, and message are required.' });
    }
    if (!validateEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: 'Please provide a valid email address.' });
    }

    // Optional photo attachment sent as a base64 data URL (e.g. from the Help assistant).
    const attachments = [];
    if (image && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) {
      attachments.push({ filename: imageName || 'attachment.jpg', path: image });
    }

    const recipient = process.env.GMAIL_USER || 'delhiveryway@gmail.com';
    const isComplaint = type === 'complaint';

    const built = isComplaint
      ? complaintEmail({
          name,
          email,
          category,
          orderNumber,
          message,
          hasPhoto: attachments.length > 0,
        })
      : contactEmail({ name, email, subject, message });

    await sendMail({
      to: recipient,
      subject: built.subject,
      text: built.text,
      html: built.html,
      replyTo: email,
      attachments: attachments.length ? attachments : undefined,
    });

    // --- Auto-reply to the customer ---
    const customerSubject = isComplaint
      ? 'We’ve received your complaint — DelhiveryWay'
      : 'We got your message! - DelhiveryWay';

    const headerTitle = isComplaint ? 'We’re on it' : 'Thank you!';
    const headerSub = isComplaint
      ? 'Your complaint has been received'
      : "We've received your message";
    const bodyLine = isComplaint
      ? `Thanks for letting us know${orderNumber ? ` about order #${safe(orderNumber)}` : ''}. Our team is reviewing your complaint and will get back to you as soon as possible.`
      : 'Thank you so much for reaching out to us! Our team will review your message and get back to you as soon as possible.';

    const customerHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${headerSub}</title>
                <style>
                    body { font-family: 'Inter', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                    .header { background: linear-gradient(135deg, #ff7a2f, #e5541a); color: #ffffff; padding: 40px 30px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
                    .header p { margin: 10px 0 0; font-size: 15px; opacity: 0.9; }
                    .content { padding: 40px 30px; text-align: center; }
                    .greeting { font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 20px; }
                    .message { color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 30px; }
                    .footer { background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
                    .disclaimer { font-size: 12px; color: #9ca3af; margin: 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${headerTitle}</h1>
                        <p>${headerSub}</p>
                    </div>
                    <div class="content">
                        <p class="greeting">Hello ${safe(name)},</p>
                        <p class="message">${bodyLine}</p>
                        <p class="message" style="margin-bottom: 0;">If you have anything to add, just reply directly to this email.</p>
                    </div>
                    <div class="footer">
                        <p class="disclaimer">This is an automated response from DelhiveryWay.</p>
                        <p class="disclaimer" style="margin-top: 10px;">&copy; ${new Date().getFullYear()} DelhiveryWay. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

    const customerText = `Hello ${name},\n\n${bodyLine}\n\nIf you have anything to add, just reply to this email.\n\nWarm regards,\nThe DelhiveryWay Team`;

    await sendMail({
      to: email,
      subject: customerSubject,
      text: customerText,
      html: customerHtml,
    });

    return res.json({ success: true, message: 'Message sent successfully.' });
  } catch (err) {
    console.error('Contact send error:', err);
    const hint = process.env.SMTP_HOST || process.env.GMAIL_USER ? '' : ' (email not configured)';
    return res.status(500).json({ success: false, message: `Failed to send message${hint}.` });
  }
};

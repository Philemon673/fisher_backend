import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface OrderEmailData {
  orderNumber: string;
  createdAt: Date;
  user: {
    name?: string;
    email: string;
  };
  shippingInfo?: {
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    apartment?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  paymentMethod?: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number | string;
  }[];
  subtotal: number | string;
  shippingFee: number | string;
  total: number | string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resendClient: Resend | null = null;
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const resendApiKey = this.config.get<string>('RESEND_API_KEY');
    if (resendApiKey) {
      this.resendClient = new Resend(resendApiKey);
      this.logger.log('Resend Mailer API Client initialized');
    }

    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT') || 587;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`SMTP Mailer initialized for host: ${host}`);
    }

    if (!this.resendClient && !this.transporter) {
      this.logger.warn(
        'Neither RESEND_API_KEY nor SMTP credentials provided. Email notifications will be logged to console.',
      );
    }
  }

  async sendOrderNotificationToAdmin(data: OrderEmailData): Promise<void> {
    const adminEmail =
      this.config.get<string>('ADMIN_EMAIL') || 'admin@aqua-gear.com';
    const mailFrom =
      this.config.get<string>('MAIL_FROM') || 'AquaGear Store <onboarding@resend.dev>';

    const paymentLabel =
      data.paymentMethod === 'card'
        ? 'Credit / Debit Card'
        : data.paymentMethod === 'paypal'
        ? 'PayPal'
        : data.paymentMethod === 'request'
        ? 'Request Payment Method (Sales Team Contact Requested)'
        : data.paymentMethod || 'Not Specified';

    const customerName =
      data.shippingInfo?.fullName || data.user.name || 'Customer';
    const customerEmail =
      data.shippingInfo?.email || data.user.email;
    const customerPhone =
      data.shippingInfo?.phone || 'N/A';

    const addressLines = [
      data.shippingInfo?.address,
      data.shippingInfo?.apartment,
      [data.shippingInfo?.city, data.shippingInfo?.state, data.shippingInfo?.zip]
        .filter(Boolean)
        .join(', '),
    ].filter(Boolean);

    const formattedAddress =
      addressLines.length > 0 ? addressLines.join('<br/>') : 'No shipping address provided';

    const itemRowsHtml = data.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; color: #2d3748;">
            <strong>${item.productName}</strong>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: center; color: #4a5568;">
            ${item.quantity}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: right; color: #2d3748;">
            $${Number(item.unitPrice).toFixed(2)}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: bold; color: #1a202c;">
            $${(Number(item.unitPrice) * item.quantity).toFixed(2)}
          </td>
        </tr>
      `,
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Order #${data.orderNumber}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e40af, #2563eb); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800;">🎉 New Order Received!</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Order #${data.orderNumber}</p>
          </div>

          <div style="padding: 24px;">

            <!-- Customer & Shipping Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-collapse: collapse;">
              <tr>
                <td width="50%" valign="top" style="padding-right: 10px;">
                  <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; height: 100%;">
                    <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px;">Shipping Details</h3>
                    <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #1e293b;">${customerName}</p>
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b;">${formattedAddress}</p>
                    <p style="margin: 0; font-size: 13px; color: #64748b;">📞 Phone: ${customerPhone}</p>
                    <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">✉️ Email: ${customerEmail}</p>
                  </div>
                </td>
                <td width="50%" valign="top" style="padding-left: 10px;">
                  <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; height: 100%;">
                    <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px;">Payment & Status</h3>
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #475569;"><strong>Method:</strong> <span style="color: #2563eb; font-weight: bold;">${paymentLabel}</span></p>
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #475569;"><strong>Date:</strong> ${new Date(data.createdAt).toLocaleString()}</p>
                    <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Status:</strong> PENDING</p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Special Notice for Request Payment -->
            ${
              data.paymentMethod === 'request'
                ? `
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
                <p style="margin: 0; font-size: 13px; color: #1e40af; font-weight: 600;">
                  📌 Customer requested payment contact. Please reach out via support chat or email to finalize payment details.
                </p>
              </div>
            `
                : ''
            }

            <!-- Order Items Table -->
            <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Order Summary</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <thead>
                <tr style="background-color: #f1f5f9; text-align: left; color: #475569;">
                  <th style="padding: 10px;">Product</th>
                  <th style="padding: 10px; text-align: center;">Qty</th>
                  <th style="padding: 10px; text-align: right;">Unit Price</th>
                  <th style="padding: 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemRowsHtml}
              </tbody>
            </table>

            <!-- Totals Summary -->
            <div style="margin-left: auto; width: 240px; font-size: 14px; border-top: 2px solid #e2e8f0; padding-top: 10px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #64748b;">
                <span>Subtotal:</span>
                <span>$${Number(data.subtotal).toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #64748b;">
                <span>Shipping:</span>
                <span>$${Number(data.shippingFee).toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-weight: bold; font-size: 16px; color: #0f172a;">
                <span>Total Amount:</span>
                <span style="color: #2563eb;">$${Number(data.total).toFixed(2)}</span>
              </div>
            </div>

          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0;">AquaGear Admin Notification • Automated Order Email</p>
          </div>

        </div>
      </body>
      </html>
    `;

    const subject = `🛒 New Order #${data.orderNumber} - ${customerName}`;

    // 1. Try Resend API
    if (this.resendClient) {
      try {
        const response = await this.resendClient.emails.send({
          from: mailFrom,
          to: adminEmail,
          subject,
          html: htmlContent,
        });
        this.logger.log(
          `Order notification email sent to admin via Resend: ${adminEmail} (id: ${response.data?.id || 'success'})`,
        );
        return;
      } catch (err) {
        this.logger.error(`Failed to send email via Resend to ${adminEmail}`, err);
      }
    }

    // 2. Fallback to Nodemailer SMTP
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: mailFrom,
          to: adminEmail,
          subject,
          html: htmlContent,
        });
        this.logger.log(`Order notification email sent to admin via SMTP: ${adminEmail}`);
        return;
      } catch (err) {
        this.logger.error(`Failed to send email via SMTP to ${adminEmail}`, err);
      }
    }

    // 3. Console Logger Fallback
    this.logger.log(`\n================ ADMIN ORDER EMAIL NOTIFICATION ================`);
    this.logger.log(`TO: ${adminEmail}`);
    this.logger.log(`SUBJECT: ${subject}`);
    this.logger.log(`CUSTOMER: ${customerName} (${customerEmail})`);
    this.logger.log(`PAYMENT METHOD: ${paymentLabel}`);
    this.logger.log(`SHIPPING: ${formattedAddress.replace(/<br\/>/g, ', ')}`);
    this.logger.log(`TOTAL: $${Number(data.total).toFixed(2)}`);
    this.logger.log(`=================================================================\n`);
  }
}


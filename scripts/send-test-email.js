/**
 * Sends a test email via SendGrid. Run: node scripts/send-test-email.js
 * Requires .env with SENDGRID_API_KEY and INVOICE_FROM_EMAIL.
 */
import 'dotenv/config';
import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const INVOICE_FROM_EMAIL = process.env.INVOICE_FROM_EMAIL || '';
const TO_EMAIL = 'chay.moalem@gmail.com';

if (!SENDGRID_API_KEY || !INVOICE_FROM_EMAIL) {
  console.error('Missing SENDGRID_API_KEY or INVOICE_FROM_EMAIL in .env');
  process.exit(1);
}

sgMail.setApiKey(SENDGRID_API_KEY);

const msg = {
  to: TO_EMAIL,
  from: INVOICE_FROM_EMAIL,
  subject: 'בדיקת שליחת אימייל – קריות מרקט',
  text: 'זו הודעת בדיקה. אם קיבלת אותה, SendGrid מוגדר כראוי.',
  html: '<p dir="rtl">זו הודעת <strong>בדיקה</strong>. אם קיבלת אותה, SendGrid מוגדר כראוי.</p>',
};

try {
  await sgMail.send(msg);
  console.log('Test email sent successfully to', TO_EMAIL);
} catch (err) {
  console.error('SendGrid error:', err.response?.body || err.message);
  process.exit(1);
}

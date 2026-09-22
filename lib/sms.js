// lib/sms.js
// Sends order-confirmation SMS via MSG91. Does nothing (safely) until
// MSG91_AUTH_KEY, MSG91_SENDER_ID and MSG91_TEMPLATE_ID are set in the
// environment — so this is safe to leave in place before those exist.

const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const SENDER_ID = process.env.MSG91_SENDER_ID;
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

const isConfigured = Boolean(AUTH_KEY && SENDER_ID && TEMPLATE_ID);

async function sendOrderConfirmationSms(phone, orderCode) {
  if (!isConfigured) {
    console.log(`[sms] Skipped (not configured) — would have confirmed order ${orderCode} to ${phone}`);
    return;
  }

  // MSG91 expects a 91-prefixed 12-digit number for India.
  const mobile = phone.length === 10 ? `91${phone}` : phone;

  const body = {
    template_id: TEMPLATE_ID,
    short_url: "0",
    recipients: [
      {
        mobiles: mobile,
        // MSG91 templates use named variables you define when you create
        // the template (commonly VAR1, VAR2, ...). Adjust this key to
        // match whatever variable name your approved template actually
        // uses for the order number.
        VAR1: orderCode,
      },
    ],
  };

  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: AUTH_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[sms] MSG91 error:", res.status, data);
    } else {
      console.log(`[sms] Sent order ${orderCode} confirmation to ${phone}`);
    }
  } catch (err) {
    // Never let an SMS failure break order placement.
    console.error("[sms] Failed to send:", err.message);
  }
}

module.exports = { sendOrderConfirmationSms, isConfigured };

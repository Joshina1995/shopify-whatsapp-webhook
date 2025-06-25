require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/json' }));

// Configuration from environment variables
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const COMPANY_WHATSAPP = process.env.COMPANY_WHATSAPP || '9715*******9';
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

console.log('Server starting with config:', {
  hasWhatsAppToken: !!WHATSAPP_TOKEN,
  hasPhoneNumberId: !!PHONE_NUMBER_ID,
  companyWhatsApp: COMPANY_WHATSAPP,
  hasWebhookSecret: !!SHOPIFY_WEBHOOK_SECRET
});

// Verify Shopify webhook
function verifyShopifyWebhook(data, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET) {
    console.log('⚠️  No webhook secret configured, skipping verification');
    return true; // Skip verification for testing
  }
  
  try {
    const calculatedHmac = crypto
      .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
      .update(data, 'utf8')
      .digest('base64');
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHmac, 'base64'),
      Buffer.from(hmacHeader, 'base64')
    );
    
    console.log('Webhook verification:', isValid ? '✅ Valid' : '❌ Invalid');
    return isValid;
  } catch (error) {
    console.error('Webhook verification error:', error);
    return false;
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(message) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log('📱 WhatsApp credentials not configured. Message would be:');
    console.log('---');
    console.log(message);
    console.log('---');
    return { success: false, reason: 'No WhatsApp credentials' };
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: COMPANY_WHATSAPP,
        type: 'text',
        text: {
          body: message
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('✅ WhatsApp message sent successfully:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  const status = {
    status: '🚀 Shopify WhatsApp Webhook Server is running!',
    timestamp: new Date().toISOString(),
    server_time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    configuration: {
      whatsapp_configured: !!(WHATSAPP_TOKEN && PHONE_NUMBER_ID),
      webhook_secret_configured: !!SHOPIFY_WEBHOOK_SECRET,
      company_whatsapp: COMPANY_WHATSAPP
    },
    endpoints: {
      health: 'GET /health',
      test: 'POST /test',
      webhook: 'POST /webhooks/orders/create'
    }
  };
  
  res.json(status);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Test endpoint
app.post('/test', async (req, res) => {
  console.log('🧪 Test endpoint called');
  
  const testMessage = `🧪 TEST MESSAGE

This is a test from your Shopify-WhatsApp webhook server!

✅ Server: Running successfully
🕒 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
📱 Target WhatsApp: ${COMPANY_WHATSAPP}

Your webhook is ready to receive Shopify orders! 🛍️`;

  const result = await sendWhatsAppMessage(testMessage);
  
  res.json({ 
    message: 'Test completed!',
    whatsapp_result: result,
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint for new orders
app.post('/webhooks/orders/create', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🔔 === NEW WEBHOOK RECEIVED ===');
    console.log('Time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const order = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    console.log('📦 Order received:', {
      order_number: order.order_number,
      customer: order.customer?.first_name || 'Guest',
      total: `${order.currency} ${order.total_price}`,
      items_count: order.line_items?.length || 0
    });
    
    // Verify webhook authenticity
    if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyWebhook(body, hmacHeader)) {
      console.log('❌ Webhook verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Format the message
    const customerName = order.customer 
      ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
      : 'Guest Customer';
    
    const itemsList = order.line_items
      .slice(0, 5) // Limit to first 5 items
      .map(item => `• ${item.title} (Qty: ${item.quantity}) - ${order.currency} ${item.price}`)
      .join('\n');
    
    const shippingAddress = order.shipping_address 
      ? `${order.shipping_address.address1 || ''}
${order.shipping_address.city || ''}, ${order.shipping_address.province || ''} ${order.shipping_address.zip || ''}
${order.shipping_address.country || ''}`
      : 'No shipping address provided';

    const orderTime = new Date(order.created_at).toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const message = `🛍️ NEW ORDER ALERT!

📋 Order #${order.order_number}
👤 Customer: ${customerName}
📧 Email: ${order.email || 'N/A'}
📱 Phone: ${order.phone || 'N/A'}

💰 Total Amount: ${order.currency} ${order.total_price}
📦 Total Items: ${order.line_items.length}

🛒 Items Ordered:
${itemsList}${order.line_items.length > 5 ? '\n... and more items' : ''}

📍 Shipping Address:
${shippingAddress}

🕒 Order Time: ${orderTime}
🏪 Store: AD Plants Shop

---
Powered by AD Plants Webhook System`;

    // Send WhatsApp notification
    console.log('📱 Sending WhatsApp notification...');
    const whatsappResult = await sendWhatsAppMessage(message);
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Order ${order.order_number} processed in ${processingTime}ms`);
    console.log('WhatsApp result:', whatsappResult.success ? '✅ Sent' : '❌ Failed');
    console.log('=== WEBHOOK COMPLETE ===\n');
    
    res.status(200).json({ 
      status: 'success',
      order_number: order.order_number,
      processing_time_ms: processingTime,
      whatsapp_sent: whatsappResult.success
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Webhook processing error:', error);
    console.error('Processing time:', processingTime + 'ms');
    
    // Return 200 to prevent Shopify retries for application errors
    res.status(200).json({ 
      status: 'error_logged',
      error: error.message,
      processing_time_ms: processingTime
    });
  }
});

// Handle 404s
app.use('*', (req, res) => {
  console.log('404 - Endpoint not found:', req.method, req.originalUrl);
  res.status(404).json({ 
    error: 'Endpoint not found',
    method: req.method,
    path: req.originalUrl,
    available_endpoints: [
      'GET /',
      'GET /health', 
      'POST /test',
      'POST /webhooks/orders/create'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🚀 ================================');
  console.log('   WEBHOOK SERVER STARTED!');
  console.log('🚀 ================================');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🕒 Started: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log('📋 Available endpoints:');
  console.log('   • GET  /              - Server status');
  console.log('   • GET  /health        - Health check');
  console.log('   • POST /test          - Send test WhatsApp');
  console.log('   • POST /webhooks/orders/create - Shopify webhook');
  console.log('\n🔧 Configuration:');
  console.log(`   • WhatsApp API: ${WHATSAPP_TOKEN ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   • Phone Number: ${PHONE_NUMBER_ID ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   • Target WhatsApp: ${COMPANY_WHATSAPP}`);
  console.log(`   • Webhook Secret: ${SHOPIFY_WEBHOOK_SECRET ? '✅ Configured' : '❌ Not configured'}`);
  console.log('\n💡 Next steps:');
  console.log('   1. Configure WhatsApp API credentials');
  console.log('   2. Set up Shopify webhook');
  console.log('   3. Test with a sample order');
  console.log('================================\n');
});

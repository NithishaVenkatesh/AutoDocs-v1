// test-webhook.js - Test your webhook endpoint locally
import crypto from 'crypto';

const WEBHOOK_URL = 'http://localhost:3000/api/webhook';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-secret-key';

// Sample push event payload
const payload = {
  ref: 'refs/heads/main',
  repository: {
    id: 123456789,
    name: 'test-repo',
    full_name: 'username/test-repo',
    clone_url: 'https://github.com/username/test-repo.git',
    html_url: 'https://github.com/username/test-repo'
  },
  commits: [
    {
      id: 'abc123def456',
      message: 'Test commit',
      author: {
        name: 'Test User',
        email: 'test@example.com'
      },
      timestamp: new Date().toISOString(),
      added: ['src/test.js'],
      modified: [],
      removed: []
    }
  ]
};

async function testWebhook() {
  console.log('🧪 Testing webhook endpoint...\n');
  console.log(`📍 URL: ${WEBHOOK_URL}`);
  console.log(`🔐 Secret: ${WEBHOOK_SECRET.substring(0, 10)}...\n`);

  const payloadString = JSON.stringify(payload);
  
  // Create signature
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const signature = 'sha256=' + hmac.update(payloadString).digest('hex');

  console.log('📦 Sending test push event...\n');

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'push',
        'x-hub-signature-256': signature,
        'x-github-delivery': crypto.randomUUID()
      },
      body: payloadString
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}\n`);

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('✅ Webhook test successful!\n');
      try {
        const data = JSON.parse(responseText);
        console.log('📄 Response:', JSON.stringify(data, null, 2));
      } catch {
        console.log('📄 Response:', responseText);
      }
    } else {
      console.log('❌ Webhook test failed!\n');
      console.log('📄 Response:', responseText);
    }

  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
    console.log('\n💡 Make sure your dev server is running on http://localhost:3000');
  }
}

testWebhook();

import 'dotenv/config';

const url = process.env.INTERNAL_EMAIL_API_URL;

async function main() {
    console.log(`Testing email API at: ${url}`);

    const payload = {
        businessUnit: 'TUSM_RequestOnline',
        appName: 'RequestOnlineSystem',
        subject: 'Test Email from RequestOnline',
        body: '<h1>This is a test email</h1><p>If you receive this, the API is working.</p>',
        to: ['yutthachai.w@thaisugarmill.com'], // Default test email, assuming user is developer
        cc: [],
        bcc: [],
        attachments: [],
        fromName: 'System Test',
        replyTo: 'no-reply@thaisugarmill.com'
    };

    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log('Response Body:', text);

        if (!res.ok) {
            console.error('❌ Request failed');
        } else {
            console.log('✅ Request success');
        }

    } catch (error) {
        console.error('❌ Network or Fetch error:', error);
    }
}

main();

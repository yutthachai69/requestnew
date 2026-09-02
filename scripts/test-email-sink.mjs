import http from 'node:http';

const port = Number(process.env.TEST_EMAIL_SINK_PORT ?? 4010);

const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/send') {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false }));
    return;
  }

  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try {
      const payload = JSON.parse(body);
      const recipients = Array.isArray(payload.to) ? payload.to : [];
      console.log(JSON.stringify({
        ok: true,
        subject: String(payload.subject ?? ''),
        recipients,
        hasBody: typeof payload.body === 'string' && payload.body.length > 0,
      }));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`test email sink listening on http://127.0.0.1:${port}/send`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

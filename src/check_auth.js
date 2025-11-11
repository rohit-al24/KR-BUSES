import http from 'http';

const data = JSON.stringify({ email: 'alice@gmail.com', password: '2002-05-12', role: 'student' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  },
  timeout: 3000
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('status', res.statusCode);
    console.log('body', body);
    process.exit(0);
  });
});

req.on('error', err => {
  console.error('error', err.message);
  process.exit(1);
});

req.write(data);
req.end();

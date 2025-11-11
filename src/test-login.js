import http from 'http';

function run() {
  const data = JSON.stringify({ email: 'alice@gmail.com', password: '2002-05-12', role: 'student' });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = http.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('status', res.statusCode);
      try { console.log('body', JSON.parse(body)); } catch (e) { console.log('body', body); }
    });
  });

  req.on('error', err => { console.error('request error', err.message); process.exit(1); });
  req.write(data);
  req.end();
}

run();

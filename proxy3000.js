const http = require('http');

const server = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: 5000,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    res.writeHead(502);
    res.end('Proxy error: ' + err.message);
  });

  req.pipe(proxy, { end: true });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Proxy listening on port 3000 -> forwarding to port 5000');
});

const express = require('express');
const path = require('path');
const { initStorage, readPortSync } = require('./storage');
const { scheduleRefresh } = require('./ha_auth');
const apiRoutes = require('./api');
const adminRoutes = require('./admin');

const app = express();
const PORT = readPortSync();

app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, '/');
  next();
});

function parseCookies(req, res, next) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(c => {
    const [name, ...rest] = c.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  });
  req.cookies = cookies;
  next();
}

app.use(express.json());
app.use(parseCookies);

app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);
app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const ingressPath = req.headers['x-ingress-path'] || '';
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
  html = html.replace('__INGRESS_PATH__', ingressPath);
  res.type('html').send(html);
});

async function start() {
  try {
    await initStorage();
    scheduleRefresh();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] HaAssistant 服务端已启动`);
      console.log(`[Server] 监听端口: ${PORT}`);
    });
  } catch (err) {
    console.error('[Server] 启动失败:', err.message);
    process.exit(1);
  }
}

start();

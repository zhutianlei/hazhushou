const express = require('express');
const path = require('path');
const { initStorage, readPortSync } = require('./storage');
const { scheduleRefresh } = require('./ha_auth');
const apiRoutes = require('./api');
const adminRoutes = require('./admin');

const app = express();
const PORT = readPortSync();

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

// API routes
app.use('/api', apiRoutes);

// Admin panel routes (both / and /admin)
app.use('/admin', adminRoutes);
app.use('/', adminRoutes);

// Serve static files for admin panel
app.use('/static', express.static(path.join(__dirname, 'public')));

async function start() {
  try {
    await initStorage();
    scheduleRefresh();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] HaAssistant 服务端已启动`);
      console.log(`[Server] 监听端口: ${PORT}`);
      console.log(`[Server] 管理面板: http://localhost:${PORT}/admin/`);
      console.log(`[Server] API端点: http://localhost:${PORT}/api/terminal/pull`);
    });
  } catch (err) {
    console.error('[Server] 启动失败:', err.message);
    process.exit(1);
  }
}

start();

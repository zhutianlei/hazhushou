const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const path = require('path');
const {
  getConfig, updateConfig,
  getWhitelist, addWhitelistItem, updateWhitelistItem, deleteWhitelistItem, batchImport,
  getAuditLog, addAuditEntry,
  getConnectionStats,
  verifyPassword, changePassword, getUsername
} = require('./storage');
const { getHaTokens, scheduleRefresh } = require('./ha_auth');

const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.session_token || req.headers['x-session-token'];
  if (!token || !sessions.has(token)) {
    if (req.path === '/' || !req.path.startsWith('/api/')) {
      return res.status(401).json({ error: '未登录' });
    }
    return res.status(401).json({ error: '未登录' });
  }
  req.sessionUser = sessions.get(token);
  next();
}

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  if (username !== getUsername()) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (!verifyPassword(password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = generateToken();
  sessions.set(token, username);
  res.cookie('session_token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
  addAuditEntry({ action: 'login', user: username, detail: { ip: req.ip } });
  res.json({ success: true, username });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.session_token || req.headers['x-session-token'];
  if (token) {
    sessions.delete(token);
  }
  res.clearCookie('session_token');
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.session_token || req.headers['x-session-token'];
  if (!token || !sessions.has(token)) {
    return res.json({ logged_in: false });
  }
  res.json({ logged_in: true, username: sessions.get(token) });
});

router.put('/password', authMiddleware, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ error: '旧密码和新密码必填' });
  }
  if (!verifyPassword(old_password)) {
    return res.status(401).json({ error: '旧密码错误' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: '新密码至少6位' });
  }
  await changePassword(new_password);
  await addAuditEntry({ action: 'change_password', user: req.sessionUser, detail: {} });
  res.json({ success: true });
});

router.get('/config', authMiddleware, (req, res) => {
  const config = getConfig();
  res.json({
    ha_base_url: config.ha_base_url,
    ha_username: config.ha_username || '',
    ha_password: config.ha_password || '',
    token_refresh_time: config.token_refresh_time || '',
    port: config.port || 8080
  });
});

router.put('/config', authMiddleware, async (req, res) => {
  const { ha_base_url, ha_username, ha_password, token_refresh_time, port } = req.body;
  const updates = {};
  if (ha_base_url !== undefined) {
    if (!ha_base_url || typeof ha_base_url !== 'string') {
      return res.status(400).json({ error: 'ha_base_url 必填' });
    }
    updates.ha_base_url = ha_base_url;
  }
  if (ha_username !== undefined) {
    updates.ha_username = ha_username;
  }
  if (ha_password !== undefined) {
    updates.ha_password = ha_password;
  }
  if (token_refresh_time !== undefined) {
    updates.token_refresh_time = token_refresh_time;
  }
  if (port !== undefined) {
    const p = parseInt(port);
    if (isNaN(p) || p < 1 || p > 65535) {
      return res.status(400).json({ error: '端口范围 1-65535' });
    }
    updates.port = p;
  }
  const result = await updateConfig(updates);
  await addAuditEntry({
    action: 'update_config',
    user: req.sessionUser,
    detail: { ha_base_url, ha_username: ha_username ? '***' : undefined, token_refresh_time, port }
  });

  // Auto-get tokens if credentials are provided
  let tokenStatus = null;
  if (result.config.ha_username && result.config.ha_password) {
    try {
      await getHaTokens(result.config.ha_username, result.config.ha_password);
      tokenStatus = 'success';
      console.log('[Admin] HA tokens 获取成功');
    } catch (e) {
      tokenStatus = 'failed';
      console.log('[Admin] HA tokens 获取失败:', e.message);
    }
  }

  // Restart scheduler if settings changed
  if (token_refresh_time !== undefined) {
    scheduleRefresh();
  }

  res.json({ success: true, needRestart: result.needRestart, port: result.config.port, tokenStatus });
});

router.get('/whitelist', authMiddleware, (req, res) => {
  res.json(getWhitelist());
});

router.post('/whitelist', authMiddleware, async (req, res) => {
  const { ip, view_path, width, height } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP 必填' });

  const item = {
    ip,
    view_path: view_path || '',
    width: width || 0,
    height: height || 0
  };
  await addWhitelistItem(item);
  await addAuditEntry({
    action: 'add_whitelist',
    user: req.sessionUser,
    detail: { ip, view_path }
  });
  res.json(item);
});

router.put('/whitelist/:ip', authMiddleware, async (req, res) => {
  const { ip } = req.params;
  const updates = req.body;
  const result = await updateWhitelistItem(ip, updates);
  if (!result) return res.status(404).json({ error: '设备不存在' });
  await addAuditEntry({
    action: 'update_whitelist',
    user: req.sessionUser,
    detail: { ip, updates }
  });
  res.json(result);
});

router.delete('/whitelist/:ip', authMiddleware, async (req, res) => {
  const { ip } = req.params;
  const success = await deleteWhitelistItem(ip);
  if (!success) return res.status(404).json({ error: '设备不存在' });
  await addAuditEntry({
    action: 'delete_whitelist',
    user: req.sessionUser,
    detail: { ip }
  });
  res.json({ success: true });
});

router.post('/whitelist/batch', authMiddleware, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '数据格式错误' });
  }
  const result = await batchImport(items);
  await addAuditEntry({
    action: 'batch_import',
    user: req.sessionUser,
    detail: { count: items.length, ...result }
  });
  res.json(result);
});

router.get('/audit', authMiddleware, (req, res) => {
  res.json(getAuditLog());
});

router.get('/stats', authMiddleware, (req, res) => {
  res.json(getConnectionStats());
});

module.exports = router;

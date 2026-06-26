const express = require('express');
const router = express.Router();
const path = require('path');
const {
  getConfig, updateConfig,
  getWhitelist, addWhitelistItem, updateWhitelistItem, deleteWhitelistItem, batchImport,
  getAuditLog, addAuditEntry,
  getConnectionStats
} = require('./storage');
const { getHaTokens, scheduleRefresh } = require('./ha_auth');

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

router.get('/config', (req, res) => {
  const config = getConfig();
  res.json({
    ha_base_url: config.ha_base_url,
    ha_username: config.ha_username || '',
    ha_password: config.ha_password || '',
    token_refresh_time: config.token_refresh_time || '',
    port: config.port || 8080
  });
});

router.put('/config', async (req, res) => {
  const { ha_base_url, ha_username, ha_password, token_refresh_time, port } = req.body;
  const updates = {};
  if (ha_base_url !== undefined) {
    if (!ha_base_url || typeof ha_base_url !== 'string') {
      return res.status(400).json({ error: 'ha_base_url 必填' });
    }
    updates.ha_base_url = ha_base_url;
  }
  if (ha_username !== undefined) updates.ha_username = ha_username;
  if (ha_password !== undefined) updates.ha_password = ha_password;
  if (token_refresh_time !== undefined) updates.token_refresh_time = token_refresh_time;
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
    user: 'admin',
    detail: { ha_base_url, ha_username: ha_username ? '***' : undefined, token_refresh_time, port }
  });

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

  if (token_refresh_time !== undefined) {
    scheduleRefresh();
  }

  res.json({ success: true, needRestart: result.needRestart, port: result.config.port, tokenStatus });
});

router.get('/whitelist', (req, res) => {
  res.json(getWhitelist());
});

router.post('/whitelist', async (req, res) => {
  const { ip, view_path, width, height } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP 必填' });

  const item = { ip, view_path: view_path || '', width: width || 0, height: height || 0 };
  await addWhitelistItem(item);
  await addAuditEntry({ action: 'add_whitelist', user: 'admin', detail: { ip, view_path } });
  res.json(item);
});

router.put('/whitelist/:ip', async (req, res) => {
  const { ip } = req.params;
  const updates = req.body;
  const result = await updateWhitelistItem(ip, updates);
  if (!result) return res.status(404).json({ error: '设备不存在' });
  await addAuditEntry({ action: 'update_whitelist', user: 'admin', detail: { ip, updates } });
  res.json(result);
});

router.delete('/whitelist/:ip', async (req, res) => {
  const { ip } = req.params;
  const success = await deleteWhitelistItem(ip);
  if (!success) return res.status(404).json({ error: '设备不存在' });
  await addAuditEntry({ action: 'delete_whitelist', user: 'admin', detail: { ip } });
  res.json({ success: true });
});

router.post('/whitelist/batch', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '数据格式错误' });
  }
  const result = await batchImport(items);
  await addAuditEntry({ action: 'batch_import', user: 'admin', detail: { count: items.length, ...result } });
  res.json(result);
});

router.get('/audit', (req, res) => {
  res.json(getAuditLog());
});

router.get('/stats', (req, res) => {
  res.json(getConnectionStats());
});

module.exports = router;

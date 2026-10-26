const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { seedIfEmpty } = require('./seed');
const { errorHandler } = require('./errors');

const PORT = process.env.PORT || 3000;

if (seedIfEmpty()) console.log('首次启动:已写入种子数据');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/members', require('./routes/members'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/stats', require('./routes/stats'));

// 生产模式:托管前端产物 + SPA fallback
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('大学生健康协会管理系统 API 运行中(前端未构建,请先 cd web && npm run build)'));
}

// API 404(避免落入 SPA fallback 后误返回 HTML)
app.use('/api', (req, res) => res.status(404).json({ code: 404, message: '接口不存在', error: 'NOT_FOUND' }));

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`大学生健康协会管理系统后端已启动: http://localhost:${PORT}`);
});

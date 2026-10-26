const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { db, UPLOADS_DIR } = require('../db');
const { ApiError } = require('../errors');
const { requireAuth, isAdmin } = require('../auth');

const router = express.Router();

router.get('/:id/download', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM activity_materials WHERE id = ?').get(req.params.id);
  if (!row || !row.file_path) throw new ApiError(404, 'NOT_FOUND', '附件不存在');
  const abs = path.join(UPLOADS_DIR, row.file_path);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'NOT_FOUND', '附件文件已丢失');
  res.download(abs, row.file_name || row.file_path);
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM activity_materials WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '材料记录不存在');
  const allowed = isAdmin(req.user.role) || row.uploader_id === req.user.uid;
  if (!allowed) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  db.prepare('DELETE FROM activity_materials WHERE id = ?').run(row.id);
  if (row.file_path) fs.unlink(path.join(UPLOADS_DIR, row.file_path), () => {});
  res.json({ code: 0, message: 'ok', data: {} });
});

module.exports = router;

const express = require('express');
const { db } = require('../db');
const { ApiError } = require('../errors');
const { requireAuth, requireAdmin } = require('../auth');
const { now } = require('../util/time');

const router = express.Router();

// 部门列表(注册页需要,故公开;统计 active 人数)
router.get('/', (req, res) => {
  const items = db.prepare(`
    SELECT d.id, d.name, d.description, d.sort,
      (SELECT COUNT(*) FROM members m WHERE m.dept_id = d.id AND m.status = 'active') AS member_count
    FROM departments d ORDER BY d.sort, d.id
  `).all();
  res.json({ code: 0, message: 'ok', data: items });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw new ApiError(400, 'VALIDATION', '部门名不能为空');
  if (db.prepare('SELECT id FROM departments WHERE name = ?').get(name)) {
    throw new ApiError(409, 'DUPLICATE', '部门名已存在');
  }
  const sort = Number.isInteger(b.sort) ? b.sort : 0;
  const info = db.prepare('INSERT INTO departments (name, description, sort, created_at) VALUES (?,?,?,?)')
    .run(name, b.description || null, sort, now());
  const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(info.lastInsertRowid);
  res.json({ code: 0, message: 'ok', data: { department } });
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '部门不存在');
  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : row.name;
  if (!name) throw new ApiError(400, 'VALIDATION', '部门名不能为空');
  if (db.prepare('SELECT id FROM departments WHERE name = ? AND id != ?').get(name, row.id)) {
    throw new ApiError(409, 'DUPLICATE', '部门名已存在');
  }
  const description = b.description !== undefined ? (b.description || null) : row.description;
  const sort = b.sort !== undefined ? (Number.isInteger(b.sort) ? b.sort : row.sort) : row.sort;
  db.prepare('UPDATE departments SET name = ?, description = ?, sort = ? WHERE id = ?')
    .run(name, description, sort, row.id);
  const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(row.id);
  res.json({ code: 0, message: 'ok', data: { department } });
});

// 删除部门前校验无 active 会员;ON DELETE SET NULL 保证误删时会员资料不丢
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '部门不存在');
  const activeCount = db.prepare("SELECT COUNT(*) AS c FROM members WHERE dept_id = ? AND status = 'active'").get(row.id).c;
  if (activeCount > 0) throw new ApiError(409, 'CONFLICT_DEPT_HAS_MEMBERS', `该部门仍有 ${activeCount} 名在册会员,请先转移`);
  db.prepare('DELETE FROM departments WHERE id = ?').run(row.id);
  res.json({ code: 0, message: 'ok', data: {} });
});

module.exports = router;

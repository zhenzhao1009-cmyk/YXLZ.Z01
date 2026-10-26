const express = require('express');
const { db } = require('../db');
const { ApiError } = require('../errors');
const { requireAuth, requireAdmin, isAdmin } = require('../auth');
const { now } = require('../util/time');

const router = express.Router();

// 公告列表:置顶优先、时间倒序;已软删不返回;my_unread 为本人未读
router.get('/', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const total = db.prepare('SELECT COUNT(*) AS c FROM announcements WHERE deleted_at IS NULL').get().c;
  const items = db.prepare(`
    SELECT a.id, a.title, a.pinned, a.require_confirm, m.name AS published_by_name, a.created_at,
      CASE WHEN EXISTS (
        SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.member_id = ?
      ) THEN 0 ELSE 1 END AS my_unread
    FROM announcements a JOIN members m ON m.id = a.published_by
    WHERE a.deleted_at IS NULL
    ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC
    LIMIT ? OFFSET ?
  `).all(req.user.uid, pageSize, (page - 1) * pageSize);
  res.json({ code: 0, message: 'ok', data: { items, total, page, pageSize } });
});

// 公告详情:require_confirm=0 打开即写已读回执;=1 等确认
router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT a.*, m.name AS published_by_name FROM announcements a
    JOIN members m ON m.id = a.published_by
    WHERE a.id = ? AND a.deleted_at IS NULL
  `).get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '公告不存在');
  const myRead = db.prepare('SELECT read_at FROM announcement_reads WHERE announcement_id = ? AND member_id = ?')
    .get(row.id, req.user.uid);
  let readAt = myRead ? myRead.read_at : null;
  if (!row.require_confirm && !myRead) {
    const stamp = now();
    db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id, member_id, read_at) VALUES (?,?,?)')
      .run(row.id, req.user.uid, stamp);
    readAt = stamp; // 响应须反映插入后的状态,否则首开仍返回未读
  }
  res.json({
    code: 0, message: 'ok',
    data: {
      announcement: { ...row, my_read: !!readAt, my_read_at: readAt },
    },
  });
});

// "我已知晓"(幂等)
router.post('/:id/confirm', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM announcements WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '公告不存在');
  db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id, member_id, read_at) VALUES (?,?,?)')
    .run(row.id, req.user.uid, now());
  res.json({ code: 0, message: 'ok', data: {} });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const content = typeof b.content === 'string' ? b.content : '';
  if (!title || !content.trim()) throw new ApiError(400, 'VALIDATION', '标题与内容不能为空');
  const pinned = b.pinned ? 1 : 0;
  const requireConfirm = b.require_confirm ? 1 : 0;
  const stamp = now();
  const info = db.prepare(`
    INSERT INTO announcements (title, content, pinned, require_confirm, published_by, created_at, updated_at, deleted_at)
    VALUES (?,?,?,?,?,?,?,NULL)
  `).run(title, content, pinned, requireConfirm, req.user.uid, stamp, stamp);
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid);
  res.json({ code: 0, message: 'ok', data: { announcement } });
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM announcements WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '公告不存在');
  const b = req.body || {};
  const title = b.title !== undefined ? String(b.title).trim() : row.title;
  const content = b.content !== undefined ? String(b.content) : row.content;
  if (!title || !content.trim()) throw new ApiError(400, 'VALIDATION', '标题与内容不能为空');
  const pinned = b.pinned !== undefined ? (b.pinned ? 1 : 0) : row.pinned;
  const requireConfirm = b.require_confirm !== undefined ? (b.require_confirm ? 1 : 0) : row.require_confirm;
  db.prepare('UPDATE announcements SET title=?, content=?, pinned=?, require_confirm=?, updated_at=? WHERE id=?')
    .run(title, content, pinned, requireConfirm, now(), row.id);
  // 普通公告转为"需确认"时,清掉历史自动已读——那些回执对应的是旧的无确认要求,不能算作已确认新要求
  if (requireConfirm === 1 && row.require_confirm === 0) {
    db.prepare('DELETE FROM announcement_reads WHERE announcement_id = ?').run(row.id);
  }
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(row.id);
  res.json({ code: 0, message: 'ok', data: { announcement } });
});

// 软删
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM announcements WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '公告不存在');
  db.prepare('UPDATE announcements SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  res.json({ code: 0, message: 'ok', data: {} });
});

// 已读/未读名单(基于全部 active 会员反查)
router.get('/:id/reads', requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  const row = db.prepare('SELECT id FROM announcements WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '公告不存在');
  // 已读/未读名单:均限定在册会员,保证 已读+未读=在册总数 口径一致
  const read = db.prepare(`
    SELECT m.name, m.student_no, d.name AS dept_name, r.read_at
    FROM announcement_reads r JOIN members m ON m.id = r.member_id
    LEFT JOIN departments d ON d.id = m.dept_id
    WHERE r.announcement_id = ? AND m.status = 'active' ORDER BY r.read_at
  `).all(row.id);
  const unread = db.prepare(`
    SELECT m.name, m.student_no, d.name AS dept_name
    FROM members m LEFT JOIN departments d ON d.id = m.dept_id
    WHERE m.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = ? AND r.member_id = m.id)
    ORDER BY m.id
  `).all(row.id);
  res.json({ code: 0, message: 'ok', data: { read, unread } });
});

module.exports = router;

const express = require('express');
const { db, withTransaction } = require('../db');
const { ApiError } = require('../errors');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../auth');
const { now, termStart, termEnd } = require('../util/time');

const router = express.Router();

const MEMBER_COLS = `m.id, m.student_no, m.name, m.gender, m.college, m.grade, m.phone,
  m.dept_id, d.name AS dept_name, m.role, m.status, m.joined_at, m.created_at, m.updated_at`;

function getMemberFull(id) {
  return db.prepare(`SELECT ${MEMBER_COLS} FROM members m LEFT JOIN departments d ON d.id = m.dept_id WHERE m.id = ?`).get(id);
}

function requireStr(body, field, label) {
  const v = body[field];
  if (typeof v !== 'string' || !v.trim()) throw new ApiError(400, 'VALIDATION', `${label}不能为空`);
  return v.trim();
}

// 自荐注册:落库 pending,不可登录,待干部审核
router.post('/register', (req, res) => {
  const b = req.body || {};
  const studentNo = requireStr(b, 'student_no', '学号');
  const name = requireStr(b, 'name', '姓名');
  const password = requireStr(b, 'password', '密码');
  if (password.length < 6) throw new ApiError(400, 'VALIDATION', '密码至少 6 位');
  const deptId = Number(b.dept_id);
  if (!deptId) throw new ApiError(400, 'VALIDATION', '请选择意向部门');
  const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(deptId);
  if (!dept) throw new ApiError(400, 'VALIDATION', '意向部门不存在');
  if (db.prepare('SELECT id FROM members WHERE student_no = ?').get(studentNo)) {
    throw new ApiError(409, 'DUPLICATE', '该学号已注册');
  }
  db.prepare(`INSERT INTO members (student_no, name, password_hash, gender, college, grade, phone, dept_id, role, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)`)
    .run(studentNo, name, hashPassword(password), '保密', b.college || null, b.grade || null, b.phone || null,
      deptId, 'member', now(), now());
  res.json({ code: 0, message: 'ok', data: {} });
});

router.post('/login', (req, res) => {
  const b = req.body || {};
  const studentNo = requireStr(b, 'student_no', '学号');
  const password = requireStr(b, 'password', '密码');
  const row = db.prepare('SELECT * FROM members WHERE student_no = ?').get(studentNo);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new ApiError(401, 'UNAUTHORIZED', '学号或密码错误');
  }
  if (row.status === 'pending') throw new ApiError(403, 'ACCOUNT_PENDING', '账号待审核,请等待干部审核通过');
  if (row.status === 'quit') throw new ApiError(403, 'ACCOUNT_QUIT', '账号已离会');
  const token = signToken(row);
  res.json({ code: 0, message: 'ok', data: { token, member: getMemberFull(row.id) } });
});

// 当前用户 + 首页小卡(本学期:按活动开始时间归属学期,而非报名时间)
router.get('/me', requireAuth, (req, res) => {
  const member = getMemberFull(req.user.uid);
  const termStartStr = termStart();
  const termEndStr = termEnd();
  const unreadCount = db.prepare(`
    SELECT COUNT(*) AS c FROM announcements a
    WHERE a.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.member_id = ?)
  `).get(req.user.uid).c;
  const signupCount = db.prepare(`
    SELECT COUNT(*) AS c FROM activity_signups s JOIN activities a ON a.id = s.activity_id
    WHERE s.member_id = ? AND s.status != 'cancelled' AND a.cancelled = 0 AND a.start_time >= ? AND a.start_time < ?
  `).get(req.user.uid, termStartStr, termEndStr).c;
  const checkinCount = db.prepare(`
    SELECT COUNT(*) AS c FROM activity_signups
    WHERE member_id = ? AND status = 'checked_in' AND checkin_at >= ? AND checkin_at < ?
  `).get(req.user.uid, termStartStr, termEndStr).c;
  res.json({ code: 0, message: 'ok', data: { member, unread_count: unreadCount, my_stats: { signup_count: signupCount, checkin_count: checkinCount } } });
});

// 改本人资料(学号/姓名/部门/角色不可改)
router.put('/me', requireAuth, (req, res) => {
  const b = req.body || {};
  const fields = {};
  for (const f of ['phone', 'college', 'grade']) {
    if (b[f] !== undefined) fields[f] = b[f] === null || b[f] === '' ? null : String(b[f]).trim();
  }
  if (b.gender !== undefined) {
    if (!['男', '女', '保密'].includes(b.gender)) throw new ApiError(400, 'VALIDATION', '性别取值非法');
    fields.gender = b.gender;
  }
  const sets = Object.keys(fields).map((f) => `${f} = ?`).join(', ');
  if (sets) {
    db.prepare(`UPDATE members SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...Object.values(fields), now(), req.user.uid);
  }
  res.json({ code: 0, message: 'ok', data: { member: getMemberFull(req.user.uid) } });
});

router.put('/password', requireAuth, (req, res) => {
  const b = req.body || {};
  const oldPassword = requireStr(b, 'old_password', '原密码');
  const newPassword = requireStr(b, 'new_password', '新密码');
  if (newPassword.length < 6) throw new ApiError(400, 'VALIDATION', '新密码至少 6 位');
  const row = db.prepare('SELECT password_hash FROM members WHERE id = ?').get(req.user.uid);
  if (!verifyPassword(oldPassword, row.password_hash)) throw new ApiError(400, 'VALIDATION', '原密码不正确');
  db.prepare('UPDATE members SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), now(), req.user.uid);
  res.json({ code: 0, message: 'ok', data: {} });
});

module.exports = router;

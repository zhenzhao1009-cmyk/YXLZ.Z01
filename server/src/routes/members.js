const express = require('express');
const { db } = require('../db');
const { ApiError } = require('../errors');
const { hashPassword, requireAuth, requireSuperAdmin, isAdmin } = require('../auth');
const { now, today } = require('../util/time');
const { sendCsv } = require('../util/csv');

const router = express.Router();

const ROLE_NAMES = { super_admin: '超级管理员', president: '会长', advisor: '指导老师', minister: '部长', member: '会员' };
const STATUS_NAMES = { pending: '待审核', active: '在册', quit: '离会' };
const GENDERS = ['男', '女', '保密'];

const MEMBER_SAFE_COLS = `m.id, m.student_no, m.name, m.gender, m.college, m.grade, m.phone,
  m.dept_id, d.name AS dept_name, m.role, m.status, m.joined_at, m.created_at, m.updated_at`;

function getMember(id) {
  return db.prepare(`
    SELECT ${MEMBER_SAFE_COLS} FROM members m
    LEFT JOIN departments d ON d.id = m.dept_id WHERE m.id = ?
  `).get(id);
}

function assertCanManageTarget(operator, target) {
  if (operator.role === 'super_admin') return;
  if (['super_admin', 'president', 'advisor'].includes(target.role)) {
    throw new ApiError(403, 'FORBIDDEN', '无权限修改管理层账号');
  }
}

function clampPage(b) {
  const page = Math.max(1, parseInt(b.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(b.pageSize, 10) || 20));
  return { page, pageSize };
}

// 部长只能把 role 设为 member/admin 任命规则之外的操作一律 403
const ROLE_VALUES = ['super_admin', 'president', 'advisor', 'minister', 'member'];
function assertCanSetRole(operator, targetRole, nextRole) {
  if (!ROLE_VALUES.includes(nextRole)) throw new ApiError(400, 'VALIDATION', '角色取值非法');
  if (!isAdmin(operator.role)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  if (operator.role === 'super_admin') return;
  if (operator.role === 'president') {
    if (!['member', 'minister'].includes(nextRole)) {
      throw new ApiError(403, 'FORBIDDEN', '会长仅可任命部长');
    }
    return;
  }
  // advisor 不能设置任何角色
  throw new ApiError(403, 'FORBIDDEN', '指导老师不能设置角色');
}

function assertRoleTransition(target, nextRole) {
  if (nextRole === 'minister' && !target.dept_id) {
    throw new ApiError(400, 'VALIDATION', '部长必须归属一个部门,请先指定部门');
  }
}

// 会员列表:部长由服务端强制 dept_id=本部门
router.get('/', requireAuth, (req, res) => {
  const { page, pageSize } = clampPage(req.query);
  const where = [];
  const params = [];
  if (req.user.role === 'minister') {
    where.push('m.dept_id = ?');
    params.push(req.user.deptId);
  } else if (!isAdmin(req.user.role)) {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  } else if (req.query.dept_id) {
    where.push('m.dept_id = ?');
    params.push(Number(req.query.dept_id));
  }
  if (req.query.status) {
    where.push('m.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(m.student_no LIKE ? OR m.name LIKE ? OR m.phone LIKE ?)');
    const kw = `%${String(req.query.q).trim()}%`;
    params.push(kw, kw, kw);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM members m ${whereSql}`).get(...params).c;
  const items = db.prepare(`
    SELECT m.id, m.student_no, m.name, m.gender, m.college, m.grade, m.phone,
      m.dept_id, d.name AS dept_name, m.role, m.status, m.joined_at
    FROM members m LEFT JOIN departments d ON d.id = m.dept_id
    ${whereSql} ORDER BY m.id LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ code: 0, message: 'ok', data: { items, total, page, pageSize } });
});

// 干部代录会员(初始密码 123456)
router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const studentNo = typeof b.student_no === 'string' ? b.student_no.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!studentNo || !name) throw new ApiError(400, 'VALIDATION', '学号与姓名不能为空');
  if (db.prepare('SELECT id FROM members WHERE student_no = ?').get(studentNo)) {
    throw new ApiError(409, 'DUPLICATE', '该学号已存在');
  }

  let deptId = null;
  let role = 'member';
  if (req.user.role === 'minister') {
    deptId = req.user.deptId;
  } else if (isAdmin(req.user.role)) {
    if (b.dept_id) {
      deptId = Number(b.dept_id);
      if (!db.prepare('SELECT id FROM departments WHERE id = ?').get(deptId)) {
        throw new ApiError(400, 'VALIDATION', '部门不存在');
      }
    }
    if (b.role !== undefined && b.role !== 'member') {
      assertCanSetRole(req.user, null, b.role);
      role = b.role;
    }
  } else {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  }
  assertRoleTransition({ dept_id: deptId }, role);

  const info = db.prepare(`
    INSERT INTO members (student_no, name, password_hash, gender, college, grade, phone, dept_id, role, status, joined_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'active',?,?,?)
  `).run(studentNo, name, hashPassword('123456'), GENDERS.includes(b.gender) ? b.gender : '保密',
    b.college || null, b.grade || null, b.phone || null, deptId, role, b.status === 'active' || !b.status ? today() : null, now(), now());
  res.json({ code: 0, message: 'ok', data: { member: getMember(info.lastInsertRowid) } });
});

// 编辑会员(字段白名单见设计规范 9.5)
router.put('/:id', requireAuth, (req, res) => {
  const target = getMember(req.params.id);
  if (!target) throw new ApiError(404, 'NOT_FOUND', '会员不存在');
  const b = req.body || {};
  const sets = {};

  // 资料:两人都可改,部长限本部门 member
  const profileFields = ['phone', 'college', 'grade'];
  if (req.user.role === 'minister') {
    if (target.dept_id !== req.user.deptId || target.role !== 'member') {
      throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
    }
  } else if (isAdmin(req.user.role)) {
    assertCanManageTarget(req.user, target);
    profileFields.push('name');
    if (b.dept_id !== undefined) {
      const deptId = b.dept_id === null ? null : Number(b.dept_id);
      if (deptId !== null && !db.prepare('SELECT id FROM departments WHERE id = ?').get(deptId)) {
        throw new ApiError(400, 'VALIDATION', '部门不存在');
      }
      sets.dept_id = deptId;
    }
    if (b.role !== undefined && b.role !== target.role) {
      assertCanSetRole(req.user, target.role, b.role);
      assertRoleTransition({ dept_id: b.dept_id !== undefined ? (b.dept_id === null ? null : Number(b.dept_id)) : target.dept_id }, b.role);
      sets.role = b.role;
    }
    if (b.status !== undefined && b.status !== target.status) {
      if (!['pending', 'active', 'quit'].includes(b.status)) throw new ApiError(400, 'VALIDATION', '状态取值非法');
      sets.status = b.status;
      // 待审核 → 在册 视同审核通过,补入会日期
      if (target.status === 'pending' && b.status === 'active') sets.joined_at = today();
    }
  } else {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  }
  for (const f of profileFields) {
    if (b[f] !== undefined) sets[f] = b[f] === null || b[f] === '' ? null : String(b[f]).trim();
  }
  if (b.gender !== undefined) {
    if (!GENDERS.includes(b.gender)) throw new ApiError(400, 'VALIDATION', '性别取值非法');
    sets.gender = b.gender;
  }
  // 部长 status 只允许传 'quit'(标记离会),不能审核激活、不能恢复
  if (req.user.role === 'minister' && b.status !== undefined && b.status !== 'quit') {
    throw new ApiError(403, 'FORBIDDEN', '部长仅可将会员标记为离会');
  }
  if (req.user.role === 'minister' && b.status === 'quit' && target.status !== 'quit') {
    sets.status = 'quit';
  }

  // 终态校验:部长必须归属部门(无论角色是否变动,防止清空部门留下无部门部长)
  const finalRole = sets.role !== undefined ? sets.role : target.role;
  const finalDeptId = sets.dept_id !== undefined ? sets.dept_id : target.dept_id;
  if (finalRole === 'minister' && !finalDeptId) {
    throw new ApiError(400, 'VALIDATION', '部长必须归属一个部门,请先指定部门');
  }

  if (Object.keys(sets).length) {
    const sql = `UPDATE members SET ${Object.keys(sets).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
    db.prepare(sql).run(...Object.values(sets), now(), target.id);
  }
  res.json({ code: 0, message: 'ok', data: { member: getMember(target.id) } });
});

// 审核注册:approve→active;reject→物理删除 pending 记录
router.put('/:id/review', requireAuth, (req, res) => {
  const target = getMember(req.params.id);
  if (!target) throw new ApiError(404, 'NOT_FOUND', '会员不存在');
  if (target.status !== 'pending') throw new ApiError(409, 'STATE_CONFLICT', '该申请已处理');
  const action = (req.body || {}).action;
  if (!['approve', 'reject'].includes(action)) throw new ApiError(400, 'VALIDATION', 'action 取值非法');

  if (req.user.role === 'minister') {
    if (target.dept_id !== req.user.deptId) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  } else if (!isAdmin(req.user.role)) {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  }

  if (action === 'reject') {
    db.prepare('DELETE FROM members WHERE id = ?').run(target.id);
    return res.json({ code: 0, message: 'ok', data: {} });
  }
  if (req.body.dept_id !== undefined) {
    if (!isAdmin(req.user.role)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
    const deptId = Number(req.body.dept_id);
    if (!db.prepare('SELECT id FROM departments WHERE id = ?').get(deptId)) {
      throw new ApiError(400, 'VALIDATION', '部门不存在');
    }
    db.prepare('UPDATE members SET dept_id = ? WHERE id = ?').run(deptId, target.id);
  }
  db.prepare("UPDATE members SET status = 'active', joined_at = ?, updated_at = ? WHERE id = ?")
    .run(today(), now(), target.id);
  res.json({ code: 0, message: 'ok', data: {} });
});

// 物理删除会员:仅 super_admin;仅 pending 或无任何关联业务记录
router.delete('/:id', requireAuth, requireSuperAdmin, (req, res) => {
  const target = getMember(req.params.id);
  if (!target) throw new ApiError(404, 'NOT_FOUND', '会员不存在');
  const refs = [];
  if (db.prepare('SELECT 1 AS x FROM activities WHERE created_by = ? LIMIT 1').get(target.id)) refs.push('创建的活动');
  if (db.prepare('SELECT 1 AS x FROM announcements WHERE published_by = ? LIMIT 1').get(target.id)) refs.push('发布的公告');
  if (db.prepare('SELECT 1 AS x FROM activity_materials WHERE uploader_id = ? LIMIT 1').get(target.id)) refs.push('上传的材料');
  if (db.prepare('SELECT 1 AS x FROM activity_signups WHERE member_id = ? OR checkin_by = ? LIMIT 1').get(target.id, target.id)) refs.push('报名/签到');
  if (db.prepare('SELECT 1 AS x FROM announcement_reads WHERE member_id = ? LIMIT 1').get(target.id)) refs.push('公告回执');
  if (target.status !== 'pending' && refs.length) {
    throw new ApiError(409, 'CONFLICT_HAS_RECORDS', `该会员存在${refs.join('、')}记录,请改用「标记离会」`);
  }
  db.prepare('DELETE FROM members WHERE id = ?').run(target.id);
  res.json({ code: 0, message: 'ok', data: {} });
});

// 重置密码为 123456
router.put('/:id/password', requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  const target = getMember(req.params.id);
  if (!target) throw new ApiError(404, 'NOT_FOUND', '会员不存在');
  assertCanManageTarget(req.user, target);
  db.prepare('UPDATE members SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword('123456'), now(), target.id);
  res.json({ code: 0, message: 'ok', data: {} });
});

// CSV 批量导入(前端已解析为 JSON 数组;事务内逐行校验,重复学号/部门不存在则跳过)
router.post('/import', requireAuth, (req, res) => {
  if (!isAdmin(req.user.role)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  const rows = req.body;
  if (!Array.isArray(rows)) throw new ApiError(400, 'VALIDATION', '请求体应为 JSON 数组');
  const inserted = [];
  const skipped = [];
  const pwHash = hashPassword('123456'); // 全部初始密码相同,哈希只算一次(2000 次 scryptSync 会长时间阻塞)
  const MAX_ROWS = 2000;
  for (const r of rows.slice(0, MAX_ROWS)) {
    const studentNo = typeof r.student_no === 'string' ? r.student_no.trim() : '';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!studentNo || !name) {
      skipped.push({ student_no: studentNo || '(空)', reason: '学号或姓名为空' });
      continue;
    }
    if (db.prepare('SELECT id FROM members WHERE student_no = ?').get(studentNo)) {
      skipped.push({ student_no: studentNo, reason: '学号已存在' });
      continue;
    }
    let deptId = null;
    if (r.dept_name) {
      const dept = db.prepare('SELECT id FROM departments WHERE name = ?').get(String(r.dept_name).trim());
      if (!dept) {
        skipped.push({ student_no: studentNo, reason: `部门「${r.dept_name}」不存在` });
        continue;
      }
      deptId = dept.id;
    }
    db.prepare(`
      INSERT INTO members (student_no, name, password_hash, gender, college, grade, phone, dept_id, role, status, joined_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?, 'member','active',?,?,?)
    `).run(studentNo, name, pwHash, GENDERS.includes(r.gender) ? r.gender : '保密',
      r.college || null, r.grade || null, r.phone || null, deptId, today(), now(), now());
    inserted.push(studentNo);
  }
  if (rows.length > MAX_ROWS) {
    skipped.push({ student_no: `(共 ${rows.length} 行)`, reason: `单次最多导入 ${MAX_ROWS} 行,超出部分未处理,请分批导入` });
  }
  res.json({ code: 0, message: 'ok', data: { inserted: inserted.length, skipped } });
});

// 导出会员名册 CSV(部长限本部门)
router.get('/export', requireAuth, (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role === 'minister') {
    where.push('m.dept_id = ?');
    params.push(req.user.deptId);
  } else if (!isAdmin(req.user.role)) {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  } else if (req.query.dept_id) {
    where.push('m.dept_id = ?');
    params.push(Number(req.query.dept_id));
  }
  if (req.query.status) {
    where.push('m.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(m.student_no LIKE ? OR m.name LIKE ? OR m.phone LIKE ?)');
    const kw = `%${String(req.query.q).trim()}%`;
    params.push(kw, kw, kw);
  }
  const rows = db.prepare(`
    SELECT m.student_no, m.name, m.gender, m.college, m.grade, m.phone,
      d.name AS dept_name, m.role, m.status, m.joined_at
    FROM members m LEFT JOIN departments d ON d.id = m.dept_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.id
  `).all(...params);
  sendCsv(res, `会员名册_${today()}.csv`,
    ['学号', '姓名', '性别', '学院', '年级', '手机', '部门', '角色', '状态', '入会日期'],
    rows.map((r) => [r.student_no, r.name, r.gender, r.college, r.grade, r.phone, r.dept_name,
      ROLE_NAMES[r.role] || r.role, STATUS_NAMES[r.status] || r.status, r.joined_at || '']));
});

module.exports = router;

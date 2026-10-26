const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const multer = require('multer');
const { db, withTransaction, UPLOADS_DIR } = require('../db');
const { ApiError } = require('../errors');
const { requireAuth, isAdmin } = require('../auth');
const { now, nowMinute, today, parse } = require('../util/time');
const checkinCode = require('../util/checkinCode');
const { lanIp } = require('../util/lan');
const { sendCsv } = require('../util/csv');

const router = express.Router();
const PORT = process.env.PORT || 3000;

const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

// 正则只看外形,这里验证是真实存在的时刻(挡住 99:00、02-31 这类输入,它们会让签到窗口判断失效)
function isValidMinuteStr(s) {
  if (!TIME_RE.test(s)) return false;
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return false;
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` === s;
}

function getActivity(id) {
  return db.prepare(`
    SELECT a.*, m.name AS created_by_name FROM activities a
    JOIN members m ON m.id = a.created_by WHERE a.id = ?
  `).get(id);
}

// 状态由时间实时推导;cancelled 优先于一切
function deriveState(a) {
  if (a.cancelled) return 'cancelled';
  const n = nowMinute();
  if (n < a.start_time) return 'upcoming';
  if (n <= a.end_time) return 'ongoing';
  return 'ended';
}

const canManage = (user, a) => isAdmin(user.role) || (user.role === 'minister' && a.created_by === user.uid);

function validSignupCount(activityId) {
  return db.prepare("SELECT COUNT(*) AS c FROM activity_signups WHERE activity_id = ? AND status IN ('registered','checked_in')").get(activityId).c;
}

// 签到窗口:开始前 30 分钟至结束
function checkinWindow(a) {
  const startMs = parse(a.start_time).getTime();
  const endMs = parse(a.end_time).getTime();
  const n = Date.now();
  if (n < startMs - 30 * 60000) return { ok: false, msg: '签到未开始' };
  if (n > endMs) return { ok: false, msg: '签到已结束' };
  return { ok: true };
}

function myStatus(activityId, uid) {
  const row = db.prepare(`
    SELECT status FROM activity_signups
    WHERE activity_id = ? AND member_id = ? AND status != 'cancelled'
    ORDER BY id DESC LIMIT 1
  `).get(activityId, uid);
  return row ? row.status : 'none';
}

// 报名写入(容量校验与写入同事务,防并发超员);须在 withTransaction 内调用
function insertSignupRow(a, memberId, status, checkinBy) {
  if (a.capacity > 0 && validSignupCount(a.id) >= a.capacity) {
    throw new ApiError(409, 'CAPACITY_FULL', '活动名额已满');
  }
  const info = db.prepare(`
    INSERT INTO activity_signups (activity_id, member_id, status, registered_at, checkin_at, checkin_by, updated_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(a.id, memberId, status, now(), status === 'checked_in' ? now() : null, checkinBy || null, now());
  return info.lastInsertRowid;
}

function getSignupRow(activityId, memberId) {
  return db.prepare(`
    SELECT s.*, m.name AS member_name, m.student_no, m.dept_id, m.role, m.status AS member_status
    FROM activity_signups s JOIN members m ON m.id = s.member_id
    WHERE s.activity_id = ? AND s.member_id = ? AND s.status != 'cancelled'
    ORDER BY s.id DESC LIMIT 1
  `).get(activityId, memberId);
}

// ── 活动列表 / 详情 ──

router.get('/', requireAuth, (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    where.push('a.title LIKE ?');
    params.push(`%${String(req.query.q).trim()}%`);
  }
  const state = req.query.state;
  if (state === 'cancelled') {
    where.push('a.cancelled = 1');
  } else if (state === 'upcoming') {
    where.push("a.cancelled = 0 AND a.start_time > ?");
    params.push(nowMinute());
  } else if (state === 'ongoing') {
    where.push("a.cancelled = 0 AND a.start_time <= ? AND a.end_time >= ?");
    params.push(nowMinute(), nowMinute());
  } else if (state === 'ended') {
    where.push("a.cancelled = 0 AND a.end_time < ?");
    params.push(nowMinute());
  }

  const rows = db.prepare(`
    SELECT a.id, a.title, a.location, a.start_time, a.end_time, a.capacity, a.cancelled,
      a.created_by, m.name AS created_by_name
    FROM activities a JOIN members m ON m.id = a.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.start_time DESC, a.id DESC
  `).all(...params);
  const signupCounts = new Map(db.prepare(`
    SELECT activity_id, COUNT(*) AS c FROM activity_signups
    WHERE status IN ('registered','checked_in') GROUP BY activity_id
  `).all().map((r) => [r.activity_id, r.c]));

  const data = rows.map((a) => ({
    ...a,
    state: deriveState(a),
    signup_count: signupCounts.get(a.id) || 0,
    my_status: myStatus(a.id, req.user.uid),
  }));
  res.json({ code: 0, message: 'ok', data });
});

router.get('/:id', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  res.json({
    code: 0, message: 'ok',
    data: {
      ...a,
      state: deriveState(a),
      signup_count: validSignupCount(a.id),
      my_status: myStatus(a.id, req.user.uid),
      can_manage: canManage(req.user, a),
    },
  });
});

function validateActivityBody(b, merged) {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const location = typeof b.location === 'string' ? b.location.trim() : '';
  if (!title) throw new ApiError(400, 'VALIDATION', '活动标题不能为空');
  if (!location) throw new ApiError(400, 'VALIDATION', '活动地点不能为空');
  if (!isValidMinuteStr(merged.start_time) || !isValidMinuteStr(merged.end_time)) {
    throw new ApiError(400, 'VALIDATION', '时间格式应为真实存在的 YYYY-MM-DD HH:MM');
  }
  if (merged.end_time <= merged.start_time) throw new ApiError(400, 'VALIDATION', '结束时间必须晚于开始时间');
  const capacity = Number(b.capacity);
  if (!Number.isInteger(capacity) || capacity < 0) throw new ApiError(400, 'VALIDATION', '容量必须为不小于 0 的整数(0=不限)');
  return { title, location, description: b.description || null, start_time: merged.start_time, end_time: merged.end_time, capacity };
}

router.post('/', requireAuth, (req, res) => {
  if (!isAdmin(req.user.role) && req.user.role !== 'minister') {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  }
  const b = req.body || {};
  const v = validateActivityBody(b, { start_time: b.start_time, end_time: b.end_time });
  const stamp = now();
  const info = db.prepare(`
    INSERT INTO activities (title, description, location, start_time, end_time, capacity, cancelled, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,'0',?,?,?)
  `).run(v.title, v.description, v.location, v.start_time, v.end_time, v.capacity, req.user.uid, stamp, stamp);
  res.json({ code: 0, message: 'ok', data: { activity: getActivity(info.lastInsertRowid) } });
});

router.put('/:id', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  if (!canManage(req.user, a)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  if (req.user.role === 'minister' && nowMinute() >= a.start_time) {
    throw new ApiError(409, 'STATE_CONFLICT', '活动已开始,部长不可再编辑');
  }
  const b = req.body || {};
  const merged = {
    start_time: b.start_time !== undefined ? b.start_time : a.start_time,
    end_time: b.end_time !== undefined ? b.end_time : a.end_time,
  };
  const v = validateActivityBody(b, merged);
  if (v.capacity > 0 && v.capacity < validSignupCount(a.id)) {
    throw new ApiError(409, 'STATE_CONFLICT', '容量不得低于当前有效报名数');
  }
  db.prepare(`
    UPDATE activities SET title=?, description=?, location=?, start_time=?, end_time=?, capacity=?, updated_at=? WHERE id=?
  `).run(v.title, v.description, v.location, v.start_time, v.end_time, v.capacity, now(), a.id);
  res.json({ code: 0, message: 'ok', data: { activity: getActivity(a.id) } });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  if (!canManage(req.user, a)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  if (a.cancelled) throw new ApiError(409, 'STATE_CONFLICT', '活动已是取消状态');
  if (nowMinute() > a.end_time) throw new ApiError(409, 'STATE_CONFLICT', '活动已结束,不可取消');
  db.prepare('UPDATE activities SET cancelled = 1, updated_at = ? WHERE id = ?').run(now(), a.id);
  res.json({ code: 0, message: 'ok', data: {} });
});

// 物理删除:仅 admin 且零报名记录(任意状态);级联删报名与材料记录,并清理附件文件
router.delete('/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'super_admin' && !isAdmin(req.user.role)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  const signupCount = db.prepare('SELECT COUNT(*) AS c FROM activity_signups WHERE activity_id = ?').get(a.id).c;
  if (signupCount > 0) throw new ApiError(409, 'CONFLICT_HAS_SIGNUPS', '活动仍有报名记录,请改用「取消活动」');
  const materials = db.prepare('SELECT id, file_path FROM activity_materials WHERE activity_id = ?').all(a.id);
  withTransaction(() => {
    db.prepare('DELETE FROM activity_materials WHERE activity_id = ?').run(a.id);
    db.prepare('DELETE FROM activities WHERE id = ?').run(a.id);
  });
  for (const mRow of materials) {
    if (mRow.file_path) fs.unlink(path.join(UPLOADS_DIR, mRow.file_path), () => {});
  }
  res.json({ code: 0, message: 'ok', data: {} });
});

// ── 报名 / 取消报名 ──

// 代报名目标解析:会员只能操作自己;部长限本部门 member;管理层任意 active 会员
function resolveTargetMember(req, memberId) {
  const uid = memberId || req.user.uid;
  if (uid !== req.user.uid) {
    if (!isAdmin(req.user.role) && req.user.role !== 'minister') {
      throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
    }
    if (req.user.role === 'minister') {
      const target = db.prepare('SELECT id, dept_id, role, status FROM members WHERE id = ?').get(uid);
      if (!target || target.dept_id !== req.user.deptId || target.role !== 'member') {
        throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
      }
    }
  }
  const member = db.prepare('SELECT id, status FROM members WHERE id = ?').get(uid);
  if (!member) throw new ApiError(404, 'NOT_FOUND', '会员不存在');
  if (member.status !== 'active') throw new ApiError(403, 'FORBIDDEN', '目标会员当前不可操作(非在册状态)');
  return member.id;
}

router.post('/:id/signup', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  if (a.cancelled) throw new ApiError(409, 'STATE_CONFLICT', '活动已取消,无法报名');
  if (nowMinute() >= a.start_time) throw new ApiError(409, 'STATE_CONFLICT', '报名已截止(活动已开始)');
  const memberId = resolveTargetMember(req, (req.body || {}).member_id);
  const existing = getSignupRow(a.id, memberId);
  if (existing) throw new ApiError(409, 'DUPLICATE', '请勿重复报名');
  let signupId;
  withTransaction(() => { signupId = insertSignupRow(a, memberId, 'registered', null); });
  res.json({ code: 0, message: 'ok', data: { signup: db.prepare('SELECT * FROM activity_signups WHERE id = ?').get(signupId) } });
});

router.delete('/:id/signup', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  if (a.cancelled) throw new ApiError(409, 'STATE_CONFLICT', '活动已取消');
  if (nowMinute() >= a.start_time) throw new ApiError(409, 'STATE_CONFLICT', '活动已开始,不可取消报名');
  const memberId = resolveTargetMember(req, req.query.member_id ? Number(req.query.member_id) : undefined);
  const row = getSignupRow(a.id, memberId);
  if (!row) throw new ApiError(409, 'STATE_CONFLICT', '尚未报名该活动');
  if (row.status === 'checked_in') throw new ApiError(409, 'STATE_CONFLICT', '已签到,请先撤销签到再取消报名');
  db.prepare("UPDATE activity_signups SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), row.id);
  res.json({ code: 0, message: 'ok', data: {} });
});

// ── 名单 / 导出 ──

function assertRosterAccess(req, a) {
  if (!canManage(req.user, a)) throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
}

router.get('/:id/signups', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  assertRosterAccess(req, a);
  const items = db.prepare(`
    SELECT s.id AS signup_id, s.member_id, m.student_no, m.name, d.name AS dept_name,
      s.status, s.registered_at, s.checkin_at, op.name AS checkin_by_name
    FROM activity_signups s
    JOIN members m ON m.id = s.member_id
    LEFT JOIN departments d ON d.id = m.dept_id
    LEFT JOIN members op ON op.id = s.checkin_by
    WHERE s.activity_id = ?
    ORDER BY s.registered_at, s.id
  `).all(a.id);
  res.json({ code: 0, message: 'ok', data: items });
});

router.get('/:id/signups/export', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  assertRosterAccess(req, a);
  const rows = db.prepare(`
    SELECT m.student_no, m.name, d.name AS dept_name, s.status, s.registered_at, s.checkin_at, s.checkin_by
    FROM activity_signups s JOIN members m ON m.id = s.member_id
    LEFT JOIN departments d ON d.id = m.dept_id
    WHERE s.activity_id = ? ORDER BY s.registered_at, s.id
  `).all(a.id);
  const statusNames = { registered: '已报名', checked_in: '已签到', cancelled: '已取消' };
  sendCsv(res, `${a.title}_名单_${today()}.csv`,
    ['学号', '姓名', '部门', '状态', '报名时间', '签到时间', '签到方式'],
    rows.map((r) => [r.student_no, r.name, r.dept_name || '', statusNames[r.status] || r.status,
      r.registered_at, r.checkin_at || '', r.status === 'checked_in' ? (r.checkin_by ? '补签' : '本人') : '']));
});

// ── 签到 ──

// 输码签到(仅本人);已签到幂等;未报名自动补报名(走同一容量事务)
router.post('/:id/checkin', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  if (a.cancelled) throw new ApiError(409, 'STATE_CONFLICT', '活动已取消,无法签到');
  const win = checkinWindow(a);
  if (!win.ok) throw new ApiError(409, 'STATE_CONFLICT', win.msg);
  const input = (req.body || {}).code;
  if (typeof input !== 'string' || !/^\d{6}$/.test(input)) throw new ApiError(400, 'BAD_CODE', '请输入 6 位数字签到码');
  const { ok } = checkinCode.verify(a.id, input);
  if (!ok) throw new ApiError(400, 'BAD_CODE', '签到码不正确');

  let result;
  withTransaction(() => {
    const row = getSignupRow(a.id, req.user.uid);
    if (row) {
      if (row.status === 'checked_in') {
        result = row; // 幂等成功,不重复写记录
        return;
      }
      db.prepare("UPDATE activity_signups SET status = 'checked_in', checkin_at = ?, checkin_by = NULL, updated_at = ? WHERE id = ?")
        .run(now(), now(), row.id);
      result = getSignupRow(a.id, req.user.uid);
      return;
    }
    // 未报名者输码签到:自动补报名(容量满则 409)
    insertSignupRow(a, req.user.uid, 'checked_in', null);
    result = getSignupRow(a.id, req.user.uid);
  });
  res.json({ code: 0, message: '签到成功', data: { signup: result } });
});

router.get('/:id/checkin-code', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  assertRosterAccess(req, a);
  const { code, expiresIn } = checkinCode.current(a.id);
  res.json({ code: 0, message: 'ok', data: { code, expires_in: expiresIn } });
});

router.get('/:id/checkin-qr', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  assertRosterAccess(req, a);
  const { code, expiresIn } = checkinCode.current(a.id);
  const url = `http://${lanIp()}:${PORT}/checkin/${a.id}?code=${code}`;
  res.json({ code: 0, message: 'ok', data: { url, code, expires_in: expiresIn } });
});

// 干部补签:开始前 30 分钟后无上限时限(含活动结束后补录);写 checkin_by 留痕
router.post('/:id/manual-checkin', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  if (a.cancelled) throw new ApiError(409, 'STATE_CONFLICT', '活动已取消,无法补签');
  if (Date.now() < parse(a.start_time).getTime() - 30 * 60000) {
    throw new ApiError(409, 'STATE_CONFLICT', '签到窗口未开始,无法补签');
  }
  const memberId = Number((req.body || {}).member_id);
  if (!memberId) throw new ApiError(400, 'VALIDATION', '缺少 member_id');
  if (req.user.role === 'minister') {
    const target = db.prepare('SELECT id, dept_id, role FROM members WHERE id = ?').get(memberId);
    if (!target || target.dept_id !== req.user.deptId || target.role !== 'member') {
      throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
    }
  } else if (!isAdmin(req.user.role)) {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  }
  const member = db.prepare('SELECT id, status FROM members WHERE id = ?').get(memberId);
  if (!member) throw new ApiError(404, 'NOT_FOUND', '会员不存在');
  if (member.status !== 'active') throw new ApiError(403, 'FORBIDDEN', '目标会员非在册状态,无法补签');

  let result;
  withTransaction(() => {
    const row = getSignupRow(a.id, memberId);
    if (row) {
      if (row.status === 'checked_in') {
        result = row; // 已签到,幂等返回
        return;
      }
      db.prepare("UPDATE activity_signups SET status = 'checked_in', checkin_at = ?, checkin_by = ?, updated_at = ? WHERE id = ?")
        .run(now(), req.user.uid, now(), row.id);
    } else {
      // 补签目标未报名:先补报名(容量校验)再签到
      insertSignupRow(a, memberId, 'checked_in', req.user.uid);
    }
    result = getSignupRow(a.id, memberId);
  });
  res.json({ code: 0, message: 'ok', data: { signup: result } });
});

// 撤销签到:checked_in → registered,清空 checkin_at/checkin_by
router.delete('/:id/checkin', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  const memberId = req.query.member_id ? Number(req.query.member_id) : req.user.uid;
  if (req.user.role === 'minister') {
    const target = db.prepare('SELECT id, dept_id, role FROM members WHERE id = ?').get(memberId);
    if (!target || target.dept_id !== req.user.deptId || target.role !== 'member') {
      throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
    }
  } else if (!isAdmin(req.user.role)) {
    throw new ApiError(403, 'FORBIDDEN', '无权限执行该操作');
  }
  const row = getSignupRow(a.id, memberId);
  if (!row || row.status !== 'checked_in') throw new ApiError(409, 'STATE_CONFLICT', '该会员未处于已签到状态');
  db.prepare("UPDATE activity_signups SET status = 'registered', checkin_at = NULL, checkin_by = NULL, updated_at = ? WHERE id = ?")
    .run(now(), row.id);
  res.json({ code: 0, message: 'ok', data: { signup: getSignupRow(a.id, memberId) } });
});

// ── 活动材料归档 ──

const FILE_EXT_WHITELIST = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', 'txt', 'md'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${Date.now()}-${crypto.randomBytes(2).toString('hex')}-${base}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!FILE_EXT_WHITELIST.includes(ext)) {
      return cb(new ApiError(400, 'VALIDATION', `不支持的文件类型 .${ext}`));
    }
    cb(null, true);
  },
});

router.get('/:id/materials', requireAuth, (req, res) => {
  const a = getActivity(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', '活动不存在');
  const items = db.prepare(`
    SELECT mt.*, m.name AS uploader_name FROM activity_materials mt
    JOIN members m ON m.id = mt.uploader_id
    WHERE mt.activity_id = ? ORDER BY mt.created_at DESC, mt.id DESC
  `).all(a.id);
  res.json({ code: 0, message: 'ok', data: items });
});

function requireMaterialUploadAccess(req, res, next) {
  const a = getActivity(req.params.id);
  if (!a) return next(new ApiError(404, 'NOT_FOUND', '活动不存在'));
  if (!canManage(req.user, a)) return next(new ApiError(403, 'FORBIDDEN', '无权限执行该操作'));
  req.activity = a;
  next();
}

function removeUploadedFile(file) {
  if (file) fs.unlink(file.path, () => {});
}

// 上传材料:管理层任意活动,部长限自建;先鉴权再落盘,失败时清理附件
router.post('/:id/materials', requireAuth, requireMaterialUploadAccess, upload.single('file'), (req, res, next) => {
  try {
    const b = req.body || {};
    const category = ['策划书', '签到表', '照片', '总结', '其他'].includes(b.category) ? b.category : '其他';
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title) throw new ApiError(400, 'VALIDATION', '材料标题不能为空');
    const file = req.file;
    const info = db.prepare(`
      INSERT INTO activity_materials (activity_id, category, title, note, file_path, file_name, file_size, uploader_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(req.activity.id, category, title, b.note || null,
      file ? file.filename : null, file ? file.originalname : null, file ? file.size : null,
      req.user.uid, now());
    const material = db.prepare('SELECT * FROM activity_materials WHERE id = ?').get(info.lastInsertRowid);
    res.json({ code: 0, message: 'ok', data: { material } });
  } catch (err) {
    removeUploadedFile(req.file);
    next(err);
  }
});

module.exports = router;

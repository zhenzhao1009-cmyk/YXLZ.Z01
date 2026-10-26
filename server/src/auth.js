const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const secret = require('./secret');
const { db } = require('./db');
const { ApiError } = require('./errors');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTS).toString('hex');
  return `scrypt$${SCRYPT_OPTS.N}$${SCRYPT_OPTS.r}$${SCRYPT_OPTS.p}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const actual = crypto.scryptSync(password, salt, 64, { N: +N, r: +r, p: +p }).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(hash, 'hex'));
}

function signToken(member) {
  return jwt.sign(
    { uid: member.id, role: member.role, deptId: member.dept_id },
    secret,
    { expiresIn: '7d' }
  );
}

// 鉴权中间件:验签 + 每请求回查 status(非 active 立即失效)
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(new ApiError(401, 'UNAUTHORIZED', '请先登录'));
  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return next(new ApiError(401, 'UNAUTHORIZED', '登录已过期,请重新登录'));
  }
  const row = db.prepare('SELECT id, role, dept_id, status FROM members WHERE id = ?').get(payload.uid);
  if (!row) return next(new ApiError(401, 'UNAUTHORIZED', '账号不存在'));
  if (row.status === 'pending') return next(new ApiError(403, 'ACCOUNT_PENDING', '账号待审核,请等待干部审核通过'));
  if (row.status === 'quit') return next(new ApiError(403, 'ACCOUNT_QUIT', '账号已离会'));
  req.user = { uid: row.id, role: row.role, deptId: row.dept_id };
  next();
}

const ADMIN_ROLES = ['president', 'advisor', 'super_admin'];
const isAdmin = (role) => ADMIN_ROLES.includes(role);

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user.role)) return next(new ApiError(403, 'FORBIDDEN', '无权限执行该操作'));
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin') return next(new ApiError(403, 'FORBIDDEN', '无权限执行该操作'));
  next();
}

module.exports = {
  hashPassword, verifyPassword, signToken,
  requireAuth, requireAdmin, requireSuperAdmin,
  isAdmin, ADMIN_ROLES,
};

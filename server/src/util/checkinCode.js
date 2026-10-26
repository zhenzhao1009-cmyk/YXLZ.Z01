const crypto = require('node:crypto');
const secret = require('../secret');

const WINDOW_SEC = 60; // 60 秒一片,接受上一窗,截图暴露 ≤2 分钟

function windowOf(unixSeconds) {
  return Math.floor(unixSeconds / WINDOW_SEC);
}

// HMAC-SHA256(JWT_SECRET, `checkin:${activityId}:${window}`) → 前 8 位 hex → % 1000000 → 补零 6 位
function code(activityId, win) {
  const hex = crypto.createHmac('sha256', secret).update(`checkin:${activityId}:${win}`).digest('hex');
  return String(parseInt(hex.slice(0, 8), 16) % 1000000).padStart(6, '0');
}

// 校验:仅比对当前窗与上一窗
function verify(activityId, input) {
  const unix = Math.floor(Date.now() / 1000);
  const win = windowOf(unix);
  const ok = input === code(activityId, win) || input === code(activityId, win - 1);
  return { ok, expiresIn: WINDOW_SEC - (unix % WINDOW_SEC) };
}

function current(activityId) {
  const unix = Math.floor(Date.now() / 1000);
  return { code: code(activityId, windowOf(unix)), expiresIn: WINDOW_SEC - (unix % WINDOW_SEC) };
}

module.exports = { WINDOW_SEC, code, verify, current };

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DATA_DIR } = require('./db');

// JWT_SECRET:环境变量优先,否则首次启动随机生成落盘,重启不失效
let secret = process.env.JWT_SECRET;
if (!secret) {
  const file = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(file)) {
    secret = fs.readFileSync(file, 'utf8').trim();
  } else {
    secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret);
  }
}

module.exports = secret;

const os = require('node:os');

// 局域网 IP:env LAN_IP 优先,否则取第一个非 internal 的 IPv4
function lanIp() {
  if (process.env.LAN_IP) return process.env.LAN_IP;
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const it of ifs[name] || []) {
      if (it.family === 'IPv4' && !it.internal) return it.address;
    }
  }
  return '127.0.0.1';
}

module.exports = { lanIp };

function pad(n) { return String(n).padStart(2, '0'); }

// 'YYYY-MM-DD HH:MM:SS'(本地时间,字典序即时间序)
function now() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 'YYYY-MM-DD HH:MM'(分钟精度,与活动起止时间格式一致)
function nowMinute() {
  return now().slice(0, 16);
}

// 'YYYY-MM-DD'
function today() {
  return now().slice(0, 10);
}

// 学期起点:8月1日—次年1月31日为秋季学期(起点当年8月1日),2月1日—7月31日为春季学期(起点当年2月1日)
function termStart() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 8) return `${y}-08-01`;
  if (m <= 1) return `${y - 1}-08-01`;
  return `${y}-02-01`;
}

// 学期终点(下个学期起点, exclusive):秋季学期内提前发布的寒假/次年春季活动不应计入本学期
function termEnd() {
  const start = new Date(`${termStart()}T00:00:00`);
  start.setMonth(start.getMonth() + 6);
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
}

// 'YYYY-MM-DD HH:MM(:SS)' → Date(本地时间)
function parse(s) {
  return new Date(String(s).replace(' ', 'T'));
}

module.exports = { now, nowMinute, today, termStart, termEnd, parse };

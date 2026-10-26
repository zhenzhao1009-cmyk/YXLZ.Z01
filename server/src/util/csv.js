function escapeCell(v) {
  let s = v == null ? '' : String(v);
  // 防止 Excel/WPS 将用户可控字段解释为公式(含前导空白/制表符绕过)
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// UTF-8 BOM 前缀,Excel 直接打开不乱码
function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  return '﻿' + lines.join('\r\n');
}

function sendCsv(res, filename, headers, rows) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(toCsv(headers, rows));
}

module.exports = { toCsv, sendCsv };

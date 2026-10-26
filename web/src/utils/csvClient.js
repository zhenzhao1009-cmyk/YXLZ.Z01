// CSV 导入解析:先按 UTF-8 解码,出现乱码回退 GBK(Excel 中文 CSV 常为 GBK)
function readFileText(file, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file, encoding);
  });
}

export async function readCsvFile(file) {
  let text = await readFileText(file, 'utf-8');
  if (text.includes('�')) {
    try {
      const gbk = await readFileText(file, 'gbk');
      if (!gbk.includes('�')) text = gbk;
    } catch { /* 保留 UTF-8 结果 */ }
  }
  return text;
}

// 支持引号转义的简易 CSV 解析
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

// 解析导入文件 → [{student_no, name, college, grade, phone, dept_name}]
export function parseImportRows(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (names) => header.findIndex((h) => names.includes(h));
  const iNo = idx(['学号', 'student_no']);
  const iName = idx(['姓名', 'name']);
  if (iNo < 0 || iName < 0) throw new Error('CSV 首行需包含「学号」与「姓名」列');
  const iCollege = idx(['学院', 'college']);
  const iGrade = idx(['年级', 'grade']);
  const iPhone = idx(['手机', '电话', 'phone']);
  const iDept = idx(['部门', 'dept_name']);
  return rows.slice(1).map((r) => ({
    student_no: (r[iNo] || '').trim(),
    name: (r[iName] || '').trim(),
    college: iCollege >= 0 ? (r[iCollege] || '').trim() : '',
    grade: iGrade >= 0 ? (r[iGrade] || '').trim() : '',
    phone: iPhone >= 0 ? (r[iPhone] || '').trim() : '',
    dept_name: iDept >= 0 ? (r[iDept] || '').trim() : '',
  }));
}

// 导出:新开窗口下载(接口已带 UTF-8 BOM)
// 导出/下载:带 JWT 拉取后触发浏览器保存(window.open 不会携带 Authorization 头)
export async function downloadUrl(url, fallbackName = 'download') {
  const headers = {};
  try {
    const saved = JSON.parse(localStorage.getItem('club_auth') || 'null');
    if (saved && saved.token) headers.Authorization = `Bearer ${saved.token}`;
  } catch { /* 未登录 */ }
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`下载失败(HTTP ${resp.status})`);
  const blob = await resp.blob();
  const dispo = resp.headers.get('Content-Disposition') || '';
  const match = /filename\*=UTF-8''([^;]+)/.exec(dispo);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

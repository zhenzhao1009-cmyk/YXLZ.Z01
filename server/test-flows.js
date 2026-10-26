const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

let failures = 0;
let baseUrl;

function check(name, condition, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${name}${!condition && detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

async function api(method, route, { token, body, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + route, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 下载接口等非 JSON 响应 */ }
  return { status: response.status, data, text, response };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitUntilReady(server) {
  for (let i = 0; i < 50; i += 1) {
    if (server.exitCode !== null) throw new Error('测试服务器提前退出');
    try {
      const response = await fetch(`${baseUrl}/departments`);
      if (response.ok) return;
    } catch { /* 服务器仍在启动 */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('测试服务器启动超时');
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
}

async function runFlows(tempDir) {
  const login = async (studentNo, password = '123456') => {
    const result = await api('POST', '/auth/login', { body: { student_no: studentNo, password } });
    if (result.status !== 200 || !result.data?.data?.token) {
      throw new Error(`账号 ${studentNo} 登录失败: HTTP ${result.status} ${result.text}`);
    }
    return result.data.data.token;
  };

  const admin = await login('20240001');
  const minister = await login('20240101');
  const otherMinister = await login('20240102');
  const member = await login('20240201');
  const president = await login('20240002');
  const advisor = await login('20240003');

  // 注册、待审核限制、审核后登录
  const departments = (await api('GET', '/departments')).data.data;
  const activityDept = departments.find((item) => item.name === '活动部');
  const register = await api('POST', '/auth/register', {
    body: {
      student_no: '20240999', name: '测试新生', password: 'abc123',
      dept_id: activityDept.id, gender: '保密',
    },
  });
  const pendingLogin = await api('POST', '/auth/login', {
    body: { student_no: '20240999', password: 'abc123' },
  });
  const pendingMembers = await api('GET', '/members?status=pending&pageSize=100', { token: admin });
  const applicant = pendingMembers.data.data.items.find((item) => item.student_no === '20240999');
  const review = await api('PUT', `/members/${applicant.id}/review`, {
    token: admin, body: { action: 'approve' },
  });
  const approvedLogin = await api('POST', '/auth/login', {
    body: { student_no: '20240999', password: 'abc123' },
  });
  check('注册后待审核且不可登录', register.status === 200 && pendingLogin.status === 403);
  check('审核后可登录', review.status === 200 && approvedLogin.status === 200
    && approvedLogin.data.data.member.name === '测试新生');

  // 会员权限范围和角色任命
  const ministerMembers = await api('GET', '/members?pageSize=100', { token: minister });
  const ministerItems = ministerMembers.data.data.items;
  const depts = [...new Set(ministerItems.map((item) => item.dept_name))];
  check('部长会员列表强制限定本部门', depts.length === 1 && depts[0] === '活动部');

  const otherItems = (await api('GET', '/members?pageSize=100', { token: otherMinister })).data.data.items;
  const outsideMember = otherItems.find((item) => item.role === 'member' && item.status === 'active');
  const editOutside = await api('PUT', `/members/${outsideMember.id}`, {
    token: minister, body: { phone: '13000000000' },
  });
  check('部长不可修改外部门会员', editOutside.status === 403);

  const allMembers = (await api('GET', '/members?pageSize=100', { token: admin })).data.data.items;
  const roleTarget = allMembers.find((item) => item.role === 'member' && item.status === 'active');
  const promote = await api('PUT', `/members/${roleTarget.id}`, { token: president, body: { role: 'minister' } });
  const advisorPromote = await api('PUT', `/members/${roleTarget.id}`, { token: advisor, body: { role: 'president' } });
  const presidentPromote = await api('PUT', `/members/${roleTarget.id}`, { token: president, body: { role: 'president' } });
  check('会长可任命部长', promote.status === 200);
  check('指导老师不可设置角色', advisorPromote.status === 403);
  check('会长不可任命会长', presidentPromote.status === 403);
  await api('PUT', `/members/${roleTarget.id}`, { token: admin, body: { role: 'member' } });

  const superAdmin = allMembers.find((item) => item.role === 'super_admin');
  const demoteSuperAdmin = await api('PUT', `/members/${superAdmin.id}`, {
    token: president, body: { role: 'member' },
  });
  const disableSuperAdmin = await api('PUT', `/members/${superAdmin.id}`, {
    token: advisor, body: { status: 'quit' },
  });
  const resetSuperAdmin = await api('PUT', `/members/${superAdmin.id}/password`, { token: president });
  check('会长和指导老师不能修改或重置超管', demoteSuperAdmin.status === 403
    && disableSuperAdmin.status === 403 && resetSuperAdmin.status === 403);

  const safeMemberResponse = await api('PUT', `/members/${roleTarget.id}`, { token: president, body: {} });
  check('会员接口响应不泄露密码哈希', safeMemberResponse.status === 200
    && !Object.hasOwn(safeMemberResponse.data.data.member, 'password_hash'));

  // 活动列表、筛选、名单权限、代报名
  const activities = (await api('GET', '/activities', { token: admin })).data.data;
  for (const state of ['upcoming', 'ongoing', 'ended', 'cancelled']) {
    const filtered = await api('GET', `/activities?state=${state}`, { token: member });
    check(`活动列表 ${state} 筛选`, filtered.status === 200
      && filtered.data.data.every((item) => item.state === state),
    `HTTP ${filtered.status}`);
  }

  const workshop = activities.find((item) => item.title === '健康饮食工作坊');
  const unauthorizedRoster = await api('GET', `/activities/${workshop.id}/signups`, { token: minister });
  check('部长不可查看非自建活动名单', unauthorizedRoster.status === 403);

  const hike = activities.find((item) => item.title === '冬季拉练活动');
  const hikeRoster = (await api('GET', `/activities/${hike.id}/signups`, { token: admin })).data.data;
  const signedIds = new Set(hikeRoster.filter((item) => item.status !== 'cancelled').map((item) => item.member_id));
  const sameDeptTarget = ministerItems.find((item) => item.role === 'member'
    && item.status === 'active' && !signedIds.has(item.id));
  const proxySignup = await api('POST', `/activities/${hike.id}/signup`, {
    token: minister, body: { member_id: sameDeptTarget.id },
  });
  const outsideSignup = await api('POST', `/activities/${hike.id}/signup`, {
    token: minister, body: { member_id: outsideMember.id },
  });
  check('部长可代本部门会员报名', proxySignup.status === 200);
  check('部长不可代外部门会员报名', outsideSignup.status === 403);

  // 公告确认与回执名单
  const announcements = (await api('GET', '/announcements', { token: member })).data.data.items;
  const needConfirm = announcements.find((item) => item.require_confirm && !item.my_read);
  const before = await api('GET', `/announcements/${needConfirm.id}`, { token: member });
  const confirm = await api('POST', `/announcements/${needConfirm.id}/confirm`, { token: member });
  const after = await api('GET', `/announcements/${needConfirm.id}`, { token: member });
  const reads = await api('GET', `/announcements/${needConfirm.id}/reads`, { token: admin });
  check('需确认公告确认后变为已读', before.data.data.announcement.my_read === false
    && confirm.status === 200 && after.data.data.announcement.my_read === true);
  check('公告已读名单包含确认会员', reads.data.data.read.some((item) => item.student_no === '20240201'));

  // 材料上传、下载、删除
  const run = activities.find((item) => item.title === '第10届校园健康跑');
  const uploadsDir = path.join(tempDir, 'uploads');
  const filesBefore = fs.readdirSync(uploadsDir).length;
  const deniedForm = new FormData();
  deniedForm.append('category', '其他');
  deniedForm.append('title', '越权材料');
  deniedForm.append('file', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
  const deniedUpload = await api('POST', `/activities/${run.id}/materials`, {
    token: member, body: deniedForm, isForm: true,
  });
  check('无权上传被拒且不落盘', deniedUpload.status === 403
    && fs.readdirSync(uploadsDir).length === filesBefore);
  const anonymousUpload = await fetch(`${baseUrl.slice(0, -4)}/uploads/anything.txt`);
  check('上传目录不再匿名可访问', anonymousUpload.status === 404);
  const form = new FormData();
  form.append('category', '总结');
  form.append('title', '联调测试材料');
  form.append('note', '测试说明');
  form.append('file', new Blob(['hello 联调'], { type: 'text/plain' }), '测试.txt');
  const upload = await api('POST', `/activities/${run.id}/materials`, {
    token: admin, body: form, isForm: true,
  });
  const materials = await api('GET', `/activities/${run.id}/materials`, { token: member });
  const uploaded = materials.data.data.find((item) => item.title === '联调测试材料');
  const download = await api('GET', `/materials/${uploaded.id}/download`, { token: member });
  const remove = await api('DELETE', `/materials/${uploaded.id}`, { token: admin });
  const afterRemove = await api('GET', `/materials/${uploaded.id}/download`, { token: member });
  check('材料上传且列表包含上传者', upload.status === 200 && uploaded.uploader_name === '陈明');
  check('材料下载内容一致', download.status === 200 && download.text === 'hello 联调');
  check('材料删除后附件不可下载', remove.status === 200 && afterRemove.status === 404);

  // CSV 导出与导入
  const csvResponse = await fetch(`${baseUrl}/members/export`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
  const csvText = new TextDecoder().decode(csvBytes);
  const hasUtf8Bom = csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf;
  check('会员名册 CSV 含 UTF-8 BOM 与表头', csvResponse.status === 200
    && hasUtf8Bom && csvText.includes('学号'));

  // CSV 公式注入防护:用户可控字段以 = + - @ 开头时前置单引号
  await api('PUT', '/auth/me', { token: member, body: { college: '=SUM(1)' } });
  const formulaCsv = await fetch(`${baseUrl}/members/export`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  const formulaText = new TextDecoder().decode(new Uint8Array(await formulaCsv.arrayBuffer()));
  check('CSV 公式注入被转义', formulaText.includes("'=SUM(1)") && !formulaText.includes(',=SUM(1)'));
  await api('PUT', '/auth/me', { token: member, body: { college: '' } });
  const imported = await api('POST', '/members/import', {
    token: admin,
    body: [
      { student_no: '20241001', name: '导入甲', dept_name: '活动部' },
      { student_no: '20241001', name: '导入甲重复', dept_name: '活动部' },
      { student_no: '20241002', name: '导入乙', dept_name: '不存在的部门' },
    ],
  });
  check('CSV 导入一条成功、两条跳过', imported.status === 200
    && imported.data.data.inserted === 1 && imported.data.data.skipped.length === 2);

  // 签到撤销与补签
  const ongoing = activities.find((item) => item.state === 'ongoing');
  const roster = (await api('GET', `/activities/${ongoing.id}/signups`, { token: admin })).data.data;
  const checked = roster.find((item) => item.status === 'checked_in');
  const undo = await api('DELETE', `/activities/${ongoing.id}/checkin?member_id=${checked.member_id}`, { token: admin });
  const afterUndo = (await api('GET', `/activities/${ongoing.id}/signups`, { token: admin })).data.data
    .find((item) => item.member_id === checked.member_id);
  const manual = await api('POST', `/activities/${ongoing.id}/manual-checkin`, {
    token: admin, body: { member_id: checked.member_id },
  });
  const afterManual = (await api('GET', `/activities/${ongoing.id}/signups`, { token: admin })).data.data
    .find((item) => item.member_id === checked.member_id);
  check('撤销签到恢复为已报名', undo.status === 200
    && afterUndo.status === 'registered' && !afterUndo.checkin_at);
  check('补签恢复已签到并记录操作者', manual.status === 200
    && afterManual.status === 'checked_in' && afterManual.checkin_by_name === '陈明');

  // 签到接口权限:普通会员不可补签/撤销(不得绕过签到码)
  const meInfo = (await api('GET', '/auth/me', { token: member })).data.data;
  const selfManual = await api('POST', `/activities/${ongoing.id}/manual-checkin`, {
    token: member, body: { member_id: meInfo.member.id },
  });
  const selfUndo = await api('DELETE', `/activities/${ongoing.id}/checkin`, { token: member });
  check('普通会员不可补签或撤销签到', selfManual.status === 403 && selfUndo.status === 403);

  // 修改密码
  const importedToken = await login('20241001');
  const wrongPassword = await api('PUT', '/auth/password', {
    token: importedToken, body: { old_password: 'wrong', new_password: 'xyz789' },
  });
  const changePassword = await api('PUT', '/auth/password', {
    token: importedToken, body: { old_password: '123456', new_password: 'xyz789' },
  });
  const newLogin = await api('POST', '/auth/login', {
    body: { student_no: '20241001', password: 'xyz789' },
  });
  check('原密码错误被拒且新密码修改生效', wrongPassword.status === 400
    && changePassword.status === 200 && newLogin.status === 200);

  // 活动容量不可低于有效报名人数
  const hikeDetail = (await api('GET', `/activities/${hike.id}`, { token: admin })).data.data;
  const lowCapacity = await api('PUT', `/activities/${hike.id}`, {
    token: admin,
    body: {
      title: hikeDetail.title,
      description: hikeDetail.description,
      location: hikeDetail.location,
      start_time: hikeDetail.start_time,
      end_time: hikeDetail.end_time,
      capacity: 1,
    },
  });
  check('活动容量低于有效报名人数时被拒', lowCapacity.status === 409);

  // 活动时间真实性:99:00 这类正则可过但时刻不存在的时间应 400
  const badTime = await api('POST', '/activities', {
    token: admin,
    body: { title: '坏时间测试', location: '测试', start_time: '2026-11-01 99:00', end_time: '2026-11-01 99:30', capacity: 0 },
  });
  check('无效时刻(99:00)创建活动被拒', badTime.status === 400);

  // 部长标记离会生效 + 角色取值校验
  const quitTarget = ministerItems.find((item) => item.role === 'member' && item.status === 'active'
    && item.student_no !== '20240201');
  const markQuit = await api('PUT', `/members/${quitTarget.id}`, { token: minister, body: { status: 'quit' } });
  const quitRow = (await api('GET', '/members?pageSize=100', { token: minister })).data.data.items
    .find((item) => item.id === quitTarget.id);
  check('部长标记离会真实生效', markQuit.status === 200 && quitRow.status === 'quit');
  const badRole = await api('PUT', `/members/${quitTarget.id}`, { token: admin, body: { role: 'admin' } });
  check('非法角色取值返回 400 而非 500', badRole.status === 400);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-club-test-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}/api`;
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      CLUB_DB_PATH: path.join(tempDir, 'test.db'),
      CLUB_UPLOADS_DIR: path.join(tempDir, 'uploads'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });

  try {
    await waitUntilReady(server);
    await runFlows(tempDir);
    if (failures > 0) throw new Error(`联调检查有 ${failures} 项失败`);
    console.log('— 全部联调检查通过 —');
  } catch (error) {
    if (serverLog.trim()) console.error('\n测试服务器日志:\n' + serverLog.trim());
    throw error;
  } finally {
    await stopServer(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\n联调失败: ${error.stack || error.message}`);
  process.exitCode = 1;
});

// 幂等种子:仅当 members 表为空时写入;全部密码 123456;活动时间相对"种子运行时刻"计算
const { db, withTransaction } = require('./db');
const { hashPassword } = require('./auth');
const { today } = require('./util/time');

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtMinute(d) { return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtSecond(d) { return `${fmtMinute(d)}:${pad(d.getSeconds())}`; }
function daysAgoSecond(days, extraMin = 0) {
  return fmtSecond(new Date(Date.now() - days * 86400000 + extraMin * 60000));
}
function daysAgoMinute(days, extraMin = 0) {
  return fmtMinute(new Date(Date.now() - days * 86400000 + extraMin * 60000));
}
function dayAt(daysLater, hh, mm) {
  const d = new Date(Date.now() + daysLater * 86400000);
  return `${fmtDate(d)} ${pad(hh)}:${pad(mm)}`;
}

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
const GIVEN = ['明', '华', '红', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '超', '霞', '平', '辉', '刚', '丹', '萍', '静', '丽', '敏', '俊', '婷', '雪', '宇', '欣', '然', '峰', '楠', '璐'];

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
  if (count > 0) return false;

  withTransaction(() => {
    // ── 部门(4 个)──
    const depts = ['活动部', '宣传部', '外联部', '秘书部'];
    const deptIds = {};
    depts.forEach((name, i) => {
      db.prepare('INSERT INTO departments (name, description, sort, created_at) VALUES (?,?,?,?)')
        .run(name, `${name},协会日常运转的中坚力量`, i + 1, daysAgoSecond(60));
    });
    db.prepare('SELECT id, name FROM departments').all().forEach((r) => { deptIds[r.name] = r.id; });

    // ── 会员 ──
    const insertMember = db.prepare(`
      INSERT INTO members (student_no, name, password_hash, gender, college, grade, phone, dept_id, role, status, joined_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const pw = hashPassword('123456');
    const stamp = daysAgoSecond(60);
    const mk = (no, name, role, deptName, status, i, gender, college, grade, phone) =>
      insertMember.run(no, name, pw, gender, college, grade, phone,
        deptName ? deptIds[deptName] : null, role, status,
        status === 'active' ? daysAgoSecond(60 - i) : null, stamp, stamp);

    mk('20240001', '陈明', 'super_admin', null, 'active', 0, '男', '计算机学院', '2023级', '13800000001');
    mk('20240002', '王浩', 'president', null, 'active', 1, '男', '体育学院', '2023级', '13800000002');
    mk('20240003', '林芳', 'advisor', null, 'active', 2, '女', '心理健康教育中心', null, '13800000003');
    mk('20240101', '李华', 'minister', '活动部', 'active', 3, '男', '体育学院', '2024级', '13800000101');
    mk('20240102', '刘婷', 'minister', '宣传部', 'active', 4, '女', '新闻传播学院', '2024级', '13800000102');
    mk('20240103', '张伟', 'minister', '外联部', 'active', 5, '男', '经济管理学院', '2024级', '13800000103');
    mk('20240104', '赵敏', 'minister', '秘书部', 'active', 6, '女', '文学院', '2024级', '13800000104');

    // 20240201~20240231:31 名普通会员,i%4 分布到 4 个部门
    const colleges = ['计算机学院', '体育学院', '新闻传播学院', '经济管理学院', '文学院', '外国语学院'];
    for (let i = 0; i < 31; i++) {
      const name = SURNAMES[i % 10] + GIVEN[i % 31];
      const gender = i % 3 === 0 ? '男' : '女';
      mk(`${20240201 + i}`, name, 'member', depts[i % 4], 'active', 7 + i,
        gender, colleges[i % 6], `${2024 + (i % 2)}级`, `13800000${200 + i}`);
    }

    // 2 名离会、2 名待审核
    mk('20240232', '孙强', 'member', '活动部', 'quit', 38, '男', '体育学院', '2023级', '13800000232');
    mk('20240233', '周丽', 'member', '宣传部', 'quit', 39, '女', '新闻传播学院', '2023级', '13800000233');
    mk('20240234', '吴磊', 'member', '外联部', 'pending', 40, '男', '经济管理学院', '2025级', '13800000234');
    mk('20240235', '郑雪', 'member', '秘书部', 'pending', 41, '女', '文学院', '2025级', '13800000235');

    // ── 活动(8 场)+ 报名/签到 ──
    const activeIds = db.prepare("SELECT id FROM members WHERE status='active' ORDER BY id").all().map((r) => r.id);
    const N = activeIds.length; // 38
    // 固定步长取人(gcd(7,38)=1,不重复),offset 错开各场名单
    const pickIds = (n, offset) => Array.from({ length: n }, (_, i) => activeIds[(offset + i * 7) % N]);

    const insertActivity = db.prepare(`
      INSERT INTO activities (title, description, location, start_time, end_time, capacity, cancelled, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insertSignup = db.prepare(`
      INSERT INTO activity_signups (activity_id, member_id, status, registered_at, checkin_at, checkin_by, updated_at)
      VALUES (?,?,?,?,?,?,?)`);

    // [标题, 描述, 地点, 开始(分钟串), 时长(分钟), 容量, created_by, 报名总数, 签到数, 取消报名数, offset]
    const endedSpecs = [
      ['第10届校园健康跑', '一年一度的校园健康跑又来了,3 公里 / 5 公里任选,完赛有纪念奖牌。', '田径场', daysAgoMinute(28, -600), 180, 50, 2, 38, 33, 2, 0],
      ['运动损伤预防讲座', '邀请校医院运动医学科医生讲解常见运动损伤的预防与应急处理。', '大学生活动中心 201', daysAgoMinute(21, -300), 120, 40, 4, 30, 24, 1, 5],
      ['心理健康主题沙龙', '期末季心理调适团体辅导,名额有限,欢迎报名。', '心理健康中心团体室', daysAgoMinute(14, -240), 120, 30, 5, 26, 18, 2, 11],
      ['急救知识培训', '心肺复苏 + AED 实操培训,考核通过颁发校园急救志愿者证书。', '校医院三楼培训室', daysAgoMinute(7, -180), 120, 40, 6, 22, 16, 1, 17],
    ];
    endedSpecs.forEach(([title, desc, loc, start, durationMin, cap, by, total, checked, cancelledCnt, offset]) => {
      const startDate = new Date(start.replace(' ', 'T'));
      const end = fmtMinute(new Date(startDate.getTime() + durationMin * 60000));
      const aid = insertActivity.run(title, desc, loc, start, end, cap, 0, by, daysAgoSecond(40), daysAgoSecond(40)).lastInsertRowid;
      pickIds(total, offset).forEach((mid, i) => {
        let status = 'registered';
        let checkinAt = null;
        if (i < checked) { // 前 checked 名签到,时间落在 [开始, 结束] 窗口内
          status = 'checked_in';
          checkinAt = fmtSecond(new Date(startDate.getTime() + (10 + (i * 9) % (durationMin - 20)) * 60000));
        } else if (i >= total - cancelledCnt) {
          status = 'cancelled';
        }
        const registeredAt = fmtSecond(new Date(startDate.getTime() - (1 + (i % 4)) * 86400000));
        insertSignup.run(aid, mid, status, registeredAt, checkinAt, status === 'checked_in' && i % 4 === 3 ? by : null, daysAgoSecond(7));
      });
    });

    // A5 趣味运动会:进行中,start=now−10 分钟
    {
      const start = fmtMinute(new Date(Date.now() - 10 * 60000));
      const end = fmtMinute(new Date(Date.now() + 110 * 60000));
      const aid = insertActivity.run('趣味运动会', '拔河、袋鼠跳、两人三足,组队即玩,胜出队伍有小奖品。', '体育馆副馆', start, end, 40, 0, 4, daysAgoSecond(5), daysAgoSecond(5)).lastInsertRowid;
      const startDate = new Date(start.replace(' ', 'T'));
      pickIds(18, 3).forEach((mid, i) => {
        let status = 'registered';
        let checkinAt = null;
        if (i < 6) { // 6 人已签到,时间在开始后 1~9 分钟
          status = 'checked_in';
          checkinAt = fmtSecond(new Date(startDate.getTime() + (1 + i) * 60000));
        }
        insertSignup.run(aid, mid, status, daysAgoSecond(5 - (i % 3)), checkinAt, null, daysAgoSecond(0, -5));
      });
    }

    // A6 健康饮食工作坊:未开始,容量 5,已报 4(演示将满/满员)
    {
      const start = dayAt(3, 18, 30);
      const end = dayAt(3, 20, 30);
      const aid = insertActivity.run('健康饮食工作坊', '营养师带你读懂食品配料表,现场制作低卡轻食。', '大学生活动中心 305', start, end, 5, 0, 2, daysAgoSecond(2), daysAgoSecond(2)).lastInsertRowid;
      pickIds(4, 9).forEach((mid, i) => insertSignup.run(aid, mid, 'registered', daysAgoSecond(2 - (i % 2), 30), null, null, daysAgoSecond(1)));
    }

    // A7 冬季拉练活动:未开始,容量 0(不限),已报 5
    {
      const start = dayAt(7, 8, 0);
      const end = dayAt(7, 12, 0);
      const aid = insertActivity.run('冬季拉练活动', '环校 10 公里健步拉练,注意保暖,穿运动鞋。', '东门集合', start, end, 0, 0, 7, daysAgoSecond(2), daysAgoSecond(2)).lastInsertRowid;
      pickIds(5, 15).forEach((mid, i) => insertSignup.run(aid, mid, 'registered', daysAgoSecond(2, 60 + i), null, null, daysAgoSecond(1)));
    }

    // A8 户外骑行活动:已取消(软标记),曾报 3 人
    {
      const start = dayAt(5, 9, 0);
      const end = dayAt(5, 13, 0);
      const aid = insertActivity.run('户外骑行活动', '环湖骑行 30 公里,天气原因取消,择期再办。', '南门车行门口', start, end, 30, 1, 2, daysAgoSecond(6), daysAgoSecond(3)).lastInsertRowid;
      pickIds(3, 21).forEach((mid, i) => insertSignup.run(aid, mid, 'registered', daysAgoSecond(5, 120 + i), null, null, daysAgoSecond(3)));
    }

    // ── 公告(3 条)+ 已读回执 ──
    const insertAnn = db.prepare(`
      INSERT INTO announcements (title, content, pinned, require_confirm, published_by, created_at, updated_at, deleted_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    const insertRead = db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id, member_id, read_at) VALUES (?,?,?)');

    const n1 = insertAnn.run('2026 年秋季纳新安排',
      '协会 2026 年秋季纳新将于 11 月初启动,各部门招聘计划与面试安排将在本公告下持续更新,请有意加入的同学提前准备。\n\n初试:11 月第一周,线上报名;\n复试:11 月第二周,线下综合面。\n\n具体时间以后续公告为准。',
      1, 0, 2, daysAgoSecond(10), daysAgoSecond(10), null).lastInsertRowid;
    const n2 = insertAnn.run('第10届校园健康跑活动总结',
      '本届健康跑共有 320 名同学参与,协会 38 名志愿者全程保障,活动圆满结束。感谢活动部、宣传部和秘书部同学的辛勤付出!\n\n活动照片与签到表已归档至活动详情页,欢迎查看。',
      0, 0, 2, daysAgoSecond(9), daysAgoSecond(9), null).lastInsertRowid;
    const n3 = insertAnn.run('冬季训练安全须知(需确认)',
      '冬季气温降低,请各位会员参加户外活动时注意:\n\n一、充分热身,穿着保暖透气的运动服装;\n二、有心血管疾病史的同学请提前报备指导老师;\n三、拉练途中不脱队、不逞强,身体不适立即联系随队干部。\n\n请全体在册会员点击"我已知晓"确认。',
      0, 1, 2, daysAgoSecond(2), daysAgoSecond(2), null).lastInsertRowid;

    // N1 约 60% 已读、N2 少量已读、N3 约 40% 已确认
    activeIds.forEach((mid, i) => {
      if (i % 5 < 3) insertRead.run(n1, mid, daysAgoSecond(9, i * 3));
      if (i % 7 === 0) insertRead.run(n2, mid, daysAgoSecond(8, i * 5));
      if (i % 5 < 2) insertRead.run(n3, mid, daysAgoSecond(1, i * 7));
    });

    // ── 活动材料归档(A1 两条纯文字示例)──
    const insertMaterial = db.prepare(`
      INSERT INTO activity_materials (activity_id, category, title, note, file_path, file_name, file_size, uploader_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const a1 = db.prepare("SELECT id FROM activities WHERE title='第10届校园健康跑'").get().id;
    insertMaterial.run(a1, '总结', '第10届校园健康跑活动总结',
      '本届健康跑报名 320 人,实际完赛 296 人,志愿者 38 人;奖牌于赛后一周内发放完毕,费用明细已报指导老师审核。', null, null, null, 2, daysAgoSecond(8));
    insertMaterial.run(a1, '签到表', '志愿者签到表说明',
      '纸质签到表已扫描存档于秘书部,电子汇总:应到 38 人,实到 36 人,2 人病假已提前报备。', null, null, null, 4, daysAgoSecond(8));
  });

  return true;
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  console.log(seedIfEmpty() ? '种子数据写入完成' : 'members 表非空,跳过种子数据');
}

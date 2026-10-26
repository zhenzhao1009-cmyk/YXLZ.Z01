const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { nowMinute, termStart, termEnd } = require('../util/time');

const router = express.Router();

// 看板一次拉全(仅管理层);已取消活动不参与出勤率与趋势
router.get('/dashboard', requireAuth, requireAdmin, (req, res) => {
  const termStartStr = termStart();
  const termEndStr = termEnd();
  const n = nowMinute();

  const memberTotal = db.prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'active'").get().c;
  const pendingCount = db.prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'pending'").get().c;
  const semesterActivityCount = db.prepare(
    "SELECT COUNT(*) AS c FROM activities WHERE cancelled = 0 AND start_time >= ? AND start_time < ?"
  ).get(termStartStr, termEndStr).c;
  const totalCheckinCount = db.prepare(
    "SELECT COUNT(*) AS c FROM activity_signups WHERE status = 'checked_in' AND checkin_at >= ? AND checkin_at < ?"
  ).get(termStartStr, termEndStr).c;

  // 平均出勤率 = 各已结束未取消活动出勤率的算术平均(有效报名数 > 0 的活动)
  const perActivity = db.prepare(`
    SELECT
      SUM(CASE WHEN s.status = 'checked_in' THEN 1 ELSE 0 END) AS checkins,
      COUNT(*) AS valid
    FROM activity_signups s JOIN activities a ON a.id = s.activity_id
    WHERE a.cancelled = 0 AND a.end_time < ? AND s.status IN ('registered','checked_in')
    GROUP BY a.id
  `).all(n);
  const rates = perActivity.filter((r) => r.valid > 0).map((r) => r.checkins / r.valid);
  const avgAttendanceRate = rates.length ? rates.reduce((x, y) => x + y, 0) / rates.length : 0;

  const deptDistribution = db.prepare(`
    SELECT COALESCE(d.name, '未分配') AS name, COUNT(*) AS count
    FROM members m LEFT JOIN departments d ON d.id = m.dept_id
    WHERE m.status = 'active'
    GROUP BY m.dept_id ORDER BY count DESC
  `).all();

  // 近 6 个月:活动数(按 start_time)与签到人次(按 checkin_at),不含已取消
  const monthlyTrend = [];
  const base = new Date();
  base.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const activities = db.prepare(
      "SELECT COUNT(*) AS c FROM activities WHERE cancelled = 0 AND substr(start_time,1,7) = ?"
    ).get(prefix).c;
    const checkins = db.prepare(
      `SELECT COUNT(*) AS c FROM activity_signups s
       JOIN activities a ON a.id = s.activity_id
       WHERE a.cancelled = 0 AND s.status = 'checked_in' AND substr(s.checkin_at,1,7) = ?`
    ).get(prefix).c;
    monthlyTrend.push({ month: prefix, activities, checkins });
  }

  // LEFT JOIN:零报名的已结束活动也要出现在对比图中(内连接会整场丢失)
  const activityCompare = db.prepare(`
    SELECT a.title,
      COUNT(CASE WHEN s.status IN ('registered','checked_in') THEN 1 END) AS signups,
      COUNT(CASE WHEN s.status = 'checked_in' THEN 1 END) AS checkins
    FROM activities a LEFT JOIN activity_signups s ON s.activity_id = a.id
    WHERE a.cancelled = 0 AND a.end_time < ?
    GROUP BY a.id ORDER BY a.end_time DESC LIMIT 10
  `).all(n);

  const topActive = db.prepare(`
    SELECT m.name, d.name AS dept_name, COUNT(*) AS checkin_count
    FROM activity_signups s JOIN members m ON m.id = s.member_id
    LEFT JOIN departments d ON d.id = m.dept_id
    WHERE s.status = 'checked_in' AND s.checkin_at >= ? AND s.checkin_at < ?
    GROUP BY s.member_id ORDER BY checkin_count DESC LIMIT 10
  `).all(termStartStr, termEndStr);

  res.json({
    code: 0, message: 'ok',
    data: {
      member_total: memberTotal,
      pending_count: pendingCount,
      semester_activity_count: semesterActivityCount,
      total_checkin_count: totalCheckinCount,
      avg_attendance_rate: avgAttendanceRate,
      dept_distribution: deptDistribution,
      monthly_trend: monthlyTrend,
      activity_compare: activityCompare,
      top_active: topActive,
    },
  });
});

module.exports = router;

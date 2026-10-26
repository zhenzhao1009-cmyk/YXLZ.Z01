CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,             -- 部门名,如 活动部
  description TEXT,                                 -- 一句话简介
  sort        INTEGER NOT NULL DEFAULT 0,           -- 前端展示顺序
  created_at  TEXT    NOT NULL                     -- 'YYYY-MM-DD HH:MM:SS'
);

CREATE TABLE IF NOT EXISTS members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no    TEXT    NOT NULL UNIQUE,            -- 学号即登录账号
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,                   -- 'scrypt$N$r$p$salt$hash'
  gender        TEXT    NOT NULL DEFAULT '保密' CHECK (gender IN ('男','女','保密')),
  college       TEXT,                               -- 学院,统计与报备用
  grade         TEXT,                               -- 如 '2025级'
  phone         TEXT,
  dept_id       INTEGER REFERENCES departments(id) ON DELETE SET NULL,  -- NULL=未分配
  role          TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin','president','advisor','minister','member')),
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','quit')),
  joined_at     TEXT,                               -- 入会日期 'YYYY-MM-DD'
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_dept   ON members(dept_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,                                 -- 纯文本
  location    TEXT    NOT NULL,
  start_time  TEXT    NOT NULL,                     -- 'YYYY-MM-DD HH:MM'
  end_time    TEXT    NOT NULL,                     -- 'YYYY-MM-DD HH:MM'
  capacity    INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),  -- 0=不限名额
  cancelled   INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1)), -- 1=已取消(软标记)
  created_by  INTEGER NOT NULL REFERENCES members(id),  -- 部长权限判据
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_activities_start ON activities(start_time);

CREATE TABLE IF NOT EXISTS activity_signups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id   INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'registered'
                CHECK (status IN ('registered','checked_in','cancelled')),
  registered_at TEXT    NOT NULL,                   -- 'YYYY-MM-DD HH:MM:SS'
  checkin_at    TEXT,                               -- 签到时刻,NULL=未签到
  checkin_by    INTEGER REFERENCES members(id),     -- NULL=本人签,非空=补签操作者id
  updated_at    TEXT    NOT NULL
);
-- 部分唯一索引:防重复报名;允许"取消后重新报名"(取消行不占索引)
CREATE UNIQUE INDEX IF NOT EXISTS ux_signup_active
  ON activity_signups(activity_id, member_id) WHERE status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_signup_member ON activity_signups(member_id);

CREATE TABLE IF NOT EXISTS announcements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  content         TEXT    NOT NULL,                 -- 纯文本,前端 pre-wrap 展示
  pinned          INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  require_confirm INTEGER NOT NULL DEFAULT 0 CHECK (require_confirm IN (0,1)),  -- 1=需点"我已知晓"
  published_by    INTEGER NOT NULL REFERENCES members(id),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  deleted_at      TEXT                                -- 非空=已软删除,列表不再可见
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  read_at         TEXT    NOT NULL,
  PRIMARY KEY (announcement_id, member_id)
);

CREATE TABLE IF NOT EXISTS activity_materials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  category    TEXT    NOT NULL DEFAULT '其他' CHECK (category IN ('策划书','签到表','照片','总结','其他')),
  title       TEXT    NOT NULL,
  note        TEXT,
  file_path   TEXT,       -- 相对 server/data/uploads 的文件名;NULL=纯文字记录
  file_name   TEXT,       -- 用户原始文件名
  file_size   INTEGER,
  uploader_id INTEGER NOT NULL REFERENCES members(id),
  created_at  TEXT    NOT NULL
);

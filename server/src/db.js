const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.CLUB_DB_PATH
  ? path.resolve(process.env.CLUB_DB_PATH)
  : path.join(DATA_DIR, 'app.db');
const UPLOADS_DIR = process.env.CLUB_UPLOADS_DIR
  ? path.resolve(process.env.CLUB_UPLOADS_DIR)
  : path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');   // node:sqlite 默认不开启外键
db.exec('PRAGMA journal_mode = WAL;');  // 读写并发更稳
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// 所有"读后写"的并发点统一走此事务,BEGIN IMMEDIATE 防并发抢名额超员
function withTransaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, withTransaction, DATA_DIR, DB_PATH, UPLOADS_DIR };

-- 埋点事件表。一行一次事件，字段全部来自 Worker 的白名单，没有自由文本。
-- 建表：npx wrangler d1 execute resume-editor-analytics --remote --file migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,                  -- Unix 秒，服务端时间（不信客户端的表）
  event   TEXT    NOT NULL,                  -- open/print/download/tour_done/tour_skip/leave
  source  TEXT    NOT NULL DEFAULT '',       -- open 的来源：blank/sample/json/paste/restore/demo/other
  ref     TEXT    NOT NULL DEFAULT '',       -- 来路「域名」，不含路径和 query
  country TEXT    NOT NULL DEFAULT '',       -- 国家代码，Cloudflare 边缘给的，不落 IP
  device  TEXT    NOT NULL DEFAULT '',       -- mobile / desktop
  ver     TEXT    NOT NULL DEFAULT '',       -- 前端版本号，用来区分改版前后
  sid     TEXT    NOT NULL DEFAULT '',       -- 会话串，关标签页即失效，跨访问认不出人
  dwell_s INTEGER NOT NULL DEFAULT 0,        -- 这一段的有效停留秒数（仅 leave）
  pages   INTEGER NOT NULL DEFAULT 0,        -- 简历几页
  secs    INTEGER NOT NULL DEFAULT 0         -- 简历几个板块
);

CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_ev_ts    ON events(event, ts);
CREATE INDEX IF NOT EXISTS idx_events_sid      ON events(sid);

/* ============================================================
   简历生成器 —— 埋点接收端（Cloudflare Worker）

   前端 assets/metrics.js 往这里 POST 一条 JSON，本文件负责校验后落库。

   三条铁律，改这个文件之前先读：

   1. **绝不接收简历内容。** 下面的白名单是唯一入口，没在白名单里的字段
      一律丢弃。姓名、电话、邮箱、经历正文永远不该出现在这里 ——
      产品首页写着「简历不出浏览器」，这句话的真假就取决于这个文件。
   2. **不存 IP、不种持久标识。** 地区只取 Cloudflare 边缘已经知道的
      request.cf.country（国家级，不落 IP）。sid 是前端 sessionStorage 里的
      随机串，关掉标签页就没了，跨访问认不出同一个人。
   3. **一切外来输入都当成恶意的。** 这是个公开端点，谁都能往里灌。
      字符串走枚举白名单或截断，数字夹在合理区间，超出的直接丢。

   存储：哪个 binding 存在就写哪个（env.DB = D1，env.AE = Analytics Engine）。
   现在用 D1，因为 Analytics Engine 需要一次账户级开关，见 wrangler.jsonc。
   ============================================================ */

/** 只接受这几个来源。别的站点即使抄了 URL 也写不进来 */
const ALLOWED_ORIGINS = new Set([
  "https://haoyu-zhu.github.io",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
]);

/** 事件白名单。想加新事件，必须同时改这里和前端 —— 故意让它不方便，
    免得哪天顺手加了个会带出用户内容的事件 */
const EVENTS = new Set([
  "open",       // 载入了一份简历（新建 / 示例 / 导入 / 恢复草稿）
  "print",      // 点了打印 —— 这是北极星指标，代表真的产出了简历
  "download",   // 下载了 JSON
  "tour_done",  // 新手指引走完
  "tour_skip",  // 新手指引中途退出
  "leave",      // 页面转入后台，结算这一段的有效停留时长
]);

/** open 事件的来源。同样是白名单，不在里面的记成 other */
const SOURCES = new Set([
  "first",     // 第一次来，纸上自动摆了示例 —— 大多数真实访问走的是这条
  "empty",     // 回头客，没草稿，纸上是空的
  "restore",   // 恢复了上次没改完的草稿
  "blank",     // 手动点「新建空白」
  "sample",    // 手动点「载入示例」
  "json",      // 导入了 .json 文件
  "paste",     // 粘贴 JSON
  "demo",      // 带 #demo 的演示链接
]);

const MAX_BODY = 2048;          // 正常请求 200 字节以内，2KB 已经很宽松
const MAX_DWELL_S = 3 * 3600;   // 单段有效停留超过 3 小时，一定是异常，丢掉

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/** 截断 + 去掉控制字符。用于那些没法枚举的字段（来路域名、版本号） */
function clean(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

/** 夹到区间内的有限数；拿不到数就给 0 */
function num(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, lo), hi);
}

/** 来路只取域名，不要完整 URL —— 完整 URL 可能带 query，那里什么都可能有 */
function refHost(v) {
  const s = clean(v, 200);
  if (!s) return "";
  try { return new URL(s).hostname.slice(0, 80); }
  catch { return ""; }
}

/** 落库。两种后端都支持，绑了哪个写哪个；两个都绑就都写（切换期用）。
    返回 Promise 交给 waitUntil，不让 beacon 等数据库。 */
function store(env, row) {
  const jobs = [];
  if (env.DB) {
    jobs.push(env.DB.prepare(
      "INSERT INTO events (ts,event,source,ref,country,device,ver,sid,dwell_s,pages,secs)" +
      " VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      row.ts, row.event, row.source, row.ref, row.country,
      row.device, row.ver, row.sid, row.dwellS, row.pages, row.secs
    ).run());
  }
  if (env.AE) {
    env.AE.writeDataPoint({
      indexes: [row.event],
      blobs:   [row.event, row.source, row.ref, row.country, row.device, row.ver, row.sid],
      doubles: [row.dwellS, row.pages, row.secs],
    });
  }
  // 写失败也只是少一条统计，绝不该让它变成 5xx 打扰用户
  return Promise.allSettled(jobs);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    // GET 给个说明页，方便自己排查；不产生任何数据
    if (request.method === "GET") {
      return new Response(
        "resume-editor analytics endpoint. POST only.\n" +
        "只接收匿名计数与时长，不接收任何简历内容。\n" +
        "源码：https://github.com/haoyu-zhu/resume-editor/tree/main/analytics\n",
        { status: 200, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405, headers });
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response("forbidden origin", { status: 403, headers });
    }

    // 先看 Content-Length 挡掉大包，再读 —— 不给对方用超大 body 拖住 Worker 的机会
    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY) return new Response("too large", { status: 413, headers });

    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return new Response("too large", { status: 413, headers });
      body = JSON.parse(text);
    } catch {
      return new Response("bad json", { status: 400, headers });
    }
    if (!body || typeof body !== "object") {
      return new Response("bad body", { status: 400, headers });
    }

    const event = EVENTS.has(body.e) ? body.e : null;
    if (!event) return new Response("unknown event", { status: 400, headers });

    // ---- 到这里为止，下面每个字段都是白名单或夹过区间的，没有自由文本 ----
    const row = {
      ts:      Math.floor(Date.now() / 1000),        // 服务端时间，不信客户端的表
      event:   event,
      source:  SOURCES.has(body.s) ? body.s : (event === "open" ? "other" : ""),
      sid:     clean(body.sid, 36),                  // 随机会话串，关标签页即失效
      device:  body.m ? "mobile" : "desktop",
      ver:     clean(body.v, 16),                    // 前端版本，区分改版前后的数据
      ref:     refHost(body.r),
      country: clean(request.cf && request.cf.country, 8),   // 边缘已知，不落 IP
      dwellS:  Math.round(num(body.d, 0, MAX_DWELL_S)),
      pages:   Math.round(num(body.p, 0, 50)),       // 简历有几页，是个数字不是内容
      secs:    Math.round(num(body.n, 0, 200)),      // 板块数量，同上
    };

    ctx.waitUntil(store(env, row));

    // 204 不带 body：sendBeacon 不看响应，省流量
    return new Response(null, { status: 204, headers });
  },
};

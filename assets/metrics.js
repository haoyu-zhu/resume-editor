/* ============================================================
   匿名使用统计

   回答两个问题：有多少人真的做出了一份简历（打印 / 下载），
   以及他们在这儿待了多久。接收端是自己的 Cloudflare Worker，
   源码就在同一个仓库的 analytics/ 下，谁都能看。

   **这里绝不发送任何简历内容。** 发出去的只有：
     事件名、打开方式、有效停留秒数、页数、板块数、
     来路域名、设备是不是手机、一个关掉标签页就失效的随机串。
   姓名、电话、邮箱、经历正文全程不出浏览器 —— 这是产品首页的承诺，
   往下面 send() 里加字段之前，先确认没有违背它。

   两个实现上的讲究：

   1. **时长只算「标签页可见」的部分。** 有人开着标签页去吃饭，
      朴素的「加载到关闭」会给出好几个小时，数据直接废掉。
   2. **上报用 sendBeacon，时机是 visibilitychange → hidden。**
      beforeunload / unload 在手机上根本不触发，用它等于丢掉大半移动端数据。
      每次转入后台都结算「这一段」的增量，总时长 = 按 sid 求和，
      这样来回切标签页也不会重复计。
   ============================================================ */

(function () {
  "use strict";

  // 接收端，源码在同一个仓库的 analytics/ 下，谁都能核对它到底收了什么。
  // 留空就整个关掉，一个字节都不往外发 —— 自己 fork 部署的话把它清空即可。
  const ENDPOINT = "https://resume-editor-analytics.zhy-tools.workers.dev";
  const VERSION = "2026-09";

  // 本地开发的流量不该混进正式统计里。想在本地验埋点，用 ?mdebug=1 打开。
  const host = location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "";
  const debug = location.search.indexOf("mdebug=1") >= 0;

  if (!ENDPOINT || (isLocal && !debug)) return;

  /** 会话串：只活在 sessionStorage 里，关掉标签页就没了。
      用途是把同一次访问的几条事件串起来，不是用来跨访问认人。 */
  let sid = "";
  try {
    sid = sessionStorage.getItem("resume-editor:sid") || "";
    if (!sid) {
      sid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 36);
      sessionStorage.setItem("resume-editor:sid", sid);
    }
  } catch (e) { /* 无痕模式下没有 sessionStorage，那就每次都是新的，无所谓 */ }

  // 断点跟 style.css 里的窄屏断点保持一致，别各写各的
  const isMobile = matchMedia("(max-width: 820px)").matches;

  /** 来路只在本次访问的第一条事件里带一次，后面就不重复了 —— beacon 越小越容易发出去。
      Worker 那边只取域名存下来，路径和 query 不要。 */
  let refSent = false;

  function send(payload) {
    const base = { sid: sid, v: VERSION, m: isMobile };
    if (!refSent) {
      refSent = true;
      if (document.referrer) base.r = document.referrer;
    }
    const body = JSON.stringify(Object.assign(base, payload));
    try {
      // sendBeacon 在页面正在关闭时也能发出去，这是 fetch 做不到的
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
        return;
      }
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "cors" });
    } catch (e) { /* 统计失败绝不能影响用户改简历 */ }
  }

  /* ---------------- 有效停留时长 ---------------- */
  let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  let pending = 0;          // 攒着还没上报的毫秒数

  function accumulate() {
    if (visibleSince) {
      pending += Date.now() - visibleSince;
      visibleSince = 0;
    }
  }

  /** 结算这一段。不足 2 秒不发 —— 多半是误点进来就走，记了也是噪音 */
  function flush() {
    accumulate();
    const secs = Math.round(pending / 1000);
    if (secs < 2) return;
    pending = 0;
    send({ e: "leave", d: secs, p: window.__mPages || 0, n: window.__mSecs || 0 });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") visibleSince = Date.now();
    else flush();
  });
  // 手机上关标签页只保证触发 pagehide，unload 经常不来
  window.addEventListener("pagehide", flush);

  /* ---------------- 对外的埋点入口 ---------------- */
  /** app.js 在关键动作处调它。只传枚举值和数字，不传任何文本内容。 */
  window.track = function (event, extra) {
    send(Object.assign({ e: event }, extra || {}));
  };
  /** 版面规模，随 leave 一起报，用来看「做出来的简历一般多长」 */
  window.trackShape = function (pages, sections) {
    window.__mPages = pages;
    window.__mSecs = sections;
  };
})();

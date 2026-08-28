/* 新手指引 —— 气泡 + 打圈的手绘箭头，一步一步指过去。
   自成一支，不改别的文件的逻辑：只读 DOM、只加自己的元素，退出后一点痕迹不留。
   window.startTour() 是唯一入口。 */
(function () {
  "use strict";

  const LS_TOUR = "resume-editor:tour";      // 自动跑过一次就记下，之后只能手动叫
  const $ = (s, r = document) => r.querySelector(s);

  /* ---- 步骤表。sel 取不到的步骤会被跳过（比如板块图标被全去掉时） ----
     reveal: 那些平时 visibility:hidden 的行内按钮，靠给祖先加 .tour-reveal 逼出来
     place:  气泡首选放在靶子的哪一侧，放不下会自动翻面                      */
  const STEPS = [
    { title: "这是一张真的 A4 纸",
      body: "屏幕上这张纸的尺寸、字号、间距，就是打印出来的样子。内容多了会自动排到下一张纸，屏幕上第几页，打印出来就是第几页。<br>下面用十几步把每个功能指一遍，随时可以跳过。",
      sel: null },

    { title: "直接在纸上改字",
      body: "点任意一处文字就能改，和改文档一样。回车被禁掉了——简历的一格里不该有换行；粘贴会自动去掉格式。",
      sel: "#doc .entry-head .org", place: "bottom" },

    { title: "划选一段，加粗",
      body: "选中纸上的字，点这里或按 <kbd>Ctrl</kbd>+<kbd>B</kbd>，再来一次取消。用来把一条长要点里的关键数字挑出来，HR 扫简历时先看见的就是它。",
      sel: "#btn-bold", place: "right" },

    { title: "标题右边的「＋」往里加东西",
      body: "每个板块标题右边挂着 <b>＋</b>，平时淡淡的，点了就往这个板块里加一行/一段经历。要给某段经历加要点，用那段标题右边的 <b>＋要点</b>。",
      sel: "#doc .sec-head .addbar", reveal: "#doc .sec-title", place: "bottom" },

    { title: "行右边的三个按钮",
      body: "鼠标移到某一行上，右边会冒出 <b>⠿ 🔗 ✕</b>：拖着 ⠿ 排序、🔗 改链接、✕ 删掉这一行。光标放进某行按 <kbd>Alt</kbd>+<kbd>↑↓</kbd> 也能挪。",
      sel: "#doc .bullet .ctl", reveal: "#doc .bullet", place: "left" },

    { title: "板块图标可以换，也可以不要",
      body: "点标题左边的小图标，十个里挑一个；最后那个 <b>✕</b> 是去掉这个板块的图标，底下「全部去掉」一次清空所有板块。去掉之后，「＋」里会多出 <b>＋图标</b> 把它请回来。",
      sel: "#doc .ico-btn, #doc .sec-head .ctl-add[data-icon]", reveal: "#doc .sec-title", place: "bottom" },

    { title: "加一个新板块",
      body: "十五种预设分三组（经历类 / 清单类 / 其它），也可以自定义标题。新板块插在「自我总结」前面，位置不合适就拖标题右边的 ⠿ 挪。",
      sel: "#btn-add-sec", place: "right" },

    { title: "版面松紧：十档预设 + 十个滑块",
      body: "字号、行距、各种间距、照片宽度。差一两行放不下时，先动<b>页顶/页底/左右留白</b>——改页边距比压字号伤害小得多。上下留白同时改的是打印用的 A4 页边距，屏幕和 PDF 始终一致。",
      sel: "#panel-layout", place: "right" },

    { title: "主题色一改全改",
      body: "五套预设，也可以自己取色。标签、横线、图标、链接会一起换。<b>深色系在黑白打印机上更稳</b>，越浅的颜色越容易印糊。",
      sel: "#swatches", place: "right" },

    { title: "排满了没有，这里实时告诉你",
      body: "设一个目标页数，<b>超了才报红</b>；<span style='color:#c47b1f'>橙色</span>是版面偏空或末页只剩零星几行；蓝色就是刚好。",
      sel: "#fill", place: "right" },

    { title: "证件照",
      body: "打开就有一张占位图，一眼看出照片放哪、多大合适。「换一张」会自动缩到 420px 宽，不用先压缩；「不要照片」会记住这个选择，刷新也不会又冒出来。",
      sel: "#panel-photo", place: "right" },

    { title: "改错了就撤销",
      body: "标题右边这对箭头，或者 <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>。增删、移动、换图标、改字都在撤销范围内。「还原全部」直接回到刚打开的样子。",
      sel: "#histbar", place: "bottom" },

    { title: "存成 PDF，或者存成 JSON",
      body: "打印前会提醒你在浏览器的打印对话框里关掉页眉页脚、勾上背景图形。<b>JSON 才是简历的底本</b>——版面参数、主题色一起带走，下次打开原样恢复，也可以发给别人。",
      sel: "#panel-export", place: "right" },

    { title: "就这些了",
      body: "内容改到一半关掉也不会丢，浏览器会记着。想重看这份指引，点左边栏「开始」里的<b>新手指引</b>。",
      sel: null, spot: "none" },
  ];

  let root = null, idx = 0, live = [];

  /* ---------- DOM ---------- */
  function build() {
    root = document.createElement("div");
    root.id = "tour";
    root.innerHTML =
      `<svg id="tour-mask" aria-hidden="true"><path id="tour-hole" fill-rule="evenodd"></path></svg>` +
      `<svg id="tour-arrow" aria-hidden="true">` +
        `<defs><marker id="tour-head" viewBox="0 0 10 10" refX="8" refY="5"` +
        ` markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
        `<path d="M0,0 L10,5 L0,10 z"></path></marker></defs>` +
        `<path id="tour-line" marker-end="url(#tour-head)"></path>` +
      `</svg>` +
      `<div id="tour-ring" aria-hidden="true"></div>` +
      `<div id="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title">` +
        `<h3 id="tour-title"></h3><p id="tour-body"></p>` +
        `<div class="tour-foot">` +
          `<span id="tour-step"></span>` +
          `<span class="tour-btns">` +
            `<button class="btn" id="tour-skip">跳过</button>` +
            `<button class="btn" id="tour-prev">上一步</button>` +
            `<button class="btn primary" id="tour-next">下一步</button>` +
          `</span>` +
        `</div>` +
      `</div>`;
    document.body.appendChild(root);
    $("#tour-next").addEventListener("click", () => go(idx + 1));
    $("#tour-prev").addEventListener("click", () => go(idx - 1));
    $("#tour-skip").addEventListener("click", stop);
    document.addEventListener("keydown", onKey, true);
    addEventListener("resize", relayout);
  }

  function onKey(e) {
    if (!root) return;
    const k = e.key;
    if (k !== "Escape" && k !== "ArrowRight" && k !== "ArrowLeft" && k !== "Enter") return;
    e.preventDefault(); e.stopPropagation();          // 别漏到编辑器的快捷键上
    if (k === "Escape") stop();
    else if (k === "ArrowLeft") go(idx - 1);
    else go(idx + 1);
  }

  /* ---------- 打圈的箭头 ----------
     从气泡边上出发，中途绕一整圈，再扎向靶子。那个圈是一条 large-arc 的
     椭圆弧「走远路」画出来的 —— 两点之间半径给得足够小，弧就只能绕一圈回来。 */
  function arrowPath(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;               // 单位方向
    const nx = -uy, ny = ux;                      // 法线
    const r = Math.max(13, Math.min(24, L * 0.13));   // 圈的半径
    const at = Math.max(r * 1.6, L * 0.42);       // 圈心落在路径的这个位置
    const cx = x0 + ux * at + nx * r * 0.15;
    const cy = y0 + uy * at + ny * r * 0.15;
    const ax = cx - ux * r, ay = cy - uy * r;     // 入圈点
    const bx = cx + ux * r, by = cy + uy * r;     // 出圈点
    const bow = L * 0.16;                          // 进圈前那段的弯度
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)}`
      + ` Q ${(x0 + ux * at * 0.5 + nx * bow).toFixed(1)} ${(y0 + uy * at * 0.5 + ny * bow).toFixed(1)}`
      + ` ${ax.toFixed(1)} ${ay.toFixed(1)}`
      + ` A ${r.toFixed(1)} ${r.toFixed(1)} 0 1 1 ${bx.toFixed(1)} ${by.toFixed(1)}`
      + ` Q ${(bx + ux * (L - at) * 0.5 - nx * bow * 0.7).toFixed(1)}`
      + ` ${(by + uy * (L - at) * 0.5 - ny * bow * 0.7).toFixed(1)}`
      + ` ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  /* 气泡朝着靶子的那条边的中点，箭头从这里出发 */
  function anchorOf(rect, side) {
    if (side === "left")   return [rect.left, rect.top + rect.height / 2];
    if (side === "right")  return [rect.right, rect.top + rect.height / 2];
    if (side === "top")    return [rect.left + rect.width / 2, rect.top];
    return [rect.left + rect.width / 2, rect.bottom];
  }

  /* ---------- 摆位 ---------- */
  function relayout() {
    const step = STEPS[idx];
    if (!step) return;
    const W = innerWidth, H = innerHeight, PAD = 14, GAP = 96;
    const bubble = $("#tour-bubble"), ring = $("#tour-ring");
    const mask = $("#tour-mask"), hole = $("#tour-hole"), arrow = $("#tour-arrow"), line = $("#tour-line");

    mask.setAttribute("viewBox", `0 0 ${W} ${H}`);
    arrow.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const t = step.sel ? $(step.sel) : null;
    const r = t ? t.getBoundingClientRect() : null;
    const spot = step.spot !== "none" && r && r.width && r.height;

    // 遮罩：整屏一个矩形，再挖掉靶子那块（evenodd）
    let d = `M0 0 H${W} V${H} H0 Z`;
    if (spot) {
      const x = r.left - 6, y = r.top - 6, w = r.width + 12, h = r.height + 12, rad = 8;
      d += ` M${x + rad} ${y} H${x + w - rad} A${rad} ${rad} 0 0 1 ${x + w} ${y + rad}`
        + ` V${y + h - rad} A${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}`
        + ` H${x + rad} A${rad} ${rad} 0 0 1 ${x} ${y + h - rad}`
        + ` V${y + rad} A${rad} ${rad} 0 0 1 ${x + rad} ${y} Z`;
    }
    hole.setAttribute("d", d);

    if (spot) {
      ring.hidden = false;
      Object.assign(ring.style, { left: (r.left - 6) + "px", top: (r.top - 6) + "px",
                                  width: (r.width + 12) + "px", height: (r.height + 12) + "px" });
    } else ring.hidden = true;

    // 气泡：没有靶子就居中
    bubble.style.maxWidth = Math.min(340, W - PAD * 2) + "px";
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    if (!spot) {
      bubble.style.left = ((W - bw) / 2) + "px";
      bubble.style.top = ((H - bh) / 2) + "px";
      arrow.style.display = "none";
      return;
    }

    // 首选那一侧放不下就翻面，再挑空间最大的
    const room = { left: r.left, right: W - r.right, top: r.top, bottom: H - r.bottom };
    const need = { left: bw + GAP, right: bw + GAP, top: bh + GAP, bottom: bh + GAP };
    let side = step.place || "right";
    if (room[side] < need[side]) {
      const flip = { left: "right", right: "left", top: "bottom", bottom: "top" };
      side = room[flip[side]] >= need[flip[side]] ? flip[side]
           : Object.keys(room).sort((a, b) => room[b] - room[a])[0];
    }

    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let bx, by;
    if (side === "left")       { bx = r.left - GAP - bw;  by = cy - bh / 2; }
    else if (side === "right") { bx = r.right + GAP;      by = cy - bh / 2; }
    else if (side === "top")   { bx = cx - bw / 2;        by = r.top - GAP - bh; }
    else                       { bx = cx - bw / 2;        by = r.bottom + GAP; }
    bx = Math.max(PAD, Math.min(bx, W - bw - PAD));
    by = Math.max(PAD, Math.min(by, H - bh - PAD));
    bubble.style.left = bx + "px";
    bubble.style.top = by + "px";

    // 箭头：从气泡朝向靶子的那条边出发，扎到靶子边缘外一点点
    const brect = { left: bx, top: by, right: bx + bw, bottom: by + bh, width: bw, height: bh };
    const from = { left: "right", right: "left", top: "bottom", bottom: "top" }[side];
    const [x0, y0] = anchorOf(brect, from);
    const [tx, ty] = anchorOf(r, side);
    const back = 10, L = Math.hypot(tx - x0, ty - y0) || 1;
    const x1 = tx - (tx - x0) / L * back, y1 = ty - (ty - y0) / L * back;

    arrow.style.display = "";
    line.setAttribute("d", arrowPath(x0, y0, x1, y1));
    const len = line.getTotalLength();
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : len;
    line.getBoundingClientRect();                     // 逼一次重排，动画才会从头跑
    line.style.strokeDashoffset = 0;
  }

  /* ---------- 走步 ---------- */
  function clearReveal() {
    live.forEach(el => el.classList.remove("tour-reveal"));
    live = [];
  }

  function go(i) {
    if (i < 0) return;
    if (i >= STEPS.length) return stop();
    clearReveal();
    idx = i;
    const step = STEPS[idx];

    // 平时藏着的行内按钮，先逼出来再量位置
    if (step.reveal) {
      const host = $(step.reveal);
      if (host) { host.classList.add("tour-reveal"); live.push(host); }
    }

    $("#tour-title").innerHTML = step.title;
    $("#tour-body").innerHTML = step.body;
    $("#tour-step").textContent = `${idx + 1} / ${STEPS.length}`;
    $("#tour-prev").disabled = idx === 0;
    $("#tour-next").textContent = idx === STEPS.length - 1 ? "完成" : "下一步";

    // 不打光的步骤（居中的开场白/收尾）没有靶子，别去滚页面
    const t = step.sel && step.spot !== "none" ? $(step.sel) : null;
    if (t) t.scrollIntoView({ block: "center", inline: "nearest" });
    // 先摆一次：rAF 在标签页不可见时会被节流甚至不触发，只挂 rAF 会留一屏空白。
    // 后面两次是校准 —— 等滚动落定、等字体加载完，位置才真的准。
    relayout();
    requestAnimationFrame(() => requestAnimationFrame(relayout));
    setTimeout(relayout, 280);
  }

  function start() {
    if (root) stop();
    // 没有简历就没东西可指
    if (!$("#stage") || $("#stage").hidden) return;
    build();
    document.body.classList.add("tour-on");
    go(0);
  }

  function stop() {
    clearReveal();
    document.removeEventListener("keydown", onKey, true);
    removeEventListener("resize", relayout);
    if (root) root.remove();
    root = null;
    document.body.classList.remove("tour-on");
    try { localStorage.setItem(LS_TOUR, "1"); } catch (e) { /* 存不下就每次都自动跑，认了 */ }
  }

  window.startTour = start;
  /** 第一次来的人自动跑一遍。跑过就记下，之后只能从侧栏手动叫。 */
  window.maybeStartTour = function () {
    let seen = true;
    try { seen = localStorage.getItem(LS_TOUR) === "1"; } catch (e) { seen = false; }
    if (!seen) setTimeout(start, 450);      // 等首屏渲染和 fitZoom 落定
  };
})();

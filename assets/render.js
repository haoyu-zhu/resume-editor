/* ============================================================
   resume.json -> DOM

   生成的结构要和 assets/resume.css 里的选择器对得上；
   格式定义见 SCHEMA.md。

   四条约定：
   - 可编辑的叶子节点带 class="ed" + data-path="到 JSON 的路径"，
     改完按这个路径写回数据，不用从 DOM 反推结构
   - 可拖动排序的整行带 data-row="到 JSON 的路径"，拖拽逻辑只认这个属性
   - 增删改的按钮带 data-add / data-set / data-del / data-grip / data-icon
   - 所有按钮一律绝对定位在页边距里，不参与排版 ——
     否则编辑时看到的版面就和打印出来的不一样了

   图标一律用 currentColor 上色，主题色换了图标跟着换，不用改 SVG。
   ============================================================ */

const ICONS = {
  edu: '<svg viewBox="0 0 100 76" fill="none"><polygon points="0,28 50,6 100,28 50,50" fill="currentColor"/><line x1="50" y1="50" x2="50" y2="72" stroke="currentColor" stroke-width="5"/><rect x="28" y="42" width="44" height="20" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 100 95"><polygon points="50,2 62.8,32.4 95.7,35.2 70.7,56.7 78.2,88.8 50,71.8 21.8,88.8 29.3,56.7 4.3,35.2 37.2,32.4" fill="currentColor"/></svg>',
  job: '<svg viewBox="0 0 100 72" fill="none" stroke="currentColor" stroke-width="5"><rect x="2.5" y="24.5" width="95" height="45" rx="4"/><polyline points="32,24 32,10 68,10 68,24"/><line x1="2" y1="45" x2="98" y2="45"/></svg>',
  research: '<svg viewBox="0 0 100 95" fill="none" stroke="currentColor" stroke-width="5"><circle cx="35" cy="35" r="32"/><line x1="58" y1="58" x2="95" y2="90" stroke-width="7"/></svg>',
  folder: '<svg viewBox="0 0 100 70"><polygon points="0,35 0,22 38,22 46,35" fill="currentColor"/><rect x="0" y="33" width="100" height="35" fill="currentColor"/></svg>',
  flag: '<svg viewBox="0 0 78 76" fill="none"><line x1="2.5" y1="4" x2="2.5" y2="73" stroke="currentColor" stroke-width="5"/><polygon points="2.5,6 75,18 2.5,34" fill="currentColor"/></svg>',
  note: '<svg viewBox="0 0 100 72" fill="none" stroke="currentColor" stroke-width="5"><rect x="2.5" y="14.5" width="95" height="54" rx="4"/><line x1="15" y1="32" x2="85" y2="32"/><line x1="15" y1="52" x2="65" y2="52"/></svg>',
  cert: '<svg viewBox="0 0 100 76" fill="none" stroke="currentColor" stroke-width="5"><rect x="2.5" y="5" width="80" height="56" rx="3"/><line x1="17" y1="24" x2="60" y2="24"/><line x1="17" y1="40" x2="47" y2="40"/><circle cx="76" cy="55" r="14" fill="currentColor" stroke="none"/></svg>',
  globe: '<svg viewBox="0 0 100 92" fill="none" stroke="currentColor" stroke-width="5"><circle cx="47" cy="45" r="42"/><ellipse cx="47" cy="45" rx="18" ry="42"/><line x1="5" y1="45" x2="89" y2="45"/></svg>',
  trophy: '<svg viewBox="0 0 100 86" fill="none" stroke="currentColor" stroke-width="5"><path d="M28 4 h44 v26 a22 22 0 0 1 -44 0 z" fill="currentColor" stroke="none"/><path d="M28 10 h-15 v9 a15 15 0 0 0 15 15"/><path d="M72 10 h15 v9 a15 15 0 0 1 -15 15"/><line x1="50" y1="52" x2="50" y2="66"/><rect x="29" y="66" width="42" height="10" fill="currentColor" stroke="none"/></svg>',
  _default: '<svg viewBox="0 0 100 95"><circle cx="50" cy="48" r="30" fill="currentColor"/></svg>',
};

/** 图标选择器按这个顺序排；名字只做 tooltip */
const ICON_ORDER = ["edu", "star", "job", "folder", "research",
                    "flag", "note", "cert", "globe", "trophy"];
/** icon 取这个值 = 这个板块明确不要图标。和「字段缺失」不是一回事 ——
    缺失或认不出来的值仍然退化成实心圆点，那是老 JSON 的既有行为，不能动。 */
const NO_ICON = "none";
const ICON_NAMES = { edu: "学位帽", star: "五角星", job: "公文包", folder: "文件夹",
                     research: "放大镜", flag: "旗帜", note: "便签", cert: "证书",
                     globe: "地球", trophy: "奖杯" };

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/** 别人发来的 resume.json 里可能塞 javascript: 之类的东西，只放行安全协议。
    没写协议的（github.com/x）当 https 补全，写了别的协议一律作废。 */
function safeUrl(u) {
  const s = String(u ?? "").trim();
  if (!s) return "#";
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return "#";   // 其它协议：javascript:、data: …
  return "https://" + s;
}

/** 字段值里唯一允许的内联标记：**加粗**。
    先整体转义再认标记 —— 顺序反了就等于把 innerHTML 的口子开给了外来 JSON。
    `[^*]+` 不跨越下一个星号，避免一行里两处加粗被贪婪地并成一处。 */
const rich = (v) => esc(v).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

/** 可编辑叶子。tag 传 "a" 就渲染成链接 */
const ed = (path, value, tag = "span", attrs = "") =>
  `<${tag} class="ed" contenteditable="true" data-path="${esc(path)}"${attrs}>`
  + `${rich(value)}</${tag}>`;

/** 可编辑的链接叶子 */
const edLink = (path, value, url) =>
  ed(path, value, "a", ` href="${esc(safeUrl(url))}"`);

/** 行级操作按钮：换行 / 拖动柄 / 改链接 / 删除。
    绝对定位在右侧页边距里，不参与布局，打印时隐藏。
    排序改用拖动柄 + Alt+↑ / Alt+↓，所以不再放 ↑↓ 两个按钮。
    opts: { drag: 给拖动柄,
            url:  链接字段的路径（没链接也给，点了就是新建）,
            wrap: "split" 从这个字段起另起一行 / "merge" 把这一行并回上一行 } */
function ctl(path, label, opts = {}) {
  let b = `<span class="ctl" contenteditable="false">`;
  if (opts.wrap === "split") {
    b += `<button class="ctl-btn ctl-wrap" data-wrap="${esc(path)}" data-mode="split" `
       + `title="从这个字段起另起一行（编辑时直接按回车也一样）">↵</button>`;
  }
  if (opts.wrap === "merge") {
    b += `<button class="ctl-btn ctl-wrap" data-wrap="${esc(path)}" data-mode="merge" `
       + `title="把这一行接回上一行">⤴</button>`;
  }
  if (opts.drag) {
    b += `<button class="ctl-btn ctl-grip" draggable="true" data-grip="${esc(path)}" `
       + `title="拖动排序${label}（键盘用 Alt+↑ / Alt+↓）">⠿</button>`;
  }
  if (opts.url) {
    b += `<button class="ctl-btn ctl-link" data-url="${esc(opts.url)}" `
       + `title="链接地址（留空即取消链接）">🔗</button>`;
  }
  b += `<button class="ctl-btn ctl-del" data-del="${esc(path)}" title="删除${label}">✕</button>`;
  return b + `</span>`;
}

/** 左侧页边距里的「＋」，同样不参与布局。两种形态：
    - 新增数组项：{ path: 数组路径, kind: 模板名, label, title }
    - 补一个被删空的可选字段：{ set: 字段路径, val: 占位值, label, title } */
function addbar(btns) {
  if (!btns || !btns.length) return "";
  return `<span class="addbar" contenteditable="false">`
    + btns.map(b => b.iconFor
        ? `<button class="ctl-btn ctl-add" data-icon="${esc(b.iconFor)}" `
          + `title="${esc(b.title)}">${esc(b.label)}</button>`
        : b.set
        ? `<button class="ctl-btn ctl-add" data-set="${esc(b.set)}" `
          + `data-val="${esc(b.val)}" title="${esc(b.title)}">${esc(b.label)}</button>`
        : `<button class="ctl-btn ctl-add" data-add="${esc(b.path)}" `
          + `data-kind="${esc(b.kind)}" title="${esc(b.title)}">${esc(b.label)}</button>`
      ).join("")
    + `</span>`;
}

/** 各类板块在标题行左边提供哪些「＋」 */
function sectionAdds(s, p) {
  const adds = sectionAddsFor(s, p);
  // 图标被删掉的板块，在「＋」里给一个请回来的入口 —— 和要点的「＋标签」同一套路数
  if (s.icon === NO_ICON) adds.unshift({ iconFor: p, label: "＋图标", title: "给这个板块加个图标" });
  return adds;
}

function sectionAddsFor(s, p) {
  if (s.type === "education") return [
    { path: `${p}.items`, kind: "eduItem",   label: "＋学校", title: "加一行教育经历" },
    { path: `${p}.notes`, kind: "note",      label: "＋备注", title: "加一条备注（GPA、获奖等）" }];
  if (s.type === "skills") return [
    { path: `${p}.lines`, kind: "skillLine", label: "＋一行", title: "在这个板块加一行" }];
  if (s.type === "campus") return [
    { path: `${p}.items`, kind: "campusItem", label: "＋一行", title: "在这个板块加一行" }];
  return [
    { path: `${p}.items`, kind: "entry", label: "＋一段经历", title: "在这个板块加一段经历" }];
}

/** 顶部信息区的一个字段：标签 + 值（值可能是链接） */
function field(line, i, j, f) {
  const base = `basics.lines.${i}.${j}`;
  const val = f.url
    ? edLink(base + ".value", f.value, f.url)
    : (f.strong ? `<span class="b">${ed(base + ".value", f.value)}</span>`
                : ed(base + ".value", f.value));
  // 换行按钮的形态看这个字段站在哪：行首只能往上并，其余都能就地断行。
  // 「断行 + 并行」两个动作合起来，任何一种分行方式都拼得出来。
  const wrap = j > 0 ? "split" : (i > 0 ? "merge" : null);
  return `<span class="fld" data-row="${esc(base)}">`
    + `<span class="lab">${ed(base + ".label", f.label)}：</span>${val}`
    + ctl(base, "这个字段", { drag: true, url: base + ".url", wrap })
    + `</span>`;
}

function header(data) {
  const b = data.basics || {};
  const photo = (data.meta || {}).photo;
  let h = `<div class="header">`;
  if (photo) h += `<div class="photo"><img src="${esc(photo)}" alt=""></div>`;
  h += `<div class="info">`
     + `<div class="nameline">`
     + `<span class="name ed" contenteditable="true" data-path="basics.name">${esc(b.name)}</span>`
     + addbar([{ path: "basics.lines", kind: "idline",
                 label: "＋一行", title: "在信息区加一整行" }])
     + `</div>`;
  (b.lines || []).forEach((line, i) => {
    h += `<div class="idline" data-row="basics.lines.${i}">`;
    line.forEach((f, j) => {
      if (j) h += `<span class="sep"></span>`;
      h += field(line, i, j, f);
    });
    h += addbar([{ path: `basics.lines.${i}`, kind: "field",
                   label: "＋字段", title: "在这一行加一个字段" }])
       + ctl(`basics.lines.${i}`, "这一行", { drag: true })
       + `</div>`;
  });
  return h + `</div></div>`;
}

function bullet(b, p) {
  let inner = "";
  if (b.label) inner += `<span class="lab">${ed(p + ".label", b.label)}：</span>`;
  inner += b.url
    ? edLink(p + ".text", b.text ?? b.url, b.url)
    : ed(p + ".text", b.text);
  return `<div class="bullet" data-row="${esc(p)}"><span class="sq"></span>${inner}`
    + addbar(b.label ? [] : [{ set: p + ".label", val: "标签", label: "＋标签",
                              title: "给这条要点加一个蓝色标签" }])
    + ctl(p, "这条要点", { drag: true, url: p + ".url" }) + `</div>`;
}

function section(s, i) {
  const p = `sections.${i}`;
  // 图标 + 标题 + 「＋」包成 .sec-head：它的宽度贴着内容，
  // 「＋」才能绝对定位在标题文字的正右方（纸内，视线本来就在那），
  // 而不是缩在页边距里、甚至挂到纸外面去 —— 那样根本没人找得到。
  let h = `<div class="sec" data-row="${p}">`
    + `<div class="sec-title"><span class="sec-head">`
    + (s.icon === NO_ICON ? `` :
        `<button class="ico-btn" contenteditable="false" data-icon="${p}" `
        + `title="换图标">${ICONS[s.icon] || ICONS._default}</button>`)
    + `<span class="ed" contenteditable="true" data-path="${p}.title">${esc(s.title)}</span>`
    + addbar(sectionAdds(s, p))
    + `</span>`
    + ctl(p, "整个板块", { drag: true }) + `</div>`
    + `<div class="sec-rule"></div>`;

  if (s.type === "education") {
    (s.items || []).forEach((it, j) => {
      const q = `${p}.items.${j}`;
      const opt = [];
      if (!it.tag)    opt.push({ set: q + ".tag",    val: "985",  label: "＋标记",
                                 title: "加院校标记（985 / 211 / QS 排名）" });
      if (!it.degree) opt.push({ set: q + ".degree", val: "本科", label: "＋学位",
                                 title: "加学位" });
      h += `<div class="row3 edu" data-row="${q}">`
        + `<span class="l"><span class="b">${ed(q + ".org", it.org)}</span>`
        + (it.tag ? ` <span class="gray small">${ed(q + ".tag", it.tag)}</span>` : ``)
        + `</span>`
        + `<span class="c"><span class="b">${ed(q + ".major", it.major)}</span>`
        + (it.degree ? `（${ed(q + ".degree", it.degree)}）` : ``)
        + `</span>`
        + `<span class="r gray small">${ed(q + ".date", it.date)}</span>`
        + addbar(opt) + ctl(q, "这一行", { drag: true }) + `</div>`;
    });
    (s.notes || []).forEach((n, j) => {
      const q = `${p}.notes.${j}`;
      h += `<div class="note" data-row="${q}">`
        + `<span class="lab">${ed(q + ".label", n.label)}：</span>`
        + ed(q + ".value", n.value) + ctl(q, "这一行", { drag: true }) + `</div>`;
    });

  } else if (s.type === "skills") {
    (s.lines || []).forEach((l, j) => {
      const q = `${p}.lines.${j}`;
      h += `<div class="skill" data-row="${q}">`
        + `<span class="lab">${ed(q + ".label", l.label)}：</span>`
        + `<span class="val">${ed(q + ".value", l.value)}</span>`
        + ctl(q, "这一行", { drag: true }) + `</div>`;
    });

  } else if (s.type === "campus") {
    (s.items || []).forEach((it, j) => {
      const q = `${p}.items.${j}`;
      h += `<div class="row3" data-row="${q}">`
        + `<span class="l b">${ed(q + ".org", it.org)}</span>`
        + `<span class="c b">${ed(q + ".role", it.role)}</span>`
        + `<span class="r gray small">${ed(q + ".date", it.date)}</span>`
        + ctl(q, "这一行", { drag: true }) + `</div>`;
    });

  } else { // entries：实习 / 工作 / 项目 / 科研 / 竞赛
    (s.items || []).forEach((it, j) => {
      const q = `${p}.items.${j}`;
      const adds = [{ path: `${q}.bullets`, kind: "bullet",
                      label: "＋要点", title: "给这段经历加一条要点" }];
      if (!it.role) adds.push({ set: q + ".role", val: "角色", label: "＋角色",
                                title: "加一个蓝色的角色 / 职位" });
      h += `<div class="entry" data-row="${q}"><div class="entry-head">`
        + `<span class="entry-lead">`
        + `<span class="org">${ed(q + ".org", it.org)}</span>`
        + (it.role ? `<span class="role">${ed(q + ".role", it.role)}</span>` : ``)
        + addbar(adds)
        + `</span>`
        + `<span class="date gray small">${ed(q + ".date", it.date)}</span>`
        + ctl(q, "整段经历", { drag: true }) + `</div>`;
      (it.bullets || []).forEach((b, k) => { h += bullet(b, `${q}.bullets.${k}`); });
      h += `</div>`;
    });
  }
  return h + `</div>`;
}

/** 主入口：把 JSON 渲染进 mount 元素 */
function renderResume(data, mount) {
  mount.innerHTML = header(data)
    + (data.sections || []).map((s, i) => section(s, i)).join("");
}

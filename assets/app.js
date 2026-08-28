/* ============================================================
   简历生成器 —— 编辑器逻辑

   数据流：resume.json → 内存里的 state.data → 渲染。
   state.data 始终是唯一真源，导出的就是它。

   改字**不重渲染**（DOM 已经显示对了，重渲染只会让光标乱跳），
   只有增删、移动、换照片这类结构性改动才重渲染。

   撤销的粒度：结构性改动一步一档；改字以「一次进出某个字段」为一档。
   Ctrl+Z 在两套撤销之间切换：这个字段里还有没提交的逐字改动，就让浏览器
   原生的 contenteditable 撤销去做（那才是逐字的）；一旦字面回到进场时的样子，
   就轮到我们的栈，接着往前撤结构性改动。光看「光标在不在字段里」是不够的 ——
   刚点完「＋要点」光标正好落在新字段里，那时候必须能一下撤掉这次新增。
   ============================================================ */

/* ---- 版面档位：从最松到最紧，对应 resume.css 里那几个变量 ---- */
const LADDER = [
  { base: 13.5,  leading: 1.14, secAbove: 9,   titleGap: 3.5, secBelow: 5,   item: 3.5, entry: 7.5, photo: 3.05, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 12.75, leading: 1.11, secAbove: 8,   titleGap: 3,   secBelow: 4.5, item: 3,   entry: 6.8, photo: 2.95, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 12,    leading: 1.08, secAbove: 7,   titleGap: 3,   secBelow: 4,   item: 2.5, entry: 6,   photo: 2.85, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 11.5,  leading: 1.06, secAbove: 6,   titleGap: 3,   secBelow: 3.5, item: 2,   entry: 5.5, photo: 2.85, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 11,    leading: 1.04, secAbove: 5.5, titleGap: 3,   secBelow: 3,   item: 2,   entry: 5,   photo: 2.85, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 10.5,  leading: 1.02, secAbove: 5,   titleGap: 3,   secBelow: 3,   item: 1.8, entry: 4.8, photo: 2.85, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 10,    leading: 1.00, secAbove: 5,   titleGap: 3,   secBelow: 3,   item: 1.5, entry: 4.5, photo: 2.85, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 9.5,   leading: 0.99, secAbove: 4.5, titleGap: 2.5, secBelow: 2.5, item: 1.2, entry: 4,   photo: 2.75, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 9,     leading: 0.98, secAbove: 4,   titleGap: 2.5, secBelow: 2.5, item: 1,   entry: 3.5, photo: 2.6, padT: 0.8, padB: 0.8, padX: 1.0 },
  { base: 8.5,   leading: 0.97, secAbove: 3.5, titleGap: 2,   secBelow: 2,   item: 0.8, entry: 3,   photo: 2.5, padT: 0.8, padB: 0.8, padX: 1.0 },
];

const VARMAP = {  // 滑块 id -> [CSS 变量, 单位]
  base:     ["--base", "pt"],
  leading:  ["--leading", ""],
  secAbove: ["--sec-gap-above", "pt"],
  titleGap: ["--title-line-gap", "pt"],
  secBelow: ["--sec-gap-below", "pt"],
  item:     ["--item-gap", "pt"],
  entry:    ["--entry-gap", "pt"],
  photo:    ["--photo-w", "cm"],
  padT:     ["--page-mt", "cm"],
  padB:     ["--page-mb", "cm"],
  padX:     ["--page-mx", "cm"],
};

/* ---- 主题色。图标用 currentColor，所以换这三个值就够了 ---- */
const DEFAULT_THEME = { accent: "#1c5ab4", accentDark: "#123c82", link: "#286ed2" };
const THEME_PRESETS = {
  blue:   { name: "经典蓝", accent: "#1c5ab4", accentDark: "#123c82", link: "#286ed2" },
  ink:    { name: "墨黑",   accent: "#333333", accentDark: "#000000", link: "#1a4f9c" },
  green:  { name: "深绿",   accent: "#17603f", accentDark: "#0d3f28", link: "#1f7a52" },
  wine:   { name: "酒红",   accent: "#8c1d2f", accentDark: "#5e101d", link: "#a8323f" },
  indigo: { name: "靛紫",   accent: "#43389e", accentDark: "#2c2470", link: "#5a4ec4" },
};
const HEX = /^#[0-9a-f]{6}$/i;

/* ---- 新增条目的模板，以及新增后光标该落在哪个字段 ---- */
const ADD_TEMPLATES = {
  eduItem:    () => ({ date: "2021.9 - 2025.7", org: "学校名称", tag: "985", major: "专业", degree: "本科" }),
  note:       () => ({ label: "备注", value: "内容" }),
  skillLine:  () => ({ label: "标签", value: "内容" }),
  campusItem: () => ({ date: "2024.9 - 2025.6", org: "组织名称", role: "角色" }),
  entry:      () => ({ date: "2026.1 - 2026.6", org: "公司 / 项目名称", role: "角色",
                       bullets: [{ label: "标签", text: "内容" }] }),
  bullet:     () => ({ label: "标签", text: "内容" }),
  field:      () => ({ label: "标签", value: "内容" }),
  idline:     () => ([{ label: "标签", value: "内容" }]),   // 信息区的一整行
};
const FOCUS_FIELD = { eduItem: "org", note: "label", skillLine: "label",
                      campusItem: "org", entry: "org", bullet: "label",
                      field: "label", idline: "0.label" };

/* ---- 可新增的板块预设 ---- */
const SECTION_PRESETS = {
  intern:    { title: "实习经历", type: "entries", icon: "job" },
  work:      { title: "工作经历", type: "entries", icon: "job" },
  project:   { title: "项目经历", type: "entries", icon: "folder" },
  research:  { title: "科研经历", type: "entries", icon: "research" },
  contest:   { title: "竞赛经历", type: "entries", icon: "trophy" },
  paper:     { title: "论文专利", type: "entries", icon: "research" },
  edu:       { title: "教育经历", type: "education", icon: "edu",
               items: [ADD_TEMPLATES.eduItem()],
               notes: [{ label: "GPA", value: "3.6/4.0（专业排名 10/100）" }] },
  campus:    { title: "校园经历", type: "campus",  icon: "flag",
               items: [ADD_TEMPLATES.campusItem()] },
  skills:    { title: "个人技能", type: "skills",  icon: "star",
               lines: [{ label: "专业技能", value: "把和岗位相关的硬技能写在这里" }] },
  cert:      { title: "证书",     type: "skills",  icon: "cert",
               lines: [{ label: "证书", value: "例：CPA 已通过 4 门；教师资格证（高中数学）" }] },
  lang:      { title: "语言能力", type: "skills",  icon: "globe",
               lines: [{ label: "语言", value: "例：英语 CET-6 580；雅思 6.5" }] },
  award:     { title: "荣誉奖项", type: "skills",  icon: "trophy",
               lines: [{ label: "奖项", value: "例：2024-2025 学年国家奖学金" }] },
  portfolio: { title: "作品集",   type: "skills",  icon: "folder",
               lines: [{ label: "作品集", value: "把链接填在这里" }] },
  summary:   { title: "自我总结", type: "skills",  icon: "note",
               lines: [{ label: "自我评价", value: "三到五条，尽量每条都能在上面的经历里找到对应" }] },
};

/** 空白简历骨架 —— 手上什么都没有时从这里起步。
    photo 留 null，由 loadData 的 normalizePhoto 统一填成默认占位图。 */
function blankResume() {
  return {
    meta: { photo: null, fit: 3 },
    basics: {
      name: "你的名字",
      lines: [
        [{ label: "电话", value: "手机号" },
         { label: "邮箱", value: "邮箱地址" },
         { label: "住址", value: "城市" }],
        [{ label: "毕业院校", value: "学校" },
         { label: "学历", value: "本科" },
         { label: "毕业时间", value: "2027.6" },
         { label: "求职意向", value: "岗位名称", strong: true }]
      ]
    },
    sections: [
      { type: "education", icon: "edu", title: "教育经历",
        items: [ADD_TEMPLATES.eduItem()],
        notes: [{ label: "GPA", value: "3.6/4.0（专业排名 10/100）" }] },
      { type: "skills", icon: "star", title: "个人技能",
        lines: [{ label: "专业技能", value: "把和岗位相关的硬技能写在这里" },
                { label: "工具", value: "用过的软件、语言、平台" }] },
      { type: "entries", icon: "job", title: "实习经历",
        items: [ADD_TEMPLATES.entry()] },
      { type: "entries", icon: "folder", title: "项目经历",
        items: [ADD_TEMPLATES.entry()] },
      { type: "skills", icon: "note", title: "自我总结",
        lines: [{ label: "自我评价", value: "三到五条，尽量每条都能在上面的经历里找到对应" }] }
    ]
  };
}

const LS_DATA  = "resume-editor:data";
const LS_SEEN  = "resume-editor:seen";   // 来过了。开场示例只给第一次来的人看
const LS_VARS  = "resume-editor:vars";
const LS_THEME = "resume-editor:theme";
const LS_TIPS  = "resume-editor:skiptips";
const LS_PAGES = "resume-editor:pages";

const state = {
  data: null,        // 当前简历 JSON
  original: null,    // 导入时的原样，用于「还原」
  vars: { ...LADDER[3] },
  theme: { ...DEFAULT_THEME },
  undo: [],          // 撤销栈
  redo: [],          // 重做栈
  zoom: 1,
  targetPages: 1,    // 目标页数，0 = 不限。超了才报红
  zoomManual: false, // 手动调过缩放就不再被 fitZoom 覆盖
  painting: false,   // 重渲染过程中，别把 focusout 当成一次改字
  editSnap: null,    // 本次改字开始前的数据快照（第一次按键时才建，见 input 处理）
  editPath: null,    // 本次改字动的是哪个字段
  drag: null,        // 正在拖动的行 { path, arr, idx, fam }
  activeRow: null,   // 光标所在那一行的 data-row 路径。决定按钮钉在哪、「＋」插在哪
  storageFull: false,
  transient: false,  // 开场示例：还没被动过，先不占本地存档（见启动那段）
  unsaved: false,    // 改过，且改完之后没导出过 JSON。关页面前拿它决定要不要拦一下
};

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* ============================== 路径读写 ============================== */
function pathGet(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function pathSet(obj, path, val) {
  const ks = path.split(".");
  const last = ks.pop();
  const parent = ks.reduce((o, k) => (o == null ? o : o[k]), obj);
  if (parent != null) parent[last] = val;
}
/** 删除路径指向的那一项；父级是数组就 splice */
function pathDelete(obj, path) {
  const ks = path.split(".");
  const last = ks.pop();
  const parent = ks.reduce((o, k) => (o == null ? o : o[k]), obj);
  if (parent == null) return;
  if (Array.isArray(parent)) {
    parent.splice(Number(last), 1);
    // 顶部信息区：一行里的字段删光了，就把这一行也去掉
    if (parent.length === 0 && ks.length && ks[ks.length - 1] !== "sections") {
      const gp = ks.slice(0, -1).reduce((o, k) => (o == null ? o : o[k]), obj);
      if (Array.isArray(gp)) gp.splice(Number(ks[ks.length - 1]), 1);
    }
  } else {
    delete parent[last];
  }
}
/** 把 "a.b.3" 拆成 { arr: 那个数组, idx: 3, arrPath: "a.b" } */
function splitPath(path) {
  const ks = path.split(".");
  const idx = Number(ks.pop());
  const arrPath = ks.join(".");
  return { arr: pathGet(state.data, arrPath), idx, arrPath };
}

/* ============================== 渲染 ============================== */
function paint() {
  state.painting = true;
  renderResume(state.data, $("#doc"));
  state.painting = false;
  state.editSnap = null;
  state.editPath = null;
  state.activeRow = null;      // 行都重画了，旧路径可能已经错位；等 focusPath 重新钉
  syncButtons();
  measure();
  persist();
}

function syncButtons() {
  $("#btn-undo").disabled = !state.undo.length;
  $("#btn-redo").disabled = !state.redo.length;
}

/** 改动之前先存档。新动作一出现，重做栈就作废 —— 编辑器的通例 */
function snapshot() {
  markDirty();
  state.undo.push(clone(state.data));
  if (state.undo.length > 60) state.undo.shift();
  state.redo.length = 0;
  syncButtons();
}

/** 重渲染之后把光标放到新出现的字段上，并滚到可见处 */
function focusPath(path) {
  const el = $(`#doc [data-path="${CSS.escape(path)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);          // 选中占位文字，直接打字就覆盖掉
}

/* ---------------- 增 / 移 ---------------- */
/** 光标所在的那一条，如果正好是 arrPath 这个数组里的，就返回它的下一位。
    否则返回末尾。—— 想在中间插一条时，「追加到末尾再拖回来」是多余的动作。 */
function insertPos(arrPath, end) {
  const p = state.activeRow;
  if (!p || !p.startsWith(arrPath + ".")) return end;
  const idx = Number(p.slice(arrPath.length + 1).split(".")[0]);
  return Number.isInteger(idx) ? Math.min(idx + 1, end) : end;
}

function addRow(arrPath, kind) {
  if (!ADD_TEMPLATES[kind]) return;
  snapshot();
  let arr = pathGet(state.data, arrPath);
  if (!Array.isArray(arr)) { pathSet(state.data, arrPath, []); arr = pathGet(state.data, arrPath); }
  const at = insertPos(arrPath, arr.length);
  arr.splice(at, 0, ADD_TEMPLATES[kind]());
  paint();
  focusPath(`${arrPath}.${at}.${FOCUS_FIELD[kind]}`);
}

/** 信息区的换行：数据形状就是「一行 = 一个字段数组」，所以
    断行 = 从第 j 个字段处 splice 出一段当新行，并行 = 把这一整行接到上一行尾巴上。
    两个动作互为逆操作，凑在一起就能拼出任意一种分行方式。 */
function idlineWrap(path, mode) {
  const m = /^basics\.lines\.(\d+)\.(\d+)$/.exec(path || "");
  if (!m) return false;
  const i = Number(m[1]), j = Number(m[2]);
  const lines = state.data?.basics?.lines;
  if (!Array.isArray(lines) || !Array.isArray(lines[i])) return false;

  if (mode === "split") {
    if (j <= 0) return false;                       // 已经在行首，没得断
    commitTextEdit();                               // 刚打的字单独占一档撤销
    snapshot();
    lines.splice(i + 1, 0, lines[i].splice(j));
    paint();
    focusPath(`basics.lines.${i + 1}.0.value`);
  } else {
    if (i <= 0) return false;                       // 没有上一行
    commitTextEdit();
    snapshot();
    const at = lines[i - 1].length;
    lines[i - 1].push(...lines.splice(i, 1)[0]);
    paint();
    focusPath(`basics.lines.${i - 1}.${at}.value`);
  }
  return true;
}

/** 光标落在哪，就把哪一行（外加它外面一层）的按钮钉住。
    刻意**不在** focusout 里取消：一取消，鼠标按到按钮上的那一瞬间按钮就没了，
    click 事件根本发不出来 —— 这正是「移过去就点不到」的老毛病。
    换行、按 Esc、或者光标落到别处时才换。 */
function markActive(el) {
  $$("#doc .is-active").forEach(n => n.classList.remove("is-active"));
  state.activeRow = null;
  if (!el) return;

  const row = el.closest("[data-row]");
  const nameline = el.closest(".header")?.querySelector(".nameline");
  // 在信息区里编辑时，「＋一行」一直亮着 —— 它挂在姓名行上，没有 data-row
  if (nameline) nameline.classList.add("is-active");
  if (!row) return;

  state.activeRow = row.dataset.row;
  row.classList.add("is-active");
  // 外面一层也点亮：站在字段上能直接「＋字段」，站在要点上能直接「＋要点」
  row.parentElement?.closest?.("[data-row]")?.classList.add("is-active");
}

/** 把一个被删空的可选字段（要点标签、院校标记、学位、角色）加回来 */
function setField(path, val) {
  snapshot();
  pathSet(state.data, path, val);
  paint();
  focusPath(path);
}

function addSection(key) {
  let preset;
  if (key === "custom") {
    const title = prompt("新板块的标题：", "板块名称");
    if (!title) return;
    preset = { title, type: "skills", icon: "note", lines: [{ label: "标签", value: "内容" }] };
  } else {
    preset = clone(SECTION_PRESETS[key]);
    if (!preset) return;
  }
  if (preset.type === "entries" && !preset.items) preset.items = [ADD_TEMPLATES.entry()];
  if (preset.type === "skills" && !preset.lines) preset.lines = [ADD_TEMPLATES.skillLine()];

  snapshot();
  const secs = state.data.sections;
  // 「自我总结」习惯上放最后，新板块插到它前面去
  let at = secs.length;
  const last = secs[secs.length - 1];
  if (last && /自我总结|自我评价/.test(last.title || "")) at = secs.length - 1;
  secs.splice(at, 0, preset);
  paint();
  focusPath(`sections.${at}.title`);
}

function moveItem(path, dir) {
  const { arr, idx } = splitPath(path);
  if (!Array.isArray(arr)) return false;
  const to = idx + dir;
  if (to < 0 || to >= arr.length) return false;
  snapshot();
  arr.splice(to, 0, arr.splice(idx, 1)[0]);
  paint();
  return true;
}

/* ============================== 拖拽排序 ============================== */
/** 两行能不能互换位置。同一个数组当然可以；此外允许要点跨经历搬家、
    信息区字段跨行搬家 —— 这两种最常用，而且不会把数据搬到错误的形状里。 */
function famOf(arrPath) {
  if (arrPath === "sections") return "section";
  if (arrPath === "basics.lines") return "idline";
  if (/^basics\.lines\.\d+$/.test(arrPath)) return "field";
  if (/\.bullets$/.test(arrPath)) return "bullet";
  return arrPath;   // 某个板块自己的 items / lines / notes，只能在板块内部动
}

/** 从鼠标落点往上找第一个「和拖动来源同族」的行 */
function dropTargetFrom(el, fam) {
  let n = el;
  while (n && n.id !== "doc") {
    if (n.dataset && n.dataset.row && famOf(splitPath(n.dataset.row).arrPath) === fam) return n;
    n = n.parentElement;
  }
  return null;
}

function clearDropMarks() {
  $$("#doc .drop-before, #doc .drop-after")
    .forEach(e => e.classList.remove("drop-before", "drop-after"));
}

/** 把 fromPath 那一项搬到 toPath 前面或后面 */
function dropMove(fromPath, toPath, after) {
  const from = splitPath(fromPath), to = splitPath(toPath);
  if (!Array.isArray(from.arr) || !Array.isArray(to.arr)) return;
  if (fromPath === toPath) return;
  snapshot();
  const item = from.arr.splice(from.idx, 1)[0];
  let at = to.idx + (after ? 1 : 0);
  if (from.arr === to.arr && from.idx < at) at--;   // 同数组内前移后，目标下标要回退一位
  to.arr.splice(clamp(at, 0, to.arr.length), 0, item);
  // 字段跨行搬家可能把某一行搬空，空行留着没意义
  if (from.arrPath.startsWith("basics.lines.") && from.arr.length === 0) {
    state.data.basics.lines.splice(Number(from.arrPath.split(".")[2]), 1);
  }
  paint();
}

/* ============================== 版面参数 ============================== */
/** @page 的 margin 不认 CSS 变量（浏览器只在这条规则里认字面值），
    所以打印时的真实页边距只能靠动态改写这条规则。屏幕上是 .paper 的 padding，
    纸上是这条 @page —— 两边必须同步，否则预览和打印就对不上了。 */
function applyPageRule() {
  let el = document.getElementById("page-rule");
  if (!el) {
    el = document.createElement("style");
    el.id = "page-rule";
    document.head.appendChild(el);
  }
  const { padT, padB, padX } = state.vars;
  el.textContent = `@page{ size:A4; margin:${padT}cm ${padX}cm ${padB}cm; }`;
}

function applyVars() {
  const root = document.documentElement;
  for (const [k, [cssVar, unit]] of Object.entries(VARMAP)) {
    root.style.setProperty(cssVar, state.vars[k] + unit);
  }
  for (const k of Object.keys(VARMAP)) {
    const el = $("#sl-" + k);
    if (el) { el.value = state.vars[k]; $("#val-" + k).textContent = state.vars[k]; }
  }
  // 当前参数正好等于某个预设档位的话，下拉就显示那一档，别显示「自定义」
  $("#ladder").value = String(ladderHit());
  applyPageRule();
  syncMeta();
  measure();
  persist();
}

function ladderHit() {
  const keys = Object.keys(VARMAP);
  return LADDER.findIndex(s => keys.every(k => s[k] === state.vars[k]));
}

function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty("--accent", state.theme.accent);
  root.style.setProperty("--accent-dark", state.theme.accentDark);
  root.style.setProperty("--link", state.theme.link);
  const el = $("#theme-custom");
  if (el) el.value = state.theme.accent;
  $$(".swatch").forEach(b => b.classList.toggle(
    "on", THEME_PRESETS[b.dataset.theme].accent.toLowerCase() === state.theme.accent.toLowerCase()));
  syncMeta();
  persist();
}

/** 把颜色往黑（amt<0）或往白（amt>0）挪一档 */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v =>
    Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt));
  return "#" + ch.map(v => clamp(v, 0, 255).toString(16).padStart(2, "0")).join("");
}

/** 版面参数和主题色要跟着 JSON 走，不然「下载下来下次接着改」会丢版面 */
function syncMeta() {
  if (!state.data) return;
  state.data.meta = state.data.meta || {};
  const hit = ladderHit();
  if (hit >= 0) { state.data.meta.fit = hit; delete state.data.meta.vars; }
  else { state.data.meta.vars = { ...state.vars }; }

  const def = JSON.stringify(DEFAULT_THEME) === JSON.stringify(state.theme);
  if (def) delete state.data.meta.theme;
  else state.data.meta.theme = { ...state.theme };

  if (state.targetPages === 1) delete state.data.meta.target_pages;   // 1 页是默认，不写
  else state.data.meta.target_pages = state.targetPages;
}

/* ============================== 页数与填充率 ============================== */
function cmToPx(cm) {
  const probe = $("#probe");
  return probe.getBoundingClientRect().width * cm;   // probe 宽度固定 1cm
}
/* ---- 纸张几何。改这里之前先想清楚和 @page / resume.css 的关系 ---- */
const PAGE_CM = { h: 29.7, w: 21, gap: 0.6 };   // gap 只是屏幕上两张纸之间的空隙
/** 一页能放多少内容（cm）。上下留白是滑块，所以得现算，不能写死 */
const usableCm = () => PAGE_CM.h - state.vars.padT - state.vars.padB;

/** 一个「不可拆开的块」。跨到下一页时整块推过去，和打印时
    break-inside:avoid 的行为对齐。top 是要推的元素，end 是这一块的底。 */
function pageUnits(doc) {
  const usable = cmToPx(usableCm());

  /** 一行拆成几个不可拆块。一段经历如果本身就比一页还高，
      整块硬绑只会在页底留下大片空白，这时退一步，允许它在要点之间断开。 */
  const rowUnits = (r) => {
    const bullets = Array.from(r.querySelectorAll(":scope > .bullet"));
    if (bullets.length && r.offsetHeight > usable) {
      return [{ top: r, end: bullets[0] },
              ...bullets.slice(1).map(x => ({ top: x, end: x }))];
    }
    return [{ top: r, end: r }];
  };

  const units = [];
  const header = doc.querySelector(".header");
  if (header) units.push({ top: header, end: header });

  doc.querySelectorAll(".sec").forEach(sec => {
    const rows = Array.from(sec.children)
      .filter(c => c.matches(".entry, .row3, .skill, .note"));
    if (!rows.length) { units.push({ top: sec, end: sec }); return; }
    // 板块标题 + 横线 + 第一块绑在一起：标题绝不能单独留在页底。
    // 注意第一行也要先过 rowUnits —— 否则一段超高的经历正好是板块第一段时，
    // 整个板块会变成一个推不动的巨块，分页就失效了。
    const first = rowUnits(rows[0]);
    units.push({ top: sec, end: first[0].end });
    units.push(...first.slice(1));
    for (let i = 1; i < rows.length; i++) units.push(...rowUnits(rows[i]));
  });
  return units;
}

/** 三栏行的中列对齐。
    每个 .row3 各自是一个 grid，中列宽度逐行算，行与行之间本来对不齐；
    写死列宽（原来的 --edu-col-w）能对齐，但短的那行右边会留出死区，
    整组字就被顶得偏离版心。所以改成量：取同一板块内最宽的一个中列，
    回写成该板块的列宽 —— 各行共享左边缘，又不留死区。
    先清空再量，否则量到的是上一轮写进去的宽度。 */
function fitRow3Columns() {
  const secs = Array.from(document.querySelectorAll("#doc .sec"))
    .map(sec => ({ sec, cells: Array.from(sec.querySelectorAll(":scope > .row3 > .c")) }))
    .filter(x => x.cells.length);
  secs.forEach(x => x.sec.style.removeProperty("--row3-c-w"));
  const widths = secs.map(x => Math.max(...x.cells.map(c => c.getBoundingClientRect().width)));
  secs.forEach((x, i) => {
    // 只有一行的板块不必对齐，留 auto 让它自己居中
    if (x.cells.length < 2) return;
    x.sec.style.setProperty("--row3-c-w", (widths[i] / (state.zoom || 1)).toFixed(2) + "px");
  });
}

/** 重排分页：把跨页的块整体推到下一页开头，返回页数和末页占用。
    推移用 --push + .pushed 类实现，打印时被 CSS 关掉 ——
    纸上的分页交给浏览器自己做（它做得对，已验证），我们只负责屏幕上像不像。 */
function paginate() {
  const doc = $("#doc");
  const pageH = cmToPx(PAGE_CM.h), gap = cmToPx(PAGE_CM.gap);
  const usable = cmToPx(usableCm());
  const step = pageH + gap;          // 相邻两页「内容起点」在文档坐标里的间距
  const z = state.zoom || 1;

  doc.querySelectorAll(".pushed").forEach(el => {
    el.classList.remove("pushed");
    el.style.removeProperty("--push");
  });

  const units = pageUnits(doc);
  const base = () => doc.getBoundingClientRect().top;
  let page = 0, bottom = 0;

  for (const u of units) {
    const t = (u.top.getBoundingClientRect().top - base()) / z;
    const bo = (u.end.getBoundingClientRect().bottom - base()) / z;
    const limit = page * step + usable;
    if (bo > limit + 0.5) {
      if (bo - t <= usable) {                  // 推得动才推
        const push = (page + 1) * step - t;
        if (push > 0) {
          u.top.classList.add("pushed");
          u.top.style.setProperty("--push", push.toFixed(2) + "px");
        }
        page++;
      } else {                                  // 推不动的超高块，让它自然流过去
        page = Math.max(page, Math.floor(bo / step));
      }
    }
    bottom = Math.max(bottom, (u.end.getBoundingClientRect().bottom - base()) / z);
  }

  const pages = Math.max(1, page + 1);
  const lastFill = clamp((bottom - (pages - 1) * step) / usable, 0, 1);
  return { pages, lastFill, pageH, gap };
}

/** 把 N 张纸画出来，垫在内容底下 */
function drawSheets(pages, pageH, gap) {
  const box = $("#sheets");
  if (!box) return;
  let h = "";
  for (let k = 0; k < pages; k++) {
    h += `<div class="sheet" style="top:${(k * (pageH + gap)).toFixed(1)}px;`
       + `height:${pageH.toFixed(1)}px"><span class="sheet-no">第 ${k + 1} 页</span></div>`;
  }
  box.innerHTML = h;
  $(".paper").style.minHeight = (pages * pageH + (pages - 1) * gap).toFixed(1) + "px";
}

function measure() {
  const doc = $("#doc");
  if (!doc || !state.data) return;
  fitRow3Columns();                 // 必须在 paginate 之前 —— 它会改行宽，进而改行高
  const { pages, lastFill, pageH, gap } = paginate();
  drawSheets(pages, pageH, gap);

  const target = state.targetPages;                 // 0 = 不限
  const over = target > 0 && pages > target;
  const sparse = pages > 1 && lastFill < 0.25;      // 末页只有零星几行，很难看
  const thin = pages === 1 && lastFill < 0.8;

  const box = $("#fill");
  $("#fill-bar").style.width = (lastFill * 100).toFixed(0) + "%";
  box.classList.toggle("over", over);
  box.classList.toggle("thin", !over && (thin || sparse));
  $("#fill-text").textContent = pages === 1
    ? `1 页 · 占 ${(lastFill * 100).toFixed(0)}%`
    : `共 ${pages} 页 · 末页 ${(lastFill * 100).toFixed(0)}%`;
  $("#fill-hint").textContent =
      over   ? `超出了目标的 ${target} 页。调小字号或间距，或删掉与岗位无关的要点。`
    : sparse ? `第 ${pages} 页只有零星几行，看着像没写完。要么压回 ${pages - 1} 页，要么把内容补厚。`
    : thin   ? "版面偏空，可以调大字号，或回去把经历写透一点。"
    : "";
}

/* ============================== 存取 ============================== */
function persist() {
  // 开场示例只是摆着看的，用户没动过就别写进存档 ——
  // 否则第二次打开会挂出「已恢复上次没改完的内容」，而内容根本没人改过
  if (state.transient) return;
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(state.data));
    localStorage.setItem(LS_VARS, JSON.stringify(state.vars));
    localStorage.setItem(LS_THEME, JSON.stringify(state.theme));
    localStorage.setItem(LS_PAGES, String(state.targetPages));
    if (state.storageFull) { state.storageFull = false; $("#storage-warn").hidden = true; }
  } catch (e) {
    // 多半是照片太大撑爆了配额。以前这里是静默吞掉的，
    // 结果人以为存上了，关掉浏览器就全没了 —— 必须说出来。
    if (!state.storageFull) {
      state.storageFull = true;
      $("#storage-warn").hidden = false;
    }
  }
}

/** meta 里记的版面档位 / 自定义参数 / 主题色，读回 state。
    外来 JSON 什么都可能写，逐项校验后再用，别把非法值灌进 CSS 变量。 */
function applyMetaLayout(m) {
  if (m.vars && typeof m.vars === "object") {
    state.vars = { ...LADDER[3] };
    for (const k of Object.keys(VARMAP)) {
      if (typeof m.vars[k] === "number" && isFinite(m.vars[k])) state.vars[k] = m.vars[k];
    }
  } else {
    const fit = typeof m.fit === "number" ? m.fit : 3;
    state.vars = { ...LADDER[clamp(fit, 0, LADDER.length - 1)] };
  }
  state.theme = { ...DEFAULT_THEME };
  if (m.theme && typeof m.theme === "object") {
    for (const k of Object.keys(DEFAULT_THEME)) {
      if (HEX.test(m.theme[k] || "")) state.theme[k] = m.theme[k];
    }
  }
  state.targetPages = [0, 1, 2, 3].includes(m.target_pages) ? m.target_pages : 1;
  const sel = $("#target-pages");
  if (sel) sel.value = String(state.targetPages);
}

/** 照片的三态：字符串 = 用这张；空字符串 = 明确不要；null / 没这个字段 = 没设置过。
    「没设置过」一律填默认占位图，这样任何一份简历打开就有图，
    真不想要照片的，点「不要照片」会写成空字符串，记得住 —— 和「没设置过」是两回事。 */
function normalizePhoto(obj) {
  obj.meta = obj.meta || {};
  if (obj.meta.photo == null && window.DEFAULT_PHOTO) {   // == 同时命中 null 和 undefined
    obj.meta.photo = window.DEFAULT_PHOTO;
  }
}

function loadData(obj, { keepVars = false, transient = false } = {}) {
  normalizePhoto(obj);
  state.transient = transient;
  state.unsaved = false;
  state.data = obj;
  state.original = clone(obj);
  state.undo = [];
  state.redo = [];
  if (!keepVars) applyMetaLayout(obj.meta || {});
  $("#empty").hidden = true;
  $("#stage").hidden = false;
  $("#editor-tools").hidden = false;
  $("#histbar").hidden = false;
  applyTheme();
  applyVars();
  paint();
  setTitle();
  state.zoomManual = false;
  fitZoom();
}

/** 存 PDF 时的默认文件名。浏览器拿的是 document.title，而平时的标题
    还挂着应用名，直接印进文件名太难看，所以进打印前换掉、出来再换回去。
    格式：姓名-求职岗位，没写岗位就只有姓名。
    加粗标记 ** 是数据层的东西，不该跑到文件名里；Windows 不许出现的字符也剔掉。 */
function printFileName() {
  const b = state.data?.basics || {}, m = state.data?.meta || {};
  const clean = (s) => String(s ?? "").replace(/\*\*/g, "").trim();
  const parts = [clean(b.name), clean(m.target_title)].filter(Boolean);
  return (parts.join("-") || "简历").replace(/[\\/:*?"<>|]/g, "").slice(0, 80);
}

/** meta.target_title 一直写在 SCHEMA 里，但以前没人用它。开着好几份简历时
    标签页上能看出哪份是哪份，比清一色的「简历生成器」有用。 */
function setTitle() {
  const name = (state.data?.basics?.name || "").trim();
  const target = (state.data?.meta?.target_title || "").trim();
  const who = [name, target].filter(Boolean).join(" · ");
  document.title = who ? `${who} — 简历生成器` : "简历生成器";
}

function readJsonFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (!obj.basics || !obj.sections) throw new Error("不像是简历 JSON（缺 basics 或 sections）");
      loadData(obj);
    } catch (e) {
      alert("读不了这个文件：" + e.message);
    }
  };
  r.readAsText(file, "utf-8");
}

/** 用户第一次真的动了内容：示例从此归他，开始落存档；
    同时挂上「还没导出」的标记，关页面时据此拦一下。 */
function markDirty() {
  state.transient = false;
  if (state.unsaved) return;
  state.unsaved = true;
  $("#btn-json")?.classList.add("dirty");
}

function downloadJson() {
  if (!state.data) return;
  syncMeta();
  const name = (state.data.basics?.name || "resume") + ".json";
  const blob = new Blob([JSON.stringify(state.data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  state.unsaved = false;
  $("#btn-json")?.classList.remove("dirty");
}

/* ============================== 照片 ============================== */
function setPhotoFromFile(file) {
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 420;                       // 2.85cm @300dpi 约 340px，420 够用
      const w = Math.min(img.width, MAX);
      const h = Math.round(img.height * w / img.width);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      snapshot();
      state.data.meta = state.data.meta || {};
      state.data.meta.photo = c.toDataURL("image/jpeg", 0.88);
      paint();
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

/* ============================== 图标选择器 ============================== */
function openIconPicker(btn) {
  const pick = $("#icon-pick");
  const path = btn.dataset.icon;
  const cur = pathGet(state.data, path + ".icon");
  pick.innerHTML = `<div class="ico-grid">`
    + ICON_ORDER.map(k =>
        `<button class="ico-opt${k === cur ? " on" : ""}" data-pick="${k}" `
        + `title="${ICON_NAMES[k]}">${ICONS[k]}</button>`).join("")
    + `<button class="ico-opt ico-off${cur === NO_ICON ? " on" : ""}" data-pick="${NO_ICON}" `
    + `title="这个板块不要图标">✕</button>`
    + `</div><div class="ico-foot">`
    + `<button class="ico-all" title="所有板块的图标一次去掉">全部去掉</button>`
    + `</div>`;
  pick.dataset.for = path;
  const r = btn.getBoundingClientRect();
  pick.hidden = false;
  pick.style.left = clamp(r.left + scrollX, 8, innerWidth - pick.offsetWidth - 8) + "px";
  pick.style.top = (r.bottom + scrollY + 6) + "px";
}
function closeIconPicker() { $("#icon-pick").hidden = true; }

/* ============================== 撤销 / 重做 ============================== */
/** 光标离开某个字段时，如果内容真的变了，就把进入时的快照压进撤销栈。
    粒度是「一个字段一档」——比一次一个字符好用得多。 */
/** 一档改字封口。repaint=true 时，如果这一档把字段清空了，就重画一次。
    改字平时只写回数据、不重渲染（打字才不卡），但可选字段的「装饰」是渲染时
    才决定的：标签后面那个全角冒号、院校的灰色标记，以及用来把它们补回来的
    「＋标签」按钮。不重画的话，删空标签只会在纸上剩一个孤零零的「：」，
    ＋按钮也不出现，看起来就是「删不掉」。
    只在焦点已经离开字段时才画 —— 否则会把正在打字的字段连同光标一起重建掉。 */
function commitTextEdit({ repaint = false } = {}) {
  if (state.painting || !state.editSnap) return;
  const snap = state.editSnap, path = state.editPath;
  state.editSnap = null;
  state.editPath = null;
  // 改了又改回去（多半是刚按过原生的逐字撤销），就别占一档
  if (path && pathGet(state.data, path) === pathGet(snap, path)) return;
  state.undo.push(snap);
  if (state.undo.length > 60) state.undo.shift();
  state.redo.length = 0;
  syncButtons();

  const now = pathGet(state.data, path), was = pathGet(snap, path);
  if (repaint && typeof now === "string" && !now.trim() && String(was ?? "").trim()) paint();
}

/** 给选中的字加粗（再来一次取消）。contenteditable 里浏览器本来就认 Ctrl+B，
    但默认可能吐 <span style="font-weight:bold">；关掉 styleWithCSS 逼它出 <b>，
    readField 才认得。execCommand 自己会派发 input 事件，写回数据走原来那条路。 */
function applyBold() {
  if (!document.activeElement?.closest?.(".ed")) return;
  document.execCommand("styleWithCSS", false, false);
  document.execCommand("bold");
}

/** 把编辑框里的内容读回成字符串。<b>/<strong> 记成 **…**，其余标签一律拍平 ——
    数据层永远只有纯文本加这一种标记，不存 HTML，外来 JSON 也就没有注入的余地。 */
function readField(el) {
  let out = "";
  const walk = (node, bold) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += n.data; continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { continue; }                 // 回车本来就禁掉了，兜个底
      const isB = !bold && (tag === "b" || tag === "strong");
      if (!isB) { walk(n, bold); continue; }
      const before = out.length;
      out += "**";
      walk(n, true);
      if (out.length === before + 2) out = out.slice(0, before);  // 空的加粗，丢掉
      else out += "**";
    }
  };
  walk(el, false);
  return out;
}

/** 这个字段里还有没有「浏览器自己能撤的字」。有就把 Ctrl+Z 让出去。 */
function hasNativeUndo(el) {
  if (!el || !state.editSnap || el.dataset.path !== state.editPath) return false;
  const was = pathGet(state.editSnap, state.editPath);
  return typeof was === "string" && readField(el) !== was;
}
function doUndo() {
  commitTextEdit();
  if (!state.undo.length) return;
  state.redo.push(clone(state.data));
  state.data = state.undo.pop();
  paint();
  setTitle();
}
function doRedo() {
  if (!state.redo.length) return;
  state.undo.push(clone(state.data));
  state.data = state.redo.pop();
  paint();
  setTitle();
}

/* ============================== 事件 ============================== */
function bind() {
  // ---- 导入 ----
  $("#file").addEventListener("change", (e) => {
    if (e.target.files[0]) readJsonFile(e.target.files[0]);
  });
  const drop = $("#empty");
  ["dragover", "dragenter"].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.add("hot");
  }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.remove("hot");
  }));
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) readJsonFile(f);
  });
  $("#btn-paste").addEventListener("click", () => {
    const t = prompt("把 resume.json 的内容整段粘贴进来：");
    if (!t) return;
    try { loadData(JSON.parse(t)); } catch (e) { alert("JSON 解析失败：" + e.message); }
  });
  $("#btn-sample").addEventListener("click", () => {
    if (window.SAMPLE) loadData(clone(window.SAMPLE));
    else alert("示例没加载上，检查 assets/sample.js 是否和网页放在一起。");
  });
  $("#btn-blank").addEventListener("click", () => {
    if (state.data && !confirm("新建一份空白简历？当前内容会被替换。")) return;
    loadData(blankResume());
    focusPath("basics.name");
  });

  // ---- 改字：只写回数据，不重渲染（DOM 已经是对的）----
  let t = null;
  // 快照在「第一次真的按下键」时才做，不在 focusin 做 ——
  // 带证件照的 JSON 有好几百 KB，点一下就 clone 一次会明显卡手
  $("#doc").addEventListener("input", (e) => {
    const el = e.target.closest(".ed");
    if (!el) return;
    if (state.editSnap && state.editPath !== el.dataset.path) commitTextEdit();
    markDirty();
    if (!state.editSnap) {                    // 记下改之前的样子
      state.editSnap = clone(state.data);
      state.editPath = el.dataset.path;
    }
    pathSet(state.data, el.dataset.path, readField(el));
    clearTimeout(t);
    t = setTimeout(() => { measure(); persist(); setTitle(); }, 250);
  });
  // 光标离开这个字段，这一档撤销就封口
  $("#doc").addEventListener("focusout", (e) => {
    if (e.target.closest(".ed")) {
      commitTextEdit({ repaint: true });   // 删空了可选字段，就在这一刻重画
      $("#btn-bold").disabled = true;
    }
  });
  // 光标落到哪一行，就把那一行的按钮钉住（见 markActive 里为什么不在 focusout 取消）。
  // 点按钮本身不算换行 —— 按钮一按下就会抢走焦点，要是这时候重算，
  // 按钮在 mousedown 和 click 之间就被收走了，等于永远点不动。
  $("#doc").addEventListener("focusin", (e) => {
    if (e.target.closest(".ctl, .addbar")) return;
    $("#btn-bold").disabled = !e.target.closest(".ed");
    markActive(e.target.closest(".ed"));
  });

  // 回车不该在简历里造出换行；在信息区它有更有用的含义：就地断行
  $("#doc").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const ed = e.target.closest(".ed");
    if (!ed) return;
    e.preventDefault();
    const fld = ed.closest(".fld");
    if (fld) idlineWrap(fld.dataset.row, "split");
  });
  // 粘贴一律去格式，否则会把网页样式带进来
  $("#doc").addEventListener("paste", (e) => {
    if (!e.target.closest(".ed")) return;
    e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData("text").replace(/\s*\n\s*/g, " ");
    document.execCommand("insertText", false, txt);
  });
  // 编辑态下点链接不要真的跳走
  $("#doc").addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });

  // ---- 行内按钮：删 / 加 / 补字段 / 改链接 / 换图标 ----
  $("#doc").addEventListener("click", (e) => {
    const del = e.target.closest(".ctl-del");
    if (del) { snapshot(); pathDelete(state.data, del.dataset.del); paint(); return; }

    const add = e.target.closest(".ctl-add");
    if (add) {
      // 「＋图标」不是加一行，是就地开选择器。stopPropagation 是必须的 ——
      // 否则冒泡到 document 上那个「点外面就关」的处理器，选择器刚开就被关掉
      if (add.dataset.icon) { e.stopPropagation(); openIconPicker(add); return; }
      if (add.dataset.set) setField(add.dataset.set, add.dataset.val);
      else addRow(add.dataset.add, add.dataset.kind);
      return;
    }

    const wrap = e.target.closest(".ctl-wrap");
    if (wrap) { idlineWrap(wrap.dataset.wrap, wrap.dataset.mode); return; }

    const ico = e.target.closest(".ico-btn");
    if (ico) { e.stopPropagation(); openIconPicker(ico); return; }

    const link = e.target.closest(".ctl-link");
    if (link) {
      const cur = pathGet(state.data, link.dataset.url) || "";
      const next = prompt("链接地址（留空即取消链接）：", cur);
      if (next === null) return;
      snapshot();
      if (next.trim()) pathSet(state.data, link.dataset.url, next.trim());
      else pathDelete(state.data, link.dataset.url);
      paint();
    }
  });

  // ---- 拖拽排序 ----
  $("#doc").addEventListener("dragstart", (e) => {
    const grip = e.target.closest(".ctl-grip");
    if (!grip) { e.preventDefault(); return; }   // 顺手掐掉 contenteditable 的原生拖文字
    const path = grip.dataset.grip;
    const { arrPath } = splitPath(path);
    state.drag = { path, fam: famOf(arrPath) };
    const row = $(`#doc [data-row="${CSS.escape(path)}"]`);
    if (row) {
      row.classList.add("dragging");
      e.dataTransfer.setDragImage(row, 12, 10);
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", path);
  });
  $("#doc").addEventListener("dragover", (e) => {
    if (!state.drag) return;
    const tgt = dropTargetFrom(e.target, state.drag.fam);
    clearDropMarks();
    if (!tgt || tgt.dataset.row === state.drag.path) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = tgt.getBoundingClientRect();
    // 信息区的字段是横着排的，看左右；其它都是整行，看上下
    const after = tgt.classList.contains("fld")
      ? e.clientX > r.left + r.width / 2
      : e.clientY > r.top + r.height / 2;
    tgt.classList.add(after ? "drop-after" : "drop-before");
  });
  $("#doc").addEventListener("drop", (e) => {
    if (!state.drag) return;
    e.preventDefault();
    const tgt = dropTargetFrom(e.target, state.drag.fam);
    clearDropMarks();
    if (tgt && tgt.dataset.row !== state.drag.path) {
      const r = tgt.getBoundingClientRect();
      const after = tgt.classList.contains("fld")
        ? e.clientX > r.left + r.width / 2
        : e.clientY > r.top + r.height / 2;
      dropMove(state.drag.path, tgt.dataset.row, after);
    }
    state.drag = null;
  });
  $("#doc").addEventListener("dragend", () => {
    clearDropMarks();
    $$("#doc .dragging").forEach(e => e.classList.remove("dragging"));
    state.drag = null;
  });

  // ---- 撤销 / 重做 / 还原 ----
  $("#btn-undo").addEventListener("click", doUndo);
  $("#btn-redo").addEventListener("click", doRedo);
  $("#btn-revert").addEventListener("click", () => {
    if (!state.original) return;
    if (!confirm("放弃所有修改，回到刚导入时的样子？")) return;
    snapshot();                                  // 还原本身也要能撤销，所以不走 loadData
    state.data = clone(state.original);
    applyMetaLayout(state.data.meta || {});      // 版面和主题色一起回去
    applyTheme();
    applyVars();
    paint();
    setTitle();
  });

  // ---- 添加板块 ----
  $("#btn-add-sec").addEventListener("click", () => {
    if (!state.data) return;
    addSection($("#new-sec").value);
  });

  // ---- 版面 ----
  $("#ladder").addEventListener("change", (e) => {
    const i = Number(e.target.value);
    if (i >= 0) { state.vars = { ...LADDER[i] }; applyVars(); }
  });
  for (const k of Object.keys(VARMAP)) {
    $("#sl-" + k).addEventListener("input", (e) => {
      state.vars[k] = Number(e.target.value);
      $("#val-" + k).textContent = e.target.value;
      applyVars();   // 里面会判断当前参数是否还落在某个预设档位上
    });
  }

  // ---- 目标页数 ----
  $("#target-pages").addEventListener("change", (e) => {
    state.targetPages = Number(e.target.value);
    syncMeta();
    measure();
    persist();
  });

  // ---- 主题色 ----
  $("#swatches").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    const p = THEME_PRESETS[b.dataset.theme];
    state.theme = { accent: p.accent, accentDark: p.accentDark, link: p.link };
    applyTheme();
  });
  $("#theme-custom").addEventListener("input", (e) => {
    const hex = e.target.value;
    if (!HEX.test(hex)) return;
    // 深色给标签用，浅一点的给链接用，一个取色就配齐三个
    state.theme = { accent: hex, accentDark: shade(hex, -0.35), link: shade(hex, 0.18) };
    applyTheme();
  });

  // ---- 照片 ----
  $("#photo-file").addEventListener("change", (e) => {
    if (e.target.files[0]) setPhotoFromFile(e.target.files[0]);
  });
  $("#btn-photo-del").addEventListener("click", () => {
    if (!state.data) return;
    snapshot();
    state.data.meta = state.data.meta || {};
    state.data.meta.photo = "";      // 空字符串 = 明确不要，别和「没设置过」混为一谈
    paint();
  });

  // ---- 缩放 ----
  $("#zoom").addEventListener("input", (e) => {
    state.zoomManual = true;
    setZoom(Number(e.target.value) / 100);
  });
  $("#btn-zoom-fit").addEventListener("click", () => { state.zoomManual = false; fitZoom(); });

  // ---- 加粗 ----
  // 按钮一旦拿到焦点，纸上的选区就没了 —— 所以 mousedown 直接拦掉，
  // 焦点留在原地，execCommand 作用的还是刚才划选的那一段。
  $("#btn-bold").addEventListener("mousedown", (e) => e.preventDefault());
  $("#btn-bold").addEventListener("click", applyBold);

  // ---- 导出 ----
  $("#btn-json").addEventListener("click", downloadJson);
  $("#btn-tour").addEventListener("click", () => window.startTour?.());
  $("#btn-print").addEventListener("click", askPrint);
  $("#btn-print-go").addEventListener("click", () => {
    if ($("#skip-tips").checked) localStorage.setItem(LS_TIPS, "1");
    $("#print-tips").close();
    setTimeout(() => window.print(), 60);
  });
  $("#btn-print-cancel").addEventListener("click", () => $("#print-tips").close());

  // ---- 全局快捷键 ----
  document.addEventListener("keydown", onKey);
  document.addEventListener("click", (e) => {
    const opt = e.target.closest(".ico-opt");
    if (opt) {
      const path = $("#icon-pick").dataset.for;
      snapshot();
      pathSet(state.data, path + ".icon", opt.dataset.pick);
      closeIconPicker();
      paint();
      return;
    }
    if (e.target.closest(".ico-all")) {
      snapshot();
      (state.data?.sections || []).forEach(s => { s.icon = NO_ICON; });
      closeIconPicker();
      paint();
      return;
    }
    if (!e.target.closest("#icon-pick")) closeIconPicker();
  });

  // 也要 measure：浏览器缩放（Ctrl+±）会改变 px/cm 的比例，页数和填充率得重算
  window.addEventListener("resize", () => { fitZoom(); measure(); });
  // 拖拽指示线不能被印到纸上（Ctrl+P 的拦截在 onKey 里）
  // 顺便把标题换成「姓名-岗位」，浏览器就拿它当存 PDF 的默认文件名。
  // 挂在 beforeprint 上而不是那个打印按钮里，是为了让浏览器菜单里的
  // 打印、以及系统快捷键那条路也一样管用。
  let titleWas = null;
  window.addEventListener("beforeprint", () => {
    clearDropMarks();
    titleWas = document.title;
    document.title = printFileName();
  });
  window.addEventListener("afterprint", () => {
    if (titleWas !== null) { document.title = titleWas; titleWas = null; }
  });

  // 关页面前提醒把 JSON 存一份。浏览器不让自定义这个对话框的文案，
  // 所以侧栏的「下载改好的 JSON」同时会亮起来，让人知道该点哪里。
  // 只在「改过、而且改完没导出过」时拦 —— 没改过就拦，纯粹是骚扰。
  window.addEventListener("beforeunload", (e) => {
    if (!state.unsaved) return;
    e.preventDefault();
    e.returnValue = "";          // 老浏览器认这个
  });
}

function onKey(e) {
  if (!state.data) return;
  const mod = e.ctrlKey || e.metaKey;
  const inField = document.activeElement?.closest?.(".ed");

  // Esc：收起钉住的按钮，光标也退出来。图标选择器开着就先关它
  if (e.key === "Escape") {
    if (!$("#icon-pick").hidden) { closeIconPicker(); return; }
    markActive(null);
    if (inField) document.activeElement.blur();
    return;
  }

  if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); applyBold(); return; }

  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); downloadJson(); return; }
  if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); askPrint(); return; }

  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
    // 这个字段里还有刚打进去的字 → 交给浏览器逐字撤；
    // 字面已经回到进场时的样子（或者压根没打过字，比如刚点完「＋要点」
    // 光标自动落在新字段里）→ 归我们，撤掉上一步结构性改动
    if (hasNativeUndo(inField)) return;
    e.preventDefault(); doUndo(); return;
  }
  if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
    e.preventDefault(); doRedo(); return;
  }

  // Alt + ↑↓：把光标所在的那一行整体挪位置，拖拽的键盘替代
  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const row = document.activeElement?.closest?.("[data-row]");
    if (!row) return;
    e.preventDefault();
    const path = row.dataset.row;
    const leaf = document.activeElement.dataset.path;
    if (moveItem(path, e.key === "ArrowUp" ? -1 : 1) && leaf) {
      // 行挪走了，路径跟着变，把光标追回到同一个字段上
      const { arrPath, idx } = splitPath(path);
      const to = idx + (e.key === "ArrowUp" ? -1 : 1);
      focusPath(leaf.replace(`${arrPath}.${idx}`, `${arrPath}.${to}`));
    }
  }
}

function askPrint() {
  if (!state.data) return;
  if (localStorage.getItem(LS_TIPS) === "1") { window.print(); return; }
  $("#skip-tips").checked = false;
  $("#print-tips").showModal();
}

/* ============================== 缩放 ============================== */
function setZoom(z) {
  state.zoom = z;
  $("#zoom").value = Math.round(z * 100);
  $("#zoom-val").textContent = Math.round(z * 100) + "%";
  $(".paper").style.transform = `scale(${z})`;
}
/** 让纸张自动缩放到刚好放进可视区。手动调过就不再插手。 */
function fitZoom() {
  const stage = $("#stage");
  if (!stage || stage.hidden || state.zoomManual) return;
  const avail = stage.clientWidth - 48;
  setZoom(clamp(avail / cmToPx(21), 0.4, 1));
}

/* ============================== 启动 ============================== */
window.addEventListener("DOMContentLoaded", () => {
  // 主题色板要先长出来，applyTheme 才有 .swatch 可点亮
  $("#swatches").innerHTML = Object.entries(THEME_PRESETS).map(([k, p]) =>
    `<button class="swatch" data-theme="${k}" title="${p.name}" `
    + `style="background:${p.accent}"></button>`).join("");
  bind();

  // index.html#demo 强制开示例，绕开本地存档，方便发演示链接
  if (location.hash === "#demo" && window.SAMPLE) { loadData(clone(window.SAMPLE)); return; }
  // 恢复上次没改完的
  let restored = false;
  try {
    const d = localStorage.getItem(LS_DATA);
    if (d) {
      const obj = JSON.parse(d);
      loadData(obj);
      restored = true;
      const v = localStorage.getItem(LS_VARS);
      const th = localStorage.getItem(LS_THEME);
      if (v) { state.vars = { ...state.vars, ...JSON.parse(v) }; applyVars(); }
      if (th) { state.theme = { ...state.theme, ...JSON.parse(th) }; applyTheme(); }
      const tp = localStorage.getItem(LS_PAGES);
      if (tp !== null) {
        state.targetPages = Number(tp);
        $("#target-pages").value = tp;
        syncMeta(); measure();
      }
    }
  } catch (e) { /* 存档坏了就当没有 */ restored = false; }
  // 纸上有东西了才谈得上指引；跑没跑过由 tour.js 自己记
  setTimeout(() => { if (state.data) window.maybeStartTour?.(); }, 0);

  // 第一次来的人：直接摆一份填满一页的示例在纸上。空白页看不出这个工具能做什么，
  // 改现成的比从零填快得多。只此一次 —— 记下「来过」，以后不再摆；
  // 用户真动了内容，示例就转正成他自己的存档（见 markDirty / persist）。
  if (!restored && window.SAMPLE) {
    let seen = true;
    try { seen = localStorage.getItem(LS_SEEN) === "1"; } catch (e) { seen = false; }
    if (!seen) {
      loadData(clone(window.SAMPLE), { transient: true });
      try { localStorage.setItem(LS_SEEN, "1"); } catch (e) { /* 存不下就算了 */ }
    }
  }
});

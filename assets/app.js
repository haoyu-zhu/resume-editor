/* ============================================================
   简历微调器 —— 编辑器逻辑
   数据流：resume.json  →  内存里的 state.data  →  渲染
   改字不重渲染（DOM 已经显示对了），只有删条目/换照片才重渲染。
   ============================================================ */

/* ---- 版面档位，与 resume-tailor 的 render.py FIT_LADDER 保持一致 ---- */
const LADDER = [
  { base: 13.5,  leading: 1.14, secAbove: 9,   titleGap: 3.5, secBelow: 5,   item: 3.5, entry: 7.5, photo: 3.05 },
  { base: 12.75, leading: 1.11, secAbove: 8,   titleGap: 3,   secBelow: 4.5, item: 3,   entry: 6.8, photo: 2.95 },
  { base: 12,    leading: 1.08, secAbove: 7,   titleGap: 3,   secBelow: 4,   item: 2.5, entry: 6,   photo: 2.85 },
  { base: 11.5,  leading: 1.06, secAbove: 6,   titleGap: 3,   secBelow: 3.5, item: 2,   entry: 5.5, photo: 2.85 },
  { base: 11,    leading: 1.04, secAbove: 5.5, titleGap: 3,   secBelow: 3,   item: 2,   entry: 5,   photo: 2.85 },
  { base: 10.5,  leading: 1.02, secAbove: 5,   titleGap: 3,   secBelow: 3,   item: 1.8, entry: 4.8, photo: 2.85 },
  { base: 10,    leading: 1.00, secAbove: 5,   titleGap: 3,   secBelow: 3,   item: 1.5, entry: 4.5, photo: 2.85 },
  { base: 9.5,   leading: 0.99, secAbove: 4.5, titleGap: 2.5, secBelow: 2.5, item: 1.2, entry: 4,   photo: 2.75 },
  { base: 9,     leading: 0.98, secAbove: 4,   titleGap: 2.5, secBelow: 2.5, item: 1,   entry: 3.5, photo: 2.6 },
  { base: 8.5,   leading: 0.97, secAbove: 3.5, titleGap: 2,   secBelow: 2,   item: 0.8, entry: 3,   photo: 2.5 },
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
};

const LS_DATA = "resume-editor:data";
const LS_VARS = "resume-editor:vars";

const state = {
  data: null,        // 当前简历 JSON
  original: null,    // 导入时的原样，用于「还原」
  vars: { ...LADDER[3] },
  undo: [],          // 删除操作的快照栈
  zoom: 1,
};

const $ = (s) => document.querySelector(s);
const clone = (o) => JSON.parse(JSON.stringify(o));

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

/* ============================== 渲染 ============================== */
function paint() {
  renderResume(state.data, $("#doc"));
  measure();
  persist();
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
  const keys = Object.keys(VARMAP);
  const hit = LADDER.findIndex(s => keys.every(k => s[k] === state.vars[k]));
  $("#ladder").value = String(hit);
  measure();
  persist();
}

/* ============================== 页数与填充率 ============================== */
function cmToPx(cm) {
  const probe = $("#probe");
  return probe.getBoundingClientRect().width * cm;   // probe 宽度固定 1cm
}
function measure() {
  const doc = $("#doc");
  if (!doc || !state.data) return;
  const usable = cmToPx(29.7 - 0.8 * 2);
  const h = doc.offsetHeight;
  const pages = Math.max(1, Math.ceil(h / usable - 0.001));
  const lastFill = (h - (pages - 1) * usable) / usable;

  const bar = $("#fill-bar"), txt = $("#fill-text"), box = $("#fill");
  bar.style.width = Math.min(100, lastFill * 100).toFixed(0) + "%";
  box.classList.toggle("over", pages > 1);
  box.classList.toggle("thin", pages === 1 && lastFill < 0.8);
  txt.textContent = pages > 1
    ? `超出一页（共 ${pages} 页）· 末页 ${(lastFill * 100).toFixed(0)}%`
    : `1 页 · 占 ${(lastFill * 100).toFixed(0)}%`;
  $("#fill-hint").textContent = pages > 1
    ? "调小字号或间距，或删掉与岗位无关的要点。"
    : (lastFill < 0.8 ? "版面偏空，可以调大字号，或回去把经历写透一点。" : "");
}

/* ============================== 存取 ============================== */
function persist() {
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(state.data));
    localStorage.setItem(LS_VARS, JSON.stringify(state.vars));
  } catch (e) { /* 照片大时可能超配额，忽略 */ }
}

function loadData(obj, { keepVars = false } = {}) {
  state.data = obj;
  state.original = clone(obj);
  state.undo = [];
  if (!keepVars) {
    const fit = (obj.meta && typeof obj.meta.fit === "number") ? obj.meta.fit : 3;
    state.vars = { ...LADDER[Math.min(Math.max(fit, 0), LADDER.length - 1)] };
  }
  $("#empty").hidden = true;
  $("#stage").hidden = false;
  $("#editor-tools").hidden = false;
  applyVars();
  paint();
  fitZoom();
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
      state.data.meta = state.data.meta || {};
      state.data.meta.photo = c.toDataURL("image/jpeg", 0.88);
      paint();
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
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

  // ---- 改字：只写回数据，不重渲染（DOM 已经是对的）----
  let t = null;
  $("#doc").addEventListener("input", (e) => {
    const el = e.target.closest(".ed");
    if (!el) return;
    pathSet(state.data, el.dataset.path, el.textContent);
    clearTimeout(t);
    t = setTimeout(() => { measure(); persist(); }, 250);
  });
  // 回车不该在简历里造出换行
  $("#doc").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest(".ed")) e.preventDefault();
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

  // ---- 删除 / 改链接 ----
  $("#doc").addEventListener("click", (e) => {
    const del = e.target.closest(".ctl-del");
    if (del) {
      state.undo.push(clone(state.data));
      if (state.undo.length > 30) state.undo.shift();
      pathDelete(state.data, del.dataset.del);
      paint();
      $("#btn-undo").disabled = false;
      return;
    }
    const link = e.target.closest(".ctl-link");
    if (link) {
      const cur = pathGet(state.data, link.dataset.url) || "";
      const next = prompt("链接地址：", cur);
      if (next !== null) { pathSet(state.data, link.dataset.url, next.trim()); paint(); }
    }
  });
  $("#btn-undo").addEventListener("click", () => {
    if (!state.undo.length) return;
    state.data = state.undo.pop();
    paint();
    $("#btn-undo").disabled = !state.undo.length;
  });
  $("#btn-revert").addEventListener("click", () => {
    if (!state.original) return;
    if (!confirm("放弃所有修改，回到刚导入时的样子？")) return;
    state.undo.push(clone(state.data));
    state.data = clone(state.original);
    paint();
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

  // ---- 照片 ----
  $("#photo-file").addEventListener("change", (e) => {
    if (e.target.files[0]) setPhotoFromFile(e.target.files[0]);
  });
  $("#btn-photo-del").addEventListener("click", () => {
    if (!state.data) return;
    state.undo.push(clone(state.data));
    state.data.meta = state.data.meta || {};
    state.data.meta.photo = null;
    paint();
  });

  // ---- 缩放 ----
  $("#zoom").addEventListener("input", (e) => {
    state.zoom = Number(e.target.value) / 100;
    $("#zoom-val").textContent = e.target.value + "%";
    $(".paper").style.transform = `scale(${state.zoom})`;
  });

  // ---- 导出 ----
  $("#btn-json").addEventListener("click", () => {
    const name = (state.data.basics?.name || "resume") + ".json";
    const blob = new Blob([JSON.stringify(state.data, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#btn-print").addEventListener("click", () => { $("#print-tips").showModal(); });
  $("#btn-print-go").addEventListener("click", () => {
    $("#print-tips").close();
    setTimeout(() => window.print(), 60);
  });

  window.addEventListener("resize", fitZoom);
}

/** 让纸张自动缩放到刚好放进可视区 */
function fitZoom() {
  const stage = $("#stage");
  if (!stage || stage.hidden) return;
  const avail = stage.clientWidth - 48;
  const paperW = cmToPx(21);
  const z = Math.max(0.4, Math.min(1, avail / paperW));
  state.zoom = z;
  $("#zoom").value = Math.round(z * 100);
  $("#zoom-val").textContent = Math.round(z * 100) + "%";
  $(".paper").style.transform = `scale(${z})`;
}

/* ============================== 启动 ============================== */
window.addEventListener("DOMContentLoaded", () => {
  bind();
  // index.html#demo 直接开示例，方便发演示链接
  if (location.hash === "#demo" && window.SAMPLE) { loadData(clone(window.SAMPLE)); return; }
  // 恢复上次没改完的
  try {
    const d = localStorage.getItem(LS_DATA);
    const v = localStorage.getItem(LS_VARS);
    if (d) {
      loadData(JSON.parse(d));
      if (v) { state.vars = JSON.parse(v); applyVars(); }
      $("#restored").hidden = false;
    }
  } catch (e) { /* 存档坏了就当没有 */ }
});

/* ============================================================
   resume.json -> DOM
   结构必须和 resume-tailor skill 的 templates/resume.html.j2 一一对应，
   否则网页上改出来的版面和 skill 直接生成的 PDF 会对不上。

   两条约定：
   - 可编辑的叶子节点带 class="ed" + data-path="到 JSON 的路径"
   - 可删除的整行带 data-del="到 JSON 的路径"
   ============================================================ */

const ICONS = {
  edu: '<svg viewBox="0 0 100 76" fill="none"><polygon points="0,28 50,6 100,28 50,50" fill="rgb(28,90,180)"/><line x1="50" y1="50" x2="50" y2="72" stroke="rgb(28,90,180)" stroke-width="5"/><rect x="28" y="42" width="44" height="20" fill="rgb(28,90,180)"/></svg>',
  star: '<svg viewBox="0 0 100 95"><polygon points="50,2 62.8,32.4 95.7,35.2 70.7,56.7 78.2,88.8 50,71.8 21.8,88.8 29.3,56.7 4.3,35.2 37.2,32.4" fill="rgb(28,90,180)"/></svg>',
  job: '<svg viewBox="0 0 100 72" fill="none" stroke="rgb(28,90,180)" stroke-width="5"><rect x="2.5" y="24.5" width="95" height="45" rx="4"/><polyline points="32,24 32,10 68,10 68,24"/><line x1="2" y1="45" x2="98" y2="45"/></svg>',
  research: '<svg viewBox="0 0 100 95" fill="none" stroke="rgb(28,90,180)" stroke-width="5"><circle cx="35" cy="35" r="32"/><line x1="58" y1="58" x2="95" y2="90" stroke-width="7"/></svg>',
  folder: '<svg viewBox="0 0 100 70"><polygon points="0,35 0,22 38,22 46,35" fill="rgb(28,90,180)"/><rect x="0" y="33" width="100" height="35" fill="rgb(28,90,180)"/></svg>',
  flag: '<svg viewBox="0 0 78 76" fill="none"><line x1="2.5" y1="4" x2="2.5" y2="73" stroke="rgb(28,90,180)" stroke-width="5"/><polygon points="2.5,6 75,18 2.5,34" fill="rgb(28,90,180)"/></svg>',
  note: '<svg viewBox="0 0 100 72" fill="none" stroke="rgb(28,90,180)" stroke-width="5"><rect x="2.5" y="14.5" width="95" height="54" rx="4"/><line x1="15" y1="32" x2="85" y2="32"/><line x1="15" y1="52" x2="65" y2="52"/></svg>',
  _default: '<svg viewBox="0 0 100 95"><circle cx="50" cy="48" r="30" fill="rgb(28,90,180)"/></svg>',
};

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/** 可编辑叶子。tag 传 "a" 就渲染成链接 */
const ed = (path, value, tag = "span", attrs = "") =>
  `<${tag} class="ed" contenteditable="true" data-path="${esc(path)}"${attrs}>`
  + `${esc(value)}</${tag}>`;

/** 可编辑的链接叶子 */
const edLink = (path, value, url) =>
  ed(path, value, "a", ` href="${esc(url)}"`);

/** 行级操作按钮：删除 / 改链接。绝对定位，不参与布局，打印时隐藏 */
function ctl(delPath, label, urlPath) {
  let b = `<span class="ctl" contenteditable="false">`;
  if (urlPath) {
    b += `<button class="ctl-btn ctl-link" data-url="${esc(urlPath)}" title="修改链接地址">🔗</button>`;
  }
  b += `<button class="ctl-btn ctl-del" data-del="${esc(delPath)}" title="删除${label}">✕</button>`;
  return b + `</span>`;
}

/** 顶部信息区的一个字段：标签 + 值（值可能是链接） */
function field(line, i, j, f) {
  const base = `basics.lines.${i}.${j}`;
  const val = f.url
    ? edLink(base + ".value", f.value, f.url)
    : (f.strong ? `<span class="b">${ed(base + ".value", f.value)}</span>`
                : ed(base + ".value", f.value));
  return `<span class="fld">`
    + `<span class="lab">${ed(base + ".label", f.label)}：</span>${val}`
    + ctl(base, "这个字段", f.url ? base + ".url" : null)
    + `</span>`;
}

function header(data) {
  const b = data.basics || {};
  const photo = (data.meta || {}).photo;
  let h = `<div class="header">`;
  if (photo) h += `<div class="photo"><img src="${esc(photo)}" alt=""></div>`;
  h += `<div class="info"><div class="name ed" contenteditable="true" data-path="basics.name">${esc(b.name)}</div>`;
  (b.lines || []).forEach((line, i) => {
    h += `<div class="idline">`;
    line.forEach((f, j) => {
      if (j) h += `<span class="sep"></span>`;
      h += field(line, i, j, f);
    });
    h += `</div>`;
  });
  return h + `</div></div>`;
}

function bullet(b, p) {
  let inner = "";
  if (b.label) inner += `<span class="lab">${ed(p + ".label", b.label)}：</span>`;
  inner += b.url
    ? edLink(p + ".text", b.text ?? b.url, b.url)
    : ed(p + ".text", b.text);
  return `<div class="bullet"><span class="sq"></span>${inner}`
    + ctl(p, "这条要点", b.url ? p + ".url" : null) + `</div>`;
}

function section(s, i) {
  const p = `sections.${i}`;
  let h = `<div class="sec">`
    + `<div class="sec-title">${ICONS[s.icon] || ICONS._default}`
    + `<span class="ed" contenteditable="true" data-path="${p}.title">${esc(s.title)}</span>`
    + ctl(p, "整个板块") + `</div>`
    + `<div class="sec-rule"></div>`;

  if (s.type === "education") {
    (s.items || []).forEach((it, j) => {
      const q = `${p}.items.${j}`;
      h += `<div class="row3 edu">`
        + `<span class="l"><span class="b">${ed(q + ".org", it.org)}</span>`
        + (it.tag ? ` <span class="gray small">${ed(q + ".tag", it.tag)}</span>` : ``)
        + `</span>`
        + `<span class="c"><span class="b">${ed(q + ".major", it.major)}</span>`
        + (it.degree ? `（${ed(q + ".degree", it.degree)}）` : ``)
        + `</span>`
        + `<span class="r gray small">${ed(q + ".date", it.date)}</span>`
        + ctl(q, "这一行") + `</div>`;
    });
    (s.notes || []).forEach((n, j) => {
      const q = `${p}.notes.${j}`;
      h += `<div class="note"><span class="lab">${ed(q + ".label", n.label)}：</span>`
        + ed(q + ".value", n.value) + ctl(q, "这一行") + `</div>`;
    });

  } else if (s.type === "skills") {
    (s.lines || []).forEach((l, j) => {
      const q = `${p}.lines.${j}`;
      h += `<div class="skill"><span class="lab">${ed(q + ".label", l.label)}：</span>`
        + `<span class="val">${ed(q + ".value", l.value)}</span>`
        + ctl(q, "这一行") + `</div>`;
    });

  } else if (s.type === "campus") {
    (s.items || []).forEach((it, j) => {
      const q = `${p}.items.${j}`;
      h += `<div class="row3">`
        + `<span class="l b">${ed(q + ".org", it.org)}</span>`
        + `<span class="c b">${ed(q + ".role", it.role)}</span>`
        + `<span class="r gray small">${ed(q + ".date", it.date)}</span>`
        + ctl(q, "这一行") + `</div>`;
    });

  } else { // entries：实习 / 工作 / 项目 / 科研 / 竞赛
    (s.items || []).forEach((it, j) => {
      const q = `${p}.items.${j}`;
      h += `<div class="entry"><div class="entry-head">`
        + `<span class="org">${ed(q + ".org", it.org)}</span>`
        + (it.role ? `<span class="role">${ed(q + ".role", it.role)}</span>` : ``)
        + `<span class="date gray small">${ed(q + ".date", it.date)}</span>`
        + ctl(q, "整段经历") + `</div>`;
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

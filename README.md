# 简历微调器

一个**纯静态**的网页，用来微调已经排好版的一页纸简历：直接在纸面上改字、拖滑块调松紧、删掉不要的条目，然后打印成 PDF。

配套 `resume-tailor`（按岗位改简历的工具）使用：那边产出 `resume.json`，这里负责后续的手动微调。两者是分开的，这个网页不依赖它也能用——只要 JSON 符合下面的格式。

**所有数据只在浏览器本地，不上传任何服务器。**

---

## 部署到 GitHub Pages

```bash
cd resume-editor
git init -b main
git add .
git commit -m "简历微调器"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在仓库页面 **Settings → Pages → Build and deployment**：
- Source 选 **Deploy from a branch**
- Branch 选 **main**，目录选 **/ (root)**

一两分钟后就能访问 `https://<你的用户名>.github.io/<仓库名>/`。

演示链接（自动载入示例简历）：`https://<你的用户名>.github.io/<仓库名>/#demo`

> 没有构建步骤，仓库里是什么就serve什么。改完 push 一下就生效。

---

## 给同学的用法

1. 打开网页，把 `resume.json` 拖进去（或点「选择 resume.json」）。
2. **改字**：直接点纸上的文字改，和改文档一样。回车被禁用了——简历的一格里不该有换行。
3. **删条目**：鼠标移到某一行，右边会冒出 `✕`。删错了点左边的「撤销删除」。
4. **调版面**：左边的滑块。上面的「版面占用」实时告诉你现在是几页、占了多少：
   - 蓝色 = 一页，且排得饱满
   - 橙色 = 一页但下半张偏空，可以调大字号，或者回去把经历写透一点
   - 红色 = 超出一页了，得调紧或者删内容
5. **出 PDF**：点「打印 / 存成 PDF」，按弹窗里的三条设置好，另存为 PDF。
6. 想留着下次接着改，点「下载改好的 JSON」。

浏览器会自动记住你改到一半的内容，关掉再打开还在。

### 打印时必须确认的三件事

在浏览器的打印对话框里：

| 设置 | 要选 | 不改会怎样 |
|---|---|---|
| 页眉和页脚 | **关掉** | 纸上印出网址和日期 |
| 背景图形 | **勾上** | 蓝色横线和图标全部消失 |
| 纸张 / 边距 | A4 / 默认 | 页边距对不上 |

---

## resume.json 格式

```json
{
  "meta": { "target_title": "数据分析师", "photo": "data:image/jpeg;base64,...", "fit": 3 },
  "basics": {
    "name": "张明",
    "lines": [
      [{"label":"电话","value":"138..."}, {"label":"邮箱","value":"..."}],
      [{"label":"求职意向","value":"数据分析师","strong":true}],
      [{"label":"GitHub","value":"https://...","url":"https://..."}]
    ]
  },
  "sections": [ ... ]
}
```

- `meta.photo`：**必须是 data URI 或 null**，不能是本地文件路径（浏览器读不到）。
  没有照片也没关系，网页里可以「换一张」上传，会自动缩到 420px 宽。
- `meta.fit`：打开时用第几档版面预设（0 最松，9 最紧）。可省略，默认 3。
- `sections[].type` 只有四种：
  - `education` — 教育经历（`items[]` + 可选 `notes[]`）
  - `skills` — 任何「标签：内容」的板块，技能、自我总结都用它（`lines[]`）
  - `entries` — 实习、工作、项目、科研、竞赛（`items[]`，每项带 `bullets[]`）
  - `campus` — 一行一条的校园经历（`items[]`）
- `sections[].icon`：`edu` `star` `job` `folder` `research` `flag` `note`

完整字段说明见 `resume-tailor` 的 `references/schema.md`。

---

## 文件

```
index.html          页面结构
assets/resume.css   简历版面样式（与 resume-tailor 的模板同源，改这里那边也要改）
assets/style.css    编辑器界面样式（打印时全部隐藏）
assets/render.js    JSON -> DOM
assets/app.js       编辑逻辑：改字回写、删除、撤销、版面变量、导出
assets/sample.js    示例简历（虚构数据）
```

## 已知限制

- **字体**：设计基准是 Noto Sans SC，同学电脑上没有的话会退到微软雅黑 / 苹方，
  字宽略有差别，可能让原本一页的内容溢出一点点。左边的「版面占用」会实时提示，按提示调即可。
- **只能改字、调版面、删条目**。新增经历、调整顺序请回到 `resume-tailor` 重新生成
  ——那类改动需要重跑岗位匹配，不是排版问题。
- **本地双击打开**（`file://`）也能用，但浏览器会禁掉 localStorage，
  所以**不会自动保存**。正常用 GitHub Pages 的网址访问就没这个问题。
- 打印分页由浏览器决定，「版面占用」是估算，极端情况下可能差一两行。

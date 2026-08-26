/* 示例简历（虚构人物、虚构数据，仅用于演示界面）
   做成 js 常量而不是 sample.json，是为了本地双击 index.html 打开时也能用 ——
   file:// 协议下 fetch 会被 CORS 拦掉。 */
window.SAMPLE = {
  "meta": { "target_title": "数据分析师", "photo": null, "playbook": "data", "fit": 3 },
  "basics": {
    "name": "张明（示例）",
    "lines": [
      [{ "label": "电话", "value": "138****0000" },
       { "label": "邮箱", "value": "zhangming@example.com" },
       { "label": "住址", "value": "浙江杭州" }],
      [{ "label": "毕业院校", "value": "示例大学" },
       { "label": "学历", "value": "本科" },
       { "label": "毕业时间", "value": "2027.6" },
       { "label": "求职意向", "value": "数据分析师", "strong": true }],
      [{ "label": "GitHub", "value": "https://github.com/example", "url": "https://github.com/example" }]
    ]
  },
  "sections": [
    { "type": "education", "icon": "edu", "title": "教育经历",
      "items": [
        { "date": "2023.9 - 2027.6", "org": "示例大学", "tag": "211", "major": "统计学", "degree": "本科" }
      ],
      "notes": [
        { "label": "GPA", "value": "3.7/4.0（专业排名 8/92）" },
        { "label": "主修课程", "value": "概率论、数理统计、回归分析、数据库原理、机器学习。" }
      ] },

    { "type": "skills", "icon": "star", "title": "个人技能",
      "lines": [
        { "label": "分析", "value": "SQL（窗口函数、性能调优），Python（pandas / scikit-learn），AB 实验设计，漏斗与归因分析。" },
        { "label": "工具", "value": "Tableau，Power BI，Excel（数据透视、Power Query），Git。" },
        { "label": "语言", "value": "英语 CET-6（562）。" }
      ] },

    { "type": "entries", "icon": "job", "title": "实习经历",
      "items": [
        { "date": "2026.6 - 2026.9", "org": "某电商平台", "role": "数据分析实习生",
          "bullets": [
            { "label": "流失归因", "text": "拆解新用户注册漏斗，定位到实名认证环节流失占比 47%，推动表单字段从 9 个精简到 5 个，次周注册转化率从 31% 提升到 39%。" },
            { "label": "报表自动化", "text": "用 Python + SQL 重写 6 张日报，把每天 2 小时的手工取数压缩到 10 分钟自动跑批，被组内 4 人日常使用。" },
            { "text": "参与 3 次 AB 实验的指标设计与结果复盘，其中 2 次结论被采纳并全量上线。" }
          ] }
      ] },

    { "type": "entries", "icon": "folder", "title": "项目经历",
      "items": [
        { "date": "2026.3 - 2026.5", "org": "校园二手交易平台用户行为分析", "role": "个人项目",
          "bullets": [
            { "label": "项目链接", "url": "https://github.com/example/campus-analysis", "text": "https://github.com/example/campus-analysis" },
            { "label": "数据", "text": "抓取并清洗 3.2 万条商品发布与成交记录，构建用户—商品—时间三维分析表。" },
            { "label": "结论", "text": "发现开学前两周成交量是平时的 2.8 倍，据此给平台运营提出错峰推广建议，被采纳为迎新季活动方案。" }
          ] }
      ] },

    { "type": "campus", "icon": "flag", "title": "校园经历",
      "items": [
        { "date": "2024.9 - 2025.6", "org": "校统计学社", "role": "数据组组长" }
      ] },

    { "type": "skills", "icon": "note", "title": "自我总结",
      "lines": [
        { "label": "自我评价", "value": "对数字敏感，习惯把问题拆到能被验证的粒度；做完分析一定追到「结论有没有被用上」这一步。" },
        { "label": "爱好", "value": "长跑，摄影，看行业数据报告。" }
      ] }
  ]
};

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""简历生成器 —— 埋点数据报表

用法：
    python analytics/report.py            # 最近 30 天
    python analytics/report.py --days 7
    python analytics/report.py --days 90 --raw   # 顺便打印明细

靠 npx wrangler 读 D1，所以得先 `npx wrangler login`。

取数策略是「一次把窗口内的行全捞回来，在本地聚合」，不是写十几条
GROUP BY 下推到 D1。理由：这个量级（一天几百到几千行）本地算毫无压力，
而口径改起来只用动 Python，不用每次重新对 SQL —— 指标定义变动远比数据量增长频繁。
真到了一天几十万行再谈下推不迟。
"""

import argparse
import json
import subprocess
import sys
import time
from collections import Counter, defaultdict

DB = "resume-editor-analytics"

# 「打开了」但没干别的，和「真做出了简历」之间隔着这两个动作
OUTCOME_EVENTS = ("print", "download")

SOURCE_CN = {
    "first":   "第一次来（自动摆示例）",
    "empty":   "回头客·空白页",
    "restore": "恢复草稿",
    "blank":   "手动新建空白",
    "sample":  "手动载入示例",
    "json":    "导入 JSON 文件",
    "paste":   "粘贴 JSON",
    "demo":    "#demo 演示链接",
    "other":   "未知（前端加了新来源却没同步 Worker 白名单）",
}


def d1(sql):
    """跑一条只读 SQL，返回行的 list。

    wrangler 会在 JSON 前面打一堆横幅和颜色码，所以从第一个 '[' 开始切。
    """
    out = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
        capture_output=True, text=True, encoding="utf-8", errors="replace", shell=True,
    )
    text = out.stdout or ""
    i = text.find("[")
    if i < 0:
        sys.exit("读 D1 失败：\n" + (out.stderr or text)[-2000:])
    try:
        return json.loads(text[i:])[0]["results"]
    except Exception as e:
        sys.exit("解析 wrangler 输出失败：%s\n%s" % (e, text[-2000:]))


def pct(a, b):
    return "—" if not b else "%.1f%%" % (100.0 * a / b)


def fmt_dur(secs):
    secs = int(round(secs))
    if secs < 60:
        return "%d 秒" % secs
    return "%d 分 %02d 秒" % (secs // 60, secs % 60)


def quantile(sorted_vals, q):
    """线性插值分位数。样本少的时候 numpy 都懒得装，自己算两行就够。"""
    if not sorted_vals:
        return 0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = q * (len(sorted_vals) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def bar(n, top, width=28):
    return "█" * max(1, int(round(width * n / top))) if n and top else ""


def table(title, counter, total, note=None):
    print("\n## %s" % title)
    if note:
        print("   %s" % note)
    if not counter:
        print("   （无数据）")
        return
    top = max(counter.values())
    for k, n in counter.most_common():
        print("   %-34s %6d  %7s  %s" % (k, n, pct(n, total), bar(n, top)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--raw", action="store_true", help="附带打印原始行")
    args = ap.parse_args()

    since = int(time.time()) - args.days * 86400
    rows = d1("SELECT * FROM events WHERE ts >= %d ORDER BY id" % since)

    print("=" * 66)
    print(" 简历生成器 · 使用统计    最近 %d 天    共 %d 条事件" % (args.days, len(rows)))
    print("=" * 66)
    if not rows:
        print("\n窗口内没有数据。")
        return

    # ---- 按会话归并。sid 关掉标签页就失效，所以一个 sid ≈ 一次访问，不是一个人 ----
    sessions = defaultdict(lambda: {"events": set(), "dwell": 0, "pages": 0, "secs": 0,
                                    "source": "", "device": "", "country": "", "ref": ""})
    events = Counter()
    for r in rows:
        events[r["event"]] += 1
        s = sessions[r["sid"] or ("anon-%d" % r["id"])]
        s["events"].add(r["event"])
        s["dwell"] += r["dwell_s"] or 0
        # 版面规模取这次访问里见过的最大值 —— 中途删到 0 页不代表他没做出东西
        s["pages"] = max(s["pages"], r["pages"] or 0)
        s["secs"] = max(s["secs"], r["secs"] or 0)
        if r["event"] == "open" and r["source"]:
            s["source"] = r["source"]
        s["device"] = r["device"] or s["device"]
        s["country"] = r["country"] or s["country"]
        if r["ref"]:
            s["ref"] = r["ref"]

    n_sess = len(sessions)
    printed = sum(1 for s in sessions.values() if "print" in s["events"])
    downloaded = sum(1 for s in sessions.values() if "download" in s["events"])
    produced = sum(1 for s in sessions.values() if s["events"] & set(OUTCOME_EVENTS))

    print("\n## 核心")
    print("   访问次数（按会话）          %6d" % n_sess)
    print("   其中打印了简历              %6d   %s   ← 北极星" % (printed, pct(printed, n_sess)))
    print("   其中下载了 JSON             %6d   %s" % (downloaded, pct(downloaded, n_sess)))
    print("   打印或下载（有产出）        %6d   %s" % (produced, pct(produced, n_sess)))
    days = max(1, args.days)
    print("   日均访问                    %8.1f" % (n_sess / float(days)))

    # ---- 停留时长。均值会被少数超长会话拉飞，所以主看中位数 ----
    dwells = sorted(s["dwell"] for s in sessions.values() if s["dwell"] > 0)
    print("\n## 停留时长（只算标签页可见的时间）")
    if dwells:
        print("   有时长记录的会话            %6d   %s" % (len(dwells), pct(len(dwells), n_sess)))
        print("   中位数                      %10s" % fmt_dur(quantile(dwells, 0.5)))
        print("   25 / 75 / 90 分位           %s / %s / %s"
              % (fmt_dur(quantile(dwells, 0.25)), fmt_dur(quantile(dwells, 0.75)),
                 fmt_dur(quantile(dwells, 0.90))))
        print("   最长                        %10s" % fmt_dur(dwells[-1]))
        print("   （不足 2 秒的会话前端不上报，所以这里天然不含误点）")
    else:
        print("   （还没有 leave 事件）")

    pr_d = sorted(s["dwell"] for s in sessions.values() if "print" in s["events"] and s["dwell"] > 0)
    no_d = sorted(s["dwell"] for s in sessions.values() if "print" not in s["events"] and s["dwell"] > 0)
    if pr_d and no_d:
        print("   打印了的人  中位停留        %10s" % fmt_dur(quantile(pr_d, 0.5)))
        print("   没打印的人  中位停留        %10s" % fmt_dur(quantile(no_d, 0.5)))

    # ---- 分布 ----
    table("打开方式", Counter(SOURCE_CN.get(s["source"], s["source"] or "（没报 open）")
                              for s in sessions.values()), n_sess)
    table("设备", Counter(s["device"] or "?" for s in sessions.values()), n_sess,
          note="mobile 的判定是视口 ≤820px，跟 style.css 的窄屏断点同一条线")
    table("地区", Counter(s["country"] or "?" for s in sessions.values()), n_sess)

    refs = Counter(s["ref"] for s in sessions.values() if s["ref"])
    table("来路域名", refs, n_sess,
          note="没有来路的是直接输网址 / 收藏夹 / 从 App 里点开，占 %s"
               % pct(n_sess - sum(refs.values()), n_sess))

    made = [s for s in sessions.values() if s["pages"] > 0]
    if made:
        table("做出来的简历有几页", Counter("%d 页" % s["pages"] for s in made), len(made))
        secs = sorted(s["secs"] for s in made)
        print("\n## 板块数量")
        print("   中位 %d 个，25/75 分位 %d / %d 个"
              % (quantile(secs, 0.5), quantile(secs, 0.25), quantile(secs, 0.75)))

    # ---- 新手指引 ----
    done = events.get("tour_done", 0)
    skip = events.get("tour_skip", 0)
    print("\n## 新手指引")
    if done + skip:
        print("   走完 %d，中途退出 %d，完成率 %s" % (done, skip, pct(done, done + skip)))
    else:
        print("   （窗口内没人触发过指引）")

    print("\n## 事件计数")
    for k, n in events.most_common():
        print("   %-12s %6d" % (k, n))

    if args.raw:
        print("\n## 明细")
        for r in rows:
            print("   " + json.dumps(r, ensure_ascii=False))

    print()


if __name__ == "__main__":
    main()

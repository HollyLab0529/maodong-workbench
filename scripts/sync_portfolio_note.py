#!/usr/bin/env python3
"""把《作品集同步信息.md》底稿里的修改日志同步进猫冬手帐的「作品集更新日志」随笔记。

用法：
    python3 workbench/scripts/sync_portfolio_note.py

行为：
  1. 解析 个人网站/作品集同步信息.md 的「## 二 · 修改日志（倒序）」区块
  2. 生成纯文本正文（最新日期在最上面，保留最近 MAX_DAYS 个日期块）
  3. 在随笔记里按标题查找该笔记：没有就新建，有就整篇覆盖（幂等，可反复跑）

令牌：优先环境变量 WORKBENCH_TOKEN，其次 workbench/.workbench-token 文件（已 gitignore）。
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("WORKBENCH_BASE", "https://workbench.hollylab.cloud").rstrip("/")
NOTE_TITLE = "作品集更新日志"
NOTE_TAGS = "作品集, 改动日志"
MAX_DAYS = int(os.environ.get("PORTFOLIO_NOTE_DAYS", "10"))
# 单条摘要在笔记里最多保留多少字（底稿保留全文，这里是速览用）
CLIP = int(os.environ.get("PORTFOLIO_NOTE_CLIP", "120"))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # workbench/
DOC = os.path.join(os.path.dirname(ROOT), "作品集同步信息.md")
TOKEN_FILE = os.path.join(ROOT, ".workbench-token")
FEISHU_URL = "https://aorv0fwlrd.feishu.cn/wiki/Iy2hwZnVCilUkRkqUxzcog62nGg"


def token():
    t = os.environ.get("WORKBENCH_TOKEN", "").strip()
    if t:
        return t
    if os.path.exists(TOKEN_FILE):
        return open(TOKEN_FILE, encoding="utf-8").read().strip()
    sys.exit("缺少令牌：设 WORKBENCH_TOKEN 或写入 workbench/.workbench-token")


def api(method, path, payload=None):
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token())
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode()
            return json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} 失败 {e.code}: {e.read().decode()[:300]}")


def plain(line):
    """把底稿里的 markdown 行压成纯文本。"""
    s = line.strip()
    s = re.sub(r"^\s*(?:\d+\.|[-*+])\s+", "", s)          # 列表序号/符号
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)          # [文本](url) → 文本
    s = s.replace("**", "").replace("`", "")                # 粗体/行内代码
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def parse_log():
    """返回 [(date, [entry, ...]), ...]，按底稿顺序（最新在前）。"""
    text = open(DOC, encoding="utf-8").read()
    m = re.search(r"^## 二 · 修改日志.*?$(.*?)(?=^## )", text, re.M | re.S)
    if not m:
        sys.exit("底稿里没找到「## 二 · 修改日志」区块")
    blocks, cur = [], None
    for raw in m.group(1).splitlines():
        h = re.match(r"^###\s+(\d{4}-\d{2}-\d{2})\s*$", raw)
        if h:
            cur = (h.group(1), [])
            blocks.append(cur)
            continue
        if cur is None or not raw.strip():
            continue
        entry = plain(raw)
        if entry:
            if CLIP and len(entry) > CLIP:
                entry = entry[:CLIP].rstrip("，。；、 ") + "…"
            cur[1].append(entry)
    return blocks


def build_content(blocks):
    head = [
        "自动同步自《作品集同步信息》底稿，请勿在此手改（改底稿后重跑同步脚本）。",
        f"飞书底稿：{FEISHU_URL}",
        "",
    ]
    body = []
    for date, entries in blocks[:MAX_DAYS]:
        if not entries:
            continue
        body.append(f"【{date}】")
        body.extend(f"· {e}" for e in entries)
        body.append("")
    if len(blocks) > MAX_DAYS:
        body.append(f"（更早 {len(blocks) - MAX_DAYS} 天记录见飞书底稿）")
    return "\n".join(head + body).rstrip()


def find_note():
    q = urllib.parse.quote("quick_notes")
    data = api("GET", f"/api/data/{q}")
    rows = data.get("rows", data) if isinstance(data, dict) else data
    for r in rows:
        if (r.get("title") or "").strip() == NOTE_TITLE:
            return r
    return None


def main():
    blocks = parse_log()
    if not blocks:
        sys.exit("底稿修改日志为空，未同步")
    content = build_content(blocks)
    note = find_note()
    payload = {
        "ntype": "改动日志",
        "title": NOTE_TITLE,
        "tags": NOTE_TAGS,
        "content": json.dumps({"content": content}, ensure_ascii=False),
        "promoted": False,
    }
    if note:
        api("PATCH", f"/api/data/quick_notes/{note['id']}", payload)
        action = "已更新"
    else:
        api("POST", "/api/data/quick_notes", payload)
        action = "已新建"
    print(f"{action}随笔记「{NOTE_TITLE}」：{len(blocks[:MAX_DAYS])} 个日期块，{len(content)} 字")


if __name__ == "__main__":
    main()

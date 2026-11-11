#!/usr/bin/env python3
"""把本地简历目录全量同步进工作台「简历库」（resumes 集合）。

约定：
- 本地真源：简历+面试/01_投递用简历/ 下的 .docx / .pdf
- 匹配规则：(简历名, 扩展名) —— 同一份简历的 docx 与 pdf 是两条独立记录
- 只更新已存在的记录（不新增、不删除），file_url / content / note 以本地为准
- in_use 原样保留（注意 DB 里存的是 "0"/"1" 字符串，不能直接 bool()）

用法：
    python3 workbench/scripts/sync_resumes.py            # 实际同步
    python3 workbench/scripts/sync_resumes.py --dry-run  # 只打印计划
    python3 workbench/scripts/sync_resumes.py --folders-only  # 只按本地目录回填文件夹字段

鉴权：读 workbench/.workbench-token（旧版助手令牌）。/api/upload 走 requireAuth，
只认它，wb_ 版 API 令牌传不上去。
"""
import io
import json
import mimetypes
import os
import re
import sys
import urllib.request
import uuid
import zipfile

BASE = os.environ.get("WORKBENCH_BASE") or "http://localhost:3031"
HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(HERE, "..", ".workbench-token")
ROOT_FILE = os.path.join(HERE, "..", ".resume-root")
BASE_FILE = os.path.join(HERE, "..", ".sync-base")
DRY = "--dry-run" in sys.argv
FOLDERS_ONLY = "--folders-only" in sys.argv


def local_setting(path, default=""):
    """读本地配置文件（不入库），用于放真实域名/路径。"""
    if os.path.exists(path):
        val = open(path, encoding="utf-8").read().strip()
        if val:
            return val
    return default


BASE = os.environ.get("WORKBENCH_BASE") or local_setting(BASE_FILE, BASE)


def resume_root():
    """简历目录：优先环境变量，其次本地文件 .resume-root（均不入库）。"""
    env = os.environ.get("RESUME_ROOT")
    if env and os.path.isdir(env):
        return env
    if os.path.exists(ROOT_FILE):
        path = open(ROOT_FILE, encoding="utf-8").read().strip()
        if path and os.path.isdir(path):
            return path
    print("❌ 未找到简历目录：请设置环境变量 RESUME_ROOT，"
          f"或在 {ROOT_FILE} 写入简历目录的绝对路径")
    sys.exit(1)


def token():
    with open(TOKEN_FILE) as f:
        return f.read().strip()


def api(path, data=None, method="GET"):
    h = {"Authorization": "Bearer " + token()}
    body = None
    if data is not None:
        h["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    req = urllib.request.Request(BASE + path, data=body, headers=h, method=method)
    return json.load(urllib.request.urlopen(req, timeout=60))


def upload(path):
    name = os.path.basename(path)
    ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    bd = "----wb" + uuid.uuid4().hex
    payload = b"".join([
        f"--{bd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
        f"Content-Type: {ctype}\r\n\r\n".encode(),
        open(path, "rb").read(),
        f"\r\n--{bd}--\r\n".encode(),
    ])
    req = urllib.request.Request(
        BASE + "/api/upload",
        data=payload,
        headers={"Authorization": "Bearer " + token(),
                 "Content-Type": f"multipart/form-data; boundary={bd}"},
        method="POST",
    )
    return json.load(urllib.request.urlopen(req, timeout=180))["url"]


def text_of_docx(blob):
    """docx → 纯文本（word/document.xml 去标签），用于 content 字段的检索与预览。"""
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        xml = z.read("word/document.xml").decode("utf8", "ignore")
    xml = xml.replace("</w:p>", "\n").replace("</w:tc>", "  ")
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"<[^>]+>", "", xml)).strip()


def truthy(v):
    return v in (True, 1, "1", "true")


def main():
    root = resume_root()
    rows = api("/api/data/resumes").get("rows", [])
    index = {}
    for r in rows:
        ext = os.path.splitext(r.get("file_url") or "")[1].lower()
        index[(r.get("name"), ext)] = r
    print(f"线上 {len(rows)} 条，本地 {root}")

    files = []
    for dirpath, _, names in os.walk(root):
        for n in names:
            if n.lower().endswith((".docx", ".pdf")) and not n.startswith("."):
                files.append(os.path.join(dirpath, n))
    files.sort()

    done, missing, failed = 0, [], []
    for f in files:
        rel = os.path.relpath(f, root)
        stem, ext = os.path.splitext(os.path.basename(f))
        ext = ext.lower()
        r = index.get((stem, ext))
        if not r:
            missing.append(rel)
            print("!! 线上无对应记录，跳过：", rel)
            continue
        if DRY:
            print(f"plan id={r['id']} {rel}")
            continue
        folder = os.path.dirname(rel).replace(os.sep, "/")
        if FOLDERS_ONLY:
            api(f"/api/data/resumes/{r['id']}", {"folder": folder}, method="PATCH")
            done += 1
            print(f"folder id={r['id']} [{folder or '(未分组)'}] {rel}")
            continue
        try:
            url = upload(f)
            content = text_of_docx(open(f, "rb").read()) if ext == ".docx" else (r.get("content") or "")
            api(f"/api/data/resumes/{r['id']}", {
                "name": stem,
                "target_role": r.get("target_role") or "",
                "file_url": url,
                "content": content,
                "note": "本地路径: " + rel,
                "folder": folder,
                "in_use": truthy(r.get("in_use")),
            }, method="PATCH")
            done += 1
            print(f"ok id={r['id']} {rel} content={len(content)}")
        except Exception as e:
            failed.append((rel, str(e)))
            print("FAIL", rel, e)

    print(f"\n完成 {done} / {len(files)}｜无匹配 {len(missing)}｜失败 {len(failed)}")


if __name__ == "__main__":
    main()

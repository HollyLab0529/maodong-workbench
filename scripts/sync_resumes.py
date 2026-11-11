#!/usr/bin/env python3
"""把 01_投递用简历 下的所有简历文件同步到工作台「简历库」(resumes 集合)。
用法: python3 sync_resumes.py [--dry-run]
"""
import json
import subprocess
import sys
from pathlib import Path

BASE = "https://workbench.hollylab.cloud"
TOKEN = open(Path.home() / ".catpaw" / "memory" / ".wb-token").read().strip() if (Path.home() / ".catpaw" / ".wb-token").exists() else "qNxXv0feK19P-960NVl95pzBKi_DZVEq"
SRC = Path.home() / "Documents" / "徐笑晗个人资料" / "简历+面试" / "01_投递用简历"
DRY = "--dry-run" in sys.argv

# 各目录对应的目标岗位
ROLE_MAP = {
    "通用版_AI应用产品经理": "AI应用产品经理",
    "其他方向_全栈开发工程师": "AI全栈开发工程师",
    "定向版_Shopee_技术产品经理": "技术产品经理TPM",
    "定向版_搜狐_产品经理": "产品经理",
    "定向版_武汉市啸洋庆_互联网产品经理": "互联网产品经理",
    "定向版_剪映_AI产品经理": "AI产品经理",
    "定向版_转转_产品经理": "产品经理",
}
# 在用标记：通用版详细版 PDF（主力投递版）
IN_USE_NAME = "详细版_徐笑晗_AI应用产品经理_北京天津.pdf"


MIME = {".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword"}
def upload(fp: Path) -> str:
    r = subprocess.run(
        ["curl", "-s", "-H", f"Authorization: Bearer {TOKEN}",
         "-F", f"file=@{fp};type={MIME[fp.suffix.lower()]}", f"{BASE}/api/upload"],
        capture_output=True, text=True, timeout=120)
    out = json.loads(r.stdout)
    if "url" not in out:
        raise RuntimeError(f"upload failed: {r.stdout[:200]}")
    return out["url"]


def docx_text(fp: Path) -> str:
    r = subprocess.run(
        ["textutil", "-convert", "txt", "-stdout", "-encoding", "UTF-8", str(fp)],
        capture_output=True, text=True, timeout=60)
    return r.stdout.strip() if r.returncode == 0 else ""


def post_resume(payload: dict):
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json",
         "-d", json.dumps(payload, ensure_ascii=False), f"{BASE}/api/data/resumes"],
        capture_output=True, text=True, timeout=60)
    return r.stdout[:200]


def main():
    files = sorted(p for d in sorted(SRC.iterdir()) if d.is_dir()
                   for p in d.iterdir()
                   if p.suffix.lower() in (".pdf", ".docx"))
    print(f"共 {len(files)} 个文件")
    ok = fail = 0
    for fp in files:
        role = ROLE_MAP.get(fp.parent.name, "")
        name = fp.stem
        note = f"本地路径: {fp.parent.name}/{fp.name}"
        try:
            if DRY:
                print(f"[dry] {fp.parent.name}/{fp.name}")
                ok += 1
                continue
            url = upload(fp)
            content = docx_text(fp) if fp.suffix.lower() == ".docx" else ""
            payload = {
                "name": name,
                "target_role": role,
                "file_url": url,
                "content": content,
                "note": note,
                "in_use": "1" if fp.name == IN_USE_NAME else "0",
            }
            resp = post_resume(payload)
            print(f"✓ {fp.parent.name}/{fp.name} -> {url} | {resp}")
            ok += 1
        except Exception as e:
            print(f"✗ {fp}: {e}")
            fail += 1
    print(f"完成: 成功 {ok}, 失败 {fail}")


if __name__ == "__main__":
    main()

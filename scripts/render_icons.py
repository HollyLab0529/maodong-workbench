#!/usr/bin/env python3
"""logo.svg -> icon-512 / icon-192 / apple-touch-icon(180)。
自研光栅化：解析 SVG（仅 M/C/L/Z + rect/circle），CGPath even-odd 采样填充，2x 超采样后缩小。
"""
import re
import struct
import zlib
import xml.etree.ElementTree as ET
from pathlib import Path

from Quartz import (CGPathCreateMutable, CGPathMoveToPoint, CGPathAddCurveToPoint,
                    CGPathAddLineToPoint, CGPathCloseSubpath, CGPathContainsPoint,
                    CGPathCreateWithRoundedRect, CGPathCreateWithEllipseInRect,
                    CGPathGetPathBoundingBox, CGRectMake, CGPointMake)

ROOT = Path(__file__).parent.parent
SRC = ROOT / "web" / "public" / "logo.svg"
OUT = SRC.parent

SIZE = 48          # SVG viewBox 尺寸
GRID = 1024        # 渲染网格（2x 于 512）
SS = 2             # 512 = GRID/2

tree = ET.parse(SRC)
root = tree.getroot()
NS = "{http://www.w3.org/2000/svg}"


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def parse_path_d(d):
    """返回 [(命令, 参数...)]，仅支持 M/C/L/Z。"""
    tokens = re.findall(r"([MLCZz])|(-?\d*\.?\d+)", d)
    cmds = []
    cur_cmd = None
    nums = []
    for cmd, num in tokens:
        if cmd:
            if cur_cmd:
                cmds.append((cur_cmd, nums))
                nums = []
            cur_cmd = cmd
        else:
            nums.append(float(num))
    if cur_cmd:
        cmds.append((cur_cmd, nums))
    return cmds


def path_to_cgpath(d):
    path = CGPathCreateMutable()
    x = y = 0.0
    for cmd, nums in parse_path_d(d):
        if cmd == "M":
            x, y = nums[0], nums[1]
            CGPathMoveToPoint(path, None, x, y)
            # 隐式后续坐标对按 L 处理（本 SVG 无此情况）
            for i in range(2, len(nums), 2):
                x, y = nums[i], nums[i + 1]
                CGPathAddLineToPoint(path, None, x, y)
        elif cmd == "C":
            for i in range(0, len(nums), 6):
                x1, y1, x2, y2, x3, y3 = nums[i:i + 6]
                CGPathAddCurveToPoint(path, None, x1, y1, x2, y2, x3, y3)
                x, y = x3, y3
        elif cmd == "L":
            for i in range(0, len(nums), 2):
                x, y = nums[i], nums[i + 1]
                CGPathAddLineToPoint(path, None, x, y)
        elif cmd in ("Z", "z"):
            CGPathCloseSubpath(path)
    return path


def parse_transform_translate(t):
    m = re.match(r"translate\((-?[\d.]+)[, ]+(-?[\d.]+)\)", t or "")
    return (float(m.group(1)), float(m.group(2))) if m else (0.0, 0.0)


def shape_path(el, dx, dy, g_fill=None):
    """元素 -> (CGPath, fill_rgb, opacity)，未写 fill 时继承 g 的 fill"""
    tag = el.tag.replace(NS, "")
    fill_attr = el.get("fill") or g_fill or "#000000"
    fill = hex2rgb(fill_attr)
    op = float(el.get("opacity", el.get("fill-opacity", "1")))
    if tag == "path":
        path = path_to_cgpath(el.get("d"))
    elif tag == "rect":
        x, y = float(el.get("x", 0)), float(el.get("y", 0))
        w, h = float(el.get("width")), float(el.get("height"))
        rx = float(el.get("rx", 0))
        path = CGPathCreateWithRoundedRect(CGRectMake(x + dx, y + dy, w, h), rx, rx, None)
    elif tag == "circle":
        cx, cy = float(el.get("cx")) + dx, float(el.get("cy")) + dy
        r = float(el.get("r"))
        path = CGPathCreateWithEllipseInRect(CGRectMake(cx - r + dx, cy - r + dy, 2 * r, 2 * r), None)
    else:
        return None
    return path, fill, op


# 按文档顺序展开所有可绘制形状（继承 g 的 opacity/transform）
shapes = []

def walk(node, g_op=1.0, dx=0.0, dy=0.0, g_fill=None):
    for el in node:
        tag = el.tag.replace(NS, "")
        if tag == "g":
            gop = g_op * float(el.get("opacity", "1"))
            gx, gy = parse_transform_translate(el.get("transform"))
            walk(el, gop, dx + gx, dy + gy, el.get("fill") or g_fill)
        elif tag in ("path", "rect", "circle"):
            s = shape_path(el, dx, dy, g_fill)
            if s:
                shapes.append((s[0], s[1], s[2] * g_op))

walk(root)

# 光栅化：GRID x GRID，每形状 bbox 限制 + even-odd 逐点测试
buf = [[(0, 0, 0, 0)] * GRID for _ in range(GRID)]  # RGBA straight
step = SIZE / GRID
for path, (r, g, b), op in shapes:
    # bbox 采样范围（CG 坐标即 SVG 坐标，y 向下；采样时翻转）
    bb = CGPathGetPathBoundingBox(path)
    x0 = max(0, int((bb.origin.x - 1) / step))
    x1 = min(GRID - 1, int((bb.origin.x + bb.size.width + 1) / step))
    # CGPath 坐标即 SVG 坐标（y 向下），与图像行方向一致，无需翻转
    y0 = max(0, int((bb.origin.y - 1) / step))
    y1 = min(GRID - 1, int((bb.origin.y + bb.size.height + 1) / step))
    for py in range(y0, y1 + 1):
        sy = (py + 0.5) * step
        row = buf[py]
        for px in range(x0, x1 + 1):
            sx = (px + 0.5) * step
            if CGPathContainsPoint(path, None, CGPointMake(sx, sy), True):
                cr, cg, cb, ca = row[px]
                a = op
                if a > 0:
                    row[px] = (          # 标准 over 合成（预乘 alpha 存储）
                        r * a + cr * ca * (1 - a),
                        g * a + cg * ca * (1 - a),
                        b * a + cb * ca * (1 - a),
                        a + ca * (1 - a),
                    )

# 2x2 盒滤波降到 512
out = SS and GRID // SS
rows = []
for oy in range(out):
    row = bytearray()
    for ox in range(out):
        r = g = b = a = 0.0
        for sy in (oy * SS, oy * SS + SS - 1):
            for sx in (ox * SS, ox * SS + SS - 1):
                pr, pg, pb, pa = buf[sy][sx]
                r += pr; g += pg; b += pb; a += pa
        n = SS * SS
        pr, pg, pb, pa = r / n, g / n, b / n, a / n
        if pa > 0:  # 反预乘得到直通 RGBA
            row += bytes((min(255, round(pr / pa * 255)), min(255, round(pg / pa * 255)),
                          min(255, round(pb / pa * 255)), round(pa * 255)))
        else:
            row += b"\x00\x00\x00\x00"
    rows.append(bytes(row))


def write_png(path, w, h, rgba_rows):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    raw = b"".join(b"\x00" + r for r in rgba_rows)
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    path.write_bytes(data)
    print(f"✓ {path.name} ({w}px, {path.stat().st_size // 1024}KB)")


def downscale(rows, src, dst):
    """区域平均缩放：src×src RGBA rows -> dst×dst。"""
    ratio = src / dst
    out_rows = []
    for dy in range(dst):
        y0, y1 = int(dy * ratio), max(int(dy * ratio) + 1, int((dy + 1) * ratio))
        row = bytearray()
        for dx in range(dst):
            x0, x1 = int(dx * ratio), max(int(dx * ratio) + 1, int((dx + 1) * ratio))
            r = g = b = a = 0.0
            n = 0
            for sy in range(y0, y1):
                srow = rows[sy]
                for sx in range(x0, x1):
                    pr, pg, pb, pa = srow[sx * 4:sx * 4 + 4]
                    r += pr; g += pg; b += pb; a += pa
                    n += 1
            # rows 已是 0~255 的直通 RGBA，区域平均即可；不能再乘 255（会把所有颜色顶成白色）
            row += bytes((min(255, round(r / n)), min(255, round(g / n)),
                          min(255, round(b / n)), min(255, round(a / n))))
        out_rows.append(bytes(row))
    return out_rows


write_png(OUT / "icon-512.png", out, out, rows)
write_png(OUT / "icon-192.png", 192, 192, downscale(rows, out, 192))
write_png(OUT / "apple-touch-icon.png", 180, 180, downscale(rows, out, 180))

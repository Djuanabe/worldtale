#!/usr/bin/env python3
"""日本地図のピクセルグリッドデータ生成スクリプト

dataofjapan/land の japan.geojson (https://github.com/dataofjapan/land) を
低解像度グリッドにラスタライズし、web/src/japanMap.ts を生成する。

使い方:
  curl -sL -o /tmp/japan.geojson \
    https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson
  python3 tools/generate-japan-map.py /tmp/japan.geojson web/src/japanMap.ts

セルのエンコード: '.'=海, それ以外は都道府県コード(1..47)を
"123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJK"[code-1] の1文字で表す。
沖縄は左上のインセット枠に移動して配置する。
"""
import json
import math
import sys

CHARS = "123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL"  # index = code-1 (47文字)

GRID_H = 150  # 縦セル数（横は縦横比から自動）

# 本土ラスタライズの範囲（Ogasawara・Amami 等の遠隔島は割愛）
MAIN_LAT_MIN = 30.0
MAIN_LAT_MAX = 45.8
MAIN_LON_MIN = 128.3
MAIN_LON_MAX = 146.2

# 沖縄本島まわり（インセットとして下方中央=列島の南の海上に移す）
OKI_LAT_MIN, OKI_LAT_MAX = 25.7, 27.1
OKI_LON_MIN, OKI_LON_MAX = 126.5, 128.5
OKI_OFF_X, OKI_OFF_Y = 64, 133  # インセット左上のセル座標

# 琵琶湖（滋賀県ポリゴンは湖面を含むため、明示的に水域として彫り込む）
BIWA_POLYGON = [
    (136.07, 35.52),
    (136.25, 35.42),
    (136.28, 35.30),
    (136.13, 35.12),
    (135.95, 34.98),
    (135.87, 35.05),
    (135.94, 35.22),
    (136.00, 35.38),
]


def decimate(ring, max_pts=400):
    if len(ring) <= max_pts:
        return ring
    step = len(ring) / max_pts
    return [ring[int(i * step)] for i in range(max_pts)]


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    data = json.load(open(src))

    # 都道府県ごとの (外環リスト, bbox) を用意（穴は無視。セル解像度なら十分）
    prefs = {}
    for f in data["features"]:
        code = int(f["properties"]["id"])
        rings = []
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            outer = decimate([(p[0], p[1]) for p in poly[0]])
            rings.append((outer, bbox(outer)))
        prefs[code] = rings

    # 投影: 経度は cos(37°) で縮めた等距円筒
    kx = math.cos(math.radians(37.0))
    lat_span = MAIN_LAT_MAX - MAIN_LAT_MIN
    lon_span = (MAIN_LON_MAX - MAIN_LON_MIN) * kx
    grid_w = round(GRID_H * lon_span / lat_span)

    def cell_of(lon, lat):
        gx = (lon - MAIN_LON_MIN) * kx / lon_span * grid_w
        gy = (MAIN_LAT_MAX - lat) / lat_span * GRID_H
        return gx, gy

    def lonlat_of(cx, cy):
        lon = MAIN_LON_MIN + (cx + 0.5) / grid_w * lon_span / kx
        lat = MAIN_LAT_MAX - (cy + 0.5) / GRID_H * lat_span
        return lon, lat

    grid = [["." for _ in range(grid_w)] for _ in range(GRID_H)]

    def paint(code, lon, lat, cx, cy):
        if 0 <= cx < grid_w and 0 <= cy < GRID_H and grid[cy][cx] == ".":
            grid[cy][cx] = CHARS[code - 1]

    # --- 本土: 各セル中心を point-in-polygon 判定 ---
    for cy in range(GRID_H):
        for cx in range(grid_w):
            lon, lat = lonlat_of(cx, cy)
            if not (MAIN_LAT_MIN <= lat <= MAIN_LAT_MAX):
                continue
            for code, rings in prefs.items():
                if code == 47:
                    continue
                hit = False
                for ring, (x0, y0, x1, y1) in rings:
                    if x0 <= lon <= x1 and y0 <= lat <= y1 and point_in_ring(lon, lat, ring):
                        hit = True
                        break
                if hit:
                    grid[cy][cx] = CHARS[code - 1]
                    break

    # --- 細い県が消えないよう、頂点も直接打つ(セル中心が外れた海岸線対策) ---
    for code, rings in prefs.items():
        if code == 47:
            continue
        have = any(CHARS[code - 1] in row for row in ["".join(r) for r in grid])
        if have:
            continue
        for ring, _ in rings:
            for lon, lat in ring:
                if MAIN_LAT_MIN <= lat <= MAIN_LAT_MAX:
                    gx, gy = cell_of(lon, lat)
                    paint(code, lon, lat, int(gx), int(gy))

    # --- 琵琶湖を水域として彫り込む（滋賀の陸セルを '.' に戻す） ---
    for cy in range(GRID_H):
        for cx in range(grid_w):
            if grid[cy][cx] == ".":
                continue
            lon, lat = lonlat_of(cx, cy)
            if point_in_ring(lon, lat, BIWA_POLYGON):
                grid[cy][cx] = "."

    # --- 内陸の取りこぼし穴を埋める ---
    # セル中心が県境の隙間に落ちて '.' になった1〜2セルの穴は、
    # 海色+海岸線の輪郭で「謎のひし形」に見えてしまう。
    # 外周からの flood fill で外海に到達できない水セルを検出し、
    # 琵琶湖（意図的な水域）以外は周囲で最も多い県コードで埋める。
    from collections import deque

    reachable = [[False] * grid_w for _ in range(GRID_H)]
    dq = deque()
    for x in range(grid_w):
        for y in (0, GRID_H - 1):
            if grid[y][x] == "." and not reachable[y][x]:
                reachable[y][x] = True
                dq.append((x, y))
    for y in range(GRID_H):
        for x in (0, grid_w - 1):
            if grid[y][x] == "." and not reachable[y][x]:
                reachable[y][x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < grid_w and 0 <= ny < GRID_H and grid[ny][nx] == "." and not reachable[ny][nx]:
                reachable[ny][nx] = True
                dq.append((nx, ny))

    filled_holes = 0
    for cy in range(GRID_H):
        for cx in range(grid_w):
            if grid[cy][cx] != "." or reachable[cy][cx]:
                continue
            lon, lat = lonlat_of(cx, cy)
            if point_in_ring(lon, lat, BIWA_POLYGON):
                continue  # 琵琶湖は残す
            neigh = {}
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < grid_w and 0 <= ny < GRID_H and grid[ny][nx] != ".":
                        neigh[grid[ny][nx]] = neigh.get(grid[ny][nx], 0) + 1
            if neigh:
                grid[cy][cx] = max(neigh, key=neigh.get)
                filled_holes += 1
    print(f"filled inland holes: {filled_holes}", file=sys.stderr)

    # --- 沖縄: 同じ縮尺でラスタライズして下方中央のインセットへ ---
    oki_w = round((OKI_LON_MAX - OKI_LON_MIN) * kx / lon_span * grid_w)
    oki_h = round((OKI_LAT_MAX - OKI_LAT_MIN) / lat_span * GRID_H)
    for oy in range(oki_h):
        for ox in range(oki_w):
            lon = OKI_LON_MIN + (ox + 0.5) / oki_w * (OKI_LON_MAX - OKI_LON_MIN)
            lat = OKI_LAT_MAX - (oy + 0.5) / oki_h * (OKI_LAT_MAX - OKI_LAT_MIN)
            for ring, (x0, y0, x1, y1) in prefs[47]:
                if x0 <= lon <= x1 and y0 <= lat <= y1 and point_in_ring(lon, lat, ring):
                    cx, cy = OKI_OFF_X + ox, OKI_OFF_Y + oy
                    if 0 <= cx < grid_w and 0 <= cy < GRID_H:
                        grid[cy][cx] = CHARS[46]
                    break

    rows = ["".join(r) for r in grid]

    # 各県のセル数と代表セル(重心)を集計
    counts = {c: 0 for c in range(1, 48)}
    sums = {c: [0, 0] for c in range(1, 48)}
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            code = CHARS.index(ch) + 1
            counts[code] += 1
            sums[code][0] += x
            sums[code][1] += y
    missing = [c for c, n in counts.items() if n == 0]
    if missing:
        print("WARNING: missing prefectures:", missing, file=sys.stderr)
    centers = {
        c: (round(sums[c][0] / n), round(sums[c][1] / n))
        for c, n in counts.items()
        if n > 0
    }
    # 重心が自県セル上にない場合は最寄りの自県セルへ寄せる
    for c, (gx, gy) in centers.items():
        ch = CHARS[c - 1]
        if rows[gy][gx] == ch:
            continue
        best, bd = None, 1e9
        for y, row in enumerate(rows):
            for x, cell in enumerate(row):
                if cell == ch:
                    d = (x - gx) ** 2 + (y - gy) ** 2
                    if d < bd:
                        bd, best = d, (x, y)
        centers[c] = best

    with open(dst, "w") as f:
        f.write("// 自動生成: tools/generate-japan-map.py（編集しない）\n")
        f.write("// 出典: dataofjapan/land japan.geojson を低解像度ラスタライズ\n")
        f.write("// セル: '.'=海, 他は都道府県コードを1文字エンコード\n\n")
        f.write(f"export const JAPAN_MAP_W = {grid_w};\n")
        f.write(f"export const JAPAN_MAP_H = {GRID_H};\n\n")
        f.write('export const JAPAN_MAP_CHARS = "' + CHARS + '";\n\n')
        f.write("export const JAPAN_MAP_ROWS: string[] = [\n")
        for row in rows:
            f.write(f'  "{row}",\n')
        f.write("];\n\n")
        f.write("// 各都道府県の代表セル [x, y]（ラベル・将来のズーム用）\n")
        f.write("export const PREF_CELL_CENTER: Record<number, [number, number]> = {\n")
        for c in sorted(centers):
            x, y = centers[c]
            f.write(f"  {c}: [{x}, {y}],\n")
        f.write("};\n\n")
        f.write("// 沖縄インセット枠（UI で区切り線を引くための範囲）\n")
        f.write(
            f"export const OKINAWA_INSET = "
            f"{{ x: {OKI_OFF_X - 2}, y: {OKI_OFF_Y - 2}, w: {oki_w + 4}, h: {oki_h + 4} }};\n\n"
        )
        f.write("export function prefCodeAt(x: number, y: number): number | null {\n")
        f.write("  const row = JAPAN_MAP_ROWS[y];\n")
        f.write("  if (!row) return null;\n")
        f.write('  const ch = row[x];\n  if (!ch || ch === ".") return null;\n')
        f.write("  const i = JAPAN_MAP_CHARS.indexOf(ch);\n")
        f.write("  return i >= 0 ? i + 1 : null;\n}\n")
    print(f"OK: {dst} ({grid_w}x{GRID_H})")
    small = sorted((n, c) for c, n in counts.items() if n > 0)[:6]
    print("smallest prefs (cells, code):", small)


if __name__ == "__main__":
    main()

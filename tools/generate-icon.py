import math

N = 32
cx = (N-1)/2.0
cy = (N-1)/2.0
R = 15.0

def figure(x, y):
    adx = abs(x - cx)
    dy = y - cy
    # 頭
    if (x-cx)**2 + (y-(cy-6.0))**2 <= 3.4**2:
        return True
    # 胴(下すぼみの楕円、下は地球で切れる)
    if ((x-cx)/4.6)**2 + ((y-(cy+4.0))/6.8)**2 <= 1.0 and y >= cy-3:
        return True
    # 腕(肩から斜め上外へ。左右対称)
    # 線分 A(肩)->B(手) までの距離で太さ判定
    ax0, ay0 = 3.0, -1.0   # 肩(adx,dy)
    ax1, ay1 = 8.5, -5.0   # 手(adx,dy)
    vx, vy = ax1-ax0, ay1-ay0
    wx, wy = adx-ax0, dy-ay0
    t = (wx*vx+wy*vy)/(vx*vx+vy*vy)
    t = max(0.0, min(1.0, t))
    px, py = ax0+t*vx, ay0+t*vy
    if (adx-px)**2 + (dy-py)**2 <= 2.3**2:
        return True
    return False

def land(x, y):
    adx = abs(x - cx)
    dy = y - cy
    blobs = [(5,-10,4.2,3.2),(13,-1,2.2,3.4),(6.5,10,3.6,2.6),(11,7,2.2,2.0)]
    for ax,ay,rx,ry in blobs:
        if ((adx-ax)/rx)**2 + ((dy-ay)/ry)**2 <= 1.0:
            return True
    return False

# セル種別: '.'=透過 K=黒 B=青 G=緑 W=白
grid = [['.' for _ in range(N)] for _ in range(N)]
fig = [[figure(x,y) for x in range(N)] for y in range(N)]
for y in range(N):
    for x in range(N):
        d = math.hypot(x-cx, y-cy)
        if d > R+0.5:
            continue
        if d > R-1.6:
            grid[y][x] = 'K'  # 地球の輪郭
        else:
            grid[y][x] = 'G' if land(x,y) else 'B'
# ヒトの輪郭(黒)= figureでない かつ 近傍にfigure、地球内側のみ
for y in range(N):
    for x in range(N):
        if fig[y][x]:
            continue
        if math.hypot(x-cx,y-cy) > R-1.6:
            continue
        near = any(0<=x+dx<N and 0<=y+dy<N and fig[y+dy][x+dx]
                   for dx in (-1,0,1) for dy in (-1,0,1))
        if near:
            grid[y][x] = 'K'
# ヒト本体(白)
for y in range(N):
    for x in range(N):
        if fig[y][x] and math.hypot(x-cx,y-cy) <= R-0.4:
            grid[y][x] = 'W'

# プレビュー
sym = {'.':' ','K':'#','B':'.','G':'o','W':'@'}
for row in grid:
    print(''.join(sym[c] for c in row))

# 左右対称チェック
ok = all(grid[y][x]==grid[y][N-1-x] for y in range(N) for x in range(N))
print("symmetric:", ok)

import json
open("icon_grid.json","w").write(json.dumps([''.join(r) for r in grid]))

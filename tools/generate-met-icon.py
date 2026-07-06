import math, json
W, H = 26, 18

def seg(px,py,ax,ay,bx,by,t):
    vx,vy=bx-ax,by-ay
    wx,wy=px-ax,py-ay
    dd=vx*vx+vy*vy
    tt=(wx*vx+wy*vy)/dd if dd else 0
    tt=max(0,min(1,tt))
    qx,qy=ax+tt*vx,ay+tt*vy
    return (px-qx)**2+(py-qy)**2 <= t*t

def person_left(x,y):
    cx=6.0
    # 頭（小さめの円）
    if (x-cx)**2 + (y-2.6)**2 <= 1.7**2: return True
    # 首
    if abs(x-cx)<=0.9 and 4<=y<=5: return True
    # 胴（肩広め→裾すぼみのコート）
    if 5<=y<=10:
        halfw = 1.4 + (10-y)*0.28   # 上ほど広い肩
        if abs(x-cx) <= halfw: return True
    # 内側へ伸ばす腕（肩から中央へ）。細く。
    if seg(x,y, cx+1.2,5.6, 12.3,7.4, 0.85): return True
    # 前脚（中央側へ一歩）
    if seg(x,y, cx+0.5,10.0, cx+1.8,15.5, 0.85): return True
    # 後脚
    if seg(x,y, cx-0.9,10.0, cx-1.4,15.5, 0.85): return True
    # 前足先
    if seg(x,y, cx+1.6,15.3, cx+2.9,15.6, 0.7): return True
    # 後足先
    if seg(x,y, cx-1.5,15.3, cx-2.6,15.6, 0.7): return True
    return False

def val(x,y):
    return person_left(x,y) or person_left(W-1-x,y)

grid=[['.' for _ in range(W)] for _ in range(H)]
for y in range(H):
    for x in range(W):
        if val(x,y): grid[y][x]='X'
for row in grid:
    print(''.join('#' if c=='X' else ' ' for c in row))
print("symmetric:", all(grid[y][x]==grid[y][W-1-x] for y in range(H) for x in range(W)))
open("met_grid.json","w").write(json.dumps([''.join(r) for r in grid]))

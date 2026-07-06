import math, json
W, H = 28, 18
CENTER=(W-1)/2.0  # 13.5

def seg(px,py,ax,ay,bx,by,t):
    vx,vy=bx-ax,by-ay
    dd=vx*vx+vy*vy
    wx,wy=px-ax,py-ay
    tt=(wx*vx+wy*vy)/dd if dd else 0
    tt=max(0,min(1,tt))
    qx,qy=ax+tt*vx,ay+tt*vy
    return (px-qx)**2+(py-qy)**2 <= t*t

def person_left(x,y):
    cx=10.0
    # 頭
    if (x-cx)**2 + (y-2.6)**2 <= 1.7**2: return True
    if abs(x-cx)<=0.9 and 4<=y<=5: return True
    # 胴（細め・裾すぼみ）
    if 5<=y<=9:
        halfw = 1.1 + (9-y)*0.2
        if abs(x-cx) <= halfw: return True
    # 内側の袖: 体側に沿ってほぼ垂直に垂らす → 先端だけ中央へ寄せる
    if seg(x,y, cx+1.4,5.8, cx+1.6,10.0, 0.66): return True   # 垂直部
    if seg(x,y, cx+1.6,10.0, 13.2,11.4, 0.6): return True     # 先端フック(中央13.5へ)
    # 外側の袖
    if seg(x,y, cx-1.4,5.8, cx-1.7,9.4, 0.62): return True
    # 前脚・後脚
    if seg(x,y, cx+0.5,10.2, cx+1.4,15.4, 0.78): return True
    if seg(x,y, cx-0.8,10.2, cx-1.2,15.4, 0.78): return True
    if seg(x,y, cx+1.2,15.2, cx+2.3,15.5, 0.6): return True
    if seg(x,y, cx-1.1,15.2, cx-2.1,15.5, 0.6): return True
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
# 接触は先端(y>=10)の1〜2行のみであるべき。上部(y5-9)の中央が空いているか確認
mid=range(12,16)
open_top = all(any(grid[y][x]=='.' for x in mid) for y in range(5,10))
touch_bottom = any(all(grid[y][x]=='X' for x in range(13,15)) for y in range(10,13))
print("upper center open:", open_top, "/ tips touch near bottom:", touch_bottom)
open("met_grid.json","w").write(json.dumps([''.join(r) for r in grid]))

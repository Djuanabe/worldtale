import json
W, H = 40, 24
def pip(x,y,poly):
    inside=False;n=len(poly);j=n-1
    for i in range(n):
        xi,yi=poly[i];xj,yj=poly[j]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi: inside=not inside
        j=i
    return inside
def seg(px,py,ax,ay,bx,by,t):
    vx,vy=bx-ax,by-ay;dd=vx*vx+vy*vy;wx,wy=px-ax,py-ay
    tt=(wx*vx+wy*vy)/dd if dd else 0;tt=max(0,min(1,tt))
    qx,qy=ax+tt*vx,ay+tt*vy
    return (px-qx)**2+(py-qy)**2<=t*t

def filled_left(x,y):
    # 腕(上端から袖口へ。少し内向き)
    if seg(x,y, 10.5,0.0, 13.5,7.5, 1.7): return True
    # 袂(垂れ袖): 内側(右)の辺を中央へまっすぐ、外側下角を丸める
    sleeve=[(5.5,7.5),(19.4,8.5),(19.4,20.5),(11.0,22.0),(6.5,20.5),(5.0,13.0)]
    if pip(x,y,sleeve): return True
    return False

def outline(fn):
    F=[[fn(x,y) for x in range(W)] for y in range(H)]
    return [[F[y][x] and any((not(0<=x+dx<W and 0<=y+dy<H)) or not F[y+dy][x+dx]
             for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))) for x in range(W)] for y in range(H)]

OL=outline(filled_left); OR=outline(lambda x,y: filled_left(W-1-x,y))
grid=[['X' if (OL[y][x] or OR[y][x]) else '.' for x in range(W)] for y in range(H)]
for row in grid: print(''.join('#' if c=='X' else ' ' for c in row))
print("symmetric:", all(grid[y][x]==grid[y][W-1-x] for y in range(H) for x in range(W)))
open("met_grid.json","w").write(json.dumps([''.join(r) for r in grid]))

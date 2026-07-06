import json
W, H = 44, 32
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

# 左の袖(菱形)。外側の角 L を画面外(x<0)へ出し、外側から袖が伸びて見えるように。
# 右corner R は中央で接する。
T=(11,6.0); R=(21.6,17); B=(11,28.0); L=(-5.0,17); C=(9.5,17)
def cham(pts,f=0.12):
    poly=[]
    for i,p in enumerate(pts):
        q=pts[(i+1)%len(pts)]
        poly.append((p[0]+(q[0]-p[0])*f, p[1]+(q[1]-p[1])*f))
        poly.append((q[0]+(p[0]-q[0])*f, q[1]+(p[1]-q[1])*f))
    return poly
POLY=cham([T,R,B,L])
def filled_left(x,y): return pip(x,y,POLY)
def outline(fn):
    F=[[fn(x,y) for x in range(W)] for y in range(H)]
    # 画面左右端に接する辺は「外へ続く」ので端に線を描かない → 端セルは輪郭にしない
    O=[[False]*W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if not F[y][x]: continue
            edge=False
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,ny=x+dx,y+dy
                if 0<=nx<W and 0<=ny<H:
                    if not F[ny][nx]: edge=True;break
                else:
                    # 上下端は輪郭に含める。左右端(x方向)は「外へ続く」ので含めない
                    if dy!=0: edge=True;break
            O[y][x]=edge
    return O
OL=outline(filled_left); OR=outline(lambda x,y: filled_left(W-1-x,y))
G=[[OL[y][x] or OR[y][x] for x in range(W)] for y in range(H)]
def stroke(ax,ay,bx,by,t=0.55, mirror=False):
    for y in range(H):
        for x in range(W):
            xx=W-1-x if mirror else x
            if seg(xx,y,ax,ay,bx,by,t): G[y][x]=True
# 袖口の二重線: 下内側の辺 B->R の内側に平行線
mx,my=-0.707,-0.707; off=2.1
stroke(B[0]+mx*off,B[1]+my*off, R[0]+mx*off,R[1]+my*off, 0.55)
stroke(B[0]+mx*off,B[1]+my*off, R[0]+mx*off,R[1]+my*off, 0.55, mirror=True)
# 集中線3本(上中央)
cxm=(W-1)/2.0
stroke(cxm-4,1.0, cxm-2.4,4.8, 0.5)
stroke(cxm,0.2, cxm,4.4, 0.5)
stroke(cxm+4,1.0, cxm+2.4,4.8, 0.5)
grid=[['X' if G[y][x] else '.' for x in range(W)] for y in range(H)]
for row in grid: print(''.join('#' if c=='X' else ' ' for c in row))
print("symmetric:", all(grid[y][x]==grid[y][W-1-x] for y in range(H) for x in range(W)))
open("met_grid.json","w").write(json.dumps([''.join(r) for r in grid]))

import json, math
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

# 左の袖(菱形・角を少し面取り)。右corner=中央で接する
T=(13,7.5); R=(21.6,17); B=(13,26.5); L=(3.5,17); C=(12.6,17)
def cham(pts,f=0.13):
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
    return [[F[y][x] and any((not(0<=x+dx<W and 0<=y+dy<H)) or not F[y+dy][x+dx]
             for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))) for x in range(W)] for y in range(H)]
OL=outline(filled_left); OR=outline(lambda x,y: filled_left(W-1-x,y))
G=[[OL[y][x] or OR[y][x] for x in range(W)] for y in range(H)]
def stroke(ax,ay,bx,by,t=0.6, mirror=False):
    for y in range(H):
        for x in range(W):
            xx=W-1-x if mirror else x
            if seg(xx,y,ax,ay,bx,by,t): G[y][x]=True
# 袖口の二重線: 下内側の辺 B->R の内側に平行線
mx,my=-0.707,-0.707; off=2.2
stroke(B[0]+mx*off,B[1]+my*off, R[0]+mx*off,R[1]+my*off, 0.55)
stroke(B[0]+mx*off,B[1]+my*off, R[0]+mx*off,R[1]+my*off, 0.55, mirror=True)
# 集中線3本(上中央)
cxm=(W-1)/2.0
stroke(cxm-4,1.2, cxm-2.4,5.0, 0.5)
stroke(cxm,0.4, cxm,4.6, 0.5)
stroke(cxm+4,1.2, cxm+2.4,5.0, 0.5)
grid=[['X' if G[y][x] else '.' for x in range(W)] for y in range(H)]
for row in grid: print(''.join('#' if c=='X' else ' ' for c in row))
print("symmetric:", all(grid[y][x]==grid[y][W-1-x] for y in range(H) for x in range(W)))
open("met_grid.json","w").write(json.dumps([''.join(r) for r in grid]))

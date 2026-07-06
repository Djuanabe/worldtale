import json
W, H = 40, 30

def pip(x, y, poly):
    inside=False; n=len(poly); j=n-1
    for i in range(n):
        xi,yi=poly[i]; xj,yj=poly[j]
        if (yi>y)!=(yj>y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:
            inside=not inside
        j=i
    return inside

def kimono_left(x, y):
    cx=11.0
    # 頭
    if (x-cx)**2 + (y-4.3)**2 <= 2.7**2: return True
    # 首
    if abs(x-cx)<=1.0 and 7<=y<=8: return True
    # 胴(スリムなAライン)
    if 8<=y<=25:
        hw=1.8+(y-8)*(2.6-1.8)/17.0
        if abs(x-cx)<=hw: return True
    # 内袖(袂): 肩から垂れ、内edgeが下で中央へ寄る三角。先端だけ触れる
    inner=[(12.6,10.0),(15.6,11.5),(20.7,21.6),(13.0,22.0)]
    if pip(x,y,inner): return True
    # 外袖(袂): 外側に垂れる(先は自由)
    outer=[(9.4,10.0),(6.4,11.5),(4.2,20.5),(9.0,21.5)]
    if pip(x,y,outer): return True
    # 足(草履)
    if 26<=y<=27 and (abs(x-(cx-1.3))<=1.0 or abs(x-(cx+1.3))<=1.0): return True
    return False

def carve_left(x,y):
    cx=11.0
    # 襟V
    if 8<=y<=13 and abs(x-cx)<=(13-y)*0.4: return True
    # 帯線
    if y==15 and abs(x-cx)<=(1.8+(y-8)*(2.6-1.8)/17.0): return True
    return False

def cell(x,y):
    L=kimono_left(x,y) and not carve_left(x,y)
    R=kimono_left(W-1-x,y) and not carve_left(W-1-x,y)
    return L or R

grid=[['.' for _ in range(W)] for _ in range(H)]
for y in range(H):
    for x in range(W):
        if cell(x,y): grid[y][x]='X'
for row in grid:
    print(''.join('#' if c=='X' else ' ' for c in row))
print("symmetric:", all(grid[y][x]==grid[y][W-1-x] for y in range(H) for x in range(W)))
# 上部の袖間にV字の空きがあるか(=2枚に見える), 触れるのは下だけか
open_mid = all(any(grid[y][x]=='.' for x in range(18,22)) for y in range(11,18))
print("upper V gap between sleeves:", open_mid)
open("met_grid.json","w").write(json.dumps([''.join(r) for r in grid]))

// WorldTale モックAPI (ローカル動作確認用・Supabase不要)
// node mock-api.mjs → http://localhost:8787
import http from "node:http";
import crypto from "node:crypto";

const PORT = 8787;

// ---- シードデータ ----
const users = [
  { id: "u1", publicId: "DEMO123456", username: "はなこ", password: "password123" },
  { id: "u2", publicId: "KAZE789012", username: "かぜのたび", password: "password123" },
  { id: "u3", publicId: "YUKI345678", username: "ゆきぐに", password: "password123" },
];

let storySeq = 0;
function seedStory(userId, prefecture, year, title, body, views, likes, mets) {
  storySeq++;
  return {
    id: `s${storySeq}`, userId, prefecture, year, title, body,
    views, likes, mets,
    createdAt: new Date(Date.UTC(year, (storySeq * 3) % 12, (storySeq * 7) % 27 + 1)).toISOString(),
    updatedAt: null,
  };
}

const stories = [
  seedStory("u1", 13, 2019, "はじめての一人暮らしと商店街の夕暮れ",
    "上京して最初の春、駅前の商店街で買ったコロッケの味を今でも覚えている。\n夕方五時のチャイムが鳴ると、八百屋のおじさんが「今日も一日おつかれさん」と声をかけてくれた。\n知らない街が、少しずつ私の街になっていった一年だった。", 128, 24, 3),
  seedStory("u1", 26, 2021, "鴨川の飛び石と、あの夏の夕立",
    "引っ越した先の京都で、鴨川の飛び石を渡るのが日課になった。\n夕立に降られて橋の下で雨宿りをしたとき、隣にいたおばあさんが飴をくれた。\n「夕立は待てば止むし、待つのも悪うない」と笑っていた。", 342, 56, 8),
  seedStory("u1", 47, 2022, "初めての沖縄、海の色に言葉を失う",
    "旅行で訪れた沖縄。飛行機の窓から見えた海の色に、隣の席の子どもと一緒に歓声を上げた。\n市場で食べたてんぷらの熱さと、夕方のスコールの匂いを忘れない。", 89, 31, 1),
  seedStory("u2", 13, 2019, "終電を逃した夜、歩いて帰った十キロ",
    "残業続きの冬、終電を逃して家まで歩いた。\n深夜の環七はトラックばかりで、コンビニの灯りがやけに暖かかった。\nあの夜見た明け方の空の色は、たぶん一生忘れない。", 210, 42, 12),
  seedStory("u2", 1, 2020, "雪かきと、隣人と、味噌汁",
    "北海道に移住して最初の冬。朝五時の雪かきで腰をやられた。\n見かねた隣の家のご夫婦が手伝ってくれて、そのまま朝ごはんまでごちそうになった。\n雪は大変だが、雪のおかげで人と話す。", 156, 38, 5),
  seedStory("u3", 15, 2018, "米どころの夏、祖母の背中",
    "夏休みはいつも新潟の祖母の家で過ごした。\n朝の田んぼの匂い、縁側のスイカ、蚊帳の中で聞いた雨の音。\n祖母が亡くなって、あの夏がどれだけ贅沢だったか知った。", 421, 88, 15),
  seedStory("u3", 13, 2020, "静まりかえった春の渋谷で",
    "誰もいないスクランブル交差点を見た春。\n世界がこんなふうに止まるなんて思ってもみなかった。\nそれでも桜は咲いていて、なんだか泣きそうになった。", 533, 102, 44),
];

// 風景写真(SVGプレースホルダをこのサーバーから配信)
const photos = [
  { id: "p1", userId: "u1", storyId: "s2", prefecture: 26, season: "summer" },
  { id: "p2", userId: "u2", storyId: "s4", prefecture: 13, season: "winter" },
  { id: "p3", userId: "u3", storyId: "s7", prefecture: 13, season: "spring" },
  { id: "p4", userId: "u2", storyId: "s5", prefecture: 1, season: "winter" },
  { id: "p5", userId: "u1", storyId: "s3", prefecture: 47, season: "summer" },
];

// reactions: key = `${storyId}|${type}|${anonToken}`
const reactions = new Set();
const reports = [];
const tokens = new Map(); // token -> userId

const SEASON_SVG = {
  spring: ["#f6d7e0", "#e8b4c8", "#b56576", "桜"],
  summer: ["#bfe3d0", "#7fc8a9", "#2d6a4f", "夏"],
  autumn: ["#f2cfa0", "#d99a5b", "#8a4b2a", "紅葉"],
  winter: ["#dce7f0", "#aebfd0", "#5b7089", "雪"],
};

function sceneSvg(season, seed) {
  const [sky, mid, ink] = SEASON_SVG[season] ?? SEASON_SVG.spring;
  const h1 = 260 + (seed * 37) % 80, h2 = 300 + (seed * 53) % 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${mid}"/>
  </linearGradient></defs>
  <rect width="1200" height="675" fill="url(#g)"/>
  <path d="M0 ${420 + seed % 40} Q 300 ${h1} 600 ${h2} T 1200 ${400 + seed % 60} V675 H0 Z" fill="${mid}" opacity="0.8"/>
  <path d="M0 ${500 + seed % 30} Q 400 ${h2} 800 ${480 + seed % 50} T 1200 520 V675 H0 Z" fill="${ink}" opacity="0.55"/>
  <circle cx="${200 + seed * 97 % 800}" cy="130" r="52" fill="#fffdf7" opacity="0.85"/>
</svg>`;
}

// ---- helpers ----
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(body);
}
function err(res, status, code, message) { json(res, status, { error: { code, message } }); }

function counts(storyId) {
  let likeCount = 0, metCount = 0;
  for (const k of reactions) {
    const [sid, type] = k.split("|");
    if (sid !== storyId) continue;
    if (type === "like") likeCount++; else metCount++;
  }
  const s = stories.find((x) => x.id === storyId);
  return { likeCount: likeCount + (s?.likes ?? 0), metCount: metCount + (s?.mets ?? 0) };
}
function reacted(storyId, anonToken) {
  return {
    like: reactions.has(`${storyId}|like|${anonToken}`),
    met: reactions.has(`${storyId}|met|${anonToken}`),
  };
}
function summary(s) {
  const u = users.find((x) => x.id === s.userId);
  const c = counts(s.id);
  return {
    id: s.id, title: s.title,
    excerpt: s.body.replace(/\n/g, " ").slice(0, 120),
    prefecture: s.prefecture, year: s.year,
    username: u.username, userPublicId: u.publicId,
    createdAt: s.createdAt, likeCount: c.likeCount, metCount: c.metCount,
  };
}
function photoJson(p, origin) {
  const u = users.find((x) => x.id === p.userId);
  return { id: p.id, url: `${origin}/img/${p.id}.svg`, season: p.season, username: u?.username, prefecture: p.prefecture };
}
function authUser(req) {
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const uid = tokens.get(h.slice(7));
  return users.find((x) => x.id === uid) ?? null;
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

// ---- server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const origin = `http://localhost:${PORT}`;
  const path = url.pathname;
  const q = url.searchParams;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  // 画像 (SVGプレースホルダ)
  const img = path.match(/^\/img\/(p\d+|new-[\w-]+)\.svg$/);
  if (img && req.method === "GET") {
    const p = photos.find((x) => x.id === img[1]);
    const season = p?.season ?? "spring";
    const seed = Number((img[1].match(/\d+/) ?? [1])[0]);
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Access-Control-Allow-Origin": "*" });
    return res.end(sceneSvg(season, seed));
  }

  try {
    if (path === "/api/health") return json(res, 200, { ok: true });

    // ---- auth ----
    if (path === "/api/auth/register" && req.method === "POST") {
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      if (!b.username || !b.password || String(b.password).length < 8)
        return err(res, 400, "VALIDATION", "ユーザー名と8文字以上のパスワードが必要です");
      const publicId = crypto.randomBytes(8).toString("hex").toUpperCase().replace(/[ILOU]/g, "X").slice(0, 10);
      const user = { id: `u${users.length + 1}`, publicId, username: String(b.username), password: String(b.password) };
      users.push(user);
      const token = crypto.randomUUID();
      tokens.set(token, user.id);
      return json(res, 201, { user: { publicId: user.publicId, username: user.username }, token });
    }
    if (path === "/api/auth/login" && req.method === "POST") {
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      const user = users.find((x) => x.publicId === b.publicId && x.password === b.password);
      if (!user) return err(res, 401, "UNAUTHORIZED", "ユーザーIDまたはパスワードが違います");
      const token = crypto.randomUUID();
      tokens.set(token, user.id);
      return json(res, 200, { user: { publicId: user.publicId, username: user.username }, token });
    }
    if (path === "/api/auth/me") {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
      return json(res, 200, { user: { publicId: u.publicId, username: u.username } });
    }

    // ---- my ----
    if (path === "/api/my/stories") {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
      const mine = stories.filter((s) => s.userId === u.id)
        .map((s) => ({ ...summary(s), views: s.views, isHidden: false }));
      return json(res, 200, { stories: mine });
    }
    if (path === "/api/my/photos") {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
      return json(res, 200, { photos: photos.filter((p) => p.userId === u.id).map((p) => photoJson(p, origin)) });
    }

    // ---- map ----
    if (path === "/api/map/summary") {
      const year = q.get("year") ? Number(q.get("year")) : null;
      const c = {};
      for (const s of stories) {
        if (year && s.year !== year) continue;
        c[String(s.prefecture)] = (c[String(s.prefecture)] ?? 0) + 1;
      }
      return json(res, 200, { counts: c });
    }

    // ---- photos ----
    if (path === "/api/photos" && req.method === "GET") {
      const pref = Number(q.get("prefecture"));
      if (!pref) return err(res, 400, "VALIDATION", "prefecture が必要です");
      const season = q.get("season");
      let list = photos.filter((p) => p.prefecture === pref);
      if (season) list = list.filter((p) => p.season === season);
      return json(res, 200, { photos: list.map((p) => photoJson(p, origin)) });
    }
    if (path === "/api/photos" && req.method === "POST") {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
      // multipartは解析せず、クエリなしの簡易受理(動作確認用)。制約チェックのみ模倣
      await readBody(req);
      const pref = 13, season = "spring"; // 動作確認用固定
      if (photos.some((p) => p.userId === u.id && p.prefecture === pref && p.season === season))
        return err(res, 409, "PHOTO_SLOT_TAKEN", "この場所・季節にはすでにあなたの写真があります");
      const id = `new-${crypto.randomUUID().slice(0, 8)}`;
      photos.push({ id, userId: u.id, storyId: null, prefecture: pref, season });
      return json(res, 201, { id, url: `${origin}/img/${id}.svg`, prefecture: pref, season });
    }
    const delPhoto = path.match(/^\/api\/photos\/([\w-]+)$/);
    if (delPhoto && req.method === "DELETE") {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
      const i = photos.findIndex((p) => p.id === delPhoto[1] && p.userId === u.id);
      if (i < 0) return err(res, 404, "NOT_FOUND", "写真が見つかりません");
      photos.splice(i, 1);
      return json(res, 200, { ok: true });
    }

    // ---- users ----
    const userMatch = path.match(/^\/api\/users\/([\w]+)$/);
    if (userMatch) {
      const u = users.find((x) => x.publicId === userMatch[1]);
      if (!u) return err(res, 404, "NOT_FOUND", "ユーザーが見つかりません");
      return json(res, 200, {
        publicId: u.publicId, username: u.username,
        storyCount: stories.filter((s) => s.userId === u.id).length,
      });
    }

    // ---- reports ----
    if (path === "/api/reports" && req.method === "POST") {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "報告にはログインが必要です");
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      reports.push({ ...b, reporterId: u.id });
      return json(res, 201, { ok: true });
    }

    // ---- stories ----
    if (path === "/api/stories" && req.method === "GET") {
      let list = [...stories];
      if (q.get("prefecture")) list = list.filter((s) => s.prefecture === Number(q.get("prefecture")));
      if (q.get("year")) list = list.filter((s) => s.year === Number(q.get("year")));
      if (q.get("userId")) {
        const u = users.find((x) => x.publicId === q.get("userId"));
        list = u ? list.filter((s) => s.userId === u.id) : [];
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = Math.max(1, Number(q.get("page")) || 1);
      const limit = Math.min(50, Number(q.get("limit")) || 20);
      const slice = list.slice((page - 1) * limit, page * limit);
      return json(res, 200, { stories: slice.map(summary), total: list.length, page });
    }
    if (path === "/api/stories" && req.method === "POST") {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      if (!b.title || !b.body || !b.prefecture || !b.year)
        return err(res, 400, "VALIDATION", "title/body/prefecture/year が必要です");
      const s = seedStory(u.id, Number(b.prefecture), Number(b.year), String(b.title), String(b.body), 0, 0, 0);
      s.likes = 0; s.mets = 0;
      stories.push(s);
      return json(res, 201, { ...summary(s), body: s.body, photos: [] });
    }

    const reactMatch = path.match(/^\/api\/stories\/([\w-]+)\/reactions$/);
    if (reactMatch) {
      const s = stories.find((x) => x.id === reactMatch[1]);
      if (!s) return err(res, 404, "NOT_FOUND", "物語が見つかりません");
      if (req.method === "POST") {
        const b = JSON.parse((await readBody(req)).toString() || "{}");
        if (!["like", "met"].includes(b.type) || !b.anonToken)
          return err(res, 400, "VALIDATION", "type/anonToken が必要です");
        const key = `${s.id}|${b.type}|${b.anonToken}`;
        if (reactions.has(key)) reactions.delete(key); else reactions.add(key);
        return json(res, 200, { ...counts(s.id), reacted: reacted(s.id, b.anonToken) });
      }
      return json(res, 200, { ...counts(s.id), reacted: reacted(s.id, q.get("anonToken") ?? "") });
    }

    const statsMatch = path.match(/^\/api\/stories\/([\w-]+)\/stats$/);
    if (statsMatch) {
      const u = authUser(req);
      if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
      const s = stories.find((x) => x.id === statsMatch[1]);
      if (!s) return err(res, 404, "NOT_FOUND", "物語が見つかりません");
      if (s.userId !== u.id) return err(res, 403, "FORBIDDEN", "権限がありません");
      return json(res, 200, { views: s.views, ...counts(s.id) });
    }

    const storyMatch = path.match(/^\/api\/stories\/([\w-]+)$/);
    if (storyMatch) {
      const s = stories.find((x) => x.id === storyMatch[1]);
      if (!s) return err(res, 404, "NOT_FOUND", "物語が見つかりません");
      if (req.method === "GET") {
        s.views++;
        const u = users.find((x) => x.id === s.userId);
        return json(res, 200, {
          id: s.id, title: s.title, body: s.body, prefecture: s.prefecture, year: s.year,
          username: u.username, userPublicId: u.publicId,
          createdAt: s.createdAt, updatedAt: s.updatedAt,
          ...counts(s.id),
          photos: photos.filter((p) => p.storyId === s.id).map((p) => ({ id: p.id, url: `${origin}/img/${p.id}.svg`, season: p.season })),
        });
      }
      if (req.method === "PUT") {
        const u = authUser(req);
        if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
        if (s.userId !== u.id) return err(res, 403, "FORBIDDEN", "権限がありません");
        const b = JSON.parse((await readBody(req)).toString() || "{}");
        if (b.title !== undefined) s.title = String(b.title);
        if (b.body !== undefined) s.body = String(b.body);
        if (b.prefecture !== undefined) s.prefecture = Number(b.prefecture);
        if (b.year !== undefined) s.year = Number(b.year);
        s.updatedAt = new Date().toISOString();
        return json(res, 200, { ...summary(s), body: s.body, updatedAt: s.updatedAt, photos: [] });
      }
      if (req.method === "DELETE") {
        const u = authUser(req);
        if (!u) return err(res, 401, "UNAUTHORIZED", "ログインが必要です");
        if (s.userId !== u.id) return err(res, 403, "FORBIDDEN", "権限がありません");
        stories.splice(stories.indexOf(s), 1);
        return json(res, 200, { ok: true });
      }
    }

    return err(res, 404, "NOT_FOUND", "エンドポイントが見つかりません");
  } catch (e) {
    console.error(e);
    return err(res, 500, "INTERNAL", "サーバー内部エラー");
  }
});

server.listen(PORT, () => console.log(`mock api on http://localhost:${PORT}`));

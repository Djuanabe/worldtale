// 47都道府県: JIS X 0401 コード・漢字名
// グリッド座標(col,row)はタイル型地図(廃止)専用だったため削除済み。
// 実形状のドット絵マップでの位置は src/japanMap.ts の PREF_CELL_CENTER を参照。
export interface Prefecture {
  code: number; // 1..47
  name: string;
  short: string; // 短縮名
}

export const PREFECTURES: Prefecture[] = [
  { code: 1, name: "北海道", short: "北海道" },
  { code: 2, name: "青森県", short: "青森" },
  { code: 3, name: "岩手県", short: "岩手" },
  { code: 4, name: "宮城県", short: "宮城" },
  { code: 5, name: "秋田県", short: "秋田" },
  { code: 6, name: "山形県", short: "山形" },
  { code: 7, name: "福島県", short: "福島" },
  { code: 8, name: "茨城県", short: "茨城" },
  { code: 9, name: "栃木県", short: "栃木" },
  { code: 10, name: "群馬県", short: "群馬" },
  { code: 11, name: "埼玉県", short: "埼玉" },
  { code: 12, name: "千葉県", short: "千葉" },
  { code: 13, name: "東京都", short: "東京" },
  { code: 14, name: "神奈川県", short: "神奈川" },
  { code: 15, name: "新潟県", short: "新潟" },
  { code: 16, name: "富山県", short: "富山" },
  { code: 17, name: "石川県", short: "石川" },
  { code: 18, name: "福井県", short: "福井" },
  { code: 19, name: "山梨県", short: "山梨" },
  { code: 20, name: "長野県", short: "長野" },
  { code: 21, name: "岐阜県", short: "岐阜" },
  { code: 22, name: "静岡県", short: "静岡" },
  { code: 23, name: "愛知県", short: "愛知" },
  { code: 24, name: "三重県", short: "三重" },
  { code: 25, name: "滋賀県", short: "滋賀" },
  { code: 26, name: "京都府", short: "京都" },
  { code: 27, name: "大阪府", short: "大阪" },
  { code: 28, name: "兵庫県", short: "兵庫" },
  { code: 29, name: "奈良県", short: "奈良" },
  { code: 30, name: "和歌山県", short: "和歌山" },
  { code: 31, name: "鳥取県", short: "鳥取" },
  { code: 32, name: "島根県", short: "島根" },
  { code: 33, name: "岡山県", short: "岡山" },
  { code: 34, name: "広島県", short: "広島" },
  { code: 35, name: "山口県", short: "山口" },
  { code: 36, name: "徳島県", short: "徳島" },
  { code: 37, name: "香川県", short: "香川" },
  { code: 38, name: "愛媛県", short: "愛媛" },
  { code: 39, name: "高知県", short: "高知" },
  { code: 40, name: "福岡県", short: "福岡" },
  { code: 41, name: "佐賀県", short: "佐賀" },
  { code: 42, name: "長崎県", short: "長崎" },
  { code: 43, name: "熊本県", short: "熊本" },
  { code: 44, name: "大分県", short: "大分" },
  { code: 45, name: "宮崎県", short: "宮崎" },
  { code: 46, name: "鹿児島県", short: "鹿児島" },
  { code: 47, name: "沖縄県", short: "沖縄" }
];

export const PREF_BY_CODE: Record<number, Prefecture> = Object.fromEntries(
  PREFECTURES.map((p) => [p.code, p])
);

export function prefName(code: number): string {
  return PREF_BY_CODE[code]?.name ?? `不明(${code})`;
}

export const SEASONS: { key: string; label: string }[] = [
  { key: "spring", label: "春" },
  { key: "summer", label: "夏" },
  { key: "autumn", label: "秋" },
  { key: "winter", label: "冬" }
];

export function seasonLabel(key: string): string {
  return SEASONS.find((s) => s.key === key)?.label ?? key;
}

// 物語のメタ情報（都道府県・市区町村・年・季節）を表示用テキストにする。
// municipality/season が null の古いデータでも崩れないよう、あれば足す形にする。
export function storyMetaText(input: {
  prefecture: number;
  municipality?: string | null;
  year: number;
  season?: string | null;
}): string {
  const place = input.municipality
    ? `${prefName(input.prefecture)} ${input.municipality}`
    : prefName(input.prefecture);
  const parts = [place, `${input.year}年`];
  if (input.season) parts.push(seasonLabel(input.season));
  return parts.join(" ・ ");
}

// ---- 地方区分（地図の2段階選択: 地方ズーム → 都道府県選択 用） ----
export interface Region {
  id: string;
  name: string;
  codes: number[]; // 所属する都道府県コード
}

export const REGIONS: Region[] = [
  { id: "hokkaido", name: "北海道", codes: [1] },
  { id: "tohoku", name: "東北", codes: [2, 3, 4, 5, 6, 7] },
  { id: "kanto", name: "関東", codes: [8, 9, 10, 11, 12, 13, 14] },
  { id: "chubu", name: "中部", codes: [15, 16, 17, 18, 19, 20, 21, 22, 23] },
  { id: "kinki", name: "近畿", codes: [24, 25, 26, 27, 28, 29, 30] },
  { id: "chugoku", name: "中国", codes: [31, 32, 33, 34, 35] },
  { id: "shikoku", name: "四国", codes: [36, 37, 38, 39] },
  { id: "kyushu", name: "九州", codes: [40, 41, 42, 43, 44, 45, 46] },
  { id: "okinawa", name: "沖縄", codes: [47] }
];

export const REGION_BY_PREF: Record<number, Region> = {};
for (const r of REGIONS) {
  for (const c of r.codes) REGION_BY_PREF[c] = r;
}

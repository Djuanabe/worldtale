// 47都道府県: JIS X 0401 コード・漢字名・タイル型地図のグリッド座標(col,row)
// col: 1(西) 〜 11(東) / row: 1(北) 〜 13(南、沖縄は離れた位置)
export interface Prefecture {
  code: number; // 1..47
  name: string;
  short: string; // タイル表示用の短縮名
  col: number;
  row: number;
}

export const PREFECTURES: Prefecture[] = [
  { code: 1, name: "北海道", short: "北海道", col: 11, row: 1 },
  { code: 2, name: "青森県", short: "青森", col: 11, row: 2 },
  { code: 3, name: "岩手県", short: "岩手", col: 11, row: 3 },
  { code: 4, name: "宮城県", short: "宮城", col: 11, row: 4 },
  { code: 5, name: "秋田県", short: "秋田", col: 10, row: 3 },
  { code: 6, name: "山形県", short: "山形", col: 10, row: 4 },
  { code: 7, name: "福島県", short: "福島", col: 10, row: 5 },
  { code: 8, name: "茨城県", short: "茨城", col: 11, row: 6 },
  { code: 9, name: "栃木県", short: "栃木", col: 10, row: 6 },
  { code: 10, name: "群馬県", short: "群馬", col: 9, row: 6 },
  { code: 11, name: "埼玉県", short: "埼玉", col: 10, row: 7 },
  { code: 12, name: "千葉県", short: "千葉", col: 11, row: 7 },
  { code: 13, name: "東京都", short: "東京", col: 10, row: 8 },
  { code: 14, name: "神奈川県", short: "神奈川", col: 10, row: 9 },
  { code: 15, name: "新潟県", short: "新潟", col: 9, row: 5 },
  { code: 16, name: "富山県", short: "富山", col: 8, row: 6 },
  { code: 17, name: "石川県", short: "石川", col: 7, row: 6 },
  { code: 18, name: "福井県", short: "福井", col: 7, row: 7 },
  { code: 19, name: "山梨県", short: "山梨", col: 9, row: 8 },
  { code: 20, name: "長野県", short: "長野", col: 9, row: 7 },
  { code: 21, name: "岐阜県", short: "岐阜", col: 8, row: 7 },
  { code: 22, name: "静岡県", short: "静岡", col: 9, row: 9 },
  { code: 23, name: "愛知県", short: "愛知", col: 8, row: 8 },
  { code: 24, name: "三重県", short: "三重", col: 8, row: 9 },
  { code: 25, name: "滋賀県", short: "滋賀", col: 7, row: 8 },
  { code: 26, name: "京都府", short: "京都", col: 6, row: 8 },
  { code: 27, name: "大阪府", short: "大阪", col: 6, row: 9 },
  { code: 28, name: "兵庫県", short: "兵庫", col: 5, row: 8 },
  { code: 29, name: "奈良県", short: "奈良", col: 7, row: 9 },
  { code: 30, name: "和歌山県", short: "和歌山", col: 6, row: 10 },
  { code: 31, name: "鳥取県", short: "鳥取", col: 5, row: 7 },
  { code: 32, name: "島根県", short: "島根", col: 4, row: 7 },
  { code: 33, name: "岡山県", short: "岡山", col: 5, row: 9 },
  { code: 34, name: "広島県", short: "広島", col: 4, row: 8 },
  { code: 35, name: "山口県", short: "山口", col: 3, row: 8 },
  { code: 36, name: "徳島県", short: "徳島", col: 6, row: 11 },
  { code: 37, name: "香川県", short: "香川", col: 5, row: 10 },
  { code: 38, name: "愛媛県", short: "愛媛", col: 4, row: 9 },
  { code: 39, name: "高知県", short: "高知", col: 5, row: 11 },
  { code: 40, name: "福岡県", short: "福岡", col: 3, row: 9 },
  { code: 41, name: "佐賀県", short: "佐賀", col: 2, row: 9 },
  { code: 42, name: "長崎県", short: "長崎", col: 1, row: 9 },
  { code: 43, name: "熊本県", short: "熊本", col: 2, row: 10 },
  { code: 44, name: "大分県", short: "大分", col: 3, row: 10 },
  { code: 45, name: "宮崎県", short: "宮崎", col: 3, row: 11 },
  { code: 46, name: "鹿児島県", short: "鹿児島", col: 2, row: 11 },
  { code: 47, name: "沖縄県", short: "沖縄", col: 1, row: 13 }
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

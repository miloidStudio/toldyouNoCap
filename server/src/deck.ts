/**
 * 題庫載入。
 *
 * deck.json 是遊戲實際讀取的檔案，格式見 README。
 * 只有 verified: true 的題目會進入遊戲。
 *
 * 注意：`category` 欄位**不會**成為遊戲內的篩選條件——分類本身就是強烈提示，
 * 會破壞「完全不知道這是什麼」的樂趣。它只用於題庫維護，
 * 以及挑選提示關鍵字時確保誘餌來自不同領域。
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question } from '../../shared/types';

const here = dirname(fileURLToPath(import.meta.url));

/** 預設題庫路徑，可用環境變數 DECK_PATH 覆寫 */
export const DECK_PATH = process.env.DECK_PATH
  ? resolve(process.env.DECK_PATH)
  : resolve(here, '../data/deck.json');

let cache: Question[] | null = null;

/** 題庫內容版本，用來讓一場遊戲固定在開局時的題目集合 */
export function getDeckVersion(questions: readonly Question[]): string {
  return createHash('sha256').update(JSON.stringify(questions)).digest('hex').slice(0, 12);
}

export function loadDeck(force = false): Question[] {
  if (cache && !force) return cache;
  const raw = readFileSync(DECK_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Question[];
  if (!Array.isArray(parsed)) {
    throw new Error(`題庫格式錯誤：${DECK_PATH} 應為陣列`);
  }
  const verified = parsed.filter((q) => q.verified);
  if (verified.length === 0) {
    throw new Error(`題庫中沒有任何 verified: true 的題目（${DECK_PATH}）`);
  }

  const missingHint = verified.filter((q) => !q.hintKeyword);
  if (missingHint.length > 0) {
    throw new Error(
      `以下題目缺少 hintKeyword（提示關鍵字）：${missingHint.map((q) => q.id).join('、')}`
    );
  }

  // 提示關鍵字與題目共用字就等於送出半個答案。
  // 這不至於讓遊戲跑不起來，所以只警告不中斷；`npm run deck:audit` 會列得更完整。
  for (const q of verified) {
    const termChars = new Set(q.term);
    if ([...q.hintKeyword].some((c) => termChars.has(c))) {
      console.warn(
        `[deck] 警告：${q.id}「${q.term}」的提示「${q.hintKeyword}」與題目有共用字，會洩底`
      );
    }
  }

  cache = verified;
  return cache;
}

/** 取得所有分類與各分類題數（題庫維護用，不出現在遊戲 UI） */
export function listCategories(deck: readonly Question[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const q of deck) {
    counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** 取得所有題目（包含 verified: false 的停用項目） */
export function loadAllQuestions(): Question[] {
  const raw = readFileSync(DECK_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Question[];
  if (!Array.isArray(parsed)) {
    throw new Error(`題庫格式錯誤：${DECK_PATH} 應為陣列`);
  }
  return parsed;
}

/** 儲存題庫至磁碟並刷新記憶體快取 */
export function saveDeck(questions: readonly Question[]): Question[] {
  const tempPath = `${DECK_PATH}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(questions, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
  renameSync(tempPath, DECK_PATH);
  cache = questions.filter((q) => q.verified);
  return cache;
}

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question } from '../../shared/types';
import { auditDeck } from './validator';

const here = dirname(fileURLToPath(import.meta.url));
const DECK_PATH = resolve(here, '../../server/data/deck.json');

function main() {
  console.log('='.repeat(60));
  console.log('  NoCap — 題庫健康度健檢工具 (Deck Audit)');
  console.log('='.repeat(60));
  console.log(`題庫路徑：${DECK_PATH}\n`);

  let deck: Question[] = [];
  try {
    const raw = readFileSync(DECK_PATH, 'utf-8');
    deck = JSON.parse(raw);
  } catch (err: any) {
    console.error('無法讀取題庫檔案：', err.message);
    process.exit(1);
  }

  const result = auditDeck(deck);

  console.log(`📊 總題目數：${result.total} 筆`);
  console.log(`✅ 規格完全合規：${result.validCount} 筆`);
  console.log(`❌ 錯誤項目：${result.errors.length} 項`);
  console.log(`⚠️  警告項目：${result.warnings.length} 項\n`);

  console.log('📂 領域分類分佈 (用於提示關鍵字誘餌挑選)：');
  const catEntries = Object.entries(result.categories).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of catEntries) {
    const bar = '█'.repeat(Math.round((count / result.total) * 20));
    console.log(`  - ${cat.padEnd(8)} : ${String(count).padStart(2)} 題 ${bar}`);
  }
  console.log('');

  if (result.errors.length > 0) {
    console.log('🚨 發現嚴重錯誤（可能導致遊戲當機或直接洩底）：');
    for (const err of result.errors) {
      console.log(`  [${err.id}]「${err.term}」: ${err.message}`);
    }
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('⚠️ 建議改善項目（不影響遊戲運作，但可提升遊玩體驗）：');
    for (const w of result.warnings) {
      console.log(`  [${w.id}]「${w.term}」: ${w.message}`);
    }
    console.log('');
  }

  if (result.errors.length === 0) {
    console.log('🎉 題庫健檢完畢，所有題目均符合遊戲防呆與洩底安全規範！');
  } else {
    process.exit(1);
  }
}

main();

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question } from '../../shared/types';
import { generateMockQuestions, generateWithGemini, INTELLECTUAL_CATEGORIES, RawCandidate } from './gemini';
import { getNextQuestionId, validateQuestion } from './validator';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DECK_PATH = resolve(here, '../../server/data/deck.json');

function printUsage() {
  console.log(`
NoCap — 知識分子硬核題庫生成工具

使用方式：
  npm run deck:build -- [選項]

選項：
  --count, -n <數字>     要生成的題目數量（預設：5）
  --category, -c <分類>   限定題目領域，預設分類清單：
                         ${INTELLECTUAL_CATEGORIES.map((c) => `"${c}"`).join('、')}
  --topic, -t <主題>      自訂主題或風格傾向（例如："量子力學佯謬"、"古羅馬冷門政治奇案"）
  --model, -m <模型>      指定 Gemini 模型名稱（預設：gemini-3.6-flash）
  --reset                將題庫重設回最初的 30 題示範題庫
  --mock                 使用內建硬核模擬題庫，不需 API Key（用於測試流程）
  --dry-run              僅預覽生成結果，不寫入檔案
  --output, -o <路徑>     指定輸出題庫路徑（預設：server/data/deck.json）
  --help, -h             顯示此說明資訊

範例：
  # 透過 Gemini 生成 10 題高難度哲學與賽局題目
  export GEMINI_API_KEY="你的金鑰"
  npm run deck:build -- -n 10 -c "哲學悖論與認識論"

  # 生成 20 題深奧冷門知識（涵蓋全領域）
  npm run deck:build -- -n 20

  # 離線預覽 3 題硬核範例（不修改檔案）
  npm run deck:build -- -n 3 --mock --dry-run
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let count = 5;
  let category: string | undefined;
  let topic: string | undefined;
  let model: string | undefined;
  let mock = false;
  let dryRun = false;
  let reset = false;
  let deckPath = DEFAULT_DECK_PATH;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--count' || arg === '-n') {
      count = parseInt(args[++i], 10) || 5;
    } else if (arg === '--category' || arg === '-c') {
      category = args[++i];
    } else if (arg === '--topic' || arg === '-t') {
      topic = args[++i];
    } else if (arg === '--model' || arg === '-m') {
      model = args[++i];
    } else if (arg === '--mock') {
      mock = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--reset') {
      reset = true;
    } else if (arg === '--output' || arg === '-o') {
      deckPath = resolve(args[++i]);
    }
  }

  // 讀取現有題庫
  let existingDeck: Question[] = [];
  try {
    const content = readFileSync(deckPath, 'utf-8');
    existingDeck = JSON.parse(content);
  } catch (err: any) {
    console.error(`無法讀取題庫檔案（${deckPath}）：`, err.message);
    process.exit(1);
  }

  if (reset) {
    const original30 = existingDeck.slice(0, 30);
    writeFileSync(deckPath, JSON.stringify(original30, null, 2) + '\n', 'utf-8');
    console.log(`🧹 已成功將題庫重設回最初的 30 筆示範題目。`);
    existingDeck = original30;
    if (args.length === 1) {
      // 僅做 reset
      return;
    }
  }

  console.log('='.repeat(60));
  console.log('  NoCap 題庫生成工具 (知識分子硬核專用版)');
  console.log('='.repeat(60));
  console.log(`模式: ${mock ? '離線模擬 (--mock)' : 'Gemini API'}`);
  console.log(`生成題數: ${count}`);
  if (category) console.log(`指定領域: ${category}`);
  if (topic) console.log(`自訂主題: ${topic}`);
  if (dryRun) console.log('【注意】開啟了 --dry-run，結果將不會寫入檔案');
  console.log('-'.repeat(60));

  const existingTerms = new Set(existingDeck.map((q) => q.term.trim()));
  console.log(`現有題庫共有 ${existingDeck.length} 筆題目。`);

  // 產生題目
  let rawList: RawCandidate[] = [];
  try {
    if (mock) {
      console.log('正在從內建硬核題庫提取候選題目...');
      rawList = generateMockQuestions(count, existingTerms);
    } else {
      console.log(`正在呼叫 Gemini (${model || process.env.GEMINI_MODEL || 'gemini-3.6-flash'}) 深度檢索高難度題目...`);
      rawList = await generateWithGemini({
        count,
        category,
        topic,
        model,
        existingTerms,
      });
    }
  } catch (err: any) {
    console.error('❌ 生成失敗：', err.message);
    process.exit(1);
  }

  console.log(`成功獲取 ${rawList.length} 筆候選題目，正在驗證規格與防洩底規則...\n`);

  const validQuestions: Question[] = [];
  let tempDeck = [...existingDeck];

  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    const validation = validateQuestion(raw, existingTerms);

    console.log(`[${i + 1}/${rawList.length}] 題目：「${raw.term}」 (${raw.category}) [難度 ${raw.difficulty || 3}]`);
    console.log(`     提示詞：「${raw.hintKeyword}」`);
    console.log(`     釋義：${raw.definition}`);

    if (validation.valid) {
      const nextId = getNextQuestionId(tempDeck);
      const question: Question = {
        id: nextId,
        term: raw.term.trim(),
        definition: raw.definition.trim(),
        category: raw.category.trim(),
        hintKeyword: raw.hintKeyword.trim(),
        difficulty: raw.difficulty || 3,
        sourceUrl: raw.sourceUrl || `https://zh.wikipedia.org/wiki/${encodeURIComponent(raw.term.trim())}`,
        pageviews: 15,
        dykHook: raw.dykHook ?? null,
        verified: true,
      };

      validQuestions.push(question);
      tempDeck.push(question);
      existingTerms.add(question.term);
      console.log(`     ✅ 驗證通過，指派 ID: ${nextId}`);
      for (const w of validation.issues.filter((x) => x.severity === 'warning')) {
        console.log(`        ⚠️ 提示: ${w.message}`);
      }
    } else {
      console.log('     ❌ 驗證失敗（已剔除）：');
      for (const err of validation.issues.filter((x) => x.severity === 'error')) {
        console.log(`        - ${err.message}`);
      }
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`統計：候選 ${rawList.length} 筆，符合規格 ${validQuestions.length} 筆。`);

  if (validQuestions.length === 0) {
    console.log('⚠️ 沒有任何合格的題目可加入。');
    return;
  }

  if (dryRun) {
    console.log('✨ 由於啟用了 --dry-run，未實際寫入檔案。');
    console.log('若確認無誤，移除 --dry-run 參數即可真正擴充題庫。');
    return;
  }

  // 寫入題庫
  const updatedDeck = [...existingDeck, ...validQuestions];
  try {
    writeFileSync(deckPath, JSON.stringify(updatedDeck, null, 2) + '\n', 'utf-8');
    console.log(`🎉 成功寫入 ${validQuestions.length} 題到 ${deckPath}！`);
    console.log(`目前題庫總題數已達到：${updatedDeck.length} 題。`);
  } catch (err: any) {
    console.error('寫入檔案時發生錯誤：', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('執行過程發生例外：', err);
  process.exit(1);
});

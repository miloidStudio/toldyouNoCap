import { Question } from './types';

export interface ValidationIssue {
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * 檢查兩個字串是否有共用字元（忽略大小寫與空白）
 * 用於檢查 hintKeyword 是否洩漏了 term 中的字
 */
export function hasCharOverlap(term: string, hintKeyword: string): boolean {
  const cleanTerm = term.replace(/\s+/g, '').toLowerCase();
  const cleanHint = hintKeyword.replace(/\s+/g, '').toLowerCase();
  const termChars = new Set(cleanTerm);
  return [...cleanHint].some((char) => termChars.has(char));
}

/**
 * 取得下一個可用的題目 ID（如 q-0031）
 */
export function getNextQuestionId(existingDeck: readonly Question[]): string {
  let maxNum = 0;
  for (const q of existingDeck) {
    const match = q.id.match(/^q-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `q-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * 驗證單一題目資料是否合規
 */
export function validateQuestion(
  q: Partial<Question>,
  existingTerms: Set<string> = new Set()
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Term 詞彙檢查
  if (!q.term || typeof q.term !== 'string' || q.term.trim().length === 0) {
    issues.push({ field: 'term', message: '題目詞彙 (term) 不可為空', severity: 'error' });
  } else {
    const trimmed = q.term.trim();
    if (trimmed.length < 2) {
      issues.push({ field: 'term', message: `題目「${trimmed}」字數過短（至少 2 字）`, severity: 'warning' });
    } else if (trimmed.length > 25) {
      issues.push({ field: 'term', message: `題目「${trimmed}」字數過長（建議 10 字以內）`, severity: 'warning' });
    }
    if (existingTerms.has(trimmed)) {
      issues.push({ field: 'term', message: `題目「${trimmed}」與現有題庫重複`, severity: 'error' });
    }
  }

  // 2. Definition 定義檢查
  if (!q.definition || typeof q.definition !== 'string' || q.definition.trim().length === 0) {
    issues.push({ field: 'definition', message: '定義 (definition) 不可為空', severity: 'error' });
  } else {
    const len = q.definition.trim().length;
    if (len < 20) {
      issues.push({ field: 'definition', message: `定義長度過短（僅 ${len} 字，建議 60~130 字）`, severity: 'warning' });
    } else if (len > 250) {
      issues.push({ field: 'definition', message: `定義長度過長（達 ${len} 字，老實人 20 秒內難以讀完）`, severity: 'warning' });
    }
  }

  // 3. Category 分類檢查
  if (!q.category || typeof q.category !== 'string' || q.category.trim().length === 0) {
    issues.push({ field: 'category', message: '分類 (category) 不可為空', severity: 'error' });
  }

  // 4. HintKeyword 提示詞檢查（核心關鍵！）
  if (!q.hintKeyword || typeof q.hintKeyword !== 'string' || q.hintKeyword.trim().length === 0) {
    issues.push({ field: 'hintKeyword', message: '提示關鍵字 (hintKeyword) 必填', severity: 'error' });
  } else {
    const hint = q.hintKeyword.trim();
    if (hint.length < 2 || hint.length > 10) {
      issues.push({ field: 'hintKeyword', message: `提示關鍵字「${hint}」長度建議為 2~6 字`, severity: 'warning' });
    }

    if (q.term && hasCharOverlap(q.term, hint)) {
      issues.push({
        field: 'hintKeyword',
        message: `提示「${hint}」與題目「${q.term}」存在共用字元，會直接洩底！`,
        severity: 'error',
      });
    }
  }

  // 5. Difficulty 難度檢查
  if (q.difficulty !== undefined && ![1, 2, 3].includes(q.difficulty as number)) {
    issues.push({ field: 'difficulty', message: '難度必須為 1、2 或 3', severity: 'error' });
  }

  const valid = !issues.some((i) => i.severity === 'error');
  return { valid, issues };
}

/**
 * 對整個題庫進行全面健康度檢查
 */
export function auditDeck(deck: readonly Question[]): {
  total: number;
  validCount: number;
  categories: Record<string, number>;
  errors: { id: string; term: string; message: string }[];
  warnings: { id: string; term: string; message: string }[];
} {
  const ids = new Set<string>();
  const terms = new Set<string>();
  const categories: Record<string, number> = {};
  const errors: { id: string; term: string; message: string }[] = [];
  const warnings: { id: string; term: string; message: string }[] = [];

  for (const q of deck) {
    // 檢查 ID 重複
    if (ids.has(q.id)) {
      errors.push({ id: q.id, term: q.term, message: `ID「${q.id}」重複出現` });
    } else {
      ids.add(q.id);
    }

    // 檢查單題品質
    const res = validateQuestion(q, terms);
    for (const issue of res.issues) {
      if (issue.severity === 'error') {
        errors.push({ id: q.id, term: q.term, message: issue.message });
      } else {
        warnings.push({ id: q.id, term: q.term, message: issue.message });
      }
    }

    if (q.term) terms.add(q.term.trim());
    if (q.category) {
      categories[q.category] = (categories[q.category] ?? 0) + 1;
    }
  }

  return {
    total: deck.length,
    validCount: deck.length - errors.length,
    categories,
    errors,
    warnings,
  };
}

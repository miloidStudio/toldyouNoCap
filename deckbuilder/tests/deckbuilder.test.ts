import { describe, expect, it } from 'vitest';
import { Question } from '../../shared/types';
import { generateMockQuestions } from '../src/gemini';
import { auditDeck, getNextQuestionId, hasCharOverlap, validateQuestion } from '../src/validator';

describe('validator (題目格式與防洩底檢驗)', () => {
  describe('hasCharOverlap (字元重疊/洩底檢驗)', () => {
    it('若提示字包含題目中的任一字，應回傳 true', () => {
      expect(hasCharOverlap('高鼻羚羊', '羚羊')).toBe(true);
      expect(hasCharOverlap('指猴', '猴爪')).toBe(true);
      expect(hasCharOverlap('薛丁格的貓', '貓咪')).toBe(true);
      expect(hasCharOverlap('Quantum', 'quantum physics')).toBe(true);
    });

    it('若完全沒有重疊字元，應回傳 false', () => {
      expect(hasCharOverlap('指猴', '覓食')).toBe(false);
      expect(hasCharOverlap('超流體', '低溫')).toBe(false);
      expect(hasCharOverlap('飛地', '邊界')).toBe(false);
      expect(hasCharOverlap('荷蘭病', '匯率')).toBe(false);
    });
  });

  describe('getNextQuestionId (自動遞增 ID 計算)', () => {
    it('空題庫時預設從 q-0001 開始', () => {
      expect(getNextQuestionId([])).toBe('q-0001');
    });

    it('能正確找到現有題庫最大 ID 並遞增', () => {
      const mockDeck = [
        { id: 'q-0001' },
        { id: 'q-0029' },
        { id: 'q-0030' },
      ] as Question[];
      expect(getNextQuestionId(mockDeck)).toBe('q-0031');
    });
  });

  describe('validateQuestion (單題驗證)', () => {
    const validQuestion: Partial<Question> = {
      term: '蜜罐蟻',
      definition: '某些螞蟻族群中專門負責儲糧的工蟻，腹部膨脹成球狀儲存蜜露，食物短缺時再反芻餵養同伴。',
      category: '動物冷知識',
      hintKeyword: '儲藏',
      difficulty: 2,
    };

    it('標準合規題目應驗證成功', () => {
      const res = validateQuestion(validQuestion);
      expect(res.valid).toBe(true);
      expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });

    it('缺少 hintKeyword 時應判定不合規', () => {
      const res = validateQuestion({ ...validQuestion, hintKeyword: '' });
      expect(res.valid).toBe(false);
      expect(res.issues.some((i) => i.field === 'hintKeyword')).toBe(true);
    });

    it('提示詞與題目有共用字（洩底）時應判定不合規', () => {
      const res = validateQuestion({ ...validQuestion, hintKeyword: '螞蟻儲存' });
      expect(res.valid).toBe(false);
      expect(res.issues.some((i) => i.message.includes('洩底'))).toBe(true);
    });

    it('題目名稱重複時應判定不合規', () => {
      const existing = new Set(['蜜罐蟻']);
      const res = validateQuestion(validQuestion, existing);
      expect(res.valid).toBe(false);
      expect(res.issues.some((i) => i.message.includes('重複'))).toBe(true);
    });
  });

  describe('auditDeck (題庫健檢)', () => {
    it('能正確統計各分類題數與揪出錯誤', () => {
      const deck: Question[] = [
        {
          id: 'q-0001',
          term: '指猴',
          definition: '馬達加斯加夜行性靈長類，中指特長能勾出樹幹中的蛀蟲。',
          category: '動物冷知識',
          hintKeyword: '覓食',
          difficulty: 2,
          sourceUrl: 'https://example.com',
          pageviews: 10,
          dykHook: null,
          verified: true,
        },
        {
          id: 'q-0001', // 重複 ID
          term: '壞題目',
          definition: '太短',
          category: '歷史',
          hintKeyword: '題目', // 洩底
          difficulty: 2,
          sourceUrl: '',
          pageviews: 0,
          dykHook: null,
          verified: true,
        },
      ];

      const result = auditDeck(deck);
      expect(result.total).toBe(2);
      expect(result.categories['動物冷知識']).toBe(1);
      expect(result.categories['歷史']).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('generateMockQuestions (模擬產題)', () => {
    it('產出題目應符合題目驗證標準', () => {
      const mocks = generateMockQuestions(3);
      expect(mocks).toHaveLength(3);
      for (const m of mocks) {
        const res = validateQuestion(m);
        expect(res.valid).toBe(true);
      }
    });
  });
});

import { INTELLECTUAL_CATEGORIES } from '../../shared/types';

export interface GenerateOptions {
  count: number;
  category?: string;
  topic?: string;
  model?: string;
  apiKey?: string;
  existingTerms?: Set<string>;
}

export interface RawCandidate {
  term: string;
  definition: string;
  category: string;
  hintKeyword: string;
  decoyKeywords?: [string, string];
  decoyRationales?: [string, string];
  difficulty: 1 | 2 | 3;
  sourceUrl?: string;
  dykHook?: string | null;
}

export async function generateIntellectualQuestions(options: GenerateOptions): Promise<RawCandidate[]> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('未設定 GEMINI_API_KEY，無法呼叫 AI 生成。');
  }

  const model = options.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const existingTerms = options.existingTerms ?? new Set<string>();

  const hasCustomTopic = Boolean(options.topic && options.topic.trim());
  const customTopic = options.topic?.trim() || '';

  const topicPriorityBlock = hasCustomTopic
    ? `
【🔥 本次最高優先核心主題／風格指令（權重最高，優先於一般學術指引）】：
出題者明確指定了題目主題與風格：「${customTopic}」！
★ 請將此主題作為【最高出題宗旨】，所有題目必須 100% 圍繞此主題發想！
★ 若此主題涉及次文化、動漫（如獵人、海賊王、咒術迴戰、鋼之鍊金術師等）、遊戲（如星海爭霸、艾爾登法環、薩爾達、魔獸等）、科幻/奇幻小說或影視設定，請大膽且專注地挑選該主題中深度冷門、極具震撼力、反直覺或具有望文生義陷阱的設定名詞，切勿偏離回傳統學術科學！`
    : '';

  const categoryInstruction = options.category
    ? `所有題目必須屬於此分類：「${options.category}」`
    : hasCustomTopic
      ? `請依主題自訂最適切的分類名稱（如「遊戲與動漫設定深度冷知識」、「科幻奇幻與次文化世界觀」或對應領域）`
      : `請均勻涵蓋以下高度學術深度分類：${(INTELLECTUAL_CATEGORIES || []).join('、')}`;

  const topicInstruction = hasCustomTopic
    ? `【核心風格保證】：全數題目必須深度貫徹指定主題「${customTopic}」，絕不可出現與該主題無關的泛泛科普題目！`
    : '深入挖掘哲學思想實驗、理論物理、深奧賽局理論、冷門歷史條約或罕見演化機制的刁鑽命題';

  const existingTermsList = [...existingTerms].slice(-40).join('、');

  const systemPrompt = `你是繁體中文派對推理遊戲《NoCap》的出題編輯。
    ${topicPriorityBlock}
選擇冷門、反直覺、名稱容易望文生義的真實概念或深度虛構設定，避免生活常識、
中小學知識、流行心理學與只靠死背人名的題目。${topicInstruction}

生成 ${options.count} 題，規格如下：
1. term：2~10 字。${hasCustomTopic ? `嚴格切合「${customTopic}」` : '看名稱不容易直接知道答案'}。${existingTermsList ? `不得與這些題目重複：${existingTermsList}` : ''}
2. definition：繁體中文 45~80 字。寫給「聰明但不是該領域專家」的玩家，能讀完後自然轉述。先講它是什麼，再講最有趣的機制或反差；必要專有名詞最多一個，且立刻用白話解釋。不要像百科條目或論文摘要。
3. hintKeyword：真正相關的 2 字宏觀領域，例如天文、地理、物理、生物、心理、哲學、歷史、語言、經濟、政治、動漫、遊戲。不得包含 term 的字。
4. decoyKeywords：兩個各 2 字的假「宏觀領域」，例如生物、文化、宗教、習俗、醫學、哲學、政治、歷史、藝術、科技。它們要讓只看名稱的人覺得題目可能屬於該領域，但不能直接拆取或改寫 term 的字詞，也不能包含 term 出現過的任何字元。禁止使用「貧窮、花卉、摩登」這種字面答案或無意義諧音，也不能與真提示相同。
5. decoyRationales：分別用一句短句說明題目名稱為何可能被誤認為該領域，僅供編輯審核。
6. category：${categoryInstruction}。
7. difficulty 固定為 3；sourceUrl 必須是可核對的原始或百科來源。

請直接輸出 JSON Array，不要包含額外 markdown 標籤或對話，格式如下：
[
  {
    "term": "高深詞彙名稱",
    "definition": "白話而準確的真實定義與機制（45-80字）",
    "category": "分類名稱",
    "hintKeyword": "動漫/遊戲/哲學/物理等2字宏觀領域",
    "decoyKeywords": ["生物", "文化"],
    "decoyRationales": ["誤讀原因一", "誤讀原因二"],
    "difficulty": 3,
    "sourceUrl": "https://zh.wikipedia.org/wiki/...",
    "dykHook": null
  }
]`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(45_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.85,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if ((response.status === 503 || response.status === 429) && attempt < 3) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
          console.warn(`[gemini] 第 ${attempt} 次請求遇高乘載 (${response.status})，稍後重試`);
          await new Promise((r) => setTimeout(r, waitMs + Math.random() * 300));
          continue;
        }
        throw new Error(`Gemini API 請求失敗 (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as any;
      const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!contentText) throw new Error('Gemini API 未回傳文字');

      return JSON.parse(contentText) as RawCandidate[];
    } catch (err: any) {
      lastError = err;
      if (attempt < 3 && err.message?.includes('503')) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Gemini API 重試失敗');
}

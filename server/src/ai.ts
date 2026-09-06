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

  const systemPrompt = `你是一位專為【頂尖知識分子、名校學者、硬核燒腦愛好者】設計派對桌遊《NoCap》（話術推理桌遊）的資深出題專家。
${topicPriorityBlock}
【玩家背景】：
本場玩家皆為受過高等教育的知識分子求知慾極強、熱愛新奇的資訊（未必是真實世界，也能是虛構故事或科幻與奇幻故事的資訊）。
日常生活中大家耳熟能詳的科普常識、名詞或物品（如：鞋拔、馬卡龍、過橋米線、三秒法則、巴納姆效應、破窗效應、破天荒、黑天鵝效應等）在他們眼中完全是送分題，會讓瞎掰人無法唬爛、老實人喪失樂趣，毀掉整場遊戲！

【核心出題宗旨】：
每道題目必須具備【極高的智識門檻、反直覺性、學術趣味、或具有望文生義陷阱的冷門悖論/定理/歷史奇聞，抑或是次文化中（如知名的動漫與電玩）比較小眾冷門的設定與概念】！
目標是：即使全場都是名校博士或各領域專家，看到題目名稱時，全場有 80% 以上的人「未曾聽過這個名詞」或「就算隱約聽過名字也絕對說不準其真正令人驚奇的深層定義」！

【絕對嚴格禁止事項（違規即為嚴重失敗）】：
1. 嚴禁任何台灣文化日常生活用品、食物小吃、常見動植物（如：鞋拔、馬卡龍、過橋米線、鴨嘴獸、發財樹等），但若是其他文化如日本、東南亞、歐美甚至是原住民族的日常用品，不過看名字未必知道是什麼的話就沒問題，可能是否某種音譯的名詞！
2. 嚴禁中小學教科書已收錄的普及常識（如：光合作用、牛頓第三定律、光速、DNA雙螺旋、大陸漂移）！
3. 嚴禁大眾俗語、成語典故（如：破天荒、亂七八糟、作壁上觀），但如果看文字很難猜以及不是來源於中文，而是翻譯的可能就可以！
4. 嚴禁氾濫的通俗心理學或流行科普（如：巴納姆效應、三秒法則、破窗效應、黑天鵝效應、吸引力法則）！

請生成 ${options.count} 筆符合以下規格的繁體中文題目：
1. 【詞彙 (term)】：長度 2~8 字。${hasCustomTopic ? `必須嚴格切合指定主題「${customTopic}」！` : '學術專有名詞、著名思想實驗、反直覺定理、歷史奇聞或深度次文化名詞。'}${existingTermsList ? `嚴格避免與現有題目重複：${existingTermsList}` : '不可重複'}。
2. 【定義 (definition)】：繁體中文，約 70~130 字，深入說清楚真實核心機制與驚奇真相，語言具體清晰，適合口述。
3. 【提示關鍵字 (hintKeyword)】（最高優先 - 標示題目所屬的宏觀領域）：
   - 【只能填寫宏觀領域／分類名稱（固定 2 個字）】！
   - 【重要：領域必須多樣化且精準，涵蓋次文化與虛構創作】：
     * 次文化、娛樂與虛構創作（重大糾錯）：
       - 動漫作品名詞與設定（例如：「窮人的薔薇」、「聖地瑪麗喬亞」、「絕對領域」）：提示詞必須是「動漫」，【嚴格禁止】生硬誤標為「軍事」、「政治」或「物理」！
       - 電玩遊戲機制與世界觀（例如：「卡拉」、「靈魂鐘聲」、「泰倫蟲族」）：提示詞必須是「遊戲」，【嚴格禁止】誤標為「哲學」、「心理」或「生物」！
       - 影視、科幻奇幻小說或神話概念：請填寫「影視」、「小說」、「神話」或「文化」！
     * 傳統人文與自然科學：
       - 可填寫：天文、地理、物理、化學、生物、心理、哲學、歷史、語言、經濟、政治、數學、賽局、考古、軍事、文化、醫學、法律、藝術、科技等。
   - 【嚴格禁止】過於細節、具體或描述性的詞彙（如「選擇癱瘓」、「宇宙妄想」、「量子曙光」、「真理巧合」皆為錯誤！必須精簡為所屬 2 字宏觀領域，如「動漫」、「遊戲」、「哲學」、「物理」、「歷史」等）。
   - 【防洩底鐵律】：大部分情況下不能包含【詞彙】本身出現過的任何一個字元！（例如題目有名稱「數」則領域不可填「數學」，可改用「邏輯」；題目有「語」不可填「語言」，可改用「文化」）。
4. 【領域分類 (category)】：${categoryInstruction}。
5. 【難度 (difficulty)】：3（極冷門）。
6. 【來源連結 (sourceUrl)】：對應維基百科條目或資料來源連結。
7. ${topicInstruction}

請直接輸出 JSON Array，不要包含額外 markdown 標籤或對話，格式如下：
[
  {
    "term": "高深詞彙名稱",
    "definition": "精確深入的真實定義與機制（70-130字）",
    "category": "分類名稱",
    "hintKeyword": "動漫/遊戲/哲學/物理等2字宏觀領域",
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
          console.warn(`[gemini] 第 ${attempt} 次請求遇高乘載 (${response.status})，1.5 秒後自動重試...`);
          await new Promise((r) => setTimeout(r, 1500 * attempt));
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


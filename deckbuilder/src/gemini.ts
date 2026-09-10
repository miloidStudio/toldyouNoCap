import { Question, INTELLECTUAL_CATEGORIES } from '../../shared/types';
import { validateQuestion } from './validator';

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

export { INTELLECTUAL_CATEGORIES };

/**
 * 離線模擬資料產生器（硬核知識分子版本，供 --mock 或無 API Key 時測試管道）
 */
export function generateMockQuestions(count: number, existingTerms: Set<string> = new Set()): RawCandidate[] {
  const mocks: RawCandidate[] = [
    {
      term: '波茲曼大腦',
      definition: '熱力學與宇宙學思想實驗。假定宇宙由熱寂狀態歷經無窮隨機量子漲落，則由虛空中直接自發凝聚出一個具備完整虛假記憶的人類大腦，其機率遠高於演化出整個真實宇宙。',
      category: '理論物理與高深科學',
      hintKeyword: '物理',
      decoyKeywords: ['哲學', '心理'],
      decoyRationales: ['名稱像思想實驗，可能被歸入哲學。', '名稱提到大腦，可能被歸入心理。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/玻尔兹曼大脑',
      dykHook: '宇宙中的大腦真的可能比整個真實宇宙更容易在虛空中隨機生成嗎？',
    },
    {
      term: '維根斯坦的甲蟲',
      definition: '哲學家維根斯坦提出的思想實驗。假設每個人盒子裡都有一隻「甲蟲」，且誰也看不到別人的盒子。如果「甲蟲」指代純私密的內部感官體驗，則這個詞在人際溝通中其實根本沒有客觀指涉意義。',
      category: '哲學悖論與認識論',
      hintKeyword: '哲學',
      decoyKeywords: ['生物', '語言'],
      decoyRationales: ['名稱提到甲蟲，可能被歸入生物。', '人名音譯也可能像語言學術語。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/私有语言论证',
      dykHook: null,
    },
    {
      term: '綠鬍子效應',
      definition: '演化生物學假說，指利他基因如果同時能表達出顯眼的辨識標籤（如綠鬍子），並促使攜帶者只對同樣有綠鬍子的個體提供無私幫助，就能在自私的基因演化競賽中迅速擴散。',
      category: '演化生物與罕見生理機制',
      hintKeyword: '生物',
      decoyKeywords: ['民俗', '時尚'],
      decoyRationales: ['奇特外貌名稱可能像民俗象徵。', '鬍子顏色也可能讓人想到時尚。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/绿胡子效应',
      dykHook: null,
    },
    {
      term: '顫抖手均衡',
      definition: '博弈論中對納許均衡的精煉概念。考慮到玩家在做決策時可能會因為手滑或心理波動而有極微小機率「按錯鈕」，只有在面對這種極微小的擾動時依然穩健的最佳策略，才稱為顫抖手均衡。',
      category: '賽局理論與行為經濟學',
      hintKeyword: '賽局',
      decoyKeywords: ['醫學', '心理'],
      decoyRationales: ['顫抖可能被理解成醫學症狀。', '手部反應也可能被理解成心理現象。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/颤抖手完美均衡',
      dykHook: null,
    },
    {
      term: '蓋梯爾問題',
      definition: '知識論著名的哲學難題。傳統哲學認為「知識就是得到證實的真實信念」，但蓋梯爾提出一系列反例，證明一個人即使擁有的信念恰好正確且有充分理由，也有可能純粹只是運氣好而巧合吻合。',
      category: '哲學悖論與認識論',
      hintKeyword: '哲學',
      decoyKeywords: ['法律', '教育'],
      decoyRationales: ['人名加問題可能像法律案例。', '也可能被誤認為教育理論。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/葛梯尔问题',
      dykHook: null,
    },
    {
      term: '卡西米爾效應',
      definition: '量子場論中的宏觀物理現象。在真空中將兩塊完全不帶電的中性金屬板平行放置於微米間距，因兩板間受限的真空零點能量模式少於外側，真空漲落會對金屬板產生微小但可測量的相互吸引力。',
      category: '理論物理與高深科學',
      hintKeyword: '物理',
      decoyKeywords: ['金融', '心理'],
      decoyRationales: ['人名加效應可能像金融現象。', '也可能被誤認為心理效應。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/卡西米尔效应',
      dykHook: null,
    },
    {
      term: '薩丕爾-沃夫假說',
      definition: '語言學與認知人類學理論，認為不同語言的文法範疇和詞彙結構會直接形塑甚至決定其說話者的思維方式、世界觀，以及對時空與因果關係的客觀認知。',
      category: '語言學與符號學',
      hintKeyword: '語言',
      decoyKeywords: ['生物', '哲學'],
      decoyRationales: ['沃夫的讀音可能讓人想到生物。', '假說名稱也可能讓人猜是哲學。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/萨丕尔-沃夫假说',
      dykHook: null,
    },
    {
      term: '布瓦西耶效應',
      definition: '認知心理學現象，指人在極度專注於視覺資訊搜尋任務時，注意力瓶頸會導致周遭極為巨大突兀的聲音或聽覺刺激完全無法進入意識被大腦感知，彷彿暫時聽力喪失。',
      category: '認知科學與深層心理學',
      hintKeyword: '心理',
      decoyKeywords: ['語言', '醫學'],
      decoyRationales: ['音譯名稱可能像語言學概念。', '效應名稱也可能被猜成醫學現象。'],
      difficulty: 3,
      sourceUrl: 'https://zh.wikipedia.org/wiki/不注意视盲',
      dykHook: null,
    },
  ];

  const pool = mocks.filter((m) => !existingTerms.has(m.term));
  return pool.slice(0, count);
}

/**
 * 呼叫 Google Gemini API 批次生成【頂尖知識分子高難度】題目
 */
export async function generateWithGemini(options: GenerateOptions): Promise<RawCandidate[]> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      '未設定 GEMINI_API_KEY。請設定環境變數（export GEMINI_API_KEY="你的金鑰"）或使用 --mock 模式測試。'
    );
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
      : `請均勻涵蓋以下高度學術深度分類：${INTELLECTUAL_CATEGORIES.join('、')}`;

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

【適合的高難度範疇範例】：
- 哲學/邏輯/思想實驗：維根斯坦的甲蟲、布里丹之驢、瑪麗房間、中文房間、蓋梯爾問題、紐康姆悖論、波茲曼大腦
- 理論物理/數學：卡西米爾效應、紫外線災難、龐加萊回歸、超流體第二聲波、麥克斯韋妖、拉馬努金求和、托卡馬克
- 賽局/經濟/決策：顫抖手均衡、阿羅不可能定理、柯斯定理、康多塞投票悖論、勝者的詛咒、塔西佗陷阱
- 演化生物/異常機制：綠鬍子效應、紅皇后假說、漢彌爾頓親屬選擇法則、柯普法則、瓦斯曼屏障
- 冷僻歷史/地緣外交奇聞：比爾泰維勒無主地、托爾德西里亞斯線、推子狂熱、皮爾當人骨贗品案、桑給巴爾38分鐘戰爭

請生成 ${options.count} 筆符合以下【頂級硬核規格】的繁體中文題目：
1. 【詞彙 (term)】：
   - 長度 2~8 字。
   ${hasCustomTopic ? `- ★ 必須嚴格切合指定主題「${customTopic}」！` : '- 專業術語、學者人名悖論、理論假說、歷史名詞或次文化深度設定名詞。'}
   - ${existingTermsList ? `嚴格避免與現有題目重複：${existingTermsList}` : '不可重複'}。
2. 【定義 (definition)】：
   - 繁體中文，約 45~80 字。
   - 必須深入說清楚「真實的核心機制、思想實驗內容或背後的荒謬/驚奇歷史真相」，語言具體精準，老實人可在 20 秒內理解關鍵字眼並在討論時用自己的話口述。
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
4. 【誘餌領域 (decoyKeywords)】：
   - 必須剛好提供兩個固定 2 字的宏觀領域，例如生物、文化、宗教、民俗、醫學、哲學、政治、歷史、藝術、科技。
   - 只看題目名稱時，玩家應能合理懷疑它屬於這些領域；但它們不能是真正答案，也不能只是把題目拆字、同義改寫或做廉價諧音。
   - 兩個誘餌都不得包含 term 出現過的任何字元，也不得與 hintKeyword 相同。
5. 【誘餌理由 (decoyRationales)】：
   - 各用一句短句說明為何名稱可能被誤認為該領域，只供編輯審核，不顯示給玩家。
6. 【領域分類 (category)】：
   - ${categoryInstruction}
7. 【難度 (difficulty)】：
   - 全數標定為 3（極冷門），偶有中度冷門標 2。絕不允許出現 1。
8. 【來源連結 (sourceUrl)】：
   - 對應的維基百科或資料來源條目連結（如 https://zh.wikipedia.org/wiki/條目名稱）。
9. ${topicInstruction}

請直接輸出 JSON Array，不要包含額外 markdown 標籤或對話，格式如下：
[
  {
    "term": "高深詞彙名稱",
    "definition": "精確深入的真實定義與機制（70-130字）",
    "category": "分類名稱",
    "hintKeyword": "動漫/遊戲/哲學/物理等2字宏觀領域",
    "decoyKeywords": ["生物", "文化"],
    "decoyRationales": ["可能誤認為生物領域的原因", "可能誤認為文化領域的原因"],
    "difficulty": 3,
    "sourceUrl": "https://zh.wikipedia.org/wiki/...",
    "dykHook": null
  }
]`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: systemPrompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.85,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 請求失敗 (${response.status} ${response.statusText}): ${errText}`);
  }

  const data = (await response.json()) as any;
  const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!contentText) {
    throw new Error('Gemini API 未回傳任何文字內容');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(contentText);
  } catch (e) {
    throw new Error(`解析 Gemini 回傳的 JSON 失敗：${contentText}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Gemini 回傳格式不符合預期的陣列：${contentText}`);
  }

  return parsed as RawCandidate[];
}

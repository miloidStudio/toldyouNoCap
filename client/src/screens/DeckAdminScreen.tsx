import { useEffect, useState, useMemo } from 'react';
import { Question, INTELLECTUAL_CATEGORIES } from '../../../shared/types';
import { hasCharOverlap, validateQuestion } from '../../../shared/validator';
import { Card, SectionTitle, Pill } from '../components/ui';

interface DeckStats {
  total: number;
  verifiedCount: number;
  categories: Record<string, number>;
}

interface DeckAudit {
  validCount: number;
  errors: { id: string; term: string; message: string }[];
  warnings: { id: string; term: string; message: string }[];
}

interface DeckResponse {
  ok: boolean;
  questions: Question[];
  stats: DeckStats;
  audit: DeckAudit;
}

export function DeckAdminScreen({ onBack }: { onBack: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [audit, setAudit] = useState<DeckAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 篩選與搜尋狀態
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC'); // 預設由編號高到低（新到舊）

  // 編輯 / 新增彈窗
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // AI 生成彈窗
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiCount, setAiCount] = useState(5);
  const [aiCategory, setAiCategory] = useState<string>('');
  const [aiTopic, setAiTopic] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('nocap.gemini_api_key') || '';
    } catch {
      return '';
    }
  });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<{ candidate: any; selected: boolean }[]>([]);

  // 重設題庫確認彈窗
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchDeck = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/deck');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DeckResponse = await res.json();
      setQuestions(data.questions);
      setStats(data.stats);
      setAudit(data.audit);
    } catch (err: any) {
      setError(err.message || '無法載入題庫');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeck();
  }, []);

  // 快速切換 verified 狀態
  const handleToggleVerified = async (q: Question) => {
    const updatedStatus = !q.verified;
    try {
      const res = await fetch(`/api/deck/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: updatedStatus }),
      });
      if (!res.ok) throw new Error('更新失敗');
      setQuestions((prev) =>
        prev.map((item) => (item.id === q.id ? { ...item, verified: updatedStatus } : item))
      );
      showToast(`已${updatedStatus ? '啟用' : '停用'}「${q.term}」`);
    } catch (err: any) {
      alert(`操作失敗：${err.message}`);
    }
  };

  // 刪除題目
  const handleDelete = async (q: Question) => {
    if (!confirm(`確定要永久刪除題目「${q.term}」嗎？`)) return;
    try {
      const res = await fetch(`/api/deck/${q.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      setQuestions((prev) => prev.filter((item) => item.id !== q.id));
      showToast(`已刪除「${q.term}」`);
      fetchDeck();
    } catch (err: any) {
      alert(`刪除失敗：${err.message}`);
    }
  };

  // 儲存（新增或修改）
  const handleSaveQuestion = async () => {
    if (!editingQuestion) return;
    setFormError(null);

    // 驗證
    const existingTerms = new Set(
      questions.filter((q) => isNew || q.id !== editingQuestion.id).map((q) => q.term.trim())
    );
    const val = validateQuestion(editingQuestion, existingTerms);
    if (!val.valid) {
      setFormError(val.issues.map((i) => i.message).join('\n'));
      return;
    }

    setSaving(true);
    try {
      const url = isNew ? '/api/deck' : `/api/deck/${editingQuestion.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingQuestion),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');

      showToast(isNew ? `已新增「${editingQuestion.term}」` : `已更新「${editingQuestion.term}」`);
      setEditingQuestion(null);
      fetchDeck();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 重設為初始 30 題
  const handleResetDeck = async () => {
    try {
      const res = await fetch('/api/deck/reset', { method: 'POST' });
      if (!res.ok) throw new Error('重設失敗');
      setShowResetConfirm(false);
      showToast('已將題庫重設回最初的 30 筆示範題目');
      fetchDeck();
    } catch (err: any) {
      alert(`重設失敗：${err.message}`);
    }
  };

  // 呼叫 Gemini 生成題目
  const handleStartAiGenerate = async () => {
    setAiGenerating(true);
    try {
      const res = await fetch('/api/deck/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: aiCount,
          category: aiCategory || undefined,
          topic: aiTopic || undefined,
          apiKey: apiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失敗');
      setAiCandidates(
        (data.candidates || []).map((item: any) => ({
          candidate: item.candidate,
          selected: item.validation?.valid ?? true,
        }))
      );
    } catch (err: any) {
      alert(`AI 生成失敗：${err.message}`);
    } finally {
      setAiGenerating(false);
    }
  };

  // 將選取的 AI 候選題目匯入題庫
  const handleImportAiCandidates = async () => {
    const selected = aiCandidates.filter((c) => c.selected).map((c) => c.candidate);
    if (selected.length === 0) {
      alert('請至少勾選一題！');
      return;
    }
    try {
      const res = await fetch('/api/deck/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '匯入失敗');
      showToast(`成功匯入 ${data.count} 筆題目！`);
      setShowAiModal(false);
      setAiCandidates([]);
      fetchDeck();
    } catch (err: any) {
      alert(`匯入失敗：${err.message}`);
    }
  };

  // 即時字元重疊檢驗（防洩底）
  const formCharOverlap = useMemo(() => {
    if (!editingQuestion?.term || !editingQuestion?.hintKeyword) return false;
    return hasCharOverlap(editingQuestion.term, editingQuestion.hintKeyword);
  }, [editingQuestion?.term, editingQuestion?.hintKeyword]);

  // 解析 ID 中的數字以進行自然數排序（如 q-0136 => 136）
  const parseIdNumber = (id: string): number => {
    const match = id.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // 篩選出的題目列表（預設以編號高的排到編號低的）
  const filteredQuestions = useMemo(() => {
    const list = questions.filter((q) => {
      // 搜尋關鍵字
      const matchSearch =
        !search ||
        q.term.toLowerCase().includes(search.toLowerCase()) ||
        q.definition.toLowerCase().includes(search.toLowerCase()) ||
        q.hintKeyword.toLowerCase().includes(search.toLowerCase()) ||
        q.id.toLowerCase().includes(search.toLowerCase());

      // 領域分類
      const matchCat = selectedCategory === 'ALL' || q.category === selectedCategory;

      // 啟用狀態
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && q.verified) ||
        (statusFilter === 'DISABLED' && !q.verified);

      return matchSearch && matchCat && matchStatus;
    });

    return list.sort((a, b) => {
      const numA = parseIdNumber(a.id);
      const numB = parseIdNumber(b.id);
      if (numA !== numB) {
        return sortOrder === 'DESC' ? numB - numA : numA - numB;
      }
      return sortOrder === 'DESC'
        ? b.id.localeCompare(a.id, undefined, { numeric: true })
        : a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [questions, search, selectedCategory, statusFilter, sortOrder]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-slate-100">
      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 rounded-2xl bg-amber-400 px-5 py-3 font-bold text-slate-900 shadow-2xl transition-all">
          {toastMsg}
        </div>
      )}

      {/* 頂部導覽列 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/20 active:translate-y-px"
          >
            ← 返回遊戲首頁
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              題庫管理中心 <span className="text-amber-400">NoCap</span>
            </h1>
            <p className="text-xs text-slate-400">視覺化管理、防洩底校驗與 Gemini 硬核批次產題</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setEditingQuestion({
                term: '',
                definition: '',
                category: INTELLECTUAL_CATEGORIES[0],
                hintKeyword: '',
                difficulty: 3,
                verified: true,
              });
              setIsNew(true);
              setFormError(null);
            }}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition hover:brightness-110 active:translate-y-px"
          >
            + 手動新增題目
          </button>
          <button
            onClick={() => {
              setShowAiModal(true);
              setAiCandidates([]);
            }}
            className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110 active:translate-y-px"
          >
            ✨ AI 批量產題
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="rounded-xl bg-white/10 px-3.5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/20 active:translate-y-px"
          >
            🧹 重設初始題庫
          </button>
        </div>
      </header>

      {/* 統計面板看板 */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="glass rounded-2xl p-4">
            <div className="text-xs font-semibold text-slate-400">總題目數</div>
            <div className="mt-1 text-3xl font-black text-amber-300">{stats.total}</div>
            <div className="mt-1 text-xs text-slate-500">含已停用題目</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-xs font-semibold text-slate-400">啟用中（遊戲抽題池）</div>
            <div className="mt-1 text-3xl font-black text-emerald-400">{stats.verifiedCount}</div>
            <div className="mt-1 text-xs text-slate-500">verified: true</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-xs font-semibold text-slate-400">已停用（暫不下架）</div>
            <div className="mt-1 text-3xl font-black text-slate-400">
              {stats.total - stats.verifiedCount}
            </div>
            <div className="mt-1 text-xs text-slate-500">不參與出題</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-xs font-semibold text-slate-400">題庫健檢狀態</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`text-2xl font-black ${audit?.errors.length === 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
              >
                {audit?.errors.length === 0 ? '全數合規' : `${audit?.errors.length} 項錯誤`}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {audit?.warnings.length ?? 0} 項建議改善
            </div>
          </div>
        </div>
      )}

      {/* 搜尋與過濾區 */}
      <div className="glass mb-6 rounded-3xl p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* 搜尋輸入框 */}
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 搜尋題目、老實人釋義、提示詞或 ID..."
              className="w-full rounded-2xl bg-black/40 px-4 py-3 pl-11 text-base text-slate-100 placeholder-slate-500 outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-amber-400"
            />
            <span className="absolute top-3.5 left-4 text-slate-500">🔍</span>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute top-3 right-4 text-sm text-slate-400 hover:text-white"
              >
                ✕ 清除
              </button>
            )}
          </div>

          {/* 狀態切換與排序 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-2xl bg-black/30 p-1 ring-1 ring-white/10">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${statusFilter === 'ALL' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                  }`}
              >
                全部 ({questions.length})
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${statusFilter === 'ACTIVE'
                    ? 'bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50'
                    : 'text-slate-400 hover:text-white'
                  }`}
              >
                僅啟用 ({questions.filter((q) => q.verified).length})
              </button>
              <button
                onClick={() => setStatusFilter('DISABLED')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${statusFilter === 'DISABLED'
                    ? 'bg-slate-700 text-slate-200'
                    : 'text-slate-400 hover:text-white'
                  }`}
              >
                僅停用 ({questions.filter((q) => !q.verified).length})
              </button>
            </div>

            {/* 編號高至低排序切換按鈕 */}
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'))}
              className="flex items-center gap-1.5 rounded-2xl bg-black/30 px-3.5 py-2 text-xs font-bold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white active:translate-y-px"
              title="點擊切換編號排序"
            >
              <span>編號：</span>
              <span className="text-amber-300">
                {sortOrder === 'DESC' ? '高到低 ⬇' : '低到高 ⬆'}
              </span>
            </button>
          </div>
        </div>

        {/* 領域分類標籤 */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`rounded-full px-3.5 py-1 text-xs font-bold transition ${selectedCategory === 'ALL'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
          >
            全部領域
          </button>
          {stats &&
            Object.entries(stats.categories).map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold transition ${selectedCategory === cat
                    ? 'bg-amber-400 text-slate-950 shadow-md'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
              >
                <span>{cat}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${selectedCategory === cat ? 'bg-black/30 text-amber-950' : 'bg-white/10 text-slate-400'
                    }`}
                >
                  {count}
                </span>
              </button>
            ))}
        </div>
      </div>

      {/* 題目卡片列表 */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">載入題庫中...</div>
      ) : error ? (
        <div className="py-20 text-center text-rose-400">錯誤：{error}</div>
      ) : filteredQuestions.length === 0 ? (
        <div className="glass rounded-3xl py-20 text-center text-slate-400">
          找不到符合條件的題目
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredQuestions.map((q) => {
            const overlap = hasCharOverlap(q.term, q.hintKeyword);
            return (
              <div
                key={q.id}
                className={`glass flex flex-col justify-between rounded-3xl p-5 transition-all hover:ring-1 ${q.verified ? 'hover:ring-amber-400/40' : 'opacity-60 hover:opacity-100'
                  }`}
              >
                <div>
                  {/* 卡片標頭：ID、領域、難度、狀態開關 */}
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular rounded bg-white/10 px-2 py-0.5 text-xs font-mono font-bold text-slate-300">
                        {q.id}
                      </span>
                      <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-300 ring-1 ring-sky-500/30">
                        {q.category}
                      </span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                        難度 {q.difficulty || 3}
                      </span>
                    </div>

                    {/* 啟用/停用開關 */}
                    <button
                      onClick={() => handleToggleVerified(q)}
                      title={q.verified ? '點擊停用（不參與遊戲出題）' : '點擊啟用（進入遊戲抽題池）'}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 ${q.verified
                          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-slate-200'
                        }`}
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${q.verified ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                          }`}
                      />
                      {q.verified ? '啟用中' : '已停用'}
                    </button>
                  </div>

                  {/* 題目名稱與提示詞 */}
                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-2xl font-black tracking-tight text-amber-300">{q.term}</h3>
                    <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200 ring-1 ring-white/15">
                      <span className="text-slate-400">🏷️ 領域提示：</span>
                      <span className="font-extrabold text-amber-300">【{q.hintKeyword}】</span>
                    </div>
                  </div>

                  {/* 洩底警示 */}
                  {overlap && (
                    <div className="mt-2 rounded-xl bg-rose-950/70 p-2.5 text-xs font-bold text-rose-300 ring-1 ring-rose-500/40">
                      ⚠️ 嚴重警告：提示詞「{q.hintKeyword}」與題目「{q.term}」包含共用字元，會直接洩底！
                    </div>
                  )}

                  {/* 老實人定義 */}
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{q.definition}</p>
                </div>

                {/* 卡片底部操作列 */}
                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                  {q.sourceUrl ? (
                    <a
                      href={q.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 transition hover:text-sky-300 hover:underline"
                    >
                      📖 維基條目 ↗
                    </a>
                  ) : (
                    <span className="text-slate-600">無來源連結</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingQuestion({ ...q });
                        setIsNew(false);
                        setFormError(null);
                      }}
                      className="rounded-lg bg-white/10 px-3 py-1.5 font-bold text-slate-200 transition hover:bg-white/20 active:translate-y-px"
                    >
                      ✏️ 編輯
                    </button>
                    <button
                      onClick={() => handleDelete(q)}
                      className="rounded-lg bg-rose-500/15 px-3 py-1.5 font-bold text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/30 active:translate-y-px"
                    >
                      🗑️ 刪除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 彈窗 1：新增 / 編輯題目 Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 shadow-2xl ring-1 ring-white/20">
            <h2 className="text-2xl font-black text-white">
              {isNew ? '+ 手動新增題目' : `✏️ 編輯題目：${editingQuestion.term}`}
            </h2>

            {formError && (
              <div className="mt-3 whitespace-pre-line rounded-xl bg-rose-950/80 p-3 text-xs font-bold text-rose-200 ring-1 ring-rose-500/50">
                {formError}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-4 text-sm">
              {/* 題目名稱 */}
              <div>
                <label className="block text-xs font-bold text-slate-400">題目詞彙 (Term)</label>
                <input
                  type="text"
                  value={editingQuestion.term || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, term: e.target.value })
                  }
                  placeholder="例如：波茲曼大腦"
                  className="mt-1 w-full rounded-xl bg-black/40 px-3.5 py-2.5 text-base text-amber-300 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* 領域分類 */}
              <div>
                <label className="block text-xs font-bold text-slate-400">領域分類 (Category)</label>
                <select
                  value={editingQuestion.category || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, category: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl bg-slate-900 px-3.5 py-2.5 text-slate-200 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-amber-400"
                >
                  {INTELLECTUAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="其他自訂">其他自訂...</option>
                </select>
                {editingQuestion.category === '其他自訂' && (
                  <input
                    type="text"
                    placeholder="請輸入自訂分類名稱"
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, category: e.target.value })
                    }
                    className="mt-2 w-full rounded-xl bg-black/40 px-3.5 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/15"
                  />
                )}
              </div>

              {/* 提示關鍵字（帶即時洩底檢查） */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-400">
                    提示領域 (hintKeyword)
                  </label>
                  <span className="text-[11px] text-slate-500">2 字廣義領域（如：天文、地理、心理、哲學）</span>
                </div>
                {/* 快速點選熱門領域 */}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[
                    '天文',
                    '地理',
                    '物理',
                    '化學',
                    '生物',
                    '心理',
                    '哲學',
                    '歷史',
                    '語言',
                    '經濟',
                    '政治',
                    '數學',
                    '賽局',
                    '考古',
                  ].map((dm) => (
                    <button
                      key={dm}
                      type="button"
                      onClick={() =>
                        setEditingQuestion({ ...editingQuestion, hintKeyword: dm })
                      }
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${editingQuestion.hintKeyword === dm
                          ? 'bg-amber-400 text-slate-950 shadow'
                          : 'bg-white/5 text-slate-300 hover:bg-white/15'
                        }`}
                    >
                      {dm}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editingQuestion.hintKeyword || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, hintKeyword: e.target.value })
                  }
                  placeholder="點選上方按鈕或輸入（例如：天文、地理、心理、哲學）"
                  className={`mt-2 w-full rounded-xl bg-black/40 px-3.5 py-2 text-sm outline-none ring-1 transition ${formCharOverlap
                      ? 'text-rose-400 ring-rose-500'
                      : 'text-slate-100 ring-white/15 focus:ring-2 focus:ring-amber-400'
                    }`}
                />
                {formCharOverlap && (
                  <div className="mt-1 text-xs font-bold text-rose-400">
                    🚨 警告：領域「{editingQuestion.hintKeyword}」與題目「{editingQuestion.term}」包含重疊字元（洩底）！
                  </div>
                )}
              </div>

              {/* 老實人真實定義 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-400">
                    真實定義 (Definition，老實人看)
                  </label>
                  <span
                    className={`text-[11px] font-mono ${(editingQuestion.definition?.length || 0) >= 60 &&
                        (editingQuestion.definition?.length || 0) <= 130
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                      }`}
                  >
                    目前 {editingQuestion.definition?.length || 0} 字（建議 60~130 字）
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={editingQuestion.definition || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, definition: e.target.value })
                  }
                  placeholder="請輸入詳實精確的定義與機制說明，老實人將在思考階段看此定義口述..."
                  className="mt-1 w-full rounded-xl bg-black/40 p-3 text-sm leading-relaxed text-slate-200 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* 難度與來源 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400">難度 (1~3)</label>
                  <select
                    value={editingQuestion.difficulty || 3}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        difficulty: Number(e.target.value) as 1 | 2 | 3,
                      })
                    }
                    className="mt-1 w-full rounded-xl bg-slate-900 px-3 py-2 text-slate-200 outline-none ring-1 ring-white/15"
                  >
                    <option value={3}>3 - 極度冷門 (推薦)</option>
                    <option value={2}>2 - 中度冷門</option>
                    <option value={1}>1 - 微冷門</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400">維基條目連結</label>
                  <input
                    type="text"
                    value={editingQuestion.sourceUrl || ''}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, sourceUrl: e.target.value })
                    }
                    placeholder="https://zh.wikipedia.org/..."
                    className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 text-xs text-slate-200 outline-none ring-1 ring-white/15"
                  />
                </div>
              </div>

              {/* 啟用開關 */}
              <label className="flex items-center gap-2.5 pt-2">
                <input
                  type="checkbox"
                  checked={editingQuestion.verified ?? true}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, verified: e.target.checked })
                  }
                  className="h-4 w-4 rounded accent-amber-400"
                />
                <span className="text-sm font-semibold text-slate-300">
                  立即啟用本題（加入遊戲抽取池）
                </span>
              </label>
            </div>

            {/* 按鈕組 */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button
                onClick={() => setEditingQuestion(null)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
              >
                取消
              </button>
              <button
                disabled={saving || formCharOverlap}
                onClick={handleSaveQuestion}
                className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40"
              >
                {saving ? '儲存中...' : '儲存題目'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 彈窗 2：AI 批量生成題目 Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="glass max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 shadow-2xl ring-1 ring-white/20">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">
                ✨ Gemini 知識分子硬核題目生成器
              </h2>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              採用高難度學術思想實驗、反直覺定理或歷史奇聞，杜絕生活常識題。
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-400">生成題數</label>
                <select
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/15"
                >
                  <option value={3}>3 題</option>
                  <option value={5}>5 題 (建議)</option>
                  <option value={10}>10 題</option>
                  <option value={20}>20 題</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400">限定領域 (可選)</label>
                <select
                  value={aiCategory}
                  onChange={(e) => setAiCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/15"
                >
                  <option value="">隨機均衡分配</option>
                  {INTELLECTUAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-400">
                  自訂風格或特定主題 (可選)
                </label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="例如：量子力學佯謬、古希臘心靈哲學、拜占庭帝國奇聞、賽局拍賣理論"
                  className="mt-1 w-full rounded-xl bg-black/40 px-3.5 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="sm:col-span-2 rounded-2xl bg-black/40 p-3.5 ring-1 ring-white/10">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">
                    🔑 Gemini API Key
                  </label>
                  {apiKey ? (
                    <span className="text-[11px] font-bold text-emerald-400">
                      ✓ 已就緒（自動儲存於瀏覽器）
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-400">
                      若未輸入將嘗試讀取伺服器 .env
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setApiKey(val);
                    try {
                      localStorage.setItem('nocap.gemini_api_key', val.trim());
                    } catch {
                      /* ignore */
                    }
                  }}
                  placeholder="貼上你的 GEMINI_API_KEY"
                  className="mt-1.5 w-full rounded-xl bg-black/60 px-3.5 py-2 text-sm font-mono text-amber-300 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-amber-400"
                />
                <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                  提示：金鑰僅安全儲存在你目前瀏覽器的 localStorage 中，或可直接存於專案根目錄的 <code className="rounded bg-white/10 px-1 py-0.5 text-slate-300">.env</code>。
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
              >
                取消
              </button>
              <button
                disabled={aiGenerating}
                onClick={handleStartAiGenerate}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
              >
                {aiGenerating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Gemini 深度構思中...
                  </>
                ) : (
                  '開始生成候選題目'
                )}
              </button>
            </div>

            {/* 候選題目預覽列表 */}
            {aiCandidates.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-300">
                    生成預覽（勾選要加入題庫的項目）：
                  </h3>
                  <div className="text-xs text-slate-400">
                    已選 {aiCandidates.filter((c) => c.selected).length} / {aiCandidates.length} 題
                  </div>
                </div>

                <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
                  {aiCandidates.map((item, idx) => (
                    <label
                      key={idx}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 transition ${item.selected
                          ? 'bg-amber-400/10 ring-amber-400/40'
                          : 'bg-black/30 opacity-50 ring-white/10'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => {
                          const updated = [...aiCandidates];
                          updated[idx].selected = e.target.checked;
                          setAiCandidates(updated);
                        }}
                        className="mt-1 h-4 w-4 rounded accent-amber-400"
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black text-amber-300">
                            {item.candidate.term}
                          </span>
                          <span className="rounded bg-sky-500/20 px-2 py-0.5 font-bold text-sky-300">
                            {item.candidate.category}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-400">
                          提示詞：
                          <span className="font-bold text-slate-200">
                            {item.candidate.hintKeyword}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-300">{item.candidate.definition}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowAiModal(false)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleImportAiCandidates}
                    className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
                  >
                    確認加入題庫 ({aiCandidates.filter((c) => c.selected).length} 題)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 彈窗 3：重設確認 Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="glass w-full max-w-md rounded-3xl p-6 shadow-2xl ring-1 ring-white/20">
            <h2 className="text-xl font-black text-rose-400">⚠️ 確認重設題庫？</h2>
            <p className="mt-3 text-sm text-slate-300">
              這將會把題庫還原為最初的 30 筆示範題目，您之後新增的所有題目將會被清除。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
              >
                取消
              </button>
              <button
                onClick={handleResetDeck}
                className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-rose-500"
              >
                確認重設
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

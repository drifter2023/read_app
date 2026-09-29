import { useEffect, useState } from 'react';
import { checkKey } from '../../core/ai/deepseek.ts';
import { clearKey, getKey, maskKey, setKey } from '../../core/ai/key.ts';
import type { Db } from '../../core/db/types.ts';

type Note = { tone: 'error' | 'quiet'; text: string } | null;

/** Home → the DeepSeek API key used by the grammar drawer (G-01). Saved only after `GET /models` accepts it. */
export function AiKeyCard({ db }: { db: Db }) {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => { void getKey(db).then(setSaved); }, [db]);
  if (saved === undefined) return null;
  const open = editing || !saved;

  const confirm = async () => {
    const key = draft.trim();
    if (!key) { setNote({ tone: 'error', text: '请先填写 API Key' }); return; }
    setChecking(true);
    setNote({ tone: 'quiet', text: '正在验证…' });
    const r = await checkKey(key);
    setChecking(false);
    if (r === 'invalid') { setNote({ tone: 'error', text: 'Key 无效，请检查后重新填写' }); return; }
    if (r === 'network') { setNote({ tone: 'error', text: '连不上 DeepSeek，请检查网络后再试' }); return; }
    await setKey(db, key);
    setSaved(key);
    setDraft('');
    setShown(false);
    setEditing(false);
    setNote(null);
  };

  const clear = async () => {
    await clearKey(db);
    setSaved(null);
    setEditing(false);
    setNote(null);
  };

  return (
    <section className="ai-card" aria-label="AI 语法分析">
      <div className="ai-head">
        <span className="eyebrow">AI 语法分析</span>
        <span className="ai-status" data-state={saved ? 'on' : 'off'}>{saved ? `已连接 ${maskKey(saved)}` : '未设置'}</span>
      </div>
      {open ? (
        <form className="ai-form" onSubmit={(e) => { e.preventDefault(); if (!checking) void confirm(); }}>
          <div className="ai-field">
            <input
              type={shown ? 'text' : 'password'}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); if (note?.tone === 'error') setNote(null); }}
              placeholder="DeepSeek API Key（sk-…）"
              aria-label="DeepSeek API Key"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="button" className="ai-eye" onClick={() => setShown((s) => !s)}>{shown ? '隐藏' : '显示'}</button>
          </div>
          <div className="ai-actions">
            {saved && <button type="button" className="ai-link" onClick={() => { setEditing(false); setDraft(''); setNote(null); }}>取消</button>}
            <button type="submit" className="ai-primary" disabled={checking}>确认</button>
          </div>
        </form>
      ) : (
        <div className="ai-actions">
          <button type="button" className="ai-link" onClick={() => setEditing(true)}>更换</button>
          <button type="button" className="ai-link" onClick={() => void clear()}>清除</button>
        </div>
      )}
      {note && <p className={note.tone === 'error' ? 'ai-note ai-note-error' : 'ai-note'} role="status">{note.text}</p>}
      <p className="ai-fine">点句尾的小水滴时，会把那一句发给 DeepSeek 分析。Key 只保存在这台设备上。</p>
    </section>
  );
}

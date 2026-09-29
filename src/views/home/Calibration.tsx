import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadDict } from '../../app/dict.ts';
import type { Db } from '../../core/db/types.ts';
import { levelLabel, pickItems, scoreCalibration, type CalibrationItem } from '../../core/vocab/calibrate.ts';
import { Difficulty } from '../../core/vocab/difficulty.ts';
import { VocabModel } from '../../core/vocab/model.ts';
import { markWord, setCalibrationState } from '../../core/vocab/store.ts';

type Step = { kind: 'loading' } | { kind: 'ask'; items: CalibrationItem[]; answers: boolean[] } | { kind: 'result'; level: string };

/**
 * The one-minute calibration test (P-06): one word at a time, 认识 or 不认识. Six of the thirty are
 * made up; claiming them makes the 认识 answers count for less. Answers are kept on the device only.
 */
export function Calibration({ db, onClose }: { db: Db; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    void loadDict().then((dict) => {
      if (!live) return;
      const diff = new Difficulty(dict);
      setStep({ kind: 'ask', items: pickItems(dict.levels(), (w) => diff.of(w), (w) => dict.lookup(w) !== null), answers: [] });
    });
    return () => { live = false; };
  }, []);

  const answer = async (known: boolean) => {
    if (step.kind !== 'ask') return;
    const answers = [...step.answers, known];
    if (answers.length < step.items.length) { setStep({ ...step, answers }); return; }
    const { answers: scored } = scoreCalibration(step.items, answers);
    for (const a of scored) await markWord(db, a.word, a.state, 'test', a.weight);
    await setCalibrationState(db, 'done');
    const model = await VocabModel.load(db, await loadDict());
    setStep({ kind: 'result', level: levelLabel(model.theta) });
  };

  return createPortal(
    <div className="cal" role="dialog" aria-modal="true" aria-label="词汇量测试">
      <button type="button" className="cal-close" onClick={onClose}>{step.kind === 'result' ? '完成' : '退出'}</button>
      {step.kind === 'loading' && <p className="cal-note">正在准备…</p>}
      {step.kind === 'ask' && (
        <>
          <div className="cal-progress" aria-label={`第 ${step.answers.length + 1} 题，共 ${step.items.length} 题`}>
            <div className="bar"><i style={{ width: `${(100 * step.answers.length) / step.items.length}%` }} /></div>
            <span>{step.answers.length + 1} / {step.items.length}</span>
          </div>
          <p className="cal-hint">认识这个词吗？只要知道一个意思就算认识。</p>
          <div className="cal-word" lang="en">{step.items[step.answers.length]!.word}</div>
          <div className="cal-actions">
            <button type="button" className="cal-no" onClick={() => void answer(false)}>不认识</button>
            <button type="button" className="cal-yes" onClick={() => void answer(true)}>认识</button>
          </div>
          <p className="cal-fine">有几个词是编出来的，老实回答结果更准。</p>
        </>
      )}
      {step.kind === 'result' && (
        <div className="cal-result">
          <p className="cal-hint">估计你的词汇量大约在</p>
          <div className="cal-level">{step.level}</div>
          <p className="cal-fine">之后查词、撤回和阅读都会继续校正这个估计。</p>
        </div>
      )}
    </div>,
    document.body,
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadDict } from '../../app/dict.ts';
import type { Db } from '../../core/db/types.ts';
import { levelLabel, pickItems, scoreCalibration, type CalibrationItem, type Pick } from '../../core/vocab/calibrate.ts';
import { Difficulty } from '../../core/vocab/difficulty.ts';
import { VocabModel } from '../../core/vocab/model.ts';
import { markWord, setCalibrationState } from '../../core/vocab/store.ts';

type Step = { kind: 'loading' } | { kind: 'ask'; items: CalibrationItem[]; answers: Pick[] } | { kind: 'result'; level: string };

/**
 * The one-minute calibration test (P-06): one real word at a time, pick its meaning from four or say
 * 不认识. Nothing is made up and no answer is marked right or wrong on screen. Answers stay on the device.
 */
export function Calibration({ db, onClose }: { db: Db; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    void loadDict().then((dict) => {
      if (!live) return;
      const diff = new Difficulty(dict);
      const senseOf = (w: string) => { const r = dict.lookup(w); return r && r.lemma === w ? { pos: r.pos, gloss: r.gloss } : null; };
      setStep({ kind: 'ask', items: pickItems(dict.levels(), (w) => diff.of(w), senseOf), answers: [] });
    });
    return () => { live = false; };
  }, []);

  const answer = async (pick: Pick) => {
    if (step.kind !== 'ask') return;
    const answers = [...step.answers, pick];
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
          <p className="cal-hint">选出这个词的意思</p>
          <div className="cal-word" lang="en">{step.items[step.answers.length]!.word}</div>
          <div className="cal-options">
            {step.items[step.answers.length]!.options.map((o, k) => (
              <button type="button" key={o} className="cal-opt" onClick={() => void answer(k)}>{o}</button>
            ))}
            <button type="button" className="cal-no" onClick={() => void answer(null)}>不认识</button>
          </div>
          <p className="cal-fine">不确定就选「不认识」，不会扣分，结果更准。</p>
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

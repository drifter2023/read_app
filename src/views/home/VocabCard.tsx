import { useEffect, useState } from 'react';
import { loadDict } from '../../app/dict.ts';
import type { Db } from '../../core/db/types.ts';
import { VocabModel } from '../../core/vocab/model.ts';
import { expectedKnown, formatVocabSize, sizeBasis } from '../../core/vocab/size.ts';
import { calibrationState, setCalibrationState } from '../../core/vocab/store.ts';
import { Calibration } from './Calibration.tsx';

/**
 * Home → predicted words (P-06): the one-minute calibration test, offered until it is taken or
 * skipped, then the estimated vocabulary size with a way to take it again.
 */
export function VocabCard({ db }: { db: Db }) {
  const [state, setState] = useState<'done' | 'skipped' | null | undefined>(undefined);
  const [size, setSize] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const refresh = async () => {
    setState(await calibrationState(db));
    const dict = await loadDict().catch(() => null);
    if (dict) {
      const model = await VocabModel.load(db, dict);
      setSize(formatVocabSize(expectedKnown(await sizeBasis(dict, (w) => model.difficulty.of(w)), model.theta)));
    }
  };
  useEffect(() => { void refresh(); }, [db]);
  if (state === undefined) return null;

  const skip = async () => {
    await setCalibrationState(db, 'skipped');
    setState('skipped');
  };

  return (
    <section className="ai-card vocab-card" aria-label="预测生词">
      <div className="ai-head">
        <span className="eyebrow">预测生词</span>
        {size && state !== null && <span className="ai-status" data-state="on">词汇量{size}</span>}
      </div>
      {state === null ? (
        <>
          <p className="vocab-copy">花一分钟测一下词汇量，提前标出的生词会更准。</p>
          <div className="ai-actions">
            <button type="button" className="ai-link" onClick={() => void skip()}>跳过</button>
            <button type="button" className="ai-primary" onClick={() => setTesting(true)}>开始测试</button>
          </div>
        </>
      ) : (
        <div className="ai-actions">
          <button type="button" className="ai-link" onClick={() => setTesting(true)}>{state === 'done' ? '重新测试' : '测一测词汇量'}</button>
        </div>
      )}
      <p className="ai-fine">根据你查过的词、撤回的词和读过的内容估计，只在这台设备上计算。</p>
      {testing && <Calibration db={db} onClose={() => { setTesting(false); void refresh(); }} />}
    </section>
  );
}

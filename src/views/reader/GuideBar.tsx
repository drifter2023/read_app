import type { Ref } from 'react';
import { GUIDE_SPEEDS, type GuideSpeed } from '../../core/prefs/prefs.ts';

/**
 * 带读 control bar (NIGHT_MODE_1c.md → N5), 夜读 only: play / pause, the reading progress, the speed.
 * Its taps are its own and never reach the reader's tap rules. While playing it fades out after 3 s
 * and lets touches through to the page, where the first one pauses (and brings it back).
 */
export function GuideBar({ playing, speed, faded, fillRef, onPlay, onPause, onSpeed }: {
  playing: boolean; speed: GuideSpeed; faded: boolean;
  /** The progress fill: its width is written directly on every progress change, not through React. */
  fillRef: Ref<HTMLElement>;
  onPlay: () => void; onPause: () => void; onSpeed: (s: GuideSpeed) => void;
}) {
  return (
    <div className="gd-bar" role="group" aria-label="带读" data-noswipe="" data-faded={faded} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="gd-play" aria-label={playing ? '暂停带读' : '开始带读'} aria-pressed={playing}
        tabIndex={faded ? -1 : 0} onClick={playing ? onPause : onPlay}>
        <span className="gd-play-disc">
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.6" height="8" rx=".8" fill="currentColor" /><rect x="6.9" y="2" width="2.6" height="8" rx=".8" fill="currentColor" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6a.6.6 0 0 0 .9.5l6-3.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
          )}
        </span>
      </button>
      <span className="gd-track" aria-hidden="true"><i ref={fillRef} /></span>
      <span className="gd-speeds" role="radiogroup" aria-label="带读速度">
        {GUIDE_SPEEDS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={v === speed} tabIndex={faded ? -1 : 0} onClick={() => onSpeed(v)}>
            <span>{v}×</span>
          </button>
        ))}
      </span>
    </div>
  );
}

/** The single easing curve for the whole app. */
export const EASE = 'cubic-bezier(.42,0,.58,1)';

/** Durations in ms, from README → Motion. */
export const MOTION = {
  drawerOpen: 330, drawerClose: 250, contentIn: 250, contentOut: 138,
  bookOut: 220, bookExpand: 460, coverFade: 300, pageFade: 320, bookBack: 300, chrome: 220,
} as const;

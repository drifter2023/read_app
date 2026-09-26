/** Books shipped with the app (README → Assets). Order is shelf order for first launch. */
export const BUNDLED = [
  { id: 'gatsby', epub: 'books/f-scott-fitzgerald_the-great-gatsby.epub', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
  { id: 'farewell', epub: 'books/ernest-hemingway_a-farewell-to-arms.epub', title: 'A Farewell to Arms', author: 'Ernest Hemingway' },
  { id: 'falcon', epub: 'books/dashiell-hammett_the-maltese-falcon.epub', title: 'The Maltese Falcon', author: 'Dashiell Hammett' },
] as const;

/** Flat cover colours, chosen by hash(title) % 8 (README → Home → Cover). From the 7a prototype. */
export const COVER_PALETTE = ['#6b4f3a', '#2f4a46', '#7a3a34', '#3b3f55', '#8a6a3a', '#4a3b52', '#2c3a2c', '#7d5b3f'] as const;

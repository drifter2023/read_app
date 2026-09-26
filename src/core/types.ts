/** A paragraph is its sentences in order; the paragraph text is INDENT + sentences.join(' '). */
export type Paragraph = string[];

/** One chapter as produced by an importer. */
export interface ParsedChapter { title: string; paras: Paragraph[]; wordCount: number }

/** A whole book as produced by an importer, before it is stored. `cover` is an image URL (file path or data URL). */
export interface ParsedBook { id: string; title: string; author: string; chapters: ParsedChapter[]; wordCount: number; cover?: string | null }

/** A stored chapter as the reader consumes it; wordStart is the book-level word index of its first word. */
export interface ChapterData { idx: number; title: string; paras: Paragraph[]; wordStart: number }

/** Reading position. Sentence-level, so it survives any font size or viewport. */
export interface Anchor { chapter: number; para: number; sentence: number }

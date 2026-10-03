/** One conversation about one book. `title` is empty until the first exchange is stored. */
export interface AgentSession {
  id: string; bookId: string; chapter: number; chapterLabel: string; title: string;
  anchorPara: number; anchorSentence: number; updatedAt: number;
}

/** `quote` on a user message is the sentence that was selected when the question was asked; `cite` is the agent's 出处. */
export type AgentMessage =
  | { role: 'user'; text: string; quote?: string; at: number }
  | { role: 'agent'; text: string; cite?: string; at: number };

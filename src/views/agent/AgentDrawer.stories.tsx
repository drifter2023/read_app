import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { createSession, saveExchange } from '../../core/agent/store.ts';
import type { Db } from '../../core/db/types.ts';
import type { ReaderEngine } from '../../core/reader/engine.ts';
import { BOOK, bookDb } from '../_stories/fixtures.ts';
import { Phone, ReaderPage } from '../_stories/Phone.tsx';
import { AgentDrawer } from './AgentDrawer.tsx';

type Attachment = { text: string; chapter: number } | null;

/**
 * Agent 抽屉 · 旁注 (M8, design 9a): a left swipe pushes the page aside into a card (a fixed 60 px strip
 * stays on the left; a tap there closes it) and shows a per-book chat with the reading companion.
 * 当前句 and a 问旁注 attachment share the slot right above the input, never both (C3, 2026-10-14).
 * Conversations are stored on the device; sending needs a DeepSeek key (not wired up in these stories).
 */
const meta = {
  title: 'Reader/Agent 抽屉 AgentDrawer',
  render: (_args, { loaded }) => <Open db={loaded.db as Db} attachment={(loaded.attachment as Attachment) ?? null} />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** First open: a new conversation about the sentence at the reading position. */
export const NewConversation: Story = { loaders: [async () => ({ db: await bookDb() })] };

/** Opened by 问旁注: the selected text replaces 当前句 above the input, with its own suggestions. */
export const WithSelection: Story = {
  loaders: [async () => ({ db: await bookDb(), attachment: { text: 'advice that I’ve been turning over in my mind', chapter: 0 } })],
};

/** An earlier conversation continues: the question with its quote, and the answer with its 出处. */
export const WithConversation: Story = {
  loaders: [async () => {
    const db = await bookDb();
    const at = Date.now() - 3 * 60_000;
    await createSession(db, { id: 's1', bookId: BOOK.id, chapter: 0, chapterLabel: 'Chapter I', title: '', anchorPara: 0, anchorSentence: 0, updatedAt: at });
    await saveExchange(db, 's1', {
      question: '这段的语气',
      quote: BOOK.chapters[0]!.paras[0]![0]!,
      answer: '语气克制而回味：叙述者用“younger and more vulnerable”回望自己，带一点自嘲；“turning over in my mind ever since”说明这句忠告分量很重，为后文他“不轻易评判别人”的态度埋下伏笔。',
      cite: 'turning over in my mind ever since',
    }, at);
    return { db };
  }],
};

const engine = { current: { currentAnchor: () => ({ chapter: 0, para: 0, sentence: 0 }) } as unknown as ReaderEngine };

/** The drawer fully open, with the page pushed into a card on the left, as useAgentSwipe leaves it at p = 1. */
function Open({ db, attachment: initial }: { db: Db; attachment: Attachment }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [attachment, setAttachment] = useState<Attachment>(initial);
  const travel = 402 * (1 + 0.9) / 2 - 60;
  return (
    <Phone bg="var(--ag-bg, #f5f5f3)">
      <div className="rd-shell">
        <AgentDrawer db={db} book={BOOK} engine={engine} open panelRef={panelRef} attachment={attachment} onAttachment={setAttachment} />
        <ReaderPage style={{ transform: `translateX(${-travel}px) scale(.9)`, borderRadius: 22, boxShadow: '0 10px 40px rgba(0,0,0,.18)' }}
          overlay={<div className="ag-dim" style={{ opacity: 0.06 }} />} />
      </div>
    </Phone>
  );
}

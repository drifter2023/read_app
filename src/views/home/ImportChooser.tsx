import { useState } from 'react';

/** `+ 导入` on the web build (L-03): paste a link, or pick an EPUB / TXT file. */
export function ImportChooser({ onLink, onFile, onClose }: {
  onLink: (text: string) => void; onFile: () => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="confirm-scrim" onClick={onClose}>
      <form
        className="confirm import-chooser"
        role="dialog"
        aria-label="导入"
        noValidate // shared text ("Title https://…") is fine; importLink finds the link in it
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) onLink(text); }}
      >
        <p className="confirm-title">导入</p>
        <label className="chooser-label" htmlFor="import-link">网页文章</label>
        <div className="ai-field chooser-field">
          <input
            id="import-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="粘贴文章链接"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <p className="chooser-note">网页由 Spotlight 的服务器代为抓取，只取正文，不保存链接。</p>
        <div className="confirm-actions">
          <button type="button" className="chooser-file" onClick={onFile}>选择文件（EPUB / TXT）</button>
          <button type="submit" className="confirm-primary" disabled={!text.trim()}>导入链接</button>
        </div>
      </form>
    </div>
  );
}

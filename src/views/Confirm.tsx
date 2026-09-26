/** Second confirmation for destructive actions (H-05). */
export function Confirm({ title, body, action, onCancel, onConfirm }: {
  title: string; body: string; action: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="confirm-scrim" onClick={onCancel}>
      <div className="confirm" role="alertdialog" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <p id="confirm-title" className="confirm-title">{title}</p>
        <p className="confirm-body">{body}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="confirm-danger" onClick={onConfirm}>{action}</button>
        </div>
      </div>
    </div>
  );
}

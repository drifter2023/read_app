import { useEffect, useState, type ReactNode } from 'react';
import { MOTION } from '../../core/motion.ts';

/**
 * Bottom sheet on the drawer's leather surface with the drawer's 330 / 250ms motion
 * (README → Settings sheet). Stays mounted through its close animation.
 */
export function Sheet({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), MOTION.drawerClose);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <div className={open ? 'sheet' : 'sheet sheet-closing'} role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="sheet-grip" aria-label="关闭" onClick={onClose}><i /></button>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

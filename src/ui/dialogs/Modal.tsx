import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { actions } from '../../state/store';

/** Native <dialog> wrapper: focus trapping, Escape to close and inert background for free. */
export function Modal({
  title,
  children,
  footer,
  wide,
  onClose,
  testId,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  onClose?: () => void;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => {
    onClose?.();
    actions.set({ dialog: null });
  };
  useEffect(() => {
    const d = ref.current!;
    const prev = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
      prev?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}`}
      aria-labelledby="modal-title"
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="btn icon ghost" aria-label="Close" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}

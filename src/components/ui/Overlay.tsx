import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/format';

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const focusable = ref.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const focusables = [
        ...ref.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
      previous?.focus();
    };
  }, [open, onClose]);

  return ref;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn('modal', size === 'lg' && '!w-[min(760px,calc(100vw-28px))]')}
      >
        <div className="flex items-start justify-between gap-5 border-b border-line px-6 py-5">
          <div>
            <h2 id={titleId} className="text-[17px] font-bold tracking-[-0.02em] text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 max-w-2xl text-[12px] leading-5 text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="icon-button -mr-2 -mt-1" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body scrollbar-thin px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-[#fbfcfd] px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Drawer({ open, onClose, title, eyebrow, children, footer, width }: DrawerProps) {
  const titleId = useId();
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="drawer"
        style={width ? { width } : undefined}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
            <h2 id={titleId} className="text-[17px] font-bold leading-6 tracking-[-0.02em] text-ink">
              {title}
            </h2>
          </div>
          <button type="button" className="icon-button -mr-2" onClick={onClose} aria-label="关闭详情">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body scrollbar-thin px-6 py-5">{children}</div>
        {footer ? (
          <div className="border-t border-line bg-[#fbfcfd] px-6 py-4">{footer}</div>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}

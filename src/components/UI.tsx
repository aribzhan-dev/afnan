import { LoaderCircle, Moon, Sun, X, Zap } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a className={'logo ' + (light ? 'logo-light' : '')} href="/" aria-label="КИП и А — главная">
      <span className="logo-symbol">
        КИП<span>и А</span>
        <Zap size={23} fill="currentColor" />
      </span>
      <span className="logo-caption">
        ЭЛЕКТРОТОВАРЫ
        <br />И АВТОМАТИКА
      </span>
    </a>
  );
}
export function ThemeButton({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      className="icon-button"
      onClick={onToggle}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  drawer = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = ref.current;
    root?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && root) {
        const elements = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]',
          ),
        ).filter((el) => el.offsetParent !== null);
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === root)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={'modal-backdrop ' + (drawer ? 'drawer-backdrop' : '')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={'modal ' + (wide ? 'modal-wide ' : '') + (drawer ? 'drawer' : '')}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Spinner() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={28} />
      <span>Загрузка…</span>
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      {message}
    </div>
  ) : null;
}

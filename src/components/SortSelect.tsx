import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
const options = [
  ['featured', 'Рекомендуемые'],
  ['price-up', 'Сначала дешевле'],
  ['price-down', 'Сначала дороже'],
  ['name', 'По названию'],
];
export default function SortSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  function choose(index: number) {
    onChange(options[index][0]);
    setOpen(false);
    button.current?.focus();
  }
  return (
    <div
      className="sort-control"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <span>Сортировка:</span>
      <button
        ref={button}
        type="button"
        className="sort-trigger"
        role="combobox"
        aria-label="Сортировка товаров"
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => {
          setActive(
            Math.max(
              0,
              options.findIndex((x) => x[0] === value),
            ),
          );
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            if (!open) {
              setOpen(true);
              setActive(
                Math.max(
                  0,
                  options.findIndex((x) => x[0] === value),
                ),
              );
            } else
              setActive(
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? options.length - 1
                    : (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
              );
          } else if ((e.key === 'Enter' || e.key === ' ') && open) {
            e.preventDefault();
            choose(active);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        {options.find((x) => x[0] === value)?.[1]}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div id={id} role="listbox" aria-label="Порядок товаров" className="sort-options">
          {options.map(([key, label], index) => (
            <div
              key={key}
              id={`${id}-${index}`}
              role="option"
              aria-selected={key === value}
              className={active === index ? 'active' : ''}
              onPointerMove={() => setActive(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
            >
              {label}
              {key === value && <Check size={16} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

export type CanvasOutlineItem = {
  id: string;
  label: string;
  title?: string;
  minY: number;
  maxY: number;
};

export default function ExperimentCanvasOutlineRail({
  items,
  activeId,
  onSelect,
  onWheelScroll,
}: {
  items: CanvasOutlineItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onWheelScroll: (deltaY: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const wheelHandlerRef = useRef(onWheelScroll);
  wheelHandlerRef.current = onWheelScroll;

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeButton = listRef.current.querySelector<HTMLButtonElement>('[aria-current="true"]');
    activeButton?.scrollIntoView({ block: 'nearest' });
  }, [open, activeId]);

  useEffect(() => {
    const element = zoneRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const list = listRef.current;
      const inList = !!(list && event.target instanceof Node && list.contains(event.target));
      if (inList && list && list.scrollHeight > list.clientHeight + 1) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const deltaY = event.deltaMode === 1
        ? event.deltaY * 32
        : event.deltaMode === 2
          ? event.deltaY * 320
          : event.deltaY;
      if (deltaY !== 0) wheelHandlerRef.current(deltaY);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  if (!items.length) return null;

  return (
    <div
      ref={zoneRef}
      className={`lab-canvas-outline-zone${open ? ' is-open' : ''}`}
      onMouseLeave={scheduleClose}
      aria-label="画布快速导航与滚轮滚动区"
    >
      {open && (
        <div
          className="lab-canvas-outline-popover"
          role="region"
          aria-label="画布目录"
          onMouseEnter={() => {
            cancelClose();
            setOpen(true);
          }}
        >
          <div className="lab-canvas-outline-list" ref={listRef}>
            {items.map(item => {
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`lab-canvas-outline-item${isActive ? ' is-active' : ''}`}
                  aria-current={isActive ? 'true' : undefined}
                  title={item.title || item.label}
                  onClick={() => onSelect(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <nav
        className="lab-canvas-outline-rail"
        aria-label="画布刻度导航"
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
        onBlur={event => {
          if (!zoneRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        {items.map(item => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              className={`lab-canvas-outline-tick${isActive ? ' is-active' : ''}`}
              aria-label={item.title || item.label}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

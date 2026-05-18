'use client';

import { useRef, useState, useEffect, type ReactNode } from 'react';

type ChartContainerProps = {
  /** ความสูงคงที่ของพื้นที่กราฟ (px) */
  height: number;
  className?: string;
  children: (dimensions: { width: number; height: number }) => ReactNode;
};

/**
 * รอจน container มีขนาดจริงก่อน render Recharts — แก้ warning width(-1) height(-1)
 */
export default function ChartContainer({ height, className = '', children }: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      const h = el.clientHeight;
      if (width > 0 && h > 0) {
        setSize({ width, height: h });
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', height, minHeight: height, minWidth: 0 }}
    >
      {size ? children(size) : null}
    </div>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

type Tone = 'neutral' | 'brand' | 'mint' | 'warning' | 'danger' | 'hero' | 'data' | 'outline';

const tones: Record<Tone, string> = {
  neutral: 'tag-neutral',
  brand: 'tag-brand',
  mint: 'tag-mint',
  warning: 'tag-warning',
  danger: 'tag-danger',
  hero: 'tag-hero',
  data: 'tag-data',
  outline: 'tag-outline',
};

export function Tag({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('tag', tones[tone], className)}>
      {dot ? <span className="status-dot bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

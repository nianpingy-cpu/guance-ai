import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/format';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export function Card({ children, className, padded = true, ...props }: CardProps) {
  return (
    <div className={cn('card', padded && 'card-pad', className)} {...props}>
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: string;
  className?: string;
}

export function SectionHeader({ title, description, action, eyebrow, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h2 className="section-title">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

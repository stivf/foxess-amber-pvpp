import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  leftBorderColor?: string;
}

export function Card({ className, leftBorderColor, style, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-[var(--bg-secondary)] shadow-md border border-[var(--border-default)]',
        className,
      )}
      style={{
        ...(leftBorderColor ? { borderLeft: `3px solid ${leftBorderColor}` } : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-3 border-b border-[var(--border-default)]', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold text-[var(--text-primary)]', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  );
}

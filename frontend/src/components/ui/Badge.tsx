import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
}

export function Badge({ className, color, style, children, ...props }: BadgeProps) {
  const bgColor = color ? `${color}26` : undefined;
  const textColor = color;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium font-mono',
        className,
      )}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

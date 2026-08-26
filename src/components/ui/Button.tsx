import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'purple' | 'subtle';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    const variants = {
      default: 'bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white active:scale-[0.98]',
      secondary: 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.98]',
      outline: 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/60 active:scale-[0.98]',
      ghost: 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/40 active:scale-[0.98]',
      danger: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/30 dark:bg-red-600/20 dark:text-red-400 dark:hover:bg-red-600/30 active:scale-[0.98]',
      purple: 'bg-purple-600 text-white hover:bg-purple-500 shadow-md shadow-purple-500/20 dark:shadow-purple-900/30 active:scale-[0.98]',
      subtle: 'bg-zinc-100/80 border border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 active:scale-[0.98]',
    };

    const sizes = {
      sm: 'h-7 px-2.5 text-xs rounded-md',
      md: 'h-9 px-3.5 text-sm rounded-lg',
      lg: 'h-10 px-5 text-base rounded-lg',
      icon: 'h-8 w-8 p-0 rounded-lg flex items-center justify-center',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

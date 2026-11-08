import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, Pressable } from 'react-native';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-1.5 rounded-lg border border-transparent',
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        default: cn('bg-primary active:bg-primary/80', Platform.select({ web: 'hover:bg-primary/80' })),
        outline: cn(
          'border-border bg-background active:bg-muted dark:border-input dark:bg-input/30 dark:active:bg-input/50',
          Platform.select({ web: 'hover:bg-muted dark:hover:bg-input/50' })
        ),
        secondary: cn(
          'bg-secondary active:bg-secondary/80',
          Platform.select({ web: 'hover:bg-secondary/80' })
        ),
        ghost: cn(
          'active:bg-muted dark:active:bg-muted/50',
          Platform.select({ web: 'hover:bg-muted dark:hover:bg-muted/50' })
        ),
        destructive: cn(
          'bg-destructive/10 active:bg-destructive/20 dark:bg-destructive/20 dark:active:bg-destructive/30',
          Platform.select({ web: 'hover:bg-destructive/20 dark:hover:bg-destructive/30' })
        ),
        link: '',
      },
      size: {
        default: 'h-8 px-2.5',
        xs: 'h-6 gap-1 rounded-md px-2',
        sm: 'h-7 gap-1 rounded-md px-2.5',
        lg: 'h-9 px-2.5',
        icon: 'size-8',
        'icon-xs': 'size-6 rounded-md',
        'icon-sm': 'size-7 rounded-md',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  cn(
    'text-foreground text-sm font-medium',
    Platform.select({ web: 'pointer-events-none transition-colors' })
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        outline: '',
        secondary: 'text-secondary-foreground',
        ghost: '',
        destructive: 'text-destructive',
        link: cn(
          'text-primary group-active:underline',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })
        ),
      },
      size: {
        default: '',
        xs: 'text-xs',
        sm: 'text-[12.8px]',
        lg: '',
        icon: '',
        'icon-xs': 'text-xs',
        'icon-sm': 'text-[12.8px]',
        'icon-lg': '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(props.disabled && 'opacity-50', buttonVariants({ variant, size }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };

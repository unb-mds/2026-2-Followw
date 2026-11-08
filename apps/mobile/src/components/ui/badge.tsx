import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, View } from 'react-native';

const badgeVariants = cva(
  cn(
    'group h-4 shrink-0 flex-row items-center justify-center gap-1 rounded-full border border-transparent px-2 py-0.5',
    Platform.select({
      web: 'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive w-fit overflow-hidden whitespace-nowrap transition-all focus-visible:ring-[3px] [&>svg]:pointer-events-none [&>svg]:size-3',
    })
  ),
  {
    variants: {
      variant: {
        default: cn('bg-primary', Platform.select({ web: '[a&]:hover:bg-primary/80' })),
        secondary: cn('bg-secondary', Platform.select({ web: '[a&]:hover:bg-secondary/80' })),
        destructive: cn(
          'bg-destructive/10 dark:bg-destructive/20',
          Platform.select({ web: '[a&]:hover:bg-destructive/20' })
        ),
        outline: cn(
          'border-border',
          Platform.select({ web: '[a&]:hover:bg-muted [a&]:hover:text-muted-foreground' })
        ),
        ghost: Platform.select({
          web: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        }),
        link: '',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const badgeTextVariants = cva('text-xs font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      link: 'text-primary',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = React.ComponentProps<typeof View> &
  React.RefAttributes<View> & {
    asChild?: boolean;
  } & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, asChild, ...props }: BadgeProps) {
  const Component = asChild ? Slot : View;
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export { Badge, badgeTextVariants, badgeVariants };
export type { BadgeProps };

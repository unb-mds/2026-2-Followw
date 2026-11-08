import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as TabsPrimitive from '@rn-primitives/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, View } from 'react-native';

type TabsListVariant = NonNullable<VariantProps<typeof tabsListVariants>['variant']>;

const TabsListVariantContext = React.createContext<TabsListVariant>('default');

const tabsListVariants = cva(
  cn(
    'text-muted-foreground flex h-8 flex-row items-center justify-center',
    Platform.select({ web: 'inline-flex w-fit', native: 'mr-auto' })
  ),
  {
    variants: {
      variant: {
        default: 'bg-muted rounded-lg p-[3px]',
        line: 'gap-1 bg-transparent p-[3px]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-2', className)} {...props} />;
}

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsListVariantContext.Provider value={variant ?? 'default'}>
      <TabsPrimitive.List className={cn(tabsListVariants({ variant }), className)} {...props} />
    </TabsListVariantContext.Provider>
  );
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { value } = TabsPrimitive.useRootContext();
  const variant = React.useContext(TabsListVariantContext);
  const active = props.value === value;
  return (
    <TextClassContext.Provider
      value={cn(
        'text-foreground/60 dark:text-muted-foreground text-sm font-medium',
        active && 'text-foreground dark:text-foreground'
      )}>
      <TabsPrimitive.Trigger
        className={cn(
          'relative flex h-full flex-1 flex-row items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5',
          Platform.select({
            web: 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring inline-flex cursor-default whitespace-nowrap transition-all focus-visible:outline-1 focus-visible:ring-[3px] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
          }),
          props.disabled && 'opacity-50',
          active &&
            variant === 'default' &&
            'bg-background dark:border-input dark:bg-input/30 shadow-sm shadow-black/5',
          className
        )}
        {...props}>
        <>{children}</>
        {variant === 'line' && active && (
          <View className="bg-foreground absolute inset-x-0 -bottom-[5px] h-0.5" />
        )}
      </TabsPrimitive.Trigger>
    </TextClassContext.Provider>
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('flex-1', Platform.select({ web: 'outline-none' }), className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };

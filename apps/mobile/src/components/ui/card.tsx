import { Text, TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { View } from 'react-native';

type CardSize = 'default' | 'sm';

const CardSizeContext = React.createContext<CardSize>('default');

function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View> & { size?: CardSize }) {
  return (
    <CardSizeContext.Provider value={size}>
      <TextClassContext.Provider value="text-sm text-card-foreground">
        <View
          className={cn(
            'bg-card border-foreground/10 flex flex-col rounded-2xl border shadow-sm shadow-black/5',
            size === 'sm' ? 'gap-3 py-3' : 'gap-4 py-4',
            className
          )}
          {...props}
        />
      </TextClassContext.Provider>
    </CardSizeContext.Provider>
  );
}

function CardHeader({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  const size = React.useContext(CardSizeContext);
  return (
    <View
      className={cn('flex flex-col gap-1 rounded-t-2xl', size === 'sm' ? 'px-3' : 'px-4', className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<typeof Text>) {
  const size = React.useContext(CardSizeContext);
  return (
    <Text
      ref={ref}
      role="heading"
      aria-level={3}
      className={cn('font-medium leading-snug', size === 'sm' ? 'text-sm' : 'text-base', className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<typeof Text>) {
  return <Text className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

function CardContent({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  const size = React.useContext(CardSizeContext);
  return <View className={cn(size === 'sm' ? 'px-3' : 'px-4', className)} {...props} />;
}

function CardFooter({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  const size = React.useContext(CardSizeContext);
  return (
    <View
      className={cn(
        'border-border bg-muted/50 flex flex-row items-center rounded-b-2xl border-t',
        size === 'sm' ? '-mb-3 p-3' : '-mb-4 p-4',
        className
      )}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };

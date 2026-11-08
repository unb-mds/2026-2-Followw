import { buttonTextVariants, buttonVariants } from '@/components/ui/button';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import * as React from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function AlertDialogOverlay({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Overlay>, 'asChild'> & {
    children?: React.ReactNode;
  }) {
  return (
    <FullWindowOverlay>
      <AlertDialogPrimitive.Overlay
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/10 p-4',
          Platform.select({
            web: 'animate-in fade-in-0 fixed',
          }),
          className
        )}
        {...props}
        asChild={Platform.OS !== 'web'}>
        <NativeOnlyAnimatedView
          entering={FadeIn.duration(200).delay(50).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          as="Pressable">
          <>{children}</>
        </NativeOnlyAnimatedView>
      </AlertDialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

type AlertDialogSize = 'default' | 'sm';

const AlertDialogSizeContext = React.createContext<AlertDialogSize>('default');

function AlertDialogContent({
  className,
  portalHost,
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  portalHost?: string;
  size?: AlertDialogSize;
}) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogSizeContext.Provider value={size}>
          <TextClassContext.Provider value="text-popover-foreground">
            <AlertDialogPrimitive.Content
              className={cn(
                'bg-popover border-foreground/10 z-50 flex w-full max-w-xs flex-col gap-4 rounded-xl border p-4',
                size === 'default' && 'sm:max-w-sm',
                Platform.select({
                  web: 'animate-in fade-in-0 zoom-in-95 duration-100',
                }),
                className
              )}
              {...props}
            />
          </TextClassContext.Provider>
        </AlertDialogSizeContext.Provider>
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
  const size = React.useContext(AlertDialogSizeContext);
  return (
    <TextClassContext.Provider
      value={cn('text-center', size === 'default' && 'sm:text-left')}>
      <View
        className={cn(
          'flex flex-col items-center gap-1.5',
          size === 'default' && 'sm:items-start',
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function AlertDialogFooter({ className, children, ...props }: ViewProps) {
  const size = React.useContext(AlertDialogSizeContext);
  return (
    <View
      className={cn(
        'bg-muted/50 border-border -mx-4 -mb-4 gap-2 rounded-b-xl border-t p-4',
        size === 'sm' ? 'flex flex-row' : 'flex flex-col-reverse sm:flex-row sm:justify-end',
        className
      )}
      {...props}>
      {size === 'sm'
        ? React.Children.map(children, (child) =>
            React.isValidElement<{ className?: string }>(child)
              ? React.cloneElement(child, {
                  className: cn('flex-1', child.props.className),
                })
              : child
          )
        : children}
    </View>
  );
}

function AlertDialogMedia({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('bg-muted mb-2 size-10 items-center justify-center rounded-md', className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('text-foreground text-base font-medium', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-muted-foreground font-sans text-sm', className)}
      {...props}
    />
  );
}

type AlertDialogButtonProps = VariantProps<typeof buttonVariants>;

function AlertDialogAction({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & AlertDialogButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <AlertDialogPrimitive.Action
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & AlertDialogButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <AlertDialogPrimitive.Cancel
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};

import { cn } from '@/lib/utils';
import { Platform, TextInput, type TextInputInstance } from 'react-native';

function Textarea({
  className,
  multiline = true,
  numberOfLines = Platform.select({ web: 2, native: 8 }),
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInputInstance>) {
  return (
    <TextInput
      className={cn(
        'text-foreground border-input dark:bg-input/30 font-sans flex min-h-16 w-full flex-row rounded-lg border bg-transparent px-2.5 py-2 text-base',
        props.editable === false && 'bg-input/50 dark:bg-input/80 opacity-50',
        Platform.select({
          web: 'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive field-sizing-content resize-y outline-none transition-colors focus-visible:ring-[3px] disabled:cursor-not-allowed md:text-sm',
        }),
        className
      )}
      placeholderTextColorClassName="accent-muted-foreground"
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  );
}

export { Textarea };

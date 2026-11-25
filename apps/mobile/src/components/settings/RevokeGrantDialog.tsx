import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export function RevokeGrantDialog({
    name,
    pending,
    failed,
    disabled,
    onConfirm,
    onClose
}: {
    name: string | null;
    pending: boolean;
    failed: boolean;
    disabled: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    return (
        <AlertDialog
            open={name !== null}
            onOpenChange={(open) => {
                if (!open && !pending) onClose();
            }}
        >
            <AlertDialogContent size="sm">
                <AlertDialogHeader>
                    <AlertDialogTitle>Revogar acesso de {name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Este acesso deixará de funcionar. Para reconectar, será necessário autorizar
                        o aplicativo novamente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {failed && (
                    <Text role="alert" className="text-sm text-destructive">
                        Não foi possível revogar. Tente novamente.
                    </Text>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>
                        <Text>Cancelar</Text>
                    </AlertDialogCancel>
                    <Button
                        variant="destructive"
                        disabled={pending || disabled}
                        onPress={onConfirm}
                    >
                        <Text>{pending ? 'Revogando…' : 'Revogar acesso'}</Text>
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

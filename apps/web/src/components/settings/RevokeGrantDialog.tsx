import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel
} from '#/components/ui/alert-dialog';
import { Button } from '#/components/ui/button';

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
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Revogar acesso de {name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Este acesso deixará de funcionar. Para reconectar, será necessário autorizar
                        o aplicativo novamente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {failed && (
                    <p role="alert" className="text-sm text-destructive">
                        Não foi possível revogar. Tente novamente.
                    </p>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                    <Button
                        variant="destructive"
                        disabled={pending || disabled}
                        onClick={onConfirm}
                    >
                        {pending ? 'Revogando…' : 'Revogar acesso'}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

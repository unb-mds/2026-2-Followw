import type { AccountData } from '@followw/core/queries/account-data.ts';

import { OFFLINE_MESSAGE, useOnline } from '@followw/core/lib/online.ts';
import { useState } from 'react';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel
} from '#/components/ui/alert-dialog';
import { Button } from '#/components/ui/button';
import { Checkbox } from '#/components/ui/checkbox';
import { Label } from '#/components/ui/label';
import { useDeleteAccountData } from '#/queries/account-data';

export function DeleteAccountForm({
    account,
    onDeleted
}: {
    account: AccountData;
    onDeleted: () => void;
}) {
    const online = useOnline();
    const [acknowledged, setAcknowledged] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const deletion = useDeleteAccountData(onDeleted);

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Confirmar exclusão</h2>
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                    {account.name ? `${account.name} · ` : ''}Matrícula {account.registration}
                </p>
                {(account.has_connected_applications || account.applications.length > 0) && (
                    <div className="flex flex-col gap-2 rounded-xl bg-destructive/10 p-4 text-sm">
                        <p className="font-semibold">Aplicativos</p>
                        {account.has_connected_applications && (
                            <p>Os aplicativos conectados perderão o acesso ao Followw.</p>
                        )}
                        {account.applications.length > 0 && (
                            <p className="break-words">
                                Seus aplicativos ({account.applications.join(', ')}) serão removidos
                                e deixarão de funcionar para todos os usuários.
                            </p>
                        )}
                    </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-h-10 items-center gap-3">
                        <Checkbox
                            id="acknowledge-deletion"
                            checked={acknowledged}
                            onCheckedChange={(checked) => setAcknowledged(checked)}
                            disabled={deletion.isPending}
                        />
                        <Label
                            htmlFor="acknowledge-deletion"
                            className="min-h-10 text-sm leading-6"
                        >
                            Entendi o que será apagado e o que será mantido.
                        </Label>
                    </div>
                    {!online && (
                        <output className="text-sm text-muted-foreground">{OFFLINE_MESSAGE}</output>
                    )}
                    <Button
                        variant="destructive"
                        className="min-h-10 self-start sm:self-auto"
                        disabled={!online || !acknowledged || deletion.isPending}
                        onClick={() => {
                            deletion.reset();
                            setConfirming(true);
                        }}
                    >
                        Excluir meus dados
                    </Button>
                </div>
            </div>
            <AlertDialog
                open={confirming}
                onOpenChange={(open) => {
                    if (!deletion.isPending) setConfirming(open);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir seus dados do Followw?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Suas marcações e preferências serão perdidas. Seus dados no SIGAA
                            continuarão intactos.
                            {account.applications.length > 0 &&
                                ' Seus aplicativos também serão removidos para todos os usuários.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deletion.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            Não foi possível concluir a exclusão. Tente novamente.
                        </p>
                    )}
                    {!online && (
                        <output className="text-sm text-muted-foreground">{OFFLINE_MESSAGE}</output>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletion.isPending}>
                            Cancelar
                        </AlertDialogCancel>
                        <Button
                            variant="destructive"
                            disabled={!online || deletion.isPending}
                            onClick={() => {
                                if (!deletion.isPending && online && acknowledged)
                                    deletion.mutate({});
                            }}
                        >
                            {deletion.isPending ? 'Excluindo…' : 'Confirmar exclusão'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}

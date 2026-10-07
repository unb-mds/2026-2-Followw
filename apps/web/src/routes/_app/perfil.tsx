import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { ChevronRight, LogOut, Pencil } from 'lucide-react';
import { useState } from 'react';

import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { ListCard } from '#/components/ListCard';
import {
    AcademicPerformance,
    ProfileIdentity,
    ProfileSection,
    ProgressSection
} from '#/components/profile/ProfileOverview';
import { ThemeToggle } from '#/components/ThemeToggle';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '#/components/ui/alert-dialog';
import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '#/components/ui/dialog';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { useOnline } from '#/lib/online';
import { titleCase } from '#/lib/profile';
import { useLogout } from '#/queries/auth';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { useUpdateSettings, useUserSettings } from '#/queries/settings';

export const Route = createFileRoute('/_app/perfil')({
    head: () => ({ meta: [{ title: 'Perfil | Followw' }] }),
    loader: async ({ context }) => {
        const user = await loadQuery(context.queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login' });
        return user;
    },
    staticData: {
        header: () => (
            <HeaderBar actions={<ThemeToggle />}>
                <HeaderTitle>Perfil</HeaderTitle>
            </HeaderBar>
        )
    },
    errorComponent: ErrorState,
    component: PerfilPage
});

function PerfilPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const settings = useUserSettings();

    return (
        <>
            {user && (
                <>
                    <ProfileIdentity user={user} displayName={settings.displayName} />
                    <AcademicPerformance user={user} />
                    <ProgressSection user={user} />
                    <AccountSection
                        name={titleCase(user.name)}
                        displayName={settings.displayName}
                    />
                </>
            )}
        </>
    );
}

function AccountSection({ name, displayName }: { name: string; displayName?: string | null }) {
    return (
        <ProfileSection title="Conta">
            <ListCard>
                <DisplayNameButton name={name} displayName={displayName} />
                <LogoutButton />
            </ListCard>
        </ProfileSection>
    );
}

function DisplayNameButton({ name, displayName }: { name: string; displayName?: string | null }) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const update = useUpdateSettings();
    const online = useOnline();
    const trimmed = value.trim();
    const valid = trimmed.length > 0 && trimmed.length <= 24;

    const save = async (nextName: string | null) => {
        try {
            await update.mutateAsync({ body: { displayName: nextName } });
            setOpen(false);
        } catch {
            // A mensagem no diálogo mantém a edição disponível para tentar de novo.
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (update.isPending) return;
                setOpen(nextOpen);
                if (nextOpen) {
                    setValue(displayName ?? '');
                    update.reset();
                }
            }}
        >
            <DialogTrigger
                render={
                    <Button
                        variant="ghost"
                        className="-mx-3 h-auto min-h-12 justify-start gap-3 rounded-none px-3 py-2.5"
                    />
                }
            >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Pencil className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                    <span className="block">Nome de exibição</span>
                    <span className="block truncate text-xs text-muted-foreground">
                        {displayName || name}
                    </span>
                </span>
                <ChevronRight className="text-muted-foreground" />
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nome de exibição</DialogTitle>
                    <DialogDescription>
                        Escolha como seu nome aparece no Followw. Seu nome no SIGAA não será
                        alterado.
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (valid && online && !update.isPending) void save(trimmed);
                    }}
                >
                    <Label htmlFor="display-name" className="mb-2">
                        Nome
                    </Label>
                    <Input
                        id="display-name"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        maxLength={24}
                        autoComplete="nickname"
                        aria-invalid={value.length > 0 && !valid}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">Até 24 caracteres.</p>
                    {!online && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            Conecte-se à internet para salvar a alteração.
                        </p>
                    )}
                    {update.isError && (
                        <p role="alert" className="mt-2 text-xs text-destructive">
                            Não foi possível salvar o nome. Tente novamente.
                        </p>
                    )}
                    <DialogFooter className="mt-4">
                        {displayName && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!online || update.isPending}
                                onClick={() => void save(null)}
                            >
                                Usar nome do SIGAA
                            </Button>
                        )}
                        <Button type="submit" disabled={!valid || !online || update.isPending}>
                            {update.isPending ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function LogoutButton() {
    const navigate = useNavigate();
    const logout = useLogout(() => void navigate({ to: '/login', replace: true }));
    const online = useOnline();

    return (
        <AlertDialog>
            <AlertDialogTrigger
                disabled={!online}
                render={
                    <Button
                        variant="ghost"
                        className="-mx-3 h-auto min-h-12 justify-start gap-3 rounded-none px-3 py-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    />
                }
            >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                    <LogOut className="size-4" />
                </span>
                <span className="flex-1 text-left">Desconectar</span>
                <ChevronRight className="text-muted-foreground" />
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
                <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Sua sessão e os dados salvos da conta serão apagados deste dispositivo.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={logout.isPending}
                        onClick={() => logout.mutate({})}
                    >
                        {logout.isPending ? 'Saindo...' : 'Sair'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

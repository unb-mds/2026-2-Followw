import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { ChevronRight, LogOut } from 'lucide-react';

import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import {
    AcademicPerformance,
    EnrollmentDetails,
    ProfileIdentity,
    ProfileList,
    ProfileSection
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
import { useLogout } from '#/queries/auth';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/perfil')({
    loader: async ({ context }) => {
        const user = await context.queryClient.query(meQueryOptions);
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

    return (
        <>
            {user && (
                <>
                    <ProfileIdentity user={user} />
                    <EnrollmentDetails user={user} />
                    <AcademicPerformance user={user} />
                    <AccountSection />
                </>
            )}
        </>
    );
}

function AccountSection() {
    return (
        <ProfileSection title="Conta">
            <ProfileList>
                <LogoutButton />
            </ProfileList>
        </ProfileSection>
    );
}

function LogoutButton() {
    const navigate = useNavigate();
    const logout = useLogout(() => void navigate({ to: '/login', replace: true }));

    return (
        <AlertDialog>
            <AlertDialogTrigger
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
                        Sua sessão e os dados salvos do RU serão apagados deste dispositivo.
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

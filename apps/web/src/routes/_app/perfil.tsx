import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { GitFork, LogOut } from 'lucide-react';

import type { UserProfile } from '#/queries/me';

import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { ListCard } from '#/components/ListCard';
import { DocumentDownloads } from '#/components/profile/DocumentDownloads';
import { EditProfile } from '#/components/profile/EditProfile';
import { InstallPromptCard } from '#/components/profile/InstallPromptCard';
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
import { Button, buttonVariants } from '#/components/ui/button';
import { useOnline } from '#/lib/online';
import { cn } from '#/lib/shadcn';
import { useLogout } from '#/queries/auth';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { useUserSettings } from '#/queries/settings';

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

    // sessão encerrada por um 401 em qualquer query ou mutation
    if (!user) return <Navigate to="/login" replace />;

    return (
        <>
            <ProfileIdentity user={user} displayName={settings.displayName} />
            <div className="my-4 flex flex-col gap-4">
                <InstallPromptCard />
                <AcademicPerformance user={user} />
                <ProgressSection user={user} />
                <AccountSection
                    user={user}
                    displayName={settings.displayName}
                    courseId={user.course?.id}
                />
            </div>
        </>
    );
}

function AccountSection({
    user,
    displayName,
    courseId
}: {
    user: UserProfile;
    displayName?: string | null;
    courseId?: number;
}) {
    return (
        <ProfileSection title="Conta">
            <ListCard>
                <div className="-mx-3">
                    <EditProfile user={user} displayName={displayName} />
                </div>
                {courseId != null && (
                    <div className="-mx-3">
                        <Link
                            to="/cursos/$id"
                            params={{ id: courseId }}
                            className={cn(
                                buttonVariants({ variant: 'ghost' }),
                                'h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3 py-2.5'
                            )}
                        >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <GitFork className="size-4" aria-hidden="true" />
                            </span>
                            <span className="flex-1 text-left">Visualizar fluxo acadêmico</span>
                        </Link>
                    </div>
                )}
                <DocumentDownloads />
                <LogoutButton />
            </ListCard>
        </ProfileSection>
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

import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { ChevronRight, GitFork, LogOut } from 'lucide-react';

import type { UserProfile } from '#/queries/me';

import { useDesktop } from '#/components/DesktopContext';
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
import { useDownloadDocument } from '#/queries/documents';
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
    staticData: { header: ProfileHeader },
    errorComponent: ErrorState,
    component: PerfilPage
});

function ProfileHeader() {
    const desktop = useDesktop();
    return (
        <HeaderBar hideOnDesktop actions={!desktop && <ThemeToggle />}>
            <HeaderTitle>Perfil</HeaderTitle>
        </HeaderBar>
    );
}

function PerfilPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const settings = useUserSettings();
    const download = useDownloadDocument();

    // sessão encerrada por um 401 em qualquer query ou mutation
    if (!user) return <Navigate to="/login" replace />;

    return (
        <div className="profile-columns lg:grid lg:items-start lg:gap-x-10 lg:gap-y-8">
            <div className="profile-identity lg:col-start-1 lg:row-start-1">
                <ProfileIdentity user={user} displayName={settings.displayName} />
            </div>
            <div className="my-4 flex flex-col gap-4 lg:contents">
                <div className="profile-install contents lg:hidden">
                    <InstallPromptCard />
                </div>
                <div className="profile-performance contents lg:col-start-2 lg:row-start-1 lg:block lg:border-l lg:pl-8">
                    <AcademicPerformance user={user} />
                </div>
                <div className="profile-progress contents lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:block">
                    <ProgressSection user={user} />
                </div>
                <div className="lg:col-start-2 lg:row-start-2 lg:border-l lg:pl-8">
                    <ProfileSection title="Documentos">
                        <div className="@container">
                            <div className="grid gap-3 lg:gap-4 @xs:grid-cols-2">
                                <DocumentDownloads download={download} />
                            </div>
                        </div>
                    </ProfileSection>
                </div>
                <div className="profile-account lg:col-start-2 lg:row-start-3 lg:border-l lg:pl-8">
                    <AccountSection
                        user={user}
                        displayName={settings.displayName}
                        courseId={user.course?.id}
                    />
                </div>
            </div>
        </div>
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
                            aria-label="Visualizar fluxo acadêmico"
                            className={cn(
                                buttonVariants({ variant: 'ghost' }),
                                'h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3 py-2.5'
                            )}
                        >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <GitFork className="size-4" aria-hidden="true" />
                            </span>
                            <span className="flex-1 text-left">Fluxo acadêmico</span>
                            <ChevronRight
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                            />
                        </Link>
                    </div>
                )}
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
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

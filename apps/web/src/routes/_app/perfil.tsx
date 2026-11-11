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
        <HeaderBar actions={!desktop && <ThemeToggle />}>
            <div className="flex flex-col gap-3">
                <HeaderTitle>Perfil</HeaderTitle>
                <p className="hidden text-sm text-muted-foreground desktop:block">
                    Seu percurso acadêmico e sua conta.
                </p>
            </div>
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
        <div className="profile-columns desktop:grid desktop:items-start desktop:gap-x-10 desktop:gap-y-8">
            <div className="profile-identity desktop:col-start-1 desktop:row-start-1">
                <ProfileIdentity user={user} displayName={settings.displayName} />
            </div>
            <div className="my-4 flex flex-col gap-4 desktop:contents">
                <div className="profile-install contents desktop:col-start-1 desktop:row-start-4 desktop:block">
                    <InstallPromptCard />
                </div>
                <div className="profile-performance contents desktop:col-start-2 desktop:row-start-1 desktop:block desktop:border-l desktop:pl-8">
                    <AcademicPerformance user={user} />
                </div>
                <div className="profile-progress contents desktop:col-start-1 desktop:row-span-2 desktop:row-start-2 desktop:block">
                    <ProgressSection user={user} />
                </div>
                <div className="desktop:col-start-2 desktop:row-start-2 desktop:border-l desktop:pl-8">
                    <ProfileSection title="Documentos">
                        <div className="grid grid-cols-2 gap-3 desktop:gap-4">
                            <DocumentDownloads download={download} />
                        </div>
                    </ProfileSection>
                </div>
                <div className="profile-account desktop:col-start-2 desktop:row-start-3 desktop:border-l desktop:pl-8">
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

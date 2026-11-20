import type { UserProfile } from '@followw/core/queries/me.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { useRouter } from 'expo-router';
import { ChevronRight, GitFork, LogOut } from 'lucide-react-native';
import { View } from 'react-native';

import { ListCard } from '@/components/ListCard';
import { EditProfile } from '@/components/profile/EditProfile';
import { ProfileSection } from '@/components/profile/ProfileOverview';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useLogout } from '@/queries/auth';

const ROW = 'h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3 py-2.5';

export function AccountSection({
    user,
    displayName
}: {
    user: UserProfile;
    displayName?: string | null;
}) {
    const router = useRouter();
    const courseId = user.course?.id;

    return (
        <ProfileSection title="Conta">
            <ListCard>
                <View className="-mx-3">
                    <EditProfile user={user} displayName={displayName} />
                </View>
                {courseId != null && (
                    <View className="-mx-3">
                        <Button
                            variant="ghost"
                            accessibilityLabel="Visualizar fluxo acadêmico"
                            className={ROW}
                            onPress={() =>
                                router.push({ pathname: '/cursos/[id]', params: { id: courseId } })
                            }
                        >
                            <View className="size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                <Icon as={GitFork} className="size-4 text-primary" />
                            </View>
                            <Text className="flex-1 text-left font-normal">Fluxo acadêmico</Text>
                            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
                        </Button>
                    </View>
                )}
                <View className="-mx-3">
                    <LogoutButton />
                </View>
            </ListCard>
        </ProfileSection>
    );
}

function LogoutButton() {
    const router = useRouter();
    const logout = useLogout(() => router.replace('/login'));
    const online = useOnline();

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" disabled={!online} className={ROW}>
                    <View className="size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                        <Icon as={LogOut} className="size-4 text-destructive" />
                    </View>
                    <Text className="flex-1 text-left font-normal text-destructive">
                        Desconectar
                    </Text>
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
                <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Sua sessão e os dados salvos da conta serão apagados deste dispositivo.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>
                        <Text>Cancelar</Text>
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={logout.isPending}
                        onPress={() => logout.mutate({})}
                    >
                        <Text>{logout.isPending ? 'Saindo...' : 'Sair'}</Text>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

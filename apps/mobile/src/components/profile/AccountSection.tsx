import { useOnline } from '@followw/core/lib/online.ts';
import { useUpdateSettings } from '@followw/core/queries/settings.ts';
import { useRouter } from 'expo-router';
import { GitFork, LogOut, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { DocumentDownloads } from '@/components/profile/DocumentDownloads';
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
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useLogout } from '@/queries/auth';

const ROW = 'h-auto min-h-12 w-full justify-start gap-3 rounded-none border-0 px-0 py-2.5';

export function AccountSection({
    displayName,
    courseId
}: {
    displayName?: string | null;
    courseId?: number;
}) {
    const router = useRouter();

    return (
        <ProfileSection title="Conta">
            <Card size="sm" className="gap-0 overflow-hidden px-3 py-0">
                <DisplayNameButton displayName={displayName} />
                {courseId != null && (
                    <>
                        <Separator />
                        <Button
                            variant="ghost"
                            className={ROW}
                            onPress={() =>
                                router.push({ pathname: '/cursos/[id]', params: { id: courseId } })
                            }
                        >
                            <RowIcon icon={GitFork} />
                            <Text className="flex-1 text-left">Visualizar fluxo acadêmico</Text>
                        </Button>
                    </>
                )}
                <DocumentDownloads />
                <Separator />
                <LogoutButton />
            </Card>
        </ProfileSection>
    );
}

function RowIcon({ icon, destructive }: { icon: typeof Pencil; destructive?: boolean }) {
    return (
        <View
            className={cn(
                'size-8 shrink-0 items-center justify-center rounded-lg',
                destructive ? 'bg-destructive/10' : 'bg-primary/10'
            )}
        >
            <Icon
                as={icon}
                className={cn('size-4', destructive ? 'text-destructive' : 'text-primary')}
            />
        </View>
    );
}

function DisplayNameButton({ displayName }: { displayName?: string | null }) {
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
            // a mensagem no diálogo mantém a edição disponível para tentar de novo
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
            <DialogTrigger asChild>
                <Button variant="ghost" className={ROW}>
                    <RowIcon icon={Pencil} />
                    <View className="min-w-0 flex-1">
                        <Text className="text-left">Nome de exibição</Text>
                        <Text
                            numberOfLines={1}
                            className="text-left text-xs font-normal text-muted-foreground"
                        >
                            {displayName || 'Clique para editar'}
                        </Text>
                    </View>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nome de exibição</DialogTitle>
                    <DialogDescription>
                        Escolha como seu nome aparece no Followw. Seu nome no SIGAA não será
                        alterado.
                    </DialogDescription>
                </DialogHeader>
                <View>
                    <Label nativeID="display-name" className="mb-2">
                        Nome
                    </Label>
                    <Input
                        value={value}
                        onChangeText={setValue}
                        maxLength={24}
                        autoComplete="nickname"
                        returnKeyType="done"
                        aria-labelledby="display-name"
                        aria-invalid={value.length > 0 && !valid}
                        onSubmitEditing={() =>
                            valid && online && !update.isPending && void save(trimmed)
                        }
                    />
                    <Text className="mt-2 text-xs text-muted-foreground">Até 24 caracteres.</Text>
                    {!online && (
                        <Text className="mt-2 text-xs text-muted-foreground">
                            Conecte-se à internet para salvar a alteração.
                        </Text>
                    )}
                    {update.isError && (
                        <Text role="alert" className="mt-2 text-xs text-destructive">
                            Não foi possível salvar o nome. Tente novamente.
                        </Text>
                    )}
                </View>
                <DialogFooter className="mt-0">
                    {displayName ? (
                        <Button
                            variant="outline"
                            disabled={!online || update.isPending}
                            onPress={() => void save(null)}
                        >
                            <Text>Usar nome do SIGAA</Text>
                        </Button>
                    ) : null}
                    <Button
                        disabled={!valid || !online || update.isPending}
                        onPress={() => void save(trimmed)}
                    >
                        <Text>{update.isPending ? 'Salvando...' : 'Salvar'}</Text>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
                    <RowIcon icon={LogOut} destructive />
                    <Text className="flex-1 text-left text-destructive">Desconectar</Text>
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

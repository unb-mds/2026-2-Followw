import { useOnline } from '@followw/core/lib/online.ts';
import { useUpdateSettings } from '@followw/core/queries/settings.ts';
import { useRouter } from 'expo-router';
import { GitFork, LogOut, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ListCard, ListChevron, ListRow } from '@/components/ListCard';
import { ProfileSection } from '@/components/profile/ProfileOverview';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useLogout } from '@/queries/auth';

const DISPLAY_NAME_MAX = 24;

export function AccountSection({
    displayName,
    courseId
}: {
    displayName?: string | null;
    courseId?: number;
}) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);

    return (
        <ProfileSection title="Conta">
            <ListCard>
                <ListRow
                    icon={Pencil}
                    title="Nome de exibição"
                    subtitle={displayName || 'Toque para editar'}
                    trailing={<ListChevron />}
                    onPress={() => setEditing(true)}
                />
                {courseId != null && (
                    <ListRow
                        icon={GitFork}
                        title="Visualizar fluxo acadêmico"
                        trailing={<ListChevron />}
                        onPress={() =>
                            router.push({ pathname: '/cursos/[id]', params: { id: courseId } })
                        }
                    />
                )}
                <LogoutRow />
            </ListCard>
            <DisplayNameDialog open={editing} onOpenChange={setEditing} displayName={displayName} />
        </ProfileSection>
    );
}

function DisplayNameDialog({
    open,
    onOpenChange,
    displayName
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    displayName?: string | null;
}) {
    const [value, setValue] = useState(displayName ?? '');
    const update = useUpdateSettings();
    const online = useOnline();
    const trimmed = value.trim();
    const valid = trimmed.length > 0 && trimmed.length <= DISPLAY_NAME_MAX;

    const save = async (nextName: string | null) => {
        try {
            await update.mutateAsync({ body: { displayName: nextName } });
            onOpenChange(false);
        } catch {
            // a mensagem no diálogo mantém a edição disponível para tentar de novo
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (update.isPending) return;
                if (next) {
                    setValue(displayName ?? '');
                    update.reset();
                }
                onOpenChange(next);
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nome de exibição</DialogTitle>
                    <DialogDescription>
                        Escolha como seu nome aparece no Followw. Seu nome no SIGAA não será
                        alterado.
                    </DialogDescription>
                </DialogHeader>
                <View className="gap-2">
                    <Input
                        value={value}
                        onChangeText={setValue}
                        maxLength={DISPLAY_NAME_MAX}
                        autoComplete="nickname"
                        autoCapitalize="words"
                        returnKeyType="done"
                        aria-label="Nome de exibição"
                        aria-invalid={value.length > 0 && !valid}
                        onSubmitEditing={() => valid && online && void save(trimmed)}
                    />
                    <Text className="text-xs text-muted-foreground">Até 24 caracteres.</Text>
                    {!online && (
                        <Text className="text-xs text-muted-foreground">
                            Conecte-se à internet para salvar a alteração.
                        </Text>
                    )}
                    {update.isError && (
                        <Text role="alert" className="text-xs text-destructive">
                            Não foi possível salvar o nome. Tente novamente.
                        </Text>
                    )}
                </View>
                <DialogFooter>
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

function LogoutRow() {
    const [open, setOpen] = useState(false);
    const logout = useLogout();
    const online = useOnline();

    return (
        <>
            <ListRow
                icon={LogOut}
                title="Desconectar"
                destructive
                disabled={!online}
                onPress={() => setOpen(true)}
            />
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
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
                            className="bg-destructive"
                            disabled={logout.isPending}
                            onPress={() => logout.mutate({})}
                        >
                            <Text>{logout.isPending ? 'Saindo...' : 'Sair'}</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

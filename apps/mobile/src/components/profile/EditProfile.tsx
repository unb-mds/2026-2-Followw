import type { UserProfile } from '@followw/core/queries/me.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { MAX_PROFILE_BIO_LENGTH, truncateProfileBio } from '@followw/core/lib/profile.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { useUpdateSettings } from '@followw/core/queries/settings.ts';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, ImagePlus, Pencil, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PersonPhoto } from '@/components/PersonPhoto';
import { Button } from '@/components/ui/button';
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
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { type PickedPhoto, useEditProfile } from '@/queries/profile-edit';

// mesmo tamanho que a API grava no SIGAA
const PHOTO_SIZE = { width: 800, height: 1000 };

type PhotoEdit = { action: 'keep' | 'remove' } | { action: 'replace'; photo: PickedPhoto };

function errorReason(error: unknown) {
    if (!(error instanceof ApiError)) return null;
    if (error.isTooManyRequests) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    if (error.status === 413 || error.status === 422)
        return typeof error.detail === 'string'
            ? error.detail
            : 'Confira os dados e tente novamente.';
    return null;
}

/** Galeria com o corte nativo em 4:5, reduzida ao tamanho final em JPEG. */
async function pickPhoto(): Promise<PickedPhoto | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 1
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return null;
    const image = await ImageManipulator.manipulate(asset.uri).resize(PHOTO_SIZE).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    return { uri: saved.uri };
}

export function EditProfile({
    user,
    displayName
}: {
    user: UserProfile;
    displayName?: string | null;
}) {
    const online = useOnline();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    disabled={saving || !online}
                    className="h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3 py-2.5"
                >
                    <View className="size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Icon as={Pencil} className="size-4 text-primary" />
                    </View>
                    <Text className="flex-1 text-left font-normal">
                        {saving ? 'Salvando perfil...' : 'Editar perfil'}
                    </Text>
                    <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90%]">
                {open && (
                    <ProfileForm
                        onSavingChange={setSaving}
                        user={user}
                        displayName={displayName}
                        close={() => setOpen(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function ProfileForm({
    user,
    displayName,
    close,
    onSavingChange
}: {
    user: UserProfile;
    displayName?: string | null;
    close: () => void;
    onSavingChange: (value: boolean) => void;
}) {
    const saving = useRef(false);
    const online = useOnline();
    const remote = useEditProfile();
    const settings = useUpdateSettings();
    const [name, setName] = useState(displayName ?? '');
    const [savedBio, setSavedBio] = useState(() => truncateProfileBio(user.bio ?? ''));
    const [bio, setBio] = useState(savedBio);
    const [photo, setPhoto] = useState<PhotoEdit>({ action: 'keep' });
    const [error, setError] = useState('');
    const [remoteSaved, setRemoteSaved] = useState(false);
    const pending = remote.isPending || settings.isPending;
    const { action } = photo;

    async function choosePhoto() {
        try {
            const picked = await pickPhoto();
            if (!picked) return;
            setError('');
            setPhoto({ action: 'replace', photo: picked });
        } catch {
            setError('Não foi possível abrir a foto. Escolha outra imagem.');
        }
    }

    async function save() {
        if (saving.current) return;
        saving.current = true;
        onSavingChange(true);
        setError('');
        let saved = remoteSaved;
        let done = '';
        let failure =
            'Não foi possível confirmar a alteração no SIGAA. Confira o perfil antes de tentar novamente.';
        try {
            const editedBio = bio === savedBio ? undefined : bio;
            if (action === 'remove') {
                await remote.mutateAsync({ action, photo: null });
                setPhoto({ action: 'keep' });
                setRemoteSaved(true);
                saved = true;
                done = 'Foto removida. ';
                failure = 'Não foi possível confirmar a alteração da bio no SIGAA.';
            }
            if (editedBio !== undefined || action === 'replace') {
                await remote.mutateAsync({
                    bio: editedBio,
                    action: action === 'replace' ? 'replace' : 'keep',
                    photo: action === 'replace' ? photo.photo : null
                });
                setSavedBio(bio);
                setPhoto({ action: 'keep' });
                setRemoteSaved(true);
                saved = true;
            }
            done = saved ? 'Alterações salvas no SIGAA. ' : '';
            failure = 'Não foi possível salvar o nome. Tente novamente.';
            await settings.mutateAsync({ body: { displayName: name.trim() || null } });
            toast.add({
                type: 'success',
                title: 'Perfil atualizado',
                description: saved ? 'As alterações já estão no SIGAA.' : undefined
            });
            close();
        } catch (failed) {
            const message = done + (errorReason(failed) ?? failure);
            setError(message);
            toast.add({
                type: 'error',
                title: 'Não foi possível salvar o perfil',
                description: message
            });
        } finally {
            saving.current = false;
            onSavingChange(false);
            remote.reset();
        }
    }

    const image = action === 'remove' ? null : action === 'replace' ? photo.photo.uri : user.photo;
    return (
        <>
            <DialogHeader>
                <DialogTitle>Editar perfil</DialogTitle>
                <DialogDescription>Foto e bio serão atualizadas no SIGAA.</DialogDescription>
            </DialogHeader>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-6">
                <View className="gap-2">
                    <Label>Foto de perfil</Label>
                    <View className="flex-row items-center gap-4">
                        <PersonPhoto src={image} size="lg" />
                        <View className="shrink flex-row flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                disabled={pending}
                                onPress={() => void choosePhoto()}
                            >
                                <Icon as={ImagePlus} className="size-4" />
                                <Text>Escolher foto</Text>
                            </Button>
                            {image && (
                                <Button
                                    variant="ghost"
                                    disabled={pending}
                                    onPress={() => setPhoto({ action: 'remove' })}
                                >
                                    <Icon as={Trash2} className="size-4" />
                                    <Text>Remover foto</Text>
                                </Button>
                            )}
                        </View>
                    </View>
                </View>
                <View className="gap-2">
                    <Label nativeID="display-name">Nome de exibição</Label>
                    <Input
                        aria-labelledby="display-name"
                        value={name}
                        maxLength={24}
                        editable={!pending}
                        onChangeText={setName}
                        placeholder={user.name}
                        autoComplete="nickname"
                    />
                    <Text className="text-xs text-muted-foreground">
                        Este nome só aparecerá no seu Followw.
                    </Text>
                </View>
                <View className="gap-2">
                    <Label nativeID="profile-bio">Bio</Label>
                    <Textarea
                        aria-labelledby="profile-bio"
                        value={bio}
                        numberOfLines={4}
                        editable={!pending}
                        placeholder="Escreva um pouco sobre você"
                        onChangeText={(value) => setBio(truncateProfileBio(value))}
                        maxLength={MAX_PROFILE_BIO_LENGTH}
                        className="h-28"
                    />
                </View>
                {error ? (
                    <Text role="alert" className="text-sm text-destructive">
                        {error}
                    </Text>
                ) : null}
                {!online && <Text role="alert">Conecte-se à internet para salvar.</Text>}
            </ScrollView>
            <DialogFooter>
                <Button variant="outline" disabled={pending} onPress={close}>
                    <Text>Cancelar</Text>
                </Button>
                <Button disabled={pending || !online} onPress={() => void save()}>
                    <Text>{pending ? 'Salvando...' : 'Salvar alterações'}</Text>
                </Button>
            </DialogFooter>
        </>
    );
}

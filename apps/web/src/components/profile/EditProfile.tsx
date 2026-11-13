import { useOnline } from '@followw/core/lib/online.ts';
import { MAX_PROFILE_BIO_LENGTH, truncateProfileBio } from '@followw/core/lib/profile.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { UserProfile } from '#/queries/me';

import { PhotoCrop } from '#/components/profile/PhotoCrop';
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
import { PersonPhoto } from '#/components/ui/person-photo';
import { Textarea } from '#/components/ui/textarea';
import { toast } from '#/components/ui/toast';
import { useEditProfile } from '#/queries/profile-edit';
import { useUpdateSettings } from '#/queries/settings';

const MAX_ORIGINAL_PHOTO_MB = 4;
const PHOTO_EXTENSIONS = /\.(jpe?g|png)$/i;

type PhotoEdit = { action: 'keep' | 'remove' } | { action: 'replace'; file: File; preview: string };

function errorReason(error: unknown) {
    if (!(error instanceof ApiError)) return null;
    if (error.isTooManyRequests) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    if (error.status === 413 || error.status === 422)
        return typeof error.detail === 'string'
            ? error.detail
            : 'Confira os dados e tente novamente.';
    return null;
}

export function EditProfile({
    user,
    displayName
}: {
    user: UserProfile;
    displayName?: string | null;
}) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
                disabled={saving}
                render={
                    <Button
                        variant="ghost"
                        className="h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3 py-2.5"
                    />
                }
            >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Pencil className="size-4" aria-hidden="true" />
                </span>
                <span className="flex-1 text-left">
                    {saving ? 'Salvando perfil...' : 'Editar perfil'}
                </span>
            </DialogTrigger>
            <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-lg">
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

export function ProfileForm({
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
    const fileInput = useRef<HTMLInputElement>(null);
    const online = useOnline();
    const remote = useEditProfile();
    const settings = useUpdateSettings();
    const [name, setName] = useState(displayName ?? '');
    const [savedBio, setSavedBio] = useState(() => truncateProfileBio(user.bio ?? ''));
    const [bio, setBio] = useState(savedBio);
    const [photo, setPhoto] = useState<PhotoEdit>({ action: 'keep' });
    const [crop, setCrop] = useState<File | null>(null);
    const { action } = photo;
    const preview = action === 'replace' ? photo.preview : null;
    const [error, setError] = useState('');
    const [remoteSaved, setRemoteSaved] = useState(false);
    const pending = remote.isPending || settings.isPending;
    useEffect(
        () => () => {
            if (preview) URL.revokeObjectURL(preview);
        },
        [preview]
    );
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
                    photo: action === 'replace' ? photo.file : null
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
    const image = action === 'remove' ? null : (preview ?? user.photo);
    return (
        <>
            <DialogHeader>
                <DialogTitle>{crop ? 'Ajustar foto' : 'Editar perfil'}</DialogTitle>
                <DialogDescription>Foto e bio serão atualizadas no SIGAA.</DialogDescription>
            </DialogHeader>
            {crop ? (
                <PhotoCrop
                    file={crop}
                    onCancel={() => setCrop(null)}
                    onConfirm={(file) => {
                        setPhoto({ action: 'replace', file, preview: URL.createObjectURL(file) });
                        setCrop(null);
                    }}
                />
            ) : (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!pending && online) void save();
                    }}
                    className="flex flex-col gap-4"
                >
                    <fieldset disabled={pending} className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="profile-photo">Foto de perfil</Label>
                            <div className="flex items-center gap-4">
                                <PersonPhoto src={image} size="lg" />
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => fileInput.current?.click()}
                                    >
                                        <ImagePlus data-icon="inline-start" aria-hidden="true" />
                                        Escolher foto
                                    </Button>
                                    <Input
                                        ref={fileInput}
                                        id="profile-photo"
                                        type="file"
                                        accept=".jpg,.jpeg,.png"
                                        className="hidden"
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            event.target.value = '';
                                            if (!file) return;
                                            if (
                                                !PHOTO_EXTENSIONS.test(file.name) ||
                                                (file.type !== '' &&
                                                    !['image/jpeg', 'image/png'].includes(
                                                        file.type
                                                    )) ||
                                                file.size > MAX_ORIGINAL_PHOTO_MB * 1024 * 1024
                                            ) {
                                                setError(
                                                    `Escolha JPEG ou PNG de até ${MAX_ORIGINAL_PHOTO_MB} MB.`
                                                );
                                                return;
                                            }
                                            setError('');
                                            setCrop(file);
                                        }}
                                    />
                                    {image && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setPhoto({ action: 'remove' })}
                                        >
                                            <Trash2 data-icon="inline-start" aria-hidden="true" />
                                            Remover foto
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                JPEG ou PNG, até {MAX_ORIGINAL_PHOTO_MB} MB.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="display-name">Nome de exibição</Label>
                            <Input
                                id="display-name"
                                value={name}
                                maxLength={24}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={user.name}
                                autoComplete="nickname"
                            />
                            <p className="text-xs text-muted-foreground">
                                Este nome só aparecerá no seu Followw.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="profile-bio">Bio</Label>
                            <Textarea
                                id="profile-bio"
                                value={bio}
                                rows={4}
                                placeholder="Escreva um pouco sobre você"
                                onChange={(e) => setBio(truncateProfileBio(e.target.value))}
                                className="field-sizing-fixed resize-none"
                                maxLength={MAX_PROFILE_BIO_LENGTH}
                            />
                        </div>
                    </fieldset>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    {!online && <p role="alert">Conecte-se à internet para salvar.</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={pending} onClick={close}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={pending || !online}>
                            {pending ? 'Salvando...' : 'Salvar alterações'}
                        </Button>
                    </DialogFooter>
                </form>
            )}
        </>
    );
}

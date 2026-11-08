import { Pencil, UserRound } from 'lucide-react';
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
import { useOnline } from '#/lib/online';
import { useEditProfile } from '#/queries/profile-edit';
import { useUpdateSettings } from '#/queries/settings';

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
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!saving) setOpen(next);
            }}
        >
            <DialogTrigger
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
                <span className="flex-1 text-left">Editar perfil</span>
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
    const [bio, setBio] = useState(user.bio ?? '');
    const [savedBio, setSavedBio] = useState(user.bio ?? '');
    const [photo, setPhoto] = useState<File | null>(null);
    const [crop, setCrop] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [action, setAction] = useState<'keep' | 'replace' | 'remove'>('keep');
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
        let savingName = false;
        try {
            if (bio !== savedBio || action !== 'keep') {
                await remote.mutateAsync({ bio, action, photo });
                setSavedBio(bio);
                setAction('keep');
                setPhoto(null);
                setPreview(null);
                setRemoteSaved(true);
                saved = true;
            }
            savingName = true;
            await settings.mutateAsync({ body: { displayName: name.trim() || null } });
            close();
        } catch {
            setError(
                savingName
                    ? saved
                        ? 'Foto e bio salvas. Não foi possível salvar o nome. Tente novamente.'
                        : 'Não foi possível salvar o nome. Tente novamente.'
                    : 'Não foi possível confirmar a alteração no SIGAA. Confira o perfil antes de tentar novamente.'
            );
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
                        setPhoto(file);
                        setPreview(URL.createObjectURL(file));
                        setAction('replace');
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
                                {image ? (
                                    <img
                                        src={image}
                                        alt="Foto de perfil"
                                        className="aspect-4/5 w-20 rounded-lg object-cover"
                                    />
                                ) : (
                                    <UserRound className="size-16 text-muted-foreground" />
                                )}
                                <div className="flex flex-col gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => fileInput.current?.click()}
                                    >
                                        Escolher foto
                                    </Button>
                                    <Input
                                        ref={fileInput}
                                        id="profile-photo"
                                        type="file"
                                        accept="image/jpeg,image/png"
                                        className="hidden"
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            event.target.value = '';
                                            if (!file) return;
                                            if (
                                                !['image/jpeg', 'image/png'].includes(file.type) ||
                                                file.size > 5 * 1024 * 1024
                                            ) {
                                                setError('Escolha JPEG ou PNG de até 5 MB.');
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
                                            onClick={() => {
                                                setPhoto(null);
                                                setAction('remove');
                                            }}
                                        >
                                            Remover foto
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">JPEG ou PNG, até 5 MB.</p>
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
                                Até 24 caracteres. Deixe vazio para usar seu nome do SIGAA.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="profile-bio">Bio</Label>
                            <textarea
                                id="profile-bio"
                                value={bio}
                                maxLength={5000}
                                rows={4}
                                onChange={(e) => setBio(e.target.value)}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
                        <Button
                            type="submit"
                            disabled={pending || !online || name.trim().length > 24}
                        >
                            {pending ? 'Salvando...' : 'Salvar alterações'}
                        </Button>
                    </DialogFooter>
                </form>
            )}
        </>
    );
}

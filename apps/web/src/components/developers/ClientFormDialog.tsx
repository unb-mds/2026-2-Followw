import type {
    OAuthClient,
    OAuthClientCreate,
    OAuthClientUpdate
} from '@followw/core/queries/oauth.ts';

import { ApiError } from '@followw/core/queries/errors.ts';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '#/components/ui/dialog';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
    FieldLegend,
    FieldSet,
    FieldTitle
} from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group';
import { Textarea } from '#/components/ui/textarea';

const MAX_REDIRECT_URIS = 5;

type SubmitCreate = {
    mode: 'create';
    onSubmit: (body: OAuthClientCreate) => Promise<void>;
};

type SubmitEdit = {
    mode: 'edit';
    client: OAuthClient;
    onSubmit: (body: OAuthClientUpdate) => Promise<void>;
};

type Props = (SubmitCreate | SubmitEdit) & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function ClientFormDialog(props: Props) {
    const { open, onOpenChange } = props;
    const editing = props.mode === 'edit' ? props.client : null;

    const [name, setName] = useState(editing?.name ?? '');
    const [description, setDescription] = useState(editing?.description ?? '');
    const [homepageUrl, setHomepageUrl] = useState(editing?.homepage_url ?? '');
    const [confidential, setConfidential] = useState(editing?.confidential ?? false);
    const [redirectUris, setRedirectUris] = useState<{ id: number; value: string }[]>(() =>
        (editing?.redirect_uris.length ? editing.redirect_uris : ['']).map((value, id) => ({
            id,
            value
        }))
    );
    const [nextUriId, setNextUriId] = useState(
        editing?.redirect_uris.length ? editing.redirect_uris.length : 1
    );
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        const uris = redirectUris.map((entry) => entry.value.trim()).filter(Boolean);
        if (!name.trim()) {
            setError('Informe o nome da aplicação.');
            return;
        }
        if (uris.length === 0) {
            setError('Informe ao menos uma URI de redirecionamento.');
            return;
        }

        setSubmitting(true);
        try {
            if (props.mode === 'create') {
                await props.onSubmit({
                    name: name.trim(),
                    description: description.trim() || null,
                    homepage_url: homepageUrl.trim() || null,
                    confidential,
                    redirect_uris: uris
                });
            } else {
                await props.onSubmit({
                    name: name.trim(),
                    description: description.trim() || null,
                    homepage_url: homepageUrl.trim() || null,
                    redirect_uris: uris
                });
            }
            onOpenChange(false);
        } catch (err) {
            setError(formatError(err));
        } finally {
            setSubmitting(false);
        }
    }

    function updateUri(id: number, value: string) {
        setRedirectUris((prev) => prev.map((item) => (item.id === id ? { ...item, value } : item)));
    }

    function addUri() {
        if (redirectUris.length >= MAX_REDIRECT_URIS) return;
        setRedirectUris((prev) => [...prev, { id: nextUriId, value: '' }]);
        setNextUriId((prev) => prev + 1);
    }

    function removeUri(id: number) {
        setRedirectUris((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {editing ? 'Editar aplicação' : 'Nova aplicação OAuth'}
                    </DialogTitle>
                    <DialogDescription>
                        {editing
                            ? 'Atualize os dados exibidos aos estudantes e as URIs de retorno autorizadas.'
                            : 'Cadastre uma aplicação para autenticar estudantes com "Entrar com Followw".'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="dev-app-name">Nome da aplicação</Label>
                        <Input
                            id="dev-app-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex.: UnB Bot ou Planejador de Grade"
                            maxLength={80}
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="dev-app-description">Descrição curta (opcional)</Label>
                        <Textarea
                            id="dev-app-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Explique brevemente o que sua aplicação faz."
                            maxLength={280}
                            rows={2}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="dev-app-homepage">Página inicial (opcional)</Label>
                        <Input
                            id="dev-app-homepage"
                            type="url"
                            value={homepageUrl}
                            onChange={(e) => setHomepageUrl(e.target.value)}
                            placeholder="https://meuapp.unb.dev"
                        />
                    </div>

                    {!editing && (
                        <FieldSet>
                            <FieldLegend variant="label">Tipo de aplicação</FieldLegend>
                            <RadioGroup
                                value={confidential ? 'confidential' : 'public'}
                                onValueChange={(value) => setConfidential(value === 'confidential')}
                                className="grid-cols-2"
                            >
                                <FieldLabel htmlFor="dev-app-type-public">
                                    <Field orientation="horizontal">
                                        <FieldContent>
                                            <FieldTitle>Pública</FieldTitle>
                                            <FieldDescription>
                                                SPA, mobile ou CLI. Sem segredo; exige PKCE + DPoP.
                                            </FieldDescription>
                                        </FieldContent>
                                        <RadioGroupItem value="public" id="dev-app-type-public" />
                                    </Field>
                                </FieldLabel>
                                <FieldLabel htmlFor="dev-app-type-confidential">
                                    <Field orientation="horizontal">
                                        <FieldContent>
                                            <FieldTitle>Confidencial</FieldTitle>
                                            <FieldDescription>
                                                Servidor backend capaz de guardar client_secret.
                                            </FieldDescription>
                                        </FieldContent>
                                        <RadioGroupItem
                                            value="confidential"
                                            id="dev-app-type-confidential"
                                        />
                                    </Field>
                                </FieldLabel>
                            </RadioGroup>
                        </FieldSet>
                    )}

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Label>URIs de redirecionamento</Label>
                            {redirectUris.length < MAX_REDIRECT_URIS && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={addUri}
                                    className="h-7 gap-1 px-2 text-xs"
                                >
                                    <Plus className="size-3.5" aria-hidden="true" />
                                    Adicionar URI
                                </Button>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            {redirectUris.map((entry, index) => (
                                <div key={entry.id} className="flex items-center gap-2">
                                    <Input
                                        aria-label={`URI de redirecionamento ${index + 1}`}
                                        value={entry.value}
                                        onChange={(e) => updateUri(entry.id, e.target.value)}
                                        placeholder={
                                            confidential
                                                ? 'https://meuapp.unb.dev/callback'
                                                : 'https://meuapp.unb.dev/cb ou meuapp://cb'
                                        }
                                        required={index === 0}
                                    />
                                    {redirectUris.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Remover URI ${index + 1}`}
                                            onClick={() => removeUri(entry.id)}
                                        >
                                            <Trash2 className="size-4" aria-hidden="true" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Correspondência exata, sem wildcards. HTTPS obrigatório, localhost estão
                            sempre liberados.
                        </p>
                    </div>

                    {error && (
                        <p role="alert" className="text-sm font-medium text-destructive">
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting
                                ? 'Salvando...'
                                : editing
                                  ? 'Salvar alterações'
                                  : 'Criar aplicação'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function formatError(err: unknown): string {
    if (err instanceof ApiError && err.detail) {
        if (typeof err.detail === 'string') return err.detail;
        if (Array.isArray(err.detail) && err.detail[0]?.msg) {
            return String(err.detail[0].msg).replace(/^Value error,\s*/i, '');
        }
    }
    return 'Não foi possível salvar a aplicação. Tente novamente.';
}

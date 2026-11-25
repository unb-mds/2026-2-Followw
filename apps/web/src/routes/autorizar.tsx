import type { AuthorizationRequest } from '@followw/core/queries/oauth.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { api } from '@followw/core/queries/api.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { oauthAuthorizationQueryOptions } from '@followw/core/queries/oauth.ts';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useLocation } from '@tanstack/react-router';

import { FollowwLogo } from '#/components/FollowwLogo';
import { LoadingSkeleton, CardSkeleton } from '#/components/LoadingSkeleton';
import { Button, buttonVariants } from '#/components/ui/button';
import { readAuthorizationRequest } from '#/lib/oauth-request';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/autorizar')({
    loader: async ({ context, location }) => {
        const user = await loadQuery(context.queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login', search: { returnTo: location.href } });
    },
    head: () => ({
        meta: [
            { title: 'Autorizar aplicativo | Followw' },
            { name: 'robots', content: 'noindex' },
            { name: 'referrer', content: 'no-referrer' }
        ]
    }),
    component: AuthorizationPage
});

function AuthorizationPage() {
    const location = useLocation();
    const request = readAuthorizationRequest(location.searchStr);
    return (
        <main
            className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12"
            data-ph-no-capture
        >
            <FollowwLogo className="size-12" />
            {request ? <Consent request={request} returnTo={location.href} /> : <InvalidRequest />}
        </main>
    );
}

function InvalidRequest() {
    return (
        <>
            <h1 className="text-2xl font-bold">Pedido de autorização inválido</h1>
            <p className="text-muted-foreground">
                Não foi possível verificar este pedido. Volte ao aplicativo e inicie a conexão
                novamente.
            </p>
            <Link to="/perfil" className={buttonVariants({ variant: 'outline' })}>
                Voltar ao perfil
            </Link>
        </>
    );
}

function Consent({ request, returnTo }: { request: AuthorizationRequest; returnTo: string }) {
    const online = useOnline();
    const authorization = useQuery({ ...oauthAuthorizationQueryOptions(request), enabled: online });
    const decision = api.useMutation('post', '/oauth/authorize', {
        onSuccess: ({ redirect_uri }) => window.location.assign(redirect_uri)
    });
    const details = authorization.data;
    const loginRequired =
        authorization.error instanceof ApiError && authorization.error.isUnauthorized;
    if (!online) return <p role="alert">Conecte-se à internet para autorizar um aplicativo.</p>;
    if (loginRequired)
        return (
            <>
                <h1 className="text-2xl font-bold">Entre novamente para continuar</h1>
                <p className="text-muted-foreground">
                    Sua sessão expirou. Entre no Followw para revisar este pedido.
                </p>
                <Link to="/login" search={{ returnTo }} className={buttonVariants()}>
                    Entrar no Followw
                </Link>
            </>
        );
    if (authorization.error instanceof ApiError && authorization.error.status === 400)
        return <InvalidRequest />;
    if (authorization.isError)
        return (
            <>
                <h1 className="text-2xl font-bold">Não foi possível verificar o pedido</h1>
                <p className="text-muted-foreground">
                    O serviço está indisponível no momento. Tente novamente antes de autorizar.
                </p>
                <Button
                    variant="outline"
                    disabled={authorization.isFetching}
                    onClick={() => void authorization.refetch()}
                >
                    Tentar novamente
                </Button>
            </>
        );
    if (!details)
        return (
            <LoadingSkeleton label="Verificando pedido de autorização">
                <CardSkeleton />
                <CardSkeleton />
            </LoadingSkeleton>
        );
    return (
        <>
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold">Conectar {details.name}?</h1>
                <p className="text-muted-foreground">
                    Este aplicativo terá acesso aos dados e ações abaixo. Autorize apenas se você
                    confiar nele.
                </p>
            </header>
            <ul className="flex flex-col divide-y rounded-2xl border bg-card px-4">
                {details.permissions.map((permission) => (
                    <li key={permission.scope} className="flex flex-col gap-1 py-4">
                        <span className="font-medium">{permission.label}</span>
                        {permission.trust_level === 'high' && (
                            <span className="text-sm text-destructive">
                                Permissão sensível: confira antes de autorizar.
                            </span>
                        )}
                    </li>
                ))}
            </ul>
            <p className="text-sm text-muted-foreground">
                Sua senha não é entregue ao aplicativo. Você pode revogar este acesso nas
                configurações do Followw.
            </p>
            {decision.isError && (
                <p role="alert" className="text-sm text-destructive">
                    Não foi possível concluir. O pedido pode ter expirado; inicie a conexão
                    novamente no aplicativo.
                </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                    variant="outline"
                    className="flex-1"
                    disabled={decision.isPending}
                    onClick={() =>
                        decision.mutate({
                            body: { request_token: details.request_token, approved: false }
                        })
                    }
                >
                    Recusar
                </Button>
                <Button
                    className="flex-1"
                    disabled={decision.isPending}
                    onClick={() =>
                        decision.mutate({
                            body: { request_token: details.request_token, approved: true }
                        })
                    }
                >
                    {decision.isPending ? 'Concluindo…' : 'Autorizar'}
                </Button>
            </div>
        </>
    );
}

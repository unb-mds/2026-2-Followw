import { accountDataQueryOptions } from '@followw/core/queries/account-data.ts';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import { HeaderTitle } from '#/components/HeaderBar';
import { CardSkeleton, LoadingSkeleton } from '#/components/LoadingSkeleton';
import { DeleteAccountForm } from '#/components/settings/DeleteAccountForm';
import { Button, buttonVariants } from '#/components/ui/button';
import { useGoBack } from '#/components/useGoBack';

export const Route = createFileRoute('/excluir-conta')({
    head: () => ({ meta: [{ title: 'Excluir meus dados | Followw' }] }),
    component: DeleteAccountPage
});

function focusHeading(element: HTMLHeadingElement | null) {
    element?.focus();
}

function DeleteAccountPage() {
    const goBack = useGoBack();
    const [deleted, setDeleted] = useState(false);
    const account = useQuery({ ...accountDataQueryOptions, enabled: !deleted });

    if (deleted) {
        return (
            <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
                <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-2xl border bg-card p-5">
                    <h1 ref={focusHeading} tabIndex={-1} className="text-xl font-semibold">
                        Exclusão concluída
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Seus dados acadêmicos e preferências foram apagados do Followw.
                    </p>
                    <Link
                        to="/"
                        className={buttonVariants({ variant: 'outline', className: 'self-start' })}
                    >
                        Voltar ao início
                    </Link>
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
            <div className="mx-auto flex max-w-2xl flex-col gap-8">
                <div className="flex flex-col gap-3">
                    <Link
                        to="/privacidade"
                        onClick={goBack}
                        className="flex min-h-10 w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Voltar
                    </Link>
                    <HeaderTitle>Excluir meus dados</HeaderTitle>
                    <p className="text-muted-foreground">
                        Apague seus dados acadêmicos e preferências do Followw. Nada muda no SIGAA.
                    </p>
                </div>
                <section className="flex flex-col gap-3">
                    <h2 className="text-lg font-semibold">O que será apagado</h2>
                    <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-muted-foreground">
                        <li>
                            IRA, MP, progresso, vínculo com a matriz e histórico de disciplinas.
                        </li>
                        <li>
                            Menções, frequência, marcações de presença, biografia e preferências.
                        </li>
                        <li>
                            Registros de leitura, grade planejada, simulações e dados offline deste
                            navegador.
                        </li>
                    </ul>
                </section>
                <section className="flex flex-col gap-3">
                    <h2 className="text-lg font-semibold">O que será mantido</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Nome, matrícula, foto, e-mail, curso e participação nas turmas, mesmo que
                        tenham sido obtidos pelo seu login ou por colegas. Aulas, postagens,
                        materiais e estatísticas coletivas também permanecem.
                    </p>
                </section>
                <section className="flex flex-col gap-3">
                    <h2 className="text-lg font-semibold">O que acontece depois</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Suas sessões continuam ativas. Ao usar o Followw novamente, seus dados
                        acadêmicos podem ser salvos outra vez.
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Cópias em outros dispositivos, arquivos baixados, registros técnicos,
                        métricas e backups não são removidos.
                    </p>
                </section>
                {account.isPending ? (
                    <LoadingSkeleton label="Verificando sua sessão">
                        <CardSkeleton />
                    </LoadingSkeleton>
                ) : account.isError ? (
                    <div role="alert" className="flex flex-col gap-3 text-sm">
                        <p>
                            Não foi possível verificar sua sessão. Confira sua conexão e tente
                            novamente.
                        </p>
                        <Button
                            variant="outline"
                            className="self-start"
                            onClick={() => void account.refetch()}
                        >
                            Tentar novamente
                        </Button>
                    </div>
                ) : account.data ? (
                    <DeleteAccountForm account={account.data} onDeleted={() => setDeleted(true)} />
                ) : (
                    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
                        <h2 className="font-semibold">Você não está conectado</h2>
                        <p className="text-sm leading-6 text-muted-foreground">
                            Entre com o SIGAA para continuar. Se você nunca entrou no Followw, não
                            há dados obtidos pelo seu login para apagar.
                        </p>
                        <Link
                            to="/login"
                            search={{ returnTo: '/excluir-conta' }}
                            className={buttonVariants({ className: 'self-start' })}
                        >
                            Entrar para excluir meus dados
                        </Link>
                    </section>
                )}
            </div>
        </main>
    );
}

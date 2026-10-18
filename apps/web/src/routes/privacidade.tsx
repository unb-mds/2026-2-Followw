import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';

export const Route = createFileRoute('/privacidade')({
    head: () => ({ meta: [{ title: 'Privacidade e termos | Followw' }] }),
    component: PrivacyPage
});

function PrivacyPage() {
    return (
        <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
            <div className="mx-auto flex max-w-2xl flex-col gap-10">
                <header className="flex flex-col gap-6">
                    <Link
                        to="/login"
                        className="flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Voltar ao login
                    </Link>
                    <div className="flex items-center gap-3">
                        <FollowwLogo className="size-10" />
                        <h1 className="text-2xl font-bold tracking-tight">Privacidade e termos</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Atualizado em <time dateTime="2026-10-18">18 de outubro de 2026</time>
                    </p>
                    <nav
                        aria-label="Nesta página"
                        className="flex flex-wrap gap-x-6 gap-y-3 text-sm"
                    >
                        <a
                            className="text-primary underline underline-offset-4"
                            href="#politica-de-privacidade"
                        >
                            Política de privacidade
                        </a>
                        <a
                            className="text-primary underline underline-offset-4"
                            href="#termos-de-servico"
                        >
                            Termos de serviço
                        </a>
                    </nav>
                </header>

                <section
                    aria-labelledby="politica-de-privacidade"
                    className="flex flex-col gap-5 text-sm leading-6 text-muted-foreground"
                >
                    <h2
                        id="politica-de-privacidade"
                        className="scroll-mt-6 text-xl font-bold text-foreground"
                    >
                        Política de privacidade
                    </h2>
                    <div>
                        <h3 className="font-semibold text-foreground">Dados e cache</h3>
                        <p>
                            Guardamos em nosso banco de dados cópias de informações do SIGAA para
                            agilizar consultas: nome, matrícula, foto, e-mail, biografia, curso,
                            indicadores acadêmicos, turmas, participantes, menções, frequência e
                            postagens. Também salvamos suas preferências e marcações de presença.
                            Dados de uma turma podem ser reutilizados nas consultas de outros
                            integrantes autorizados dessa turma.
                        </p>
                        <p className="mt-2">
                            Esse cache é atualizado conforme o tipo de informação, mas não tem prazo
                            automático de exclusão no servidor: permanece até uma solicitação de
                            exclusão. O vencimento do prazo de atualização não apaga os dados.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Credenciais e sessão</h3>
                        <p>
                            Não guardamos sua senha nem sua sessão do SIGAA no banco de dados, nem
                            credenciais nos logs da API. Elas ficam em cookies cifrados no seu
                            navegador e são usadas para autenticar no CAS/SIGAA. Tarefas de
                            atualização também enviam credenciais cifradas à fila QStash (Upstash)
                            para processamento. Extrato e QR code do RU são consultados sem cache no
                            servidor.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">No seu dispositivo</h3>
                        <p>
                            Usamos cookies para manter seu acesso e armazenamento local para
                            preferências, páginas e dados consultados. O cache de dados permite
                            acesso offline por até 14 dias e é limpo ao sair da conta. Você também
                            pode remover os dados do site nas configurações do navegador.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Análise de uso</h3>
                        <p>
                            Usamos PostHog para métricas de navegação e gravação de sessões, com
                            informações sobre páginas, interações e dispositivo, para entender o uso
                            e corrigir problemas. Esses dados são enviados ao PostHog. A API também
                            registra dados técnicos das requisições, como rota, status e duração,
                            para diagnóstico.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Excluir seus dados</h3>
                        <p>
                            Para solicitar a exclusão dos seus dados existentes no Followw, escreva
                            para{' '}
                            <a
                                className="text-primary underline underline-offset-4"
                                href="mailto:removal@followw.app"
                            >
                                removal@followw.app
                            </a>
                            . Não envie sua senha. A exclusão não altera seus registros na UnB e não
                            impede novas coletas: seus dados podem voltar em sincronizações futuras,
                            inclusive de participantes feitas por outros integrantes da turma. Para
                            limpar o dispositivo, saia da conta ou remova os dados do site no
                            navegador.
                        </p>
                    </div>
                </section>

                <section
                    aria-labelledby="termos-de-servico"
                    className="flex flex-col gap-5 border-t border-border pt-8 text-sm leading-6 text-muted-foreground"
                >
                    <h2
                        id="termos-de-servico"
                        className="scroll-mt-6 text-xl font-bold text-foreground"
                    >
                        Termos de serviço
                    </h2>
                    <p>
                        Use o Followw com responsabilidade e respeite a privacidade das outras
                        pessoas. Integrações, scripts e automações são permitidos desde que
                        respeitem os controles de acesso e não prejudiquem o Followw ou os sistemas
                        da UnB.
                    </p>
                    <p>
                        É proibido sobrecarregar o serviço, burlar restrições, acessar contas ou
                        dados sem autorização, adulterar informações de forma mal-intencionada ou
                        usar dados para perseguição (stalking), assédio, vigilância de pessoas ou
                        outras práticas abusivas. O acesso pode ser restringido em caso de abuso.
                    </p>
                    <p>
                        O Followw depende dos sistemas da UnB e pode apresentar indisponibilidade ou
                        dados desatualizados. Confira informações e procedimentos acadêmicos
                        importantes nos canais oficiais.
                    </p>
                </section>
            </div>
        </main>
    );
}

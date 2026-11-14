import type { InternshipDetail, InternshipItem } from '@followw/core/queries/internships.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import {
    internshipDetailQueryOptions,
    internshipsQueryOptions
} from '@followw/core/queries/internships.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Building2, Download, GraduationCap, Users, Wallet } from 'lucide-react';

import { formatCurrency, formatDate } from '#/components/search/InternshipCard';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '#/components/ui/dialog';
import { Spinner } from '#/components/ui/spinner';
import { Markdown } from '#/lib/markdown';

export function InternshipDetailView({ detail }: { detail: InternshipDetail }) {
    return (
        <div className="flex flex-col gap-6">
            <DialogHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {detail.is_my_course ? (
                        <Badge variant="default">Seu Curso</Badge>
                    ) : (
                        <Badge variant="secondary">Geral</Badge>
                    )}
                    {detail.sigaa_enrollment ? (
                        <Badge variant="outline">Inscrição via SIGAA</Badge>
                    ) : (
                        <Badge variant="outline">Inscrição externa</Badge>
                    )}
                </div>
                <DialogTitle className="text-xl leading-snug font-bold">
                    {titleCase(detail.title)}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                    Publicado de {formatDate(detail.published_from)} até{' '}
                    {formatDate(detail.published_until)}
                </DialogDescription>
            </DialogHeader>

            {/* Informações da Concedente */}
            <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3.5 text-sm">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                    <Building2 className="size-4 text-primary" aria-hidden="true" />
                    <span>{titleCase(detail.grantor.name)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>CNPJ: {detail.grantor.cnpj || 'Não informado'}</span>
                    <span>Convênio: {detail.grantor.agreement_type}</span>
                </div>
                {detail.grantor.responsibles.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                        Responsáveis: {detail.grantor.responsibles.join(', ')}
                    </p>
                )}
            </div>

            {/* Remuneração e Vagas */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1 rounded-xl border p-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Wallet className="size-3.5 text-primary" aria-hidden="true" />
                        Bolsa
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(detail.stipend) ?? 'A combinar'}
                    </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border p-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Briefcase className="size-3.5 text-primary" aria-hidden="true" />
                        Aux. Transporte
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                        {detail.transport_allowance
                            ? `${formatCurrency(detail.transport_allowance.amount)} / ${detail.transport_allowance.period}`
                            : 'Não informado'}
                    </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border p-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="size-3.5 text-primary" aria-hidden="true" />
                        Vagas
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                        {detail.vacancies} {detail.vacancies === 1 ? 'vaga' : 'vagas'}
                    </span>
                </div>
            </div>

            {/* Cursos Elegíveis */}
            {detail.courses.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        <GraduationCap className="size-3.5 text-primary" aria-hidden="true" />
                        Cursos Elegíveis ({detail.courses.length})
                    </h4>
                    <ul className="flex flex-col gap-1 text-xs">
                        {detail.courses.map((course) => (
                            <li key={`${course.name}-${course.degree}-${course.unit}`}>
                                {titleCase(course.name)}
                                {course.degree === 'Licenciatura' && ' · Licenciatura'}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Descrição Detalhada */}
            {detail.description && (
                <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        Descrição da Vaga
                    </h4>
                    <div className="rounded-xl border bg-card p-4">
                        <Markdown>{detail.description}</Markdown>
                    </div>
                </div>
            )}

            {/* Anexo de Edital / Arquivo */}
            {detail.attachment && (
                <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        Edital / Anexo
                    </h4>
                    <a
                        href={detail.attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border bg-card p-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
                    >
                        <Download className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{detail.attachment.name}</span>
                    </a>
                </div>
            )}
        </div>
    );
}

export function InternshipDetailDialog({
    summary,
    open,
    onOpenChange
}: {
    summary: InternshipItem | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const client = useQueryClient();
    const {
        data: detail,
        isLoading,
        error,
        refetch
    } = useQuery({
        ...internshipDetailQueryOptions(summary?.reference ?? ''),
        enabled: open && Boolean(summary)
    });
    const missing = error instanceof ApiError && error.isNotFound;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                {isLoading ? (
                    <DialogHeader className="pr-8">
                        <DialogTitle>{titleCase(summary?.title ?? 'Detalhes da vaga')}</DialogTitle>
                        <DialogDescription>
                            Inscrições até {summary && formatDate(summary.published_until)}
                        </DialogDescription>
                        <output className="flex items-center gap-2 text-muted-foreground">
                            <Spinner />
                            Carregando detalhes da vaga...
                        </output>
                    </DialogHeader>
                ) : missing || !detail ? (
                    <div className="py-8 text-center">
                        <DialogTitle className="text-sm text-destructive">
                            {missing
                                ? 'A vaga mudou ou saiu do mural. Atualize a lista para continuar.'
                                : 'Não foi possível carregar os detalhes do estágio.'}
                        </DialogTitle>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => {
                                if (!missing) {
                                    void refetch();
                                    return;
                                }
                                void client.invalidateQueries({
                                    queryKey: internshipsQueryOptions.queryKey
                                });
                                onOpenChange(false);
                            }}
                        >
                            {missing ? 'Atualizar mural' : 'Tentar novamente'}
                        </Button>
                    </div>
                ) : (
                    <InternshipDetailView detail={detail} />
                )}
            </DialogContent>
        </Dialog>
    );
}

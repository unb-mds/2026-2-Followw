import type { InternshipDetail, InternshipItem } from '@followw/core/queries/internships.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import {
    internshipDetailQueryOptions,
    internshipsQueryOptions
} from '@followw/core/queries/internships.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Building2, Download, GraduationCap, Users, Wallet } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { LinesSkeleton, LoadingSkeleton, repeat } from '@/components/LoadingSkeleton';
import { Markdown, openLink } from '@/components/Markdown';
import { formatCurrency, formatDate } from '@/components/search/InternshipCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

function SectionTitle({ icon, children }: { icon?: typeof Briefcase; children: string }) {
    return (
        <View className="flex-row items-center gap-1.5">
            {icon && <Icon as={icon} className="size-3.5 text-primary" />}
            <Text
                role="heading"
                aria-level={4}
                className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
                {children}
            </Text>
        </View>
    );
}

function Fact({ icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
    return (
        <View className="gap-1 rounded-xl border border-border p-3">
            <View className="flex-row items-center gap-1.5">
                <Icon as={icon} className="size-3.5 text-primary" />
                <Text className="text-xs text-muted-foreground">{label}</Text>
            </View>
            <Text className="text-sm font-semibold text-foreground">{value}</Text>
        </View>
    );
}

export function InternshipDetailView({ detail }: { detail: InternshipDetail }) {
    return (
        <View className="gap-6">
            <DialogHeader className="gap-2">
                <View className="flex-row flex-wrap items-center gap-2">
                    <Badge variant={detail.is_my_course ? 'default' : 'secondary'}>
                        <Text>{detail.is_my_course ? 'Seu Curso' : 'Geral'}</Text>
                    </Badge>
                    <Badge variant="outline">
                        <Text>
                            {detail.sigaa_enrollment ? 'Inscrição via SIGAA' : 'Inscrição externa'}
                        </Text>
                    </Badge>
                </View>
                <DialogTitle className="text-xl leading-snug font-bold">
                    {titleCase(detail.title)}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                    {`Publicado de ${formatDate(detail.published_from)} até ${formatDate(detail.published_until)}`}
                </DialogDescription>
            </DialogHeader>

            <View className="gap-2 rounded-xl border border-border bg-muted/30 p-3.5">
                <View className="flex-row items-center gap-2">
                    <Icon as={Building2} className="size-4 text-primary" />
                    <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                        {titleCase(detail.grantor.name)}
                    </Text>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                    <Text className="text-xs text-muted-foreground">
                        CNPJ: {detail.grantor.cnpj || 'Não informado'}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                        Convênio: {detail.grantor.agreement_type}
                    </Text>
                </View>
                {detail.grantor.responsibles.length > 0 && (
                    <Text className="text-xs text-muted-foreground">
                        Responsáveis: {detail.grantor.responsibles.join(', ')}
                    </Text>
                )}
            </View>

            <View className="gap-3">
                <Fact
                    icon={Wallet}
                    label="Bolsa"
                    value={formatCurrency(detail.stipend) ?? 'A combinar'}
                />
                <Fact
                    icon={Briefcase}
                    label="Aux. Transporte"
                    value={
                        detail.transport_allowance
                            ? `${formatCurrency(detail.transport_allowance.amount)} / ${detail.transport_allowance.period}`
                            : 'Não informado'
                    }
                />
                <Fact
                    icon={Users}
                    label="Vagas"
                    value={`${detail.vacancies} ${detail.vacancies === 1 ? 'vaga' : 'vagas'}`}
                />
            </View>

            {detail.courses.length > 0 && (
                <View className="gap-2">
                    <SectionTitle icon={GraduationCap}>
                        {`Cursos Elegíveis (${detail.courses.length})`}
                    </SectionTitle>
                    <View className="gap-1">
                        {detail.courses.map((course) => (
                            <Text
                                key={`${course.name}-${course.degree}-${course.unit}`}
                                className="text-xs"
                            >
                                {titleCase(course.name)}
                                {course.degree === 'Licenciatura' && ' · Licenciatura'}
                            </Text>
                        ))}
                    </View>
                </View>
            )}

            {detail.description && (
                <View className="gap-2">
                    <SectionTitle>Descrição da Vaga</SectionTitle>
                    <View className="rounded-xl border border-border bg-card p-4">
                        <Markdown>{detail.description}</Markdown>
                    </View>
                </View>
            )}

            {detail.attachment && (
                <View className="gap-2">
                    <SectionTitle>Edital / Anexo</SectionTitle>
                    <Pressable
                        accessibilityRole="link"
                        onPress={() => detail.attachment && openLink(detail.attachment.url)}
                        className="flex-row items-center gap-2 rounded-xl border border-border bg-card p-3 active:bg-primary/5"
                    >
                        <Icon as={Download} className="size-4 shrink-0 text-primary" />
                        <Text numberOfLines={1} className="shrink text-sm font-medium text-primary">
                            {detail.attachment.name}
                        </Text>
                    </Pressable>
                </View>
            )}
        </View>
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
            <DialogContent className="max-h-[85%]">
                <ScrollView>
                    {isLoading ? (
                        <DialogHeader className="pr-8">
                            <DialogTitle>
                                {titleCase(summary?.title ?? 'Detalhes da vaga')}
                            </DialogTitle>
                            <DialogDescription>
                                {`Inscrições até ${summary ? formatDate(summary.published_until) : ''}`}
                            </DialogDescription>
                            <LoadingSkeleton
                                label="Carregando detalhes da vaga..."
                                className="mt-4 gap-6"
                            >
                                {repeat(3, () => (
                                    <LinesSkeleton
                                        lines={['h-5 w-1/3', 'w-full', 'w-full', 'w-2/3']}
                                    />
                                ))}
                            </LoadingSkeleton>
                        </DialogHeader>
                    ) : missing || !detail ? (
                        <View className="items-center py-8">
                            <DialogTitle className="text-center text-sm text-destructive">
                                {missing
                                    ? 'A vaga mudou ou saiu do mural. Atualize a lista para continuar.'
                                    : 'Não foi possível carregar os detalhes do estágio.'}
                            </DialogTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onPress={() => {
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
                                <Text>{missing ? 'Atualizar mural' : 'Tentar novamente'}</Text>
                            </Button>
                        </View>
                    ) : (
                        <InternshipDetailView detail={detail} />
                    )}
                </ScrollView>
            </DialogContent>
        </Dialog>
    );
}

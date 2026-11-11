import { useNavigate } from '@tanstack/react-router';

import type { ScheduledClass } from '#/lib/schedule';
import type { Classroom } from '#/queries/classrooms';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { ClassCard } from '#/components/home/ClassCard';
import { SectionHeader } from '#/components/SectionHeader';

interface TodayClassesSectionProps {
    noClassReason?: string;
    isLoadingError: boolean;
    onRetry: () => void;
    classes: ScheduledClass<Classroom>[];
}

export const TodayClassesSection: React.FC<TodayClassesSectionProps> = (props) => {
    const { noClassReason, isLoadingError, classes } = props;
    // sem aulas no dia, a seção some
    if (!noClassReason && !isLoadingError && !classes.length) return null;

    return (
        <section>
            <SectionHeader title="Aulas do dia" />
            <TodayClassesContent {...props} />
        </section>
    );
};

function TodayClassesContent({
    noClassReason,
    isLoadingError,
    onRetry,
    classes
}: TodayClassesSectionProps) {
    const navigate = useNavigate();

    if (noClassReason)
        return (
            <div className="rounded-2xl bg-card p-4">
                <p className="font-semibold">Não há aulas hoje</p>
                <p className="text-sm text-muted-foreground">{noClassReason}</p>
            </div>
        );
    if (isLoadingError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={onRetry} />;

    return (
        <div className="flex flex-col gap-2">
            {classes.map(({ item, start, end, status }) => (
                <ClassCard
                    key={`${item.id}-${start}`}
                    title={item.subject.name}
                    code={item.subject.code}
                    classNumber={item.number}
                    time={`${start}–${end}`}
                    location={item.room ?? 'Local não informado'}
                    status={status}
                    onClick={() => navigate({ to: '/turmas/$id', params: { id: item.id } })}
                />
            ))}
        </div>
    );
}

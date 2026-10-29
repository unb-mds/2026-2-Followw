import { noop, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { ProfessorDetailsSection } from '#/components/professor/ProfessorDetailsSection';
import { ProfessorHeader } from '#/components/professor/ProfessorHeader';
import { buttonVariants } from '#/components/ui/button';
import { titleCase } from '#/lib/profile';
import { loadQuery } from '#/queries/load';
import { professorQueryOptions } from '#/queries/professors';

export const Route = createFileRoute('/_app/professores_/$siape')({
    loader: async ({ context: { queryClient }, params }) => {
        const siape = Number(params.siape);
        if (Number.isNaN(siape)) {
            return { professorName: undefined };
        }
        const professor = await loadQuery(queryClient, professorQueryOptions(siape)).catch(noop);
        return { professorName: professor?.name };
    },
    head: ({ loaderData }) => ({
        meta: [
            {
                title: `${loaderData?.professorName ? titleCase(loaderData.professorName) : 'Docente'} | Followw`
            }
        ]
    }),
    staticData: {
        header: ProfessorPageHeader
    },
    errorComponent: ErrorState,
    component: ProfessorPage
});

function ProfessorPageHeader() {
    const router = useRouter();
    const canGoBack = useCanGoBack();

    return (
        <HeaderBar showLogo={false}>
            <Link
                to="/buscar"
                aria-label="Voltar para busca"
                onClick={(event) => {
                    if (!canGoBack) return;
                    event.preventDefault();
                    router.history.back();
                }}
                className={buttonVariants({ variant: 'ghost', className: 'size-10' })}
            >
                <ArrowLeft className="size-5" />
            </Link>
            <HeaderTitle>Docente</HeaderTitle>
        </HeaderBar>
    );
}

function ProfessorPage() {
    const { siape } = Route.useParams();
    const siapeNumber = Number(siape);
    const isInvalidSiape = Number.isNaN(siapeNumber);

    const {
        data: professor,
        isPending,
        isLoadingError,
        refetch
    } = useQuery({
        ...professorQueryOptions(isInvalidSiape ? 0 : siapeNumber),
        enabled: !isInvalidSiape
    });

    if (isLoadingError) {
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => refetch()} />;
    }

    if (isPending) {
        return (
            <div className="py-12">
                <LoadingText className="justify-center">Carregando dados do docente...</LoadingText>
            </div>
        );
    }

    if (!professor) {
        return (
            <div className="py-12 text-center text-sm text-muted-foreground">
                Docente não encontrado.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5 pb-8">
            <ProfessorHeader professor={professor} />
            <ProfessorDetailsSection professor={professor} />
        </div>
    );
}

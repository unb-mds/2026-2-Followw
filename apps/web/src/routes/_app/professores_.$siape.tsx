import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router';

import { ErrorState } from '#/components/ErrorState';
import { BackHeader } from '#/components/HeaderBar';
import { ProfessorDetailsSection } from '#/components/professor/ProfessorDetailsSection';
import { ProfessorHeader } from '#/components/professor/ProfessorHeader';
import { titleCase } from '#/lib/profile';
import { ApiError } from '#/queries/errors';
import { loadQuery } from '#/queries/load';
import { professorQueryOptions } from '#/queries/professors';

// mesmo limite do `Path` da API; fora dele o docente não existe
const MAX_SIAPE = 2 ** 31 - 1;

function parseSiape(value: string): number {
    const siape = /^\d+$/.test(value) ? Number(value) : 0;
    if (siape <= 0 || siape > MAX_SIAPE) throw notFound({ routeId: rootRouteId });
    return siape;
}

export const Route = createFileRoute('/_app/professores_/$siape')({
    params: {
        parse: ({ siape }) => ({ siape: parseSiape(siape) }),
        stringify: ({ siape }) => ({ siape: String(siape) })
    },
    loader: async ({ context: { queryClient }, params: { siape } }) => {
        const professor = await loadQuery(queryClient, professorQueryOptions(siape)).catch(
            (error) => {
                if (error instanceof ApiError && error.isNotFound) {
                    throw notFound({ routeId: rootRouteId });
                }
            }
        );
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
        header: () => <BackHeader to="/buscar" title="Docente" ariaLabel="Voltar para busca" />
    },
    errorComponent: ErrorState,
    component: ProfessorPage
});

function ProfessorPage() {
    const { siape } = Route.useParams();
    const { data: professor } = useSuspenseQuery(professorQueryOptions(siape));

    return (
        <div className="flex flex-col gap-5 pb-8">
            <ProfessorHeader professor={professor} />
            <ProfessorDetailsSection professor={professor} />
        </div>
    );
}

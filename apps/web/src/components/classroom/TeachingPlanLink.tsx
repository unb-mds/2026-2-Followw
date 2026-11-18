import { Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';

import { ListCard } from '#/components/ListCard';

export function TeachingPlanLink({ id }: { id: string }) {
    return (
        <ListCard>
            <Link
                to="/turmas/$id/plano-de-ensino"
                params={{ id }}
                className="flex min-h-11 items-center gap-3 rounded-lg py-3 text-sm font-semibold transition-colors outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <BookOpen aria-hidden className="size-4 shrink-0 text-primary" />
                Plano de ensino
            </Link>
        </ListCard>
    );
}

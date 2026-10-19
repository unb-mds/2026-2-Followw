import { ChevronDown } from 'lucide-react';

export function SubjectDisclosure({
    count,
    children
}: {
    count: number;
    children: React.ReactNode;
}) {
    return (
        <details className="group/requirements min-w-0">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {`${count} ${count === 1 ? 'matéria' : 'matérias'}`}
                <ChevronDown
                    className="size-4 shrink-0 transition-transform group-open/requirements:rotate-180"
                    aria-hidden="true"
                />
            </summary>
            <div className="mt-2 flex min-w-0 flex-col gap-2 border-l pl-3 font-normal">
                {children}
            </div>
        </details>
    );
}

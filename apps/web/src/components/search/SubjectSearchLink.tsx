import { SEARCH_MAX_LENGTH } from '#/queries/subjects';

export function SubjectSearchLink({
    query,
    children
}: {
    query: string;
    children: React.ReactNode;
}) {
    return (
        <a
            href={`/buscar?${new URLSearchParams({ q: query.trim().slice(0, SEARCH_MAX_LENGTH) })}`}
            className="rounded-sm transition-colors hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
            {children}
        </a>
    );
}

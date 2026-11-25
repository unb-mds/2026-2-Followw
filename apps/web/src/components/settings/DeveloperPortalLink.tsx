import { Link } from '@tanstack/react-router';
import { ChevronRight, Code2 } from 'lucide-react';

export function DeveloperPortalLink() {
    return (
        <Link
            to="/developers"
            className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors not-first:border-t hover:bg-accent"
        >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Code2 className="size-4" aria-hidden="true" />
            </span>
            <span className="flex-1">Portal de desenvolvedores</span>
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
    );
}

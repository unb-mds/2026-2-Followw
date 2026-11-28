import { Link } from '@tanstack/react-router';
import { ChevronRight, Trash2 } from 'lucide-react';

import { buttonVariants } from '#/components/ui/button';

export function DeleteAccountLink() {
    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Seus dados</h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
                <Link
                    to="/excluir-conta"
                    className={buttonVariants({
                        variant: 'ghost',
                        className:
                            'h-auto min-h-14 w-full justify-start gap-3 rounded-none p-4 text-destructive hover:bg-destructive/10 hover:text-destructive'
                    })}
                >
                    <Trash2 className="size-5 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">Excluir meus dados</span>
                    <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
            </div>
        </section>
    );
}

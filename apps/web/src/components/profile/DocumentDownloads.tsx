import { Download, GraduationCap, IdCard } from 'lucide-react';

import type { StudentDocument } from '#/queries/documents';

import { Button } from '#/components/ui/button';
import { Spinner } from '#/components/ui/spinner';
import { useOnline } from '#/lib/online';
import { studentDocuments, useDownloadDocument } from '#/queries/documents';

const documents = [
    { document: 'student-card', icon: IdCard },
    { document: 'transcript', icon: GraduationCap }
] satisfies { document: StudentDocument; icon: typeof IdCard }[];

export function DocumentDownloads() {
    const download = useDownloadDocument();
    const online = useOnline();

    return (
        <>
            {documents.map(({ document, icon: Icon }) => {
                const { label } = studentDocuments[document];
                const pending = download.isPending && download.variables === document;
                return (
                    <Button
                        key={document}
                        type="button"
                        variant="ghost"
                        className="-mx-3 h-auto min-h-12 justify-start gap-3 rounded-none px-3 py-2.5"
                        disabled={!online || download.isPending}
                        aria-label={`Baixar ${label.toLowerCase()}`}
                        aria-busy={pending}
                        onClick={() => download.mutate(document)}
                    >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                            <span className="block">{label}</span>
                            <span
                                className="block text-xs text-muted-foreground"
                                aria-live="polite"
                            >
                                {pending && 'Preparando download...'}
                            </span>
                        </span>
                        {pending ? (
                            <Spinner aria-label="Preparando download" />
                        ) : (
                            <Download className="size-4 text-muted-foreground" aria-hidden="true" />
                        )}
                    </Button>
                );
            })}
            {(!online || download.isError) && (
                <p
                    role={download.isError ? 'alert' : 'status'}
                    className="py-2 text-xs text-muted-foreground"
                >
                    {!online
                        ? 'Conecte-se à internet para baixar os documentos.'
                        : 'Não foi possível baixar o documento. Tente novamente.'}
                </p>
            )}
        </>
    );
}

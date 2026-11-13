import { Download, GraduationCap, IdCard } from 'lucide-react';

import { Button } from '#/components/ui/button';
import { Spinner } from '#/components/ui/spinner';
import { useOnline } from '#/lib/online';
import { cn } from '#/lib/shadcn';
import {
    documentRefusal,
    studentDocuments,
    type useDownloadDocument,
    type StudentDocument
} from '#/queries/documents';

const documents = [
    { document: 'student-card', icon: IdCard, shortLabel: 'Carteirinha' },
    { document: 'transcript', icon: GraduationCap, shortLabel: 'Histórico' }
] satisfies { document: StudentDocument; icon: typeof IdCard; shortLabel: string }[];

export function DocumentDownloads({
    download
}: {
    download: ReturnType<typeof useDownloadDocument>;
}) {
    const pending = download.isPending ? download.variables : null;
    const failure = download.isError
        ? {
              document: download.variables,
              message:
                  documentRefusal(download.error) ??
                  'Não foi possível baixar o documento. Tente novamente.'
          }
        : null;
    const online = useOnline();

    return (
        <>
            {documents.map(({ document, icon: Icon, shortLabel }) => {
                const { label } = studentDocuments[document];
                const isPending = pending === document;
                const message = failure?.document === document ? failure.message : null;
                return (
                    <div
                        key={document}
                        className="flex min-w-0 items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm @sm:gap-3 @sm:p-3"
                    >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary @sm:size-8">
                            <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm @sm:text-base">{shortLabel}</span>
                            <span
                                role={message ? 'alert' : undefined}
                                className={cn(
                                    'block text-xs wrap-anywhere',
                                    message ? 'text-destructive' : 'text-muted-foreground'
                                )}
                                aria-live="polite"
                            >
                                {isPending ? 'Processando documento...' : message}
                            </span>
                        </span>
                        <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="size-11"
                            disabled={!online || pending !== null}
                            aria-label={`Baixar ${label.toLowerCase()}`}
                            aria-busy={isPending}
                            onClick={() => download.mutate(document)}
                        >
                            {isPending ? (
                                <Spinner aria-label="Preparando download" />
                            ) : (
                                <Download aria-hidden="true" className="text-muted-foreground" />
                            )}
                        </Button>
                    </div>
                );
            })}
            {!online && (
                <output className="col-span-full block py-2 text-xs text-muted-foreground">
                    Conecte-se à internet para baixar os documentos.
                </output>
            )}
        </>
    );
}

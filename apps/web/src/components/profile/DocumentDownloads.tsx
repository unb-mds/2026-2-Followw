import {
    documentRefusal,
    studentDocuments,
    type StudentDocument
} from '@followw/core/lib/documents.ts';
import { useOnline } from '@followw/core/lib/online.ts';
import { Download, FileText, GraduationCap, IdCard } from 'lucide-react';

import type { useDownloadDocument } from '#/queries/documents';

import { ListCard } from '#/components/ListCard';
import { Button } from '#/components/ui/button';
import { Spinner } from '#/components/ui/spinner';
import { cn } from '#/lib/shadcn';

// sem `document`, o download ainda não existe e a linha fica desativada
const documents: { document?: StudentDocument; icon: typeof IdCard; shortLabel: string }[] = [
    { document: 'student-card', icon: IdCard, shortLabel: 'Carteirinha' },
    { icon: GraduationCap, shortLabel: 'Diploma' },
    { document: 'transcript', icon: FileText, shortLabel: 'Histórico' }
];

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
        <div className="flex flex-col gap-2">
            <ListCard>
                {documents.map(({ document, icon: Icon, shortLabel }) => {
                    const label = document ? studentDocuments[document].label : shortLabel;
                    const isPending = document != null && pending === document;
                    const message =
                        document && failure?.document === document ? failure.message : null;
                    return (
                        <Button
                            key={shortLabel}
                            type="button"
                            variant="ghost"
                            className="-mx-3 h-auto min-h-12 justify-start gap-3 rounded-none px-3 py-2.5"
                            disabled={!document || !online || pending !== null}
                            aria-label={`Baixar ${label.toLowerCase()}`}
                            aria-busy={isPending}
                            onClick={() => document && download.mutate(document)}
                        >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col text-left">
                                <span>{shortLabel}</span>
                                {(isPending || message) && (
                                    <span
                                        role={message ? 'alert' : undefined}
                                        className={cn(
                                            'text-xs font-normal wrap-anywhere whitespace-normal',
                                            message ? 'text-destructive' : 'text-muted-foreground'
                                        )}
                                    >
                                        {isPending ? 'Processando documento...' : message}
                                    </span>
                                )}
                            </span>
                            {isPending ? (
                                <Spinner aria-label="Preparando download" />
                            ) : (
                                <Download aria-hidden="true" className="text-muted-foreground" />
                            )}
                        </Button>
                    );
                })}
            </ListCard>
            {!online && (
                <output className="block px-1 text-xs text-muted-foreground">
                    Conecte-se à internet para baixar os documentos.
                </output>
            )}
        </div>
    );
}

import { Download, GraduationCap, IdCard } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/ui/button';
import { Spinner } from '#/components/ui/spinner';
import { saveFile } from '#/lib/download';
import { useOnline } from '#/lib/online';
import { getDocumentDownload, studentDocuments, type StudentDocument } from '#/queries/documents';

const documents = [
    { document: 'student-card', icon: IdCard },
    { document: 'transcript', icon: GraduationCap }
] satisfies { document: StudentDocument; icon: typeof IdCard }[];

export function DocumentDownloads() {
    const [pending, setPending] = useState<StudentDocument | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const online = useOnline();

    async function handleDownload(document: StudentDocument) {
        setPending(document);
        setMessage(null);
        try {
            const { blob, filename } = await getDocumentDownload(document);
            saveFile(blob, filename);
        } catch {
            setMessage('Não foi possível baixar o documento. Tente novamente.');
        } finally {
            setPending(null);
        }
    }

    return (
        <>
            {documents.map(({ document, icon: Icon }) => {
                const { label } = studentDocuments[document];
                const isPending = pending === document;
                return (
                    <div
                        key={document}
                        className="-mx-3 flex min-h-12 items-center gap-1 px-3 py-2.5"
                    >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block">{label}</span>
                            <span
                                className="block text-xs text-muted-foreground"
                                aria-live="polite"
                            >
                                {isPending && 'Processando documento...'}
                            </span>
                        </span>
                        <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={!online || pending !== null}
                            aria-label={`Baixar ${label.toLowerCase()}`}
                            aria-busy={isPending}
                            onClick={() => handleDownload(document)}
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
            {(!online || message) && (
                <p
                    role={message ? 'alert' : 'status'}
                    className="py-2 text-xs text-muted-foreground"
                >
                    {!online ? 'Conecte-se à internet para baixar os documentos.' : message}
                </p>
            )}
        </>
    );
}

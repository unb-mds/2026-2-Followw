import { useOnline } from '@followw/core/lib/online.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { Download } from 'lucide-react';

import { Button } from '#/components/ui/button';
import { Spinner } from '#/components/ui/spinner';
import { useDownloadMaterial } from '#/queries/materials';

export function MaterialDownload({ classroomId, postId }: { classroomId: string; postId: string }) {
    const download = useDownloadMaterial(classroomId, postId);
    const online = useOnline();
    const missing = download.error instanceof ApiError && download.error.isNotFound;
    return (
        <div className="flex flex-col items-start gap-2">
            <Button
                variant="outline"
                size="sm"
                disabled={!online || download.isPending}
                aria-busy={download.isPending}
                onClick={() => download.mutate()}
            >
                {download.isPending ? (
                    <Spinner aria-hidden="true" />
                ) : (
                    <Download aria-hidden="true" />
                )}
                {download.isPending ? 'Baixando...' : 'Baixar'}
            </Button>
            {download.isError && (
                <p role="alert" className="text-sm text-destructive">
                    {missing
                        ? 'Arquivo não encontrado. Atualize as postagens para conferir os materiais do tópico.'
                        : 'Não foi possível baixar o arquivo. Tente novamente.'}
                </p>
            )}
            {!online && (
                <p className="text-sm text-muted-foreground">
                    Conecte-se à internet para baixar o arquivo.
                </p>
            )}
        </div>
    );
}

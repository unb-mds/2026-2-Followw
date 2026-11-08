import { studentDocuments, type StudentDocument } from '@followw/core/lib/documents.ts';
import { useOnline } from '@followw/core/lib/online.ts';
import { Download, GraduationCap, IdCard } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ListCard, ListRow } from '@/components/ListCard';
import { Icon } from '@/components/ui/icon';
import { useColor } from '@/lib/colors';
import { documentFailureMessage, shareDocument } from '@/queries/documents';

const documents = [
    { document: 'student-card', icon: IdCard },
    { document: 'transcript', icon: GraduationCap }
] satisfies { document: StudentDocument; icon: typeof IdCard }[];

/** Linhas para baixar a carteirinha e o histórico (PDF aberto na folha de compartilhamento). */
export function DocumentDownloads() {
    const [pending, setPending] = useState<StudentDocument | null>(null);
    const [failure, setFailure] = useState<{ document: StudentDocument; message: string } | null>(
        null
    );
    const online = useOnline();
    const muted = useColor('muted-foreground');

    async function handleDownload(document: StudentDocument) {
        setPending(document);
        setFailure(null);
        try {
            await shareDocument(document);
        } catch (error) {
            setFailure({ document, message: documentFailureMessage(error) });
        } finally {
            setPending(null);
        }
    }

    const rows = documents.map(({ document, icon }) => {
        const isPending = pending === document;
        const message = failure?.document === document ? failure.message : null;
        let subtitle: string | undefined;
        if (isPending) subtitle = 'Processando documento...';
        else if (message) subtitle = message;
        else if (!online) subtitle = 'Conecte-se à internet para baixar.';
        return (
            <ListRow
                key={document}
                icon={icon}
                title={studentDocuments[document].label}
                subtitle={subtitle}
                subtitleTone={message ? 'destructive' : 'muted'}
                disabled={!online || pending !== null}
                onPress={() => void handleDownload(document)}
                trailing={
                    isPending ? (
                        <ActivityIndicator color={muted} />
                    ) : (
                        <Icon as={Download} className="text-muted-foreground" />
                    )
                }
            />
        );
    });
    return <ListCard>{rows}</ListCard>;
}

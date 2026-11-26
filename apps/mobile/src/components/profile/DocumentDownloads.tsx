import { studentDocuments, type StudentDocument } from '@followw/core/lib/documents.ts';
import { useOnline } from '@followw/core/lib/online.ts';
import { Download, FileText, GraduationCap, IdCard } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ListCard } from '@/components/ListCard';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { documentFailureMessage, shareDocument } from '@/queries/documents';

// sem `document`, o download ainda não existe e a linha fica desativada
const documents: { document?: StudentDocument; icon: typeof IdCard; shortLabel: string }[] = [
    { document: 'student-card', icon: IdCard, shortLabel: 'Carteirinha' },
    { icon: GraduationCap, shortLabel: 'Diploma' },
    { document: 'transcript', icon: FileText, shortLabel: 'Histórico' }
];

/** Lista para baixar os documentos (PDF aberto na folha de compartilhamento). */
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

    return (
        <View className="gap-2">
            <ListCard>
                {documents.map(({ document, icon, shortLabel }) => {
                    const label = document ? studentDocuments[document].label : shortLabel;
                    const isPending = document != null && pending === document;
                    const message =
                        document && failure?.document === document ? failure.message : null;
                    return (
                        <View key={shortLabel} className="-mx-3">
                            <Button
                                variant="ghost"
                                className="h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3 py-2.5"
                                disabled={!document || !online || pending !== null}
                                accessibilityLabel={`Baixar ${label.toLowerCase()}`}
                                accessibilityState={{ busy: isPending }}
                                onPress={() => {
                                    if (document) void handleDownload(document);
                                }}
                            >
                                <View className="size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                    <Icon as={icon} className="size-4 text-primary" />
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text className="text-left font-normal">{shortLabel}</Text>
                                    {(isPending || message) && (
                                        <Text
                                            role={message ? 'alert' : undefined}
                                            className={cn(
                                                'text-xs font-normal',
                                                message
                                                    ? 'text-destructive'
                                                    : 'text-muted-foreground'
                                            )}
                                        >
                                            {isPending ? 'Processando documento...' : message}
                                        </Text>
                                    )}
                                </View>
                                {isPending ? (
                                    <ActivityIndicator size="small" color={muted} />
                                ) : (
                                    <Icon as={Download} className="size-4 text-muted-foreground" />
                                )}
                            </Button>
                        </View>
                    );
                })}
            </ListCard>
            {!online && (
                <Text role="status" className="px-1 text-xs text-muted-foreground">
                    Conecte-se à internet para baixar os documentos.
                </Text>
            )}
        </View>
    );
}

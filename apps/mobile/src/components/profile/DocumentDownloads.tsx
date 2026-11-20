import { studentDocuments, type StudentDocument } from '@followw/core/lib/documents.ts';
import { useOnline } from '@followw/core/lib/online.ts';
import { Download, GraduationCap, IdCard } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { documentFailureMessage, shareDocument } from '@/queries/documents';

const documents = [
    { document: 'student-card', icon: IdCard, shortLabel: 'Carteirinha' },
    { document: 'transcript', icon: GraduationCap, shortLabel: 'Histórico' }
] satisfies { document: StudentDocument; icon: typeof IdCard; shortLabel: string }[];

/** Cards para baixar a carteirinha e o histórico (PDF aberto na folha de compartilhamento). */
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
        <View className="gap-3">
            <View className="flex-row gap-3">
                {documents.map(({ document, icon, shortLabel }) => {
                    const { label } = studentDocuments[document];
                    const isPending = pending === document;
                    const message = failure?.document === document ? failure.message : null;
                    return (
                        <View
                            key={document}
                            className="min-w-0 flex-1 flex-row items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm shadow-black/5"
                        >
                            <View className="size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                <Icon as={icon} className="size-4 text-primary" />
                            </View>
                            <View className="min-w-0 flex-1">
                                <Text className="text-sm">{shortLabel}</Text>
                                {(isPending || message) && (
                                    <Text
                                        role={message ? 'alert' : undefined}
                                        className={cn(
                                            'text-xs',
                                            message ? 'text-destructive' : 'text-muted-foreground'
                                        )}
                                    >
                                        {isPending ? 'Processando documento...' : message}
                                    </Text>
                                )}
                            </View>
                            <Button
                                size="icon-sm"
                                variant="ghost"
                                className="size-9"
                                disabled={!online || pending !== null}
                                accessibilityLabel={`Baixar ${label.toLowerCase()}`}
                                accessibilityState={{ busy: isPending }}
                                onPress={() => void handleDownload(document)}
                            >
                                {isPending ? (
                                    <ActivityIndicator size="small" color={muted} />
                                ) : (
                                    <Icon as={Download} className="size-4 text-muted-foreground" />
                                )}
                            </Button>
                        </View>
                    );
                })}
            </View>
            {!online && (
                <Text role="status" className="py-2 text-xs text-muted-foreground">
                    Conecte-se à internet para baixar os documentos.
                </Text>
            )}
        </View>
    );
}

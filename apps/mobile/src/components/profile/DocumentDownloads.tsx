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
    { document: 'student-card', icon: IdCard },
    { document: 'transcript', icon: GraduationCap }
] satisfies { document: StudentDocument; icon: typeof IdCard }[];

/** Linhas (com divisória acima) para baixar a carteirinha e o histórico (PDF aberto na folha de compartilhamento). */
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
        <>
            {documents.map(({ document, icon }) => {
                const { label } = studentDocuments[document];
                const isPending = pending === document;
                const message = failure?.document === document ? failure.message : null;
                return (
                    <View
                        key={document}
                        className="min-h-12 flex-row items-center gap-3 border-t border-border py-2.5"
                    >
                        <View className="size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Icon as={icon} className="size-4 text-primary" />
                        </View>
                        <View className="min-w-0 flex-1">
                            <Text>{label}</Text>
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
            {!online && (
                <Text
                    role="status"
                    className="border-t border-border py-2 text-xs text-muted-foreground"
                >
                    Conecte-se à internet para baixar os documentos.
                </Text>
            )}
        </>
    );
}

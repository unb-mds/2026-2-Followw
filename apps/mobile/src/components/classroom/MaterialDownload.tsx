import { useOnline } from '@followw/core/lib/online.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { Download } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';
import { useDownloadMaterial } from '@/queries/materials';

export function MaterialDownload({ classroomId, postId }: { classroomId: string; postId: string }) {
    const download = useDownloadMaterial(classroomId, postId);
    const online = useOnline();
    const muted = useColor('muted-foreground');
    const missing = download.error instanceof ApiError && download.error.isNotFound;
    return (
        <View className="flex-col items-start gap-2">
            <Button
                variant="outline"
                size="sm"
                disabled={!online || download.isPending}
                accessibilityState={{ busy: download.isPending }}
                onPress={() => download.mutate()}
            >
                {download.isPending ? (
                    <ActivityIndicator size="small" color={muted} />
                ) : (
                    <Icon as={Download} className="size-4" />
                )}
                <Text>{download.isPending ? 'Baixando...' : 'Baixar'}</Text>
            </Button>
            {download.isError && (
                <Text role="alert" className="text-sm text-destructive">
                    {missing
                        ? 'Arquivo não encontrado. Atualize as postagens para conferir os materiais do tópico.'
                        : 'Não foi possível baixar o arquivo. Tente novamente.'}
                </Text>
            )}
            {!online && (
                <Text className="text-sm text-muted-foreground">
                    Conecte-se à internet para baixar o arquivo.
                </Text>
            )}
        </View>
    );
}

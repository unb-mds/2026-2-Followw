import { ShieldCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

const REPOSITORY_URL = 'https://github.com/unb-mds/2026-2-Followw';

const PARAGRAPH = 'mt-3 text-sm leading-6 text-muted-foreground';

export function LoginPrivacyInfo() {
    const [open, setOpen] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Text className="mt-8 max-w-80 text-center text-xs leading-5 text-muted-foreground">
                Suas credenciais <Text className="text-xs font-bold">não são armazenadas</Text> no
                Followw.{' '}
                <Text
                    accessibilityRole="button"
                    className="text-xs font-semibold text-primary"
                    onPress={() => setOpen(true)}
                >
                    Saiba mais
                </Text>
            </Text>

            <DialogContent className="max-w-110 gap-0 p-6 pb-8" showCloseButton={false}>
                <View className="flex-row items-start justify-between gap-4">
                    <View className="size-11 items-center justify-center rounded-2xl bg-primary/10">
                        <Icon as={ShieldCheck} className="size-6 text-primary" />
                    </View>
                    <DialogClose asChild>
                        <Button
                            variant="ghost"
                            size="icon-lg"
                            className="rounded-full"
                            accessibilityLabel="Fechar informações de privacidade"
                        >
                            <Icon as={X} className="size-5" />
                        </Button>
                    </DialogClose>
                </View>

                <DialogHeader className="mt-5">
                    <DialogTitle className="text-xl font-bold tracking-tight">
                        Seu acesso é protegido
                    </DialogTitle>
                </DialogHeader>
                <Text className={PARAGRAPH}>
                    Ao conectar com o SIGAA, suas credenciais são usadas apenas para autenticar nos
                    servidores oficiais da UnB e não são armazenadas no banco de dados do Followw.
                </Text>
                <Text className={PARAGRAPH}>
                    Suas credenciais e sessão ficam cifradas no armazenamento seguro do seu aparelho
                    para que você não precise digitar sua senha toda vez.
                </Text>
                <Text className={PARAGRAPH}>
                    O Followw é um projeto de código aberto, e você pode conferir todo o
                    código-fonte no{' '}
                    <Text
                        accessibilityRole="link"
                        className="text-sm text-primary"
                        onPress={() => void Linking.openURL(REPOSITORY_URL)}
                    >
                        GitHub
                    </Text>
                    .
                </Text>
                <DialogClose asChild>
                    <Button className="mt-6 h-11 w-full rounded-full">
                        <Text className="font-bold">Entendi</Text>
                    </Button>
                </DialogClose>
            </DialogContent>
        </Dialog>
    );
}

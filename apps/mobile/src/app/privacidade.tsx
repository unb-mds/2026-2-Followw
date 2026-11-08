import { EMAILS, mailto } from '@followw/core/lib/contact.ts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useRef } from 'react';
import {
    type LayoutChangeEvent,
    Linking,
    Pressable,
    ScrollView,
    type ScrollViewInstance,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FollowwLogo } from '@/components/FollowwLogo';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type SectionId = 'politica-de-privacidade' | 'termos-de-servico';

const SECTION = 'gap-4';
const LINK = 'text-sm text-primary underline';

export default function PrivacyScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { section } = useLocalSearchParams<{ section?: string }>();
    const scroll = useRef<ScrollViewInstance>(null);
    const articleTop = useRef(0);
    const offsets = useRef<Partial<Record<SectionId, number>>>({});

    const scrollTo = (id: SectionId) =>
        scroll.current?.scrollTo({ y: articleTop.current + (offsets.current[id] ?? 0) });
    const track = (id: SectionId) => (event: LayoutChangeEvent) => {
        offsets.current[id] = event.nativeEvent.layout.y;
        if (section === id) scrollTo(id);
    };

    return (
        <ScrollView
            ref={scroll}
            className="flex-1 bg-background"
            contentContainerStyle={{
                paddingTop: insets.top + 40,
                paddingBottom: insets.bottom + 40
            }}
            contentContainerClassName="w-full max-w-2xl gap-10 self-center px-6"
        >
            <View className="gap-6">
                <Pressable
                    accessibilityRole="link"
                    onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
                    className="flex-row items-center gap-2 self-start"
                >
                    <Icon as={ArrowLeft} className="size-4 text-primary" />
                    <Text className="text-sm text-primary">Voltar ao login</Text>
                </Pressable>
                <View className="flex-row items-center gap-3">
                    <FollowwLogo size={40} />
                    <Text
                        role="heading"
                        aria-level={1}
                        className="flex-1 text-2xl font-bold tracking-tight"
                    >
                        Privacidade e termos
                    </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                    Atualizado em 18 de outubro de 2026
                </Text>
                <View
                    accessibilityLabel="Nesta página"
                    className="flex-row flex-wrap gap-x-6 gap-y-3"
                >
                    <Pressable
                        accessibilityRole="link"
                        onPress={() => scrollTo('politica-de-privacidade')}
                    >
                        <Text className={LINK}>Política de privacidade</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="link"
                        onPress={() => scrollTo('termos-de-servico')}
                    >
                        <Text className={LINK}>Termos de serviço</Text>
                    </Pressable>
                </View>
            </View>

            <View
                onLayout={(event) => {
                    articleTop.current = event.nativeEvent.layout.y;
                }}
            >
                <View className={SECTION} onLayout={track('politica-de-privacidade')}>
                    <Text role="heading" aria-level={2} className="text-xl font-bold">
                        Política de privacidade
                    </Text>
                    <Topic title="Dados e cache">
                        <Body>
                            Guardamos em nosso banco de dados cópias de informações do SIGAA para
                            agilizar consultas: nome, matrícula, foto, e-mail, biografia, curso,
                            indicadores acadêmicos, turmas, participantes, menções, frequência e
                            postagens. Também salvamos suas preferências e marcações de presença.
                            Dados de uma turma podem ser reutilizados nas consultas de outros
                            integrantes autorizados dessa turma.
                        </Body>
                        <Body>
                            Esse cache é atualizado conforme o tipo de informação, mas não tem prazo
                            automático de exclusão no servidor: permanece até uma solicitação de
                            exclusão. O vencimento do prazo de atualização não apaga os dados.
                        </Body>
                    </Topic>
                    <Topic title="Credenciais e sessão">
                        <Body>
                            Não guardamos sua senha sob nenhuma circunstância, nem no banco de
                            dados, nem em logs. Elas ficam apenas cifradas no armazenamento seguro
                            do seu aparelho e são necessárias para autenticar no CAS/SIGAA. Tarefas
                            de sincronização também enviam credenciais cifradas à fila QStash
                            (Upstash) para processamento. Extrato e QR code do RU são consultados
                            sem cache no servidor.
                        </Body>
                    </Topic>
                    <Topic title="No seu dispositivo">
                        <Body>
                            Usamos o armazenamento do aparelho para manter seu acesso, preferências
                            e dados consultados. O cache de dados permite acesso offline por até 14
                            dias e é limpo ao sair da conta. Você também pode remover os dados do
                            app nas configurações do sistema.
                        </Body>
                    </Topic>
                    <Topic title="Análise de uso">
                        <Body>
                            Usamos PostHog para métricas de navegação, com informações sobre telas,
                            interações e dispositivo, para entender o uso e corrigir problemas.
                            Esses dados são enviados ao PostHog. A API também registra dados
                            técnicos das requisições, como rota, status e duração, para diagnóstico.
                        </Body>
                    </Topic>
                    <Topic title="Excluir seus dados">
                        <Body>
                            Para solicitar a exclusão dos seus dados existentes no Followw, escreva
                            para <MailLink email={EMAILS.removal} />. Não envie sua senha. A
                            exclusão não altera seus registros na UnB e não impede novas coletas:
                            seus dados podem voltar em sincronizações futuras, inclusive de
                            participantes feitas por outros integrantes da turma. Para limpar o
                            dispositivo, saia da conta ou remova os dados do app nas configurações
                            do sistema.
                        </Body>
                    </Topic>
                </View>

                <View className={cn(SECTION, 'pt-8')} onLayout={track('termos-de-servico')}>
                    <Text role="heading" aria-level={2} className="text-xl font-bold">
                        Termos de serviço
                    </Text>
                    <Body>
                        Use o Followw com responsabilidade e respeite a privacidade das outras
                        pessoas. Integrações, scripts e automações são permitidos desde que
                        respeitem os controles de acesso e não prejudiquem o Followw ou os sistemas
                        da UnB.
                    </Body>
                    <Body>
                        Caso tenha dúvidas ou precise integrar nossa API, entre em contato conosco
                        através do e-mail <MailLink email={EMAILS.contact} />, será um prazer
                        ajudar.
                    </Body>
                    <Body>
                        É proibido sobrecarregar o serviço, burlar restrições, acessar contas ou
                        dados sem autorização, adulterar informações de forma mal-intencionada ou
                        usar dados para perseguição (stalking), assédio, vigilância de pessoas ou
                        outras práticas abusivas. O Followw reserva o direito de suspender o acesso
                        em caso de suspeita de violação destes termos a qualquer momento.
                    </Body>
                    <Body>
                        O Followw depende dos sistemas da UnB e pode apresentar indisponibilidade ou
                        dados desatualizados. Confira informações e procedimentos acadêmicos
                        importantes nos canais oficiais.
                    </Body>
                </View>
            </View>
        </ScrollView>
    );
}

function Topic({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View className="gap-2">
            <Text role="heading" aria-level={3} className="text-sm leading-6 font-semibold">
                {title}
            </Text>
            {children}
        </View>
    );
}

function Body({ children }: { children: React.ReactNode }) {
    return <Text className="text-sm leading-6 text-muted-foreground">{children}</Text>;
}

function MailLink({ email }: { email: string }) {
    return (
        <Text
            accessibilityRole="link"
            className={LINK}
            onPress={() => void Linking.openURL(mailto(email))}
        >
            {email}
        </Text>
    );
}

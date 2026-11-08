import { useOnline } from '@followw/core/lib/online.ts';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    type TextInputInstance,
    View
} from 'react-native';

import { LoginPrivacyInfo } from '@/components/auth/LoginPrivacyInfo';
import { LoginSubmitButton } from '@/components/auth/LoginSubmitButton';
import { FollowwLogo } from '@/components/FollowwLogo';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { loginErrorMessage, PASSWORD_MAX, REGISTRATION_LENGTH, validateLogin } from '@/lib/login';
import { cn } from '@/lib/utils';
import { useLogin } from '@/queries/auth';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

const FIELD = 'h-12 rounded-2xl bg-background px-4 shadow-sm shadow-black/5';
const FOOTER_LINK = 'text-xs text-muted-foreground underline';

export default function LoginScreen() {
    const router = useRouter();
    const login = useLogin();
    const online = useOnline();
    const passwordInput = useRef<TextInputInstance>(null);
    const [registration, setRegistration] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [invalid, setInvalid] = useState<string | null>(null);

    const error = invalid ?? loginErrorMessage(login.error, online);

    const submit = () => {
        if (login.isPending || !online) return;
        const problem = validateLogin(registration, password);
        setInvalid(problem);
        if (problem) return;
        login.mutate(
            { body: { registration, password } },
            { onSuccess: () => router.replace('/perfil') }
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1 bg-background"
        >
            <Screen
                fullscreen
                keyboardDismissMode="on-drag"
                contentContainerClassName="grow items-center px-10 pt-42 pb-2"
            >
                <View className="items-center">
                    <FollowwLogo size={80} />
                    <Text
                        role="heading"
                        aria-level={1}
                        className="mt-2 text-3xl leading-tight font-bold tracking-tight"
                    >
                        Followw
                    </Text>
                    <Text className="text-xs text-muted-foreground">Universidade de Brasília</Text>
                </View>

                <View className="mt-11 w-full max-w-90">
                    <Input
                        value={registration}
                        onChangeText={(text) => setRegistration(text.replace(/\D/g, ''))}
                        placeholder="Matrícula"
                        aria-label="Matrícula"
                        keyboardType="number-pad"
                        maxLength={REGISTRATION_LENGTH}
                        autoComplete="username"
                        textContentType="username"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="next"
                        submitBehavior="submit"
                        onSubmitEditing={() => passwordInput.current?.focus()}
                        className={FIELD}
                    />
                    <View className="relative mt-3">
                        <Input
                            ref={passwordInput}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Senha do SIGAA"
                            aria-label="Senha do SIGAA"
                            secureTextEntry={!showPassword}
                            maxLength={PASSWORD_MAX}
                            autoComplete="current-password"
                            textContentType="password"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="go"
                            onSubmitEditing={submit}
                            className={cn(FIELD, 'pr-14')}
                        />
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onPress={() => setShowPassword((visible) => !visible)}
                            accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            accessibilityState={{ selected: showPassword }}
                            className="absolute top-2.5 right-3"
                        >
                            <Icon
                                as={showPassword ? EyeOff : Eye}
                                className="size-5 text-muted-foreground"
                            />
                        </Button>
                    </View>

                    {error && (
                        <Text
                            role="alert"
                            className="mt-3 text-center text-xs font-semibold text-destructive"
                        >
                            {error}
                        </Text>
                    )}

                    <LoginSubmitButton pending={login.isPending} onPress={submit} />
                </View>

                <Button variant="link" className="mt-5" onPress={() => router.replace('/')}>
                    <Text className="text-xs font-semibold">Continuar sem entrar</Text>
                </Button>

                <LoginPrivacyInfo />

                <View className="mt-auto max-w-sm flex-row gap-4 px-6 pt-8 pb-6">
                    <Pressable
                        accessibilityRole="link"
                        onPress={() =>
                            router.push({
                                pathname: '/privacidade',
                                params: { section: 'politica-de-privacidade' }
                            })
                        }
                    >
                        <Text className={FOOTER_LINK}>Política de privacidade</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="link"
                        onPress={() =>
                            router.push({
                                pathname: '/privacidade',
                                params: { section: 'termos-de-servico' }
                            })
                        }
                    >
                        <Text className={FOOTER_LINK}>Termos de serviço</Text>
                    </Pressable>
                </View>
            </Screen>
        </KeyboardAvoidingView>
    );
}

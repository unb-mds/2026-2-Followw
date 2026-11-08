import { useOnline } from '@followw/core/lib/online.ts';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    type TextInputInstance,
    View
} from 'react-native';

import { LoginPrivacyInfo } from '@/components/auth/LoginPrivacyInfo';
import { LoginSubmitButton } from '@/components/auth/LoginSubmitButton';
import { FollowwLogo } from '@/components/FollowwLogo';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { loginErrorMessage, PASSWORD_MAX, REGISTRATION_LENGTH, validateLogin } from '@/lib/login';
import { useLogin } from '@/queries/auth';

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
            { onSuccess: () => (router.canGoBack() ? router.back() : router.replace('/perfil')) }
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1 bg-background"
        >
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerClassName="grow items-center px-10 pt-12 pb-6"
            >
                <View className="items-center">
                    <FollowwLogo size={80} />
                    <Text className="mt-2 text-3xl leading-tight font-extrabold tracking-tight">
                        Followw
                    </Text>
                    <Text className="text-xs text-muted-foreground">Universidade de Brasília</Text>
                </View>

                <View className="mt-10 w-full max-w-90 gap-3">
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
                        className="h-12 rounded-2xl px-4"
                    />
                    <View>
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
                            className="h-12 rounded-2xl px-4 pr-14"
                        />
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            hitSlop={8}
                            onPress={() => setShowPassword((visible) => !visible)}
                            className="absolute top-0 right-0 h-12 w-12 items-center justify-center"
                        >
                            <Icon
                                as={showPassword ? EyeOff : Eye}
                                className="size-5 text-muted-foreground"
                            />
                        </Pressable>
                    </View>

                    {error && (
                        <Text
                            role="alert"
                            className="text-center text-xs font-semibold text-destructive"
                        >
                            {error}
                        </Text>
                    )}

                    <LoginSubmitButton pending={login.isPending} onPress={submit} />
                </View>

                <Button variant="link" className="mt-3" onPress={() => router.back()}>
                    <Text className="text-xs font-semibold">Continuar sem entrar</Text>
                </Button>

                <LoginPrivacyInfo />

                <View className="mt-auto flex-row gap-4 pt-8">
                    <Button
                        variant="link"
                        className="h-auto p-0"
                        onPress={() =>
                            router.push({
                                pathname: '/privacidade',
                                params: { section: 'politica-de-privacidade' }
                            })
                        }
                    >
                        <Text className="text-xs font-normal text-muted-foreground underline">
                            Política de privacidade
                        </Text>
                    </Button>
                    <Button
                        variant="link"
                        className="h-auto p-0"
                        onPress={() =>
                            router.push({
                                pathname: '/privacidade',
                                params: { section: 'termos-de-servico' }
                            })
                        }
                    >
                        <Text className="text-xs font-normal text-muted-foreground underline">
                            Termos de serviço
                        </Text>
                    </Button>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

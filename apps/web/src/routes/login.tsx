import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { LoginPrivacyInfo } from '#/components/auth/LoginPrivacyInfo';
import { LoginSubmitButton } from '#/components/auth/LoginSubmitButton';
import { ErrorState } from '#/components/ErrorState';
import { FollowwLogo } from '#/components/FollowwLogo';
import { buttonVariants } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput
} from '#/components/ui/input-group';
import { Label } from '#/components/ui/label';
import { cn } from '#/lib/utils';
import { useLogin } from '#/queries/auth';
import { ApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/login')({
    loader: async ({ context }) => {
        try {
            const user = await context.queryClient.query(meQueryOptions);
            if (user) throw redirect({ to: '/' });
        } catch (error) {
            if (error instanceof ApiError || error instanceof TypeError) return;
            throw error;
        }
    },
    errorComponent: ErrorState,
    component: LoginPage
});

function LoginPage() {
    const navigate = useNavigate();
    const login = useLogin();
    const [registration, setRegistration] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const error =
        login.error instanceof ApiError && login.error.isUnauthorized
            ? 'Matrícula ou senha incorretas.'
            : login.error
              ? 'Não foi possível conectar ao SIGAA. Tente novamente.'
              : undefined;

    return (
        <main className="login-page flex min-h-dvh w-full flex-col items-center bg-background text-foreground shadow-2xl">
            <div className="login-content flex w-full flex-col items-center px-10 pt-42">
                <header className="flex flex-col items-center text-center">
                    <FollowwLogo className="h-auto w-20 drop-shadow-sm" />
                    <h1 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight">
                        Followw
                    </h1>
                    <p className="text-xs text-muted-foreground">Universidade de Brasília</p>
                </header>

                <form
                    className="mt-11 w-full max-w-90"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (login.isPending) return;
                        login.mutate(
                            { body: { registration, password } },
                            { onSuccess: () => void navigate({ to: '/', replace: true }) }
                        );
                    }}
                >
                    <Label htmlFor="registration" className="sr-only">
                        Matrícula
                    </Label>
                    <Input
                        id="registration"
                        type="text"
                        inputMode="numeric"
                        autoComplete="username"
                        required
                        pattern="\d{9}"
                        maxLength={9}
                        value={registration}
                        onChange={(event) => setRegistration(event.target.value)}
                        placeholder="Matrícula"
                        className="h-12 rounded-2xl bg-background px-4 shadow-sm"
                    />

                    <Label htmlFor="password" className="sr-only">
                        Senha do SIGAA
                    </Label>
                    <InputGroup className="mt-3 h-12 rounded-2xl bg-background shadow-sm">
                        <InputGroupInput
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            required
                            minLength={6}
                            maxLength={64}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Senha do SIGAA"
                            className="h-full pl-4"
                        />
                        <InputGroupAddon align="inline-end">
                            <InputGroupButton
                                size="icon-sm"
                                onClick={() => setShowPassword((visible) => !visible)}
                                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                aria-controls="password"
                                aria-pressed={showPassword}
                            >
                                {showPassword ? (
                                    <EyeOff className="size-5" aria-hidden="true" />
                                ) : (
                                    <Eye className="size-5" aria-hidden="true" />
                                )}
                            </InputGroupButton>
                        </InputGroupAddon>
                    </InputGroup>

                    {error && (
                        <p
                            role="alert"
                            className="mt-3 text-center text-xs font-semibold text-destructive"
                        >
                            {error}
                        </p>
                    )}

                    <LoginSubmitButton pending={login.isPending} />
                </form>

                <Link
                    to="/"
                    className={cn(
                        buttonVariants({ variant: 'link' }),
                        'mt-5 text-xs font-semibold'
                    )}
                >
                    Continuar sem entrar
                </Link>

                <LoginPrivacyInfo />
            </div>
        </main>
    );
}

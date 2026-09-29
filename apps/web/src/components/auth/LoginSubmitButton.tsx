import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { loginProgressAt } from '#/lib/login-progress';

interface LoginSubmitButtonProps {
    pending: boolean;
}

export function LoginSubmitButton({ pending }: LoginSubmitButtonProps) {
    return (
        <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="relative mt-4 flex h-12 w-full cursor-pointer items-center justify-center overflow-hidden rounded-full bg-login-blue text-sm font-bold text-white shadow-md transition hover:bg-login-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-login-blue disabled:cursor-wait"
        >
            {pending ? (
                <>
                    <LoginProgressBar />
                    <span className="relative z-10 flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        Entrando...
                    </span>
                </>
            ) : (
                'Entrar'
            )}
        </button>
    );
}

function LoginProgressBar() {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const startedAt = performance.now();
        const interval = window.setInterval(() => {
            setProgress(loginProgressAt(performance.now() - startedAt));
        }, 50);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <span
            className="login-submit-progress"
            style={{ transform: `scaleX(${progress / 100})` }}
            aria-hidden="true"
        />
    );
}

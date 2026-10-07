import { useEffect, useState } from 'react';

import { Button } from '#/components/ui/button';
import { Spinner } from '#/components/ui/spinner';
import { loginProgressAt } from '#/lib/login-progress';

interface LoginSubmitButtonProps {
    pending: boolean;
}

export function LoginSubmitButton({ pending }: LoginSubmitButtonProps) {
    return (
        <Button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="relative mt-4 h-12 w-full overflow-hidden rounded-full font-bold shadow-md disabled:cursor-wait"
        >
            {pending ? (
                <>
                    <LoginProgressBar />
                    <span className="relative z-10 flex items-center gap-2">
                        <Spinner aria-hidden="true" />
                        Entrando...
                    </span>
                </>
            ) : (
                'Entrar'
            )}
        </Button>
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
            className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left bg-[color-mix(in_oklch,var(--primary),black_25%)] transition-transform duration-50 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress / 100})` }}
            aria-hidden="true"
        />
    );
}

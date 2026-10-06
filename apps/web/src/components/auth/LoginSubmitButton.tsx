import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '#/components/ui/button';
import { Progress } from '#/components/ui/progress';
import { loginProgressAt } from '#/lib/login-progress';

interface LoginSubmitButtonProps {
    pending: boolean;
}

export function LoginSubmitButton({ pending }: LoginSubmitButtonProps) {
    return (
        <div className="relative mt-4">
            <Button
                type="submit"
                disabled={pending}
                aria-busy={pending}
                className="h-12 w-full rounded-full font-bold shadow-md"
            >
                {pending ? (
                    <span className="flex items-center gap-2">
                        <LoaderCircle
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                        />
                        Entrando...
                    </span>
                ) : (
                    'Entrar'
                )}
            </Button>
            {pending && <LoginProgressBar />}
        </div>
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
        <Progress
            value={progress}
            className="pointer-events-none absolute inset-x-4 bottom-1 [&_[data-slot=progress-indicator]]:bg-primary-foreground motion-reduce:[&_[data-slot=progress-indicator]]:w-3/4! motion-reduce:[&_[data-slot=progress-indicator]]:transition-none [&_[data-slot=progress-track]]:bg-primary-foreground/20"
            aria-hidden="true"
        />
    );
}

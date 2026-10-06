import { Link } from '@tanstack/react-router';
import { ArrowRight, Lock } from 'lucide-react';

import { buttonVariants } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';

export const LoginPromptCard: React.FC = () => {
    return (
        <Card>
            <CardContent className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Lock className="size-6" />
                </div>

                <div className="flex-1">
                    <h3 className="text-lg font-bold tracking-tight text-foreground">
                        Acesse com sua Matrícula UnB
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Conecte-se sua conta do SIGAA para visualizar suas turmas, horários e notas.
                    </p>

                    <div className="mt-4 flex items-center gap-3">
                        <Link to="/login" className={buttonVariants({ size: 'lg' })}>
                            <span>Entrar com SIGAA</span>
                            <ArrowRight className="size-4" />
                        </Link>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

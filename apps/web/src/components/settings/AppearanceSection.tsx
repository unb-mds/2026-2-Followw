import { ThemeToggle } from '#/components/ThemeToggle';

export function AppearanceSection() {
    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Aparência</h2>
            <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4">
                <div>
                    <h3 className="font-medium">Tema</h3>
                    <p className="text-sm text-muted-foreground">
                        Alternar entre sistema, claro e escuro.
                    </p>
                </div>
                <ThemeToggle />
            </div>
        </section>
    );
}

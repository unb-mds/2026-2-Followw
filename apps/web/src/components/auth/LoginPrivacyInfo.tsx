import { ShieldCheck, X } from 'lucide-react';
import { useRef } from 'react';

export function LoginPrivacyInfo() {
    const dialogRef = useRef<HTMLDialogElement>(null);

    return (
        <>
            <div className="mt-8 max-w-90 text-center text-xs leading-5 text-login-muted">
                <p>
                    Suas credenciais <strong>não são armazenadas</strong> nos servidores do Followw.
                </p>
                <button
                    type="button"
                    onClick={() => dialogRef.current?.showModal()}
                    className="mt-1 cursor-pointer font-semibold text-login-blue underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-login-blue"
                >
                    Saiba mais
                </button>
            </div>

            <dialog
                ref={dialogRef}
                aria-labelledby="login-privacy-title"
                className="fixed inset-x-0 top-auto bottom-0 mx-auto mb-0 w-full max-w-110 rounded-t-3xl border-0 bg-white p-6 pb-8 text-ink shadow-2xl backdrop:bg-night/45 sm:inset-0 sm:my-auto sm:w-5/6 sm:rounded-3xl"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-light text-primary-dark">
                        <ShieldCheck className="size-6" aria-hidden="true" />
                    </div>
                    <button
                        type="button"
                        onClick={() => dialogRef.current?.close()}
                        aria-label="Fechar informações de privacidade"
                        className="flex size-9 cursor-pointer items-center justify-center rounded-full text-login-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-login-blue"
                    >
                        <X className="size-5" aria-hidden="true" />
                    </button>
                </div>

                <h2 id="login-privacy-title" className="mt-5 text-xl font-bold tracking-tight">
                    Seu acesso é protegido
                </h2>
                <p className="mt-3 text-sm leading-6 text-login-muted">
                    Você entra com sua conta do SIGAA. Suas credenciais são usadas para autenticar
                    nos servidores oficiais da UnB e não são armazenadas nos servidores do Followw.
                </p>
                <p className="mt-3 text-sm leading-6 text-login-muted">
                    A sessão fica em cookies cifrados no seu navegador para manter o acesso entre
                    visitas.
                </p>
                <button
                    type="button"
                    onClick={() => dialogRef.current?.close()}
                    className="mt-6 h-11 w-full cursor-pointer rounded-full bg-login-blue text-sm font-bold text-white hover:bg-login-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-login-blue"
                >
                    Entendi
                </button>
            </dialog>
        </>
    );
}

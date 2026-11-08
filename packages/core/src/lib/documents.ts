import { ApiError } from '../queries/errors.ts';

export const studentDocuments = {
    'student-card': { label: 'Carteirinha estudantil', filename: 'carteirinha.pdf' },
    transcript: { label: 'Histórico acadêmico', filename: 'historico.pdf' }
} as const;

export type StudentDocument = keyof typeof studentDocuments;

export const EMPTY_DOCUMENT_MESSAGE = 'O documento recebido está vazio.';

/** Mensagem da API quando o SIGAA recusa emitir um documento (ex.: perfil sem foto). */
export function documentRefusal(error: unknown): string | null {
    return error instanceof ApiError && error.status === 422 && typeof error.detail === 'string'
        ? error.detail
        : null;
}

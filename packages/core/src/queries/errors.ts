export class ApiError extends Error {
    readonly status: number;
    readonly detail: unknown;
    /** Segundos do header `Retry-After`, quando a API o envia. */
    readonly retryAfter?: number;

    constructor(status: number, detail: unknown, retryAfter?: number) {
        const message = typeof detail === 'string' ? detail : `API error ${status}`;
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.detail = detail;
        this.retryAfter = retryAfter;
    }

    get isUnauthorized(): boolean {
        return this.status === 401;
    }

    get isForbidden(): boolean {
        return this.status === 403;
    }

    get isNotFound(): boolean {
        return this.status === 404;
    }

    get isTooManyRequests(): boolean {
        return this.status === 429;
    }

    get isServerError(): boolean {
        return this.status >= 500;
    }
}

/** Extrai um ApiError a partir do status e body de resposta de erro. */
export function toApiError(status: number, body: unknown, retryAfter?: number): ApiError {
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : body;

    return new ApiError(status, detail, retryAfter);
}

/** `Retry-After` em segundos (valor numérico ou data HTTP). */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
    const date = Date.parse(header);
    return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

export class ApiError extends Error {
    readonly status: number;
    readonly detail: unknown;

    constructor(status: number, detail: unknown) {
        const message = typeof detail === 'string' ? detail : `API error ${status}`;
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.detail = detail;
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

    get isServerError(): boolean {
        return this.status >= 500;
    }
}

/** Extrai um ApiError a partir do status e body de resposta de erro. */
export function toApiError(status: number, body: unknown): ApiError {
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : body;

    return new ApiError(status, detail);
}

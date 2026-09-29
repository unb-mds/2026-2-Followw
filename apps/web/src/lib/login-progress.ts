const LIMIT = 98;
const TYPICAL_LOGIN_MS = 4000;
const TIME_CONSTANT_MS = TYPICAL_LOGIN_MS / Math.log(10);

export function loginProgressAt(elapsedMs: number): number {
    return LIMIT * (1 - Math.exp(-Math.max(0, elapsedMs) / TIME_CONSTANT_MS));
}

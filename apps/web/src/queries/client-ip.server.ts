import { getRequestIP } from '@tanstack/react-start/server';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function clientIpHeaders(request: Request): Headers {
    const headers = new Headers();
    const secret = process.env.JWT_SECRET_KEY;
    if (!secret) return headers;

    let ip: string | undefined;
    if (process.env.VERCEL === '1') {
        ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    } else {
        try {
            ip = getRequestIP();
        } catch {}
    }
    if (!ip || !isIP(ip)) return headers;

    const client = `${Math.floor(Date.now() / 1000)}:${ip}`;
    headers.set('X-Followw-Client', client);
    headers.set(
        'X-Followw-Client-Signature',
        createHmac('sha256', secret).update(`followw:rate-limit:${client}`).digest('hex')
    );
    return headers;
}

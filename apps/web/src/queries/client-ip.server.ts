import { getRequestIP } from '@tanstack/react-start/server';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';

let cloudflareRanges: BlockList | undefined;

function loadCloudflareRanges(path: string) {
    const ranges = new BlockList();
    for (const cidr of readFileSync(path, 'utf8').trim().split(/\s+/)) {
        const [address, prefix] = cidr.split('/');
        if (!address || !prefix) throw new Error('Faixa de IP da Cloudflare inválida');
        ranges.addSubnet(address, Number(prefix), isIP(address) === 6 ? 'ipv6' : 'ipv4');
    }
    return ranges;
}

export function clientIpHeaders(request: Request): Headers {
    const headers = new Headers();
    const secret = process.env.RATE_LIMIT_SECRET_KEY;
    if (!secret) return headers;

    let ip: string | undefined;
    if (process.env.VERCEL === '1') {
        ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    } else if (process.env.FOLLOWW_TRUST_PROXY === '1') {
        ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
        const family = ip ? isIP(ip) : 0;
        const visitor = request.headers.get('cf-connecting-ip')?.trim();
        const cidrsFile = process.env.FOLLOWW_CLOUDFLARE_CIDRS;
        if (cidrsFile && ip && family && visitor && isIP(visitor)) {
            cloudflareRanges ??= loadCloudflareRanges(cidrsFile);
            if (cloudflareRanges.check(ip, family === 6 ? 'ipv6' : 'ipv4')) ip = visitor;
        }
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

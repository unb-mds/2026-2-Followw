import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/ui/button';

interface ShareButtonProps {
    title: string;
    text?: string;
    url?: string | (() => string);
}

export const ShareButton: React.FC<ShareButtonProps> = ({ title, text, url: shareUrl }) => {
    const [copied, setCopied] = useState(false);

    const share = async () => {
        const path = typeof shareUrl === 'function' ? shareUrl() : shareUrl;
        const url = path ? new URL(path, window.location.origin).href : window.location.href;
        if (navigator.share) {
            await navigator.share({ title, text, url }).catch(() => {});
            return;
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button
            variant="ghost"
            size="icon-lg"
            type="button"
            onClick={share}
            aria-label={copied ? 'Link copiado' : 'Compartilhar'}
            title={copied ? 'Link copiado' : 'Compartilhar'}
        >
            {copied ? <Check className="size-5" /> : <Share2 className="size-5" />}
        </Button>
    );
};

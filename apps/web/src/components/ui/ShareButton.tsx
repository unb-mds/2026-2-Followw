import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';

interface ShareButtonProps {
    title: string;
    text?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ title, text }) => {
    const [copied, setCopied] = useState(false);

    const share = async () => {
        const url = window.location.href;
        if (navigator.share) {
            await navigator.share({ title, text, url }).catch(() => {});
            return;
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={share}
            aria-label={copied ? 'Link copiado' : 'Compartilhar'}
            title={copied ? 'Link copiado' : 'Compartilhar'}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/60 text-primary-dark transition hover:bg-white active:scale-95"
        >
            {copied ? <Check className="size-5" /> : <Share2 className="size-5" />}
        </button>
    );
};

import type { Components } from 'react-markdown';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '#/lib/shadcn';

const components: Components = {
    img: ({ src, alt, title }) =>
        src ? <img src={src} alt={alt} title={title} /> : <span>{alt}</span>,
    a: ({ href, children, title }) => {
        const external = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href ?? '');
        return (
            <a
                href={href}
                title={title}
                target={external ? '_blank' : undefined}
                rel={external ? 'external noopener noreferrer' : undefined}
            >
                {children}
            </a>
        );
    }
};

/** `article` para páginas de leitura; o padrão cabe em cards e diálogos. */
export function Markdown({ children, article = false }: { children: string; article?: boolean }) {
    return (
        <div
            className={cn(
                'markdown wrap-break-word',
                article ? 'article' : 'text-sm leading-relaxed text-foreground'
            )}
        >
            <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
}

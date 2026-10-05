import type { Components } from 'react-markdown';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

export function Markdown({ children }: { children: string }) {
    return (
        <div className="markdown text-sm leading-relaxed wrap-break-word text-ink-soft">
            <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
}

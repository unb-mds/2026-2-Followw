interface PublicPage {
    path: '/' | '/ru';
    title: string;
    description: string;
}

export function publicPageHead({ path, title, description }: PublicPage) {
    const url = new URL(path, 'https://followw.app').href;

    return {
        meta: [
            { title },
            { name: 'description', content: description },
            { name: 'robots', content: 'index, follow' },
            { property: 'og:site_name', content: 'Followw' },
            { property: 'og:locale', content: 'pt_BR' },
            { property: 'og:type', content: 'website' },
            { property: 'og:title', content: title },
            { property: 'og:description', content: description },
            { property: 'og:url', content: url }
        ],
        links: [{ rel: 'canonical', href: url }]
    };
}

interface PublicPage {
    path: '/' | '/ru';
    title: string;
    description: string;
    search?: string;
    index?: boolean;
    image?: { path: string; alt: string };
}

export function publicPageHead({
    path,
    title,
    description,
    search,
    index = true,
    image
}: PublicPage) {
    const url = new URL(path, 'https://followw.app').href;
    const pageUrl = search ? `${url}?${search}` : url;
    const imageUrl = image && new URL(image.path, url).href;

    return {
        meta: [
            { title },
            { name: 'description', content: description },
            { name: 'robots', content: index ? 'index, follow' : 'noindex, follow' },
            { property: 'og:site_name', content: 'Followw UnB' },
            { property: 'og:locale', content: 'pt_BR' },
            { property: 'og:type', content: 'website' },
            { property: 'og:title', content: title },
            { property: 'og:description', content: description },
            { property: 'og:url', content: pageUrl },
            ...(image && imageUrl
                ? [
                      { property: 'og:image', content: imageUrl },
                      { property: 'og:image:type', content: 'image/png' },
                      { property: 'og:image:width', content: '1200' },
                      { property: 'og:image:height', content: '630' },
                      { property: 'og:image:alt', content: image.alt },
                      { name: 'twitter:card', content: 'summary_large_image' },
                      { name: 'twitter:title', content: title },
                      { name: 'twitter:description', content: description },
                      { name: 'twitter:image', content: imageUrl },
                      { name: 'twitter:image:alt', content: image.alt }
                  ]
                : [])
        ],
        links: [{ rel: 'canonical', href: pageUrl }]
    };
}

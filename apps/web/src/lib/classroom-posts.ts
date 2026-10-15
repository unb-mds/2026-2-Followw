import type { ClassroomPost, PostType } from '#/queries/classrooms';

import { formatClassroomDate, formatClassroomDateTime } from '#/lib/classroom-details';

export const postTypeLabels: Record<PostType, string> = {
    news: 'Notícia',
    topic: 'Tópico de aula',
    material: 'Material',
    assessment: 'Avaliação'
};

export function postDateLabel(post: ClassroomPost) {
    if (post.starts_at) return formatClassroomDateTime(post.starts_at);
    if (post.starts_on) {
        const start = formatClassroomDate(post.starts_on);
        if (post.ends_on && post.ends_on !== post.starts_on) {
            return `${start} a ${formatClassroomDate(post.ends_on)}`;
        }
        return post.time_label ? `${start} · ${post.time_label}` : start;
    }
    if (post.published_at) return formatClassroomDateTime(post.published_at);
    return post.published_on ? formatClassroomDate(post.published_on) : null;
}

export function postLink(url: string | null | undefined) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null;
    } catch {
        return null;
    }
}

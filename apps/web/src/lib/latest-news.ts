import type { Classroom, ClassroomPost } from '#/queries/classrooms';

export type ClassroomNews = { classroom: Classroom; post: ClassroomPost };

const publicationDate = ({ post }: ClassroomNews) => post.published_at ?? post.published_on ?? '';

export function latestNews(
    groups: { classroom: Classroom; posts: ClassroomPost[] }[]
): ClassroomNews[] {
    const seenIds = new Set<string>();
    const seenPublications = new Set<string>();
    return groups
        .filter(({ classroom }) => classroom.current)
        .flatMap(({ classroom, posts }) =>
            posts.filter((post) => post.type === 'news').map((post) => ({ classroom, post }))
        )
        .toSorted((a, b) => {
            return (
                publicationDate(b).localeCompare(publicationDate(a)) ||
                a.classroom.id.localeCompare(b.classroom.id) ||
                a.post.id.localeCompare(b.post.id)
            );
        })
        .filter(({ post }) => {
            const date = (post.published_on ?? post.published_at)?.slice(0, 10);
            const title = post.title
                .normalize('NFC')
                .trim()
                .replace(/\s+/g, ' ')
                .toLocaleLowerCase('pt-BR');
            const publication = date ? JSON.stringify([title, date]) : null;
            const duplicate =
                seenIds.has(post.id) || (publication !== null && seenPublications.has(publication));
            seenIds.add(post.id);
            if (publication !== null) seenPublications.add(publication);
            return !duplicate;
        })
        .slice(0, 5);
}

import type { CourseCurriculum } from '@followw/core/queries/curriculum.ts';

import { curriculumQueryOptions } from '@followw/core/queries/curriculum.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, mock, spyOn, test } from 'bun:test';

import { CurriculumView } from '#/components/curriculum/CurriculumView';

import { useDom } from '../../helpers/dom';

const dom = useDom();
afterEach(() => mock.restore());

test.each([
    [2, 2600],
    [24, 12288]
])('baixa um PNG completo com %i semestres e suas conexões', async (periodCount, expectedWidth) => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const base = { code: 'A', name: 'Cálculo & Álgebra', hours: 60 };
    client.setQueryData(curriculumQueryOptions(42, '2026.2').queryKey, {
        course_id: 42,
        sigaa_id: 42,
        code: '01',
        entry_semester: '2026.2',
        valid_from: '2025.1',
        matrix: 'Matriz de teste',
        shift: null,
        degree: null,
        modality: null,
        total_workload: null,
        required_workload: null,
        optional_min_workload: null,
        complementary_min_workload: null,
        elective_max_workload: null,
        complementary: [],
        periods: [
            { period: 1, subjects: [base] },
            ...Array.from({ length: periodCount - 1 }, (_, index) => ({
                period: index + 2,
                subjects: [
                    {
                        code: `B${index}`,
                        name: 'Projetos',
                        prerequisites: [[{ code: 'A', subject: base }]]
                    }
                ]
            }))
        ]
    } satisfies CourseCurriculum);
    const canvas = Object.getPrototypeOf(document.createElement('canvas'));
    const drawImage = mock(
        (_image: HTMLImageElement, _x: number, _y: number, _width: number, _height: number) => {}
    );
    spyOn(canvas, 'getContext').mockReturnValue({
        measureText: (value: string) => ({ width: 6 * value.length }),
        clearRect: mock(),
        fillRect: mock(),
        getImageData: () => ({ data: [24, 33, 40, 255] }),
        drawImage
    });
    const png = new Blob(['png'], { type: 'image/png' });
    const encode = spyOn(canvas, 'toBlob').mockImplementation((callback: BlobCallback) =>
        callback(png)
    );
    const imagePrototype = Object.getPrototypeOf(document.createElement('img'));
    const decode = spyOn(imagePrototype, 'decode').mockResolvedValue(undefined);
    const createUrl = spyOn(URL, 'createObjectURL')
        .mockReturnValueOnce('blob:curriculum-source')
        .mockReturnValueOnce('blob:curriculum-download');
    const revokeUrl = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let filename: string | undefined;
    const anchor = Object.getPrototypeOf(document.createElement('a'));
    spyOn(anchor, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        filename = this.download;
    });
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <CurriculumView
                courseId={42}
                courseName="Curso de teste"
                entrySemester="2026.2"
                currentPeriod={null}
                ownCourse={false}
                loggedIn={false}
                desktop={null}
            />
        </QueryClientProvider>
    );

    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Baixar fluxograma' }));
    await dom.testing.waitFor(() => expect(filename).toBe('fluxograma-42-2026.2.png'));
    expect(decode).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith('blob:curriculum-source');
    expect(encode.mock.calls[0][1]).toBe('image/png');
    expect(createUrl.mock.calls[1][0]).toBe(png);
    const blob = createUrl.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error('A imagem base não recebeu um Blob.');
    const svg = await blob.text();
    const [image, x, y, width, height] = drawImage.mock.calls[0];
    expect(image.src).toBe('blob:curriculum-source');
    expect([x, y, width]).toEqual([0, 0, expectedWidth]);
    expect(svg).toContain(`width="${width}" height="${height}"`);
    const [, viewWidth, viewHeight] = svg.match(/viewBox="0 0 (\d+) (\d+)"/) ?? [];
    expect(width / height).toBeCloseTo(Number(viewWidth) / Number(viewHeight), 1);
    expect(svg).toContain('Matriz 01 · 2025.1');
    expect(svg).toContain('1º semestre');
    expect(svg).toContain(`${periodCount}º semestre`);
    expect(svg).toContain('followw.app');
    expect(svg).toContain('Cálculo &amp; Álgebra');
    expect(svg).toContain('Projetos');
    expect(svg).toContain('marker-end="url(#');
    expect(svg).not.toContain('var(--');
});

import { Platform } from 'react-native';

import { shareContent, webUrl } from '@/lib/share';

describe('compartilhamento', () => {
    const original = Platform.OS;
    afterEach(() => {
        Platform.OS = original;
    });

    test('monta o link público a partir do caminho do site', () => {
        expect(webUrl('/cursos/6360')).toBe('https://followw.app/cursos/6360');
    });

    test('no iOS o link vai em um campo separado', () => {
        Platform.OS = 'ios';
        expect(shareContent('Curso', 'https://followw.app/cursos/1', 'Engenharia')).toEqual({
            title: 'Curso',
            message: 'Engenharia',
            url: 'https://followw.app/cursos/1'
        });
    });

    test('no Android o link vai junto da mensagem', () => {
        Platform.OS = 'android';
        expect(shareContent('Curso', 'https://followw.app/cursos/1')).toEqual({
            title: 'Curso',
            message: 'Curso\nhttps://followw.app/cursos/1'
        });
    });
});

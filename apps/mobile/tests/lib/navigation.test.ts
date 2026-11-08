import { activeNavIndex, isDoubleTap, showsNavigation } from '@/lib/navigation';

test('marca a aba da rota e a de turmas nos detalhes da turma', () => {
    expect(activeNavIndex('/')).toBe(0);
    expect(activeNavIndex('/turmas')).toBe(1);
    expect(activeNavIndex('/turmas/9001')).toBe(1);
    expect(activeNavIndex('/ru')).toBe(2);
    expect(activeNavIndex('/perfil')).toBe(4);
    expect(activeNavIndex('/professores/123')).toBe(-1);
});

test('esconde a barra nas telas cheias como no web', () => {
    for (const path of ['/', '/turmas', '/turmas/1', '/ru', '/buscar', '/perfil', '/professores/1'])
        expect(showsNavigation(path)).toBe(true);
    for (const path of ['/login', '/privacidade', '/cursos/123', '/rota-inexistente'])
        expect(showsNavigation(path)).toBe(false);
});

test('dois toques rápidos contam como toque duplo', () => {
    expect(isDoubleTap(null, 1000)).toBe(false);
    expect(isDoubleTap(1000, 1300)).toBe(true);
    expect(isDoubleTap(1000, 1500)).toBe(false);
});

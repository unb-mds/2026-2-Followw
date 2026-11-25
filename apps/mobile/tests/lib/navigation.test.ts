import { activeNavIndex, restaurantTabHref, showsNavigation } from '@/lib/navigation';

test('marca a aba da rota e a de turmas e perfil nas subpáginas', () => {
    expect(activeNavIndex('/')).toBe(0);
    expect(activeNavIndex('/turmas')).toBe(1);
    expect(activeNavIndex('/turmas/9001')).toBe(1);
    expect(activeNavIndex('/ru')).toBe(2);
    expect(activeNavIndex('/perfil')).toBe(4);
    expect(activeNavIndex('/perfil/simulador')).toBe(4);
    expect(activeNavIndex('/configuracoes')).toBe(4);
    expect(activeNavIndex('/professores/123')).toBe(-1);
});

test('esconde a barra nas telas cheias como no web', () => {
    for (const path of [
        '/',
        '/turmas',
        '/turmas/1',
        '/ru',
        '/buscar',
        '/perfil',
        '/professores/1',
        '/configuracoes'
    ])
        expect(showsNavigation(path)).toBe(true);
    for (const path of ['/login', '/cursos/123', '/turmas/1/plano-de-ensino', '/rota-inexistente'])
        expect(showsNavigation(path)).toBe(false);
});

test('tocar no RU já aberto pede a carteirinha', () => {
    expect(restaurantTabHref('/')).toBe('/ru');
    expect(restaurantTabHref('/ru')).toEqual({ pathname: '/ru', params: { carteirinha: '1' } });
});

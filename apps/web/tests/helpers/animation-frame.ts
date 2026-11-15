// o frameloop do motion captura o requestAnimationFrame ao ser importado; este preload roda antes
let frame = 0;
globalThis.requestAnimationFrame ??= (callback) => {
    setTimeout(() => callback(performance.now()), 0);
    return ++frame;
};

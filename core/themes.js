import { USER } from './manager.js';

/**
 * @description 配色：给 body 加一个 class，颜色都在 style.css 里
 * @description v2.43 起是固定的五套深色配色，不再跟着酒馆主题走（跟着走时强调色常常是黄色）
 */
export const THEMES = ['blue', 'teal', 'violet', 'rose', 'mono'];
export const DEFAULT_THEME = 'blue';

/** 旧版存下来的值（follow / paper / night / mint / contrast）一律按默认配色显示，不改用户存的设置 */
export function normalizeTheme(name) {
    return THEMES.includes(name) ? name : DEFAULT_THEME;
}

export function applyTheme(name = USER.tableBaseSetting.v2_theme) {
    const body = globalThis.document?.body;
    if (!body?.classList) return;
    ['follow', 'paper', 'night', 'mint', 'contrast', ...THEMES].forEach(theme => body.classList.remove(`v2-theme-${theme}`));
    body.classList.add(`v2-theme-${normalizeTheme(name)}`);
}

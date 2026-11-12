/**
 * @description 底部弹层：整屏阅读、行菜单、注入预览都用它
 * @description 挂在表格抽屉里面（#v2u_sheet_host），不走酒馆的弹窗，手机上从底部滑出
 */

export const esc = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let current = null;

function host() {
    return document.getElementById('v2u_sheet_host');
}

/** 关掉当前弹层 */
export function closeBottomSheet() {
    if (!current) return;
    const { root, onClose } = current;
    current = null;
    root.remove();
    try { onClose?.(); } catch (_) { }
}

/**
 * 打开底部弹层
 * @param {{ title: string, sub?: string, body: string|Node, actions?: {label: string, icon?: string, kind?: 'primary'|'danger', onClick: Function}[], tall?: boolean, onClose?: Function }} opts
 * @returns {{ root: HTMLElement, body: HTMLElement, setSub: Function, setActions: Function, close: Function } | null}
 */
export function openBottomSheet({ title, sub = '', body, actions = [], tall = true, onClose } = {}) {
    const mount = host();
    if (!mount) return null;
    closeBottomSheet();
    const root = document.createElement('div');
    root.className = 'v2u-sheet-wrap';
    root.innerHTML = `
        <div class="v2u-sheet-mask" data-sheet-close></div>
        <section class="v2u-sheet${tall ? ' is-tall' : ''}" role="dialog" aria-label="${esc(title)}">
            <div class="v2u-sheet-grip" data-sheet-close><span></span></div>
            <header class="v2u-sheet-head">
                <div class="v2u-sheet-titles"><b>${esc(title)}</b><small></small></div>
                <button type="button" class="v2u-icon-btn" data-sheet-close aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </header>
            <div class="v2u-sheet-body"></div>
            <footer class="v2u-sheet-foot"></footer>
        </section>`;
    const bodyEl = root.querySelector('.v2u-sheet-body');
    const footEl = root.querySelector('.v2u-sheet-foot');
    const subEl = root.querySelector('.v2u-sheet-titles small');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
    const setSub = (text) => { subEl.textContent = text || ''; subEl.style.display = text ? '' : 'none'; };
    const setActions = (list) => {
        footEl.innerHTML = '';
        footEl.style.display = list?.length ? '' : 'none';
        (list || []).forEach(action => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `v2u-btn${action.kind ? ` is-${action.kind}` : ''}${action.grow === false ? '' : ' is-grow'}`;
            button.innerHTML = `${action.icon ? `<i class="fa-solid ${action.icon}"></i>` : ''}<span>${esc(action.label)}</span>`;
            button.addEventListener('click', (event) => { event.stopPropagation(); action.onClick?.(event); });
            footEl.append(button);
        });
    };
    setSub(sub);
    setActions(actions);
    root.addEventListener('click', (event) => {
        if (event.target.closest('[data-sheet-close]')) { event.stopPropagation(); closeBottomSheet(); }
    });
    mount.append(root);
    current = { root, onClose };
    return { root, body: bodyEl, setSub, setActions, close: closeBottomSheet };
}

/**
 * 一列带文字的操作（行菜单、更多操作）
 * @param {string} title
 * @param {{label: string, icon?: string, hint?: string, danger?: boolean, onClick: Function}[]} items
 */
export function openActionSheet(title, items, sub = '') {
    const list = document.createElement('div');
    list.className = 'v2u-menu';
    items.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `v2u-menu-item${item.danger ? ' is-danger' : ''}`;
        button.innerHTML = `<i class="fa-solid ${item.icon || 'fa-circle'}"></i><span><b>${esc(item.label)}</b>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}</span>`;
        button.addEventListener('click', (event) => { event.stopPropagation(); closeBottomSheet(); item.onClick?.(); });
        list.append(button);
    });
    return openBottomSheet({ title, sub, body: list, tall: false });
}

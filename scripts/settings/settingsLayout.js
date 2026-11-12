/**
 * @description 设置页的排版：每组设置收成一行，点标题展开；顶上可以搜
 * @description 只动显示（加 class、加搜索框），不改任何设置项的 id 和取值方式
 */

const FOLD_KEY = 'v2u_setting_open';
let rootEl = null;

function readOpen() {
    try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]')); } catch (_) { return new Set(); }
}
function writeOpen(set) {
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...set])); } catch (_) { }
}

const titleOf = (card) => (card.querySelector(':scope > .v2s-title > span')?.textContent || '').trim();

function cards() {
    return rootEl ? [...rootEl.querySelectorAll('.v2s-card')].filter(card => card.querySelector(':scope > .v2s-title') && !card.classList.contains('v2s-inline')) : [];
}

function setFolded(card, folded) {
    card.classList.toggle('is-folded', folded);
    card.querySelector(':scope > .v2s-title')?.setAttribute('aria-expanded', String(!folded));
}

/** 展开某一组设置并滚过去（按标题找） */
export function focusSetting(title) {
    const card = cards().find(c => titleOf(c) === title);
    if (!card) return false;
    setFolded(card, false);
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return true;
}

export function enhanceSettings(root) {
    if (!root || root.dataset.v2uEnhanced) return;
    root.dataset.v2uEnhanced = '1';
    rootEl = root;
    const open = readOpen();

    for (const card of cards()) {
        card.classList.add('v2s-fold');
        const title = card.querySelector(':scope > .v2s-title');
        title.setAttribute('role', 'button');
        title.setAttribute('tabindex', '0');
        title.insertAdjacentHTML('beforeend', '<i class="fa-solid fa-chevron-down v2s-chev"></i>');
        setFolded(card, !open.has(titleOf(card)));
        const toggle = () => {
            const folded = !card.classList.contains('is-folded');
            setFolded(card, folded);
            const now = readOpen();
            if (folded) now.delete(titleOf(card)); else now.add(titleOf(card));
            writeOpen(now);
        };
        title.addEventListener('click', (event) => { if (!event.target.closest('a, input, select, button')) toggle(); });
        title.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    }

    // 搜索：按标题和里面的文字找，搜到的组自动展开
    const host = root.querySelector('.v2h');
    if (!host) return;
    const box = document.createElement('label');
    box.className = 'v2u-search v2s-search';
    box.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="搜设置，比如「总结」「API」" autocomplete="off">';
    host.parentElement.insertBefore(box, host);
    const empty = document.createElement('div');
    empty.className = 'v2u-empty';
    empty.style.display = 'none';
    empty.textContent = '没有搜到这项设置';
    box.after(empty);
    let before = null;
    box.querySelector('input').addEventListener('input', (event) => {
        const key = event.target.value.trim().toLowerCase();
        const groups = [...root.querySelectorAll('.v2h-group')];
        if (!key) {
            cards().forEach(card => { card.style.display = ''; if (before) setFolded(card, before.get(card) ?? true); });
            groups.forEach(group => { group.style.display = ''; group.querySelectorAll('.v2h-btn').forEach(b => { b.style.display = ''; }); });
            root.querySelectorAll('.v2s-inline').forEach(el => { el.style.display = ''; });
            before = null;
            empty.style.display = 'none';
            return;
        }
        if (!before) before = new Map(cards().map(card => [card, card.classList.contains('is-folded')]));
        let hits = 0;
        cards().forEach(card => {
            const match = card.textContent.toLowerCase().includes(key);
            card.style.display = match ? '' : 'none';
            if (match) { setFolded(card, false); hits++; }
        });
        root.querySelectorAll('.v2s-inline').forEach(el => { const match = el.textContent.toLowerCase().includes(key); el.style.display = match ? '' : 'none'; if (match) hits++; });
        groups.forEach(group => {
            let any = false;
            group.querySelectorAll('.v2h-btn').forEach(button => {
                const match = `${button.textContent} ${button.title || ''}`.toLowerCase().includes(key);
                button.style.display = match ? '' : 'none';
                if (match) { any = true; hits++; }
            });
            group.style.display = any ? '' : 'none';
        });
        empty.style.display = hits ? 'none' : '';
    });
}

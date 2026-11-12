/**
 * @description 抽屉里的「总览」和「角色」两页，以及本轮注入预览的底部弹层
 * @description 这里只读数据：表格内容从最新一楼的快照读，上一楼只比对格子 uid，不往任何地方写
 */
import { BASE, DERIVED, EDITOR, USER } from '../../core/manager.js';
import { V2 } from '../../core/v2keys.js';
import { lastInjection } from '../../core/promptExtras.js';
import { buildProfiles, estimateTokens, searchProfiles } from '../../core/characterData.js';
import { computeTiers } from '../../core/sendTiers.js';
import { cardState, getAvatar } from '../../core/characterStatus.js';
import { stripColumnMark } from '../../core/rowIdentity.js';
import { esc, openBottomSheet } from '../editor/bottomSheet.js';
import { initTableData } from '../../index.js';
import { readSheet } from '../editor/sheetCards.js';

const clean = (v) => String(v ?? '').trim();
const short = (text, max) => { const s = clean(text); return s.length > max ? `${s.slice(0, max)}…` : s; };
const num = (n) => Number(n || 0).toLocaleString('en-US');
const SEG_CLS = ['is-ac', 'is-teal', 'is-blue', 'is-vio', 'is-mute'];

/** 最新一楼的表格实例和楼层号；没有表格时 sheets 为空 */
function latestSheets() {
    const { piece, deep } = BASE.getLastSheetsPiece();
    const hash = piece ? BASE.getPieceHash(piece) : null;
    if (!hash || deep < 0) return { sheets: [], deep: -1 };
    return { sheets: BASE.hashSheetsToSheets(hash).filter(sheet => sheet.enable), deep };
}

/** 上一楼每张表的格子 uid（只读） */
function prevSets(deep) {
    if (deep <= 0) return null;
    try {
        const prev = BASE.getPieceHash(BASE.getLastSheetsPiece(deep - 1, 3, false)?.piece);
        if (!prev) return null;
        const map = new Map();
        Object.entries(prev).forEach(([uid, hash]) => { if (Array.isArray(hash)) map.set(uid, new Set(hash.flat())); });
        return map;
    } catch (_) {
        return null;
    }
}

/** 最新一楼相对上一楼改了什么 */
function floorChanges(sheets, deep) {
    const prev = prevSets(deep);
    if (!prev) return null;
    const list = [];
    for (const sheet of sheets) {
        const before = prev.get(sheet.uid);
        if (!before) continue;
        const data = readSheet(sheet, before);
        for (const row of data.rows) {
            if (!row.changed) continue;
            const title = short(row.cells.find(cell => cell.value)?.value || `第 ${row.r} 行`, 16);
            if (row.isNew) {
                list.push({ kind: '新增', sheet, where: sheet.name, text: short(row.cells.filter(cell => cell.value).map(cell => cell.value).join(' · '), 60) });
            } else {
                for (const cell of row.cells.filter(c => c.changed)) {
                    list.push({ kind: '更新', sheet, where: `${sheet.name} · ${title}`, text: `${stripColumnMark(cell.header)}：${short(cell.value.split(/[；;\n]/).filter(Boolean).pop() || '（清空）', 50)}` });
                }
            }
        }
    }
    return list;
}

function injectionEntry() {
    let entry = lastInjection();
    if (!entry?.text && !USER.tableBaseSetting.step_by_step) {
        try { initTableData(); } catch (error) { console.warn('[记忆增强 v2] 预览生成失败', error); }
        entry = lastInjection();
    }
    return entry;
}

/** 注入内容按来源分段：字数最多的三张表、其余表、找回的旧事 */
function injectionSegments(entry) {
    const sheets = (entry?.sheets || []).filter(x => x.chars > 0).sort((a, b) => b.chars - a.chars);
    const segs = sheets.slice(0, 3).map(x => ({ name: x.name, chars: x.chars }));
    const rest = sheets.slice(3).reduce((sum, x) => sum + x.chars, 0);
    if (rest) segs.push({ name: `其余 ${sheets.length - 3} 张表`, chars: rest });
    if (entry?.recallChars) segs.push({ name: '找回的旧事', chars: entry.recallChars });
    return segs.map((seg, i) => ({ ...seg, cls: seg.name === '找回的旧事' ? 'is-mute' : SEG_CLS[i] }));
}

const barHtml = (segs) => `<span class="v2u-cover is-tall">${segs.map(seg => `<i class="${seg.cls}" style="flex:${seg.chars}"></i>`).join('')}</span>`;

function clickButton(id) {
    document.getElementById(id)?.click();
}

/** 总览页 */
export function renderOverview(container) {
    if (!container) return;
    const context = USER.getContext();
    const chat = context.chat || [];
    // 先生成注入预览（它会把表格实例对到别的楼层去读），再把实例对回最新一楼
    const hasSheets = latestSheets().sheets.length > 0;
    const entry = hasSheets ? injectionEntry() : null;
    const { sheets, deep } = latestSheets();
    const enabled = USER.tableBaseSetting.isExtensionAble !== false;
    const meta = context.chatMetadata || {};
    const parts = [];

    parts.push(`<header class="v2u-page-head"><h2>记忆表格</h2><span class="v2u-pill">${chat.length ? `共 ${chat.length} 楼${deep >= 0 ? ` · 表格在第 ${deep} 楼` : ''}` : '还没有打开聊天'}</span></header>`);
    if (!enabled) parts.push(`<div class="v2u-tip is-warn">插件现在是关着的，不会让 AI 更新表格。到「设置」里的「插件开关」打开。</div>`);
    if (meta[`${V2.chatImport}_declined`] && !meta[V2.chatImport]) {
        parts.push(`<section class="v2u-callout"><div><b>这个聊天有原版表格，还没导入</b><small>导入只是复制一份，原版的数据不会改动。</small></div><button type="button" class="v2u-btn is-primary" data-go="import">导入</button></section>`);
    }

    // 本轮发给模型的记忆
    if (entry) {
        const total = entry.totalChars ?? ((entry.tableChars || 0) + (entry.recallChars || 0));
        const segs = injectionSegments(entry);
        parts.push(`<section class="v2u-panel">
            <div class="v2u-panel-head"><h3>本轮会发给模型的记忆</h3><span class="v2u-mute">第 ${entry.turn} 轮</span></div>
            <div class="v2u-big"><b>${num(total)}</b><span>字${entry.text ? `，约 ${num(estimateTokens(entry.text))} token` : ''}</span></div>
            ${segs.length ? `${barHtml(segs)}<div class="v2u-legend is-grid">${segs.map(seg => `<span><i class="${seg.cls}"></i><em>${esc(short(seg.name, 10))}</em><b>${num(seg.chars)}</b></span>`).join('')}</div>` : ''}
            <div class="v2u-row"><button type="button" class="v2u-btn is-grow" data-go="preview"><i class="fa-solid fa-eye"></i><span>看全文</span></button><button type="button" class="v2u-btn is-grow" data-go="send-setting"><i class="fa-solid fa-sliders"></i><span>调整发送</span></button></div>
        </section>`);
    } else if (sheets.length) {
        parts.push(`<section class="v2u-panel"><div class="v2u-panel-head"><h3>本轮会发给模型的记忆</h3></div><div class="v2u-mute">还没有发送记录，聊一轮之后这里会显示发了多少字。</div></section>`);
    }

    // 快捷入口
    parts.push(`<div class="v2u-quick">
        <button type="button" data-go="graph"><i class="fa-solid fa-diagram-project"></i><b>关系图</b><small>角色之间的关系</small></button>
        <button type="button" data-go="map"><i class="fa-solid fa-map-location-dot"></i><b>地图</b><small>去过的地点</small></button>
        <button type="button" data-go="database"><i class="fa-solid fa-table-list"></i><b>表格</b><small>${sheets.length} 张表</small></button>
    </div>`);

    // 这一楼改了什么
    if (sheets.length) {
        const changes = floorChanges(sheets, deep);
        const shown = (changes || []).slice(0, 8);
        parts.push(`<section class="v2u-panel">
            <div class="v2u-panel-head"><h3>第 ${deep} 楼改了什么</h3>${changes?.length ? `<span class="v2u-mute">${changes.length} 处</span>` : ''}</div>
            ${!changes ? `<div class="v2u-mute">找不到上一楼的表格，没法比对。</div>` : !changes.length ? `<div class="v2u-mute">这一楼没有改动表格。</div>` : `<ul class="v2u-changes">${shown.map(change => `<li><button type="button" data-go-sheet="${esc(change.sheet.uid)}"><span class="v2u-tag ${change.kind === '新增' ? 'is-green' : 'is-ac'}">${change.kind}</span><span><small>${esc(change.where)}</small>${esc(change.text)}</span></button></li>`).join('')}</ul>${changes.length > shown.length ? `<div class="v2u-mute">还有 ${changes.length - shown.length} 处，到「表格」里看。</div>` : ''}`}
        </section>`);
        parts.push(`<section class="v2u-panel"><div class="v2u-panel-head"><h3>各张表</h3></div><div class="v2u-sheetlist">${sheets.map(sheet => `<button type="button" data-go-sheet="${esc(sheet.uid)}"><span>${esc(sheet.name)}</span><b>${Math.max(0, sheet.getRowCount() - 1)} 行</b><i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div></section>`);
    } else if (chat.length) {
        parts.push(`<div class="v2u-empty">这个聊天还没有表格。正常聊一轮，AI 回复后表格会自动出现。</div>`);
    }

    container.innerHTML = parts.join('');
    if (!container.dataset.bound) {
        container.dataset.bound = '1';
        container.addEventListener('click', onHomeClick);
    }
}

async function onHomeClick(event) {
    const sheetButton = event.target.closest('[data-go-sheet]');
    if (sheetButton) {
        document.getElementById('database_button')?.click();
        const { selectSheet } = await import('../editor/chatSheetsDataView.js');
        return void selectSheet(sheetButton.dataset.goSheet);
    }
    const go = event.target.closest('[data-go]')?.dataset.go;
    if (!go) return;
    if (go === 'preview') return void openInjectionPreview();
    if (go === 'graph') return clickButton('table_v2_relation_graph_button');
    if (go === 'map') return clickButton('table_v2_map_button');
    if (go === 'import') return clickButton('table_v2_import_original_button');
    if (go === 'database') return clickButton('database_button');
    if (go === 'send-setting') {
        clickButton('setting_button');
        const { focusSetting } = await import('../settings/settingsLayout.js');
        return void focusSetting('发给 AI 的内容');
    }
}

// ---------------------------------------------------------------- 本轮注入预览

/** 本轮注入预览：底部弹层，按来源看字数，再看全文 */
export function openInjectionPreview() {
    const entry = injectionEntry();
    if (!entry) return EDITOR.error('还没有发送过表格，先聊一轮或打开有表格的聊天');
    const total = entry.totalChars ?? ((entry.tableChars || 0) + (entry.recallChars || 0));
    const segs = injectionSegments(entry);
    const rows = (entry.sheets || []).map(x => `<li><span><b>${esc(x.name)}</b><small>${x.rows} 行 · ${x.tiers ? `完整 ${x.tiers.full} / 简要 ${x.tiers.brief} / 名册 ${x.tiers.roster}` : '整表发送'}</small></span><em>${num(x.chars)} 字</em><i>${total ? Math.round((x.chars / total) * 100) : 0}%</i></li>`).join('');
    const body = `<div class="v2u-preview">
        <div class="v2u-big"><b>${num(total)}</b><span>字${entry.text ? `，约 ${num(estimateTokens(entry.text))} token` : ''}</span></div>
        ${segs.length ? barHtml(segs) : ''}
        <div class="v2u-mute">${esc(entry.at)} · 第 ${entry.turn} 轮${entry.pure ? '（分步填表，只发数据）' : ''} · 表格 ${num(entry.tableChars ?? 0)} 字，找回旧事 ${num(entry.recallChars ?? 0)} 字</div>
        ${entry.present ? `<div class="v2u-kv"><span>在场</span><p>${esc(entry.present.join('、') || '无')}</p><span>主要角色</span><p>${esc((entry.main || []).join('、') || '无')}</p></div>` : ''}
        ${rows ? `<ul class="v2u-preview-list">${rows}</ul>` : ''}
        ${entry.reminders ? `<div class="v2u-f-k">定时提醒</div><pre class="v2u-pre">${esc(entry.reminders)}</pre>` : ''}
        <details class="v2u-details"><summary>完整内容</summary><pre class="v2u-pre">${esc(entry.text || '')}</pre></details>
    </div>`;
    openBottomSheet({
        title: '本轮注入预览',
        body,
        actions: [{ label: '复制全文', icon: 'fa-copy', onClick: () => navigator.clipboard?.writeText(entry.text || '').then(() => EDITOR.success('已复制'), () => EDITOR.error('复制失败，请展开「完整内容」手动复制')) }],
    });
}

// ---------------------------------------------------------------- 角色名册

const roster = { filter: 'all', query: '' };
const ABSENT_FLOORS = 30;

function favorOf(profile) {
    for (const section of profile.sections || []) {
        for (const item of section.grid || []) {
            if (/好感/.test(item.label)) { const n = parseFloat(item.value); if (Number.isFinite(n)) return n; }
        }
    }
    return null;
}

/** 角色页：名册。点一个人，收起抽屉并打开聊天底部的资料卡 */
export function renderRoster(container) {
    if (!container) return;
    const { sheets } = latestSheets();
    const chatLength = USER.getContext().chat?.length || 0;
    let list = [], present = new Set(), appear = {};
    try {
        list = buildProfiles(sheets).list;
        present = computeTiers(sheets)?.present ?? new Set();
        appear = cardState().appear || {};
    } catch (error) {
        console.warn('[记忆增强 v2] 名册生成失败', error);
    }
    const lastSeen = (p) => appear[p.primary]?.last;
    const isAbsent = (p) => !present.has(p.primary) && Number.isFinite(lastSeen(p)) && chatLength - 1 - lastSeen(p) >= ABSENT_FLOORS;
    const counts = { all: list.length, present: list.filter(p => present.has(p.primary)).length, absent: list.filter(isAbsent).length, missing: list.filter(p => p.empty?.length).length };
    let shown = searchProfiles(list, roster.query);
    if (roster.filter === 'present') shown = shown.filter(p => present.has(p.primary));
    if (roster.filter === 'absent') shown = shown.filter(isAbsent);
    if (roster.filter === 'missing') shown = shown.filter(p => p.empty?.length);
    shown.sort((a, b) => (present.has(b.primary) - present.has(a.primary)) || ((lastSeen(b) ?? -1) - (lastSeen(a) ?? -1)));

    const rowHtml = (p) => {
        const favor = favorOf(p);
        const seen = lastSeen(p);
        const ago = Number.isFinite(seen) ? chatLength - 1 - seen : null;
        let src = '';
        try { src = getAvatar(p.primary) || ''; } catch (_) { }
        const first = (p.sections || []).flatMap(s => s.grid || []).filter(item => !/好感/.test(item.label)).slice(0, 2).map(item => item.value).join(' · ');
        return `<button type="button" class="v2u-person" data-person="${esc(p.primary)}">
            <span class="v2u-ava is-lg${present.has(p.primary) ? ' is-here' : ''}">${src ? `<img src="${esc(src)}" alt="">` : esc(p.primary.slice(0, 1))}</span>
            <span class="v2u-person-main">
                <span class="v2u-person-name"><b>${esc(p.primary)}</b><small>${esc(short(first, 22))}</small></span>
                ${favor !== null ? `<span class="v2u-person-favor"><span class="v2u-meter is-warm"><i style="width:${Math.max(0, Math.min(100, favor))}%"></i></span>好感 ${favor}</span>` : ''}
                <span class="v2u-person-meta"><span>${ago === null ? '还没记到出场' : ago <= 0 ? '本楼出场' : `${ago} 楼前出场`}</span><span>约 ${p.tokens} token</span>${p.empty?.length ? `<span class="is-warn"><i class="fa-solid fa-triangle-exclamation"></i> 缺 ${p.empty.length} 项</span>` : ''}</span>
            </span>
            <i class="fa-solid fa-chevron-right"></i>
        </button>`;
    };
    const here = shown.filter(p => present.has(p.primary));
    const away = shown.filter(p => !present.has(p.primary));
    const group = (title, people) => people.length ? `<section class="v2u-group"><div class="v2u-group-head">${title} · ${people.length}</div>${people.map(rowHtml).join('')}</section>` : '';
    const chip = (key, label) => `<button type="button" class="v2u-chip${roster.filter === key ? ' is-on' : ''}" data-filter="${key}"><span>${label}</span><small>${counts[key]}</small></button>`;

    const keepFocus = document.activeElement?.id === 'v2u_roster_search';
    container.innerHTML = `
        <header class="v2u-page-head"><h2>角色</h2><span class="v2u-mute">在场 ${counts.present} · 共 ${counts.all}</span><button type="button" class="v2u-icon-btn" data-go="graph" aria-label="关系图" title="关系图"><i class="fa-solid fa-diagram-project"></i></button></header>
        <div class="v2u-tools"><label class="v2u-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="v2u_roster_search" placeholder="搜名字、身份、状态" value="${esc(roster.query)}" autocomplete="off"></label></div>
        <div class="v2u-chips">${chip('all', '全部')}${chip('present', '在场')}${chip('absent', '久未出场')}${chip('missing', '资料不全')}</div>
        ${list.length ? (group('在场', here) + group('不在场', away) || `<div class="v2u-empty">没有符合条件的角色</div>`) : `<div class="v2u-empty">角色表里还没有角色</div>`}`;
    if (keepFocus) { const input = container.querySelector('#v2u_roster_search'); input?.focus(); input?.setSelectionRange?.(roster.query.length, roster.query.length); }
    if (!container.dataset.bound) {
        container.dataset.bound = '1';
        let timer = null;
        container.addEventListener('input', (event) => {
            if (event.target.id !== 'v2u_roster_search') return;
            roster.query = event.target.value;
            clearTimeout(timer);
            timer = setTimeout(() => renderRoster(container), 200);
        });
        container.addEventListener('click', async (event) => {
            const filter = event.target.closest('[data-filter]');
            if (filter) { roster.filter = filter.dataset.filter; return renderRoster(container); }
            if (event.target.closest('[data-go="graph"]')) return clickButton('table_v2_relation_graph_button');
            const person = event.target.closest('[data-person]');
            if (!person) return;
            const name = person.dataset.person;
            const { openCharacterCard } = await import('./characterCardView.js');
            if (openCharacterCard(name)) {
                // 资料卡在聊天最下面：收起抽屉让它露出来
                if (document.getElementById('table_drawer_content')?.classList.contains('openDrawer')) document.querySelector('#table_database_settings_drawer .drawer-toggle')?.click();
                return;
            }
            // 资料卡关着时，退而求其次：翻到这个人所在的表并搜他
            const profile = buildProfiles(latestSheets().sheets).list.find(p => p.primary === name);
            document.getElementById('database_button')?.click();
            const { selectSheet } = await import('../editor/chatSheetsDataView.js');
            if (profile?.home?.uid && await selectSheet(profile.home.uid)) {
                const search = document.getElementById('v2u_sheet_search');
                if (search) { search.value = name; search.dispatchEvent(new Event('input', { bubbles: true })); }
            }
        });
    }
}

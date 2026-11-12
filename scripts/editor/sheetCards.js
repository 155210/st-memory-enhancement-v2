/**
 * @description 表格页的卡片视图：一行一张卡片，每类表按内容换排法
 * @description 只读数据画界面；改数据走原来的 Cell 动作（editCellData / newAction），不另开写入路径
 */
import { summaryConfig } from '../../core/summaryManager.js';
import { columnMode, isNameKeyedSheet, parseNameCell, stripColumnMark } from '../../core/rowIdentity.js';
import { isPairSheet } from '../../core/sendTiers.js';
import { getAvatar } from '../../core/characterStatus.js';
import { esc } from './bottomSheet.js';

const clean = (v) => String(v ?? '').trim();
const short = (text, max) => { const s = clean(text); return s.length > max ? `${s.slice(0, max)}…` : s; };

/** 超过这么多字的格子算长内容：卡片上截断，点开整屏看 */
export const LONG_LIMIT = 60;
const MEDIUM_LIMIT = 14;
const PAGE = 30;

// 段之间「；」或换行，段内「/」（6/1 这种日期不拆）——和 # 列追加时的写法一致
const SEGMENT_SPLIT = /[；;\n]+/;
const ITEM_SPLIT = /(?<!\d)[/／]|[/／](?!\d)/;

/** 把一格内容拆成条目，顺序和原文一致（最后一条是最新写进去的） */
export function splitEntries(value, append = false) {
    const text = clean(value);
    if (!text) return [];
    let parts = text.split(SEGMENT_SPLIT).map(clean).filter(Boolean);
    if (append) parts = parts.flatMap(seg => seg.split(ITEM_SPLIT)).map(clean).filter(Boolean);
    return parts;
}

/** 这一格是不是该按条目显示：只追加的列，或者很长而且本身分了三段以上 */
export function asEntries(header, value) {
    const append = columnMode(header) === 'append';
    const text = clean(value);
    if (!append && text.length <= LONG_LIMIT) return null;
    const entries = splitEntries(text, append);
    if (entries.length < (append ? 2 : 3)) return null;
    return entries;
}

const NUMERIC = /^-?\d+(\.\d+)?\s*(%|％|岁|次|个|天|年|月|cm|kg|ml|斤|米|人)?$/i;
const METER_HEAD = /好感|臣服|亲密|信任|忠诚|值$|度$/;

/** 表的种类，决定用哪种排法 */
export function sheetKind(sheet, headers) {
    const { summaryTable, archiveTable, eventTable } = summaryConfig();
    if (sheet.name === summaryTable) return 'summary';
    if (sheet.name === archiveTable) return 'archive';
    if (sheet.name === eventTable) return 'event';
    const plain = headers.map(stripColumnMark);
    if (isPairSheet(sheet)) return 'pair';
    if (plain.some(h => /此地角色|在场角色/.test(h)) || /时空/.test(sheet.name)) return 'spacetime';
    if (/任务|约定|待办/.test(sheet.name)) return 'task';
    if (/物品|道具|装备/.test(sheet.name)) return 'item';
    if (isNameKeyedSheet(sheet)) return 'person';
    return 'generic';
}

/**
 * 读出一张表要画的东西
 * @param {Object} sheet 表格实例
 * @param {Set<string>|null} prev 上一楼这张表里所有格子的 uid；null 表示没有上一楼，不标改动
 */
export function readSheet(sheet, prev) {
    const hash = sheet.hashSheet || [];
    const value = (uid) => clean(sheet.cells.get(uid)?.data?.value);
    const headers = (hash[0] || []).slice(1).map(value);
    const rows = hash.slice(1).map((row, i) => {
        const isNew = !!prev && !prev.has(row[0]);
        const cells = row.slice(1).map((uid, c) => ({ uid, c, header: headers[c] ?? '', value: value(uid), changed: !!prev && (isNew || !prev.has(uid)) }));
        return { r: i + 1, head: row[0], isNew, cells, changed: isNew || cells.some(cell => cell.changed) };
    });
    const kind = sheetKind(sheet, headers);
    return { sheet, headers, rows, kind, changed: rows.filter(row => row.changed).length };
}

// ---------------------------------------------------------------- 小零件

const tag = (text, cls = '') => `<span class="v2u-tag ${cls}">${esc(text)}</span>`;
const NEW_TAG = tag('本楼', 'is-ac');

function avatar(name, size = '') {
    let src = '';
    try { src = getAvatar(parseNameCell(name).primary || name) || ''; } catch (_) { }
    const inner = src ? `<img src="${esc(src)}" alt="">` : esc(clean(name).slice(0, 1) || '?');
    return `<span class="v2u-ava ${size}">${inner}</span>`;
}

function meter(valueText, cls = '') {
    const n = parseFloat(valueText);
    const pct = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
    return `<span class="v2u-meter ${cls}"><i style="width:${pct}%"></i></span>`;
}

/** 一格：按长短自动选排法；都带 data-cell，点了打开整屏阅读 / 编辑 */
function field(cell, { forceFull = false } = {}) {
    const label = stripColumnMark(cell.header) || '（没有列名）';
    const text = cell.value;
    const mark = cell.changed ? NEW_TAG : '';
    const base = `data-cell="${esc(cell.uid)}"`;
    if (!text) {
        return `<button type="button" class="v2u-f is-empty" ${base}><span class="v2u-f-k">${esc(label)}</span><span class="v2u-f-v">—</span></button>`;
    }
    if (METER_HEAD.test(label) && NUMERIC.test(text)) {
        return `<button type="button" class="v2u-f is-full is-meter${cell.changed ? ' is-changed' : ''}" ${base}><span class="v2u-f-k">${esc(label)}</span>${meter(text, /好感|亲密/.test(label) ? 'is-warm' : '')}<b>${esc(text)}</b>${mark}</button>`;
    }
    const entries = asEntries(cell.header, text);
    if (entries) {
        const latest = entries.slice(-3).reverse();
        const rest = entries.length - latest.length;
        return `<button type="button" class="v2u-f is-full is-entries${cell.changed ? ' is-changed' : ''}" ${base}>
            <span class="v2u-f-k">${esc(label)} · ${entries.length} 条，共 ${text.length} 字 · 最新在上${mark}</span>
            ${latest.map((entry, i) => `<span class="v2u-entry${i === 0 && cell.changed ? ' is-new' : ''}"><i></i><span>${esc(entry)}</span></span>`).join('')}
            ${rest > 0 ? `<span class="v2u-more-link">还有 ${rest} 条 <i class="fa-solid fa-chevron-right"></i></span>` : ''}
        </button>`;
    }
    if (text.length > LONG_LIMIT) {
        return `<button type="button" class="v2u-f is-full is-long${cell.changed ? ' is-changed' : ''}" ${base}>
            <span class="v2u-f-k">${esc(label)}${mark}</span>
            <span class="v2u-f-v v2u-clamp3">${esc(text)}</span>
            <span class="v2u-more-link">共 ${text.length} 字 · 展开 <i class="fa-solid fa-chevron-right"></i></span>
        </button>`;
    }
    const full = forceFull || text.length > MEDIUM_LIMIT;
    return `<button type="button" class="v2u-f${full ? ' is-full' : ''}${cell.changed ? ' is-changed' : ''}" ${base}><span class="v2u-f-k">${esc(label)}${mark}</span><span class="v2u-f-v">${esc(text)}</span></button>`;
}

/** 一组格子：短数字排成数字块，其余进两栏 */
function fieldGrid(cells) {
    const stats = cells.filter(cell => cell.value && NUMERIC.test(cell.value) && cell.value.length <= 8 && !METER_HEAD.test(stripColumnMark(cell.header)));
    const useStats = stats.length >= 2 ? stats.slice(0, 6) : [];
    const rest = cells.filter(cell => !useStats.includes(cell));
    const statHtml = useStats.length ? `<div class="v2u-stats">${useStats.map(cell => `<button type="button" class="v2u-stat${cell.changed ? ' is-changed' : ''}" data-cell="${esc(cell.uid)}"><span>${esc(stripColumnMark(cell.header))}</span><b>${esc(cell.value)}</b></button>`).join('')}</div>` : '';
    return `${statHtml}<div class="v2u-grid">${rest.map(cell => field(cell)).join('')}</div>`;
}

const rowMenuButton = (editable) => editable ? `<button type="button" class="v2u-icon-btn is-quiet" data-act="rowmenu" aria-label="这一行的操作"><i class="fa-solid fa-ellipsis"></i></button>` : '';

/** 一行收起来时显示的那句话 */
function summaryLine(cells) {
    return cells.filter(cell => cell.value && cell.value.length <= 24).slice(0, 3).map(cell => cell.value).join(' · ') || short(cells.find(cell => cell.value)?.value || '', 30);
}

// ---------------------------------------------------------------- 各类表

function cardShell(row, { title, sub, lead = '', badges = '', body, open, editable, cls = '' }) {
    return `<article class="v2u-card ${cls}${open ? ' is-open' : ''}${row.changed ? ' is-changed' : ''}" data-row="${row.r}" data-head="${esc(row.head)}">
        <header class="v2u-card-head" data-act="toggle">
            <span class="v2u-idx">${row.r}</span>${lead}
            <span class="v2u-card-title"><b>${esc(title || '（空行，点开填写）')}</b>${!open && sub ? `<small>${esc(sub)}</small>` : ''}</span>
            ${badges}${row.changed ? NEW_TAG : ''}${rowMenuButton(editable)}
            <i class="fa-solid fa-chevron-${open ? 'up' : 'down'} v2u-chev"></i>
        </header>
        ${open ? `<div class="v2u-card-body">${body()}</div>` : ''}
    </article>`;
}

function personCard(row, ctx) {
    const nameCell = row.cells[0];
    const { primary, aliases } = parseNameCell(nameCell?.value || '');
    const rest = row.cells.slice(1);
    const present = ctx.present?.has(primary);
    return cardShell(row, {
        title: primary || nameCell?.value,
        sub: summaryLine(rest),
        lead: avatar(primary || nameCell?.value || ''),
        badges: present ? tag('在场', 'is-green') : '',
        open: ctx.isOpen(row),
        editable: ctx.editable,
        body: () => `${nameCell ? `<div class="v2u-grid">${field({ ...nameCell, header: nameCell.header || '角色名' }, { forceFull: true })}</div>` : ''}${aliases.length ? `<div class="v2u-note">外号：${esc(aliases.join('、'))}</div>` : ''}${fieldGrid(rest)}`,
    });
}

function genericCard(row, ctx) {
    const first = row.cells[0];
    return cardShell(row, {
        title: short(first?.value || '', 30),
        sub: summaryLine(row.cells.slice(1)),
        open: ctx.isOpen(row),
        editable: ctx.editable,
        body: () => fieldGrid(row.cells),
    });
}

function findCol(row, pattern) {
    return row.cells.find(cell => pattern.test(stripColumnMark(cell.header)));
}

function spacetimeView(data, ctx) {
    if (!data.rows.length) return emptyState(ctx);
    const last = data.rows[data.rows.length - 1];
    const date = findCol(last, /日期/), time = findCol(last, /时间/), place = findCol(last, /地点|位置|场景/), who = findCol(last, /此地角色|在场角色|角色/);
    const used = new Set([date, time, place, who].filter(Boolean));
    const others = last.cells.filter(cell => !used.has(cell));
    const names = clean(who?.value).split(/[、,，/|；;\s]+/).map(clean).filter(Boolean);
    const segs = clean(place?.value).split(/\s*[>＞›→]\s*|\s*\/\s*/).map(clean).filter(Boolean);
    const hero = `<article class="v2u-hero${last.changed ? ' is-changed' : ''}" data-row="${last.r}" data-head="${esc(last.head)}">
        <div class="v2u-hero-top"><span>现在</span>${last.changed ? NEW_TAG : ''}${rowMenuButton(ctx.editable)}</div>
        ${date ? `<button type="button" class="v2u-hero-date" data-cell="${esc(date.uid)}">${esc(date.value || '—')}</button>` : ''}
        ${time ? `<button type="button" class="v2u-hero-time" data-cell="${esc(time.uid)}">${esc(time.value || '—')}</button>` : ''}
        ${place ? `<button type="button" class="v2u-hero-block" data-cell="${esc(place.uid)}"><span class="v2u-f-k">${esc(stripColumnMark(place.header))}</span><span class="v2u-crumbs">${segs.length ? segs.map((seg, i) => `<span${i === segs.length - 1 ? ' class="is-last"' : ''}>${esc(seg)}</span>`).join('<i class="fa-solid fa-chevron-right"></i>') : '—'}</span></button>` : ''}
        ${who ? `<button type="button" class="v2u-hero-block" data-cell="${esc(who.uid)}"><span class="v2u-f-k">${esc(stripColumnMark(who.header))}</span><span class="v2u-people">${names.length ? names.map(name => `<span>${avatar(name, 'is-sm')}${esc(name)}</span>`).join('') : '—'}</span></button>` : ''}
        ${others.length ? `<div class="v2u-grid">${others.map(cell => field(cell)).join('')}</div>` : ''}
    </article>`;
    const earlier = data.rows.slice(0, -1);
    return hero + (earlier.length ? `<div class="v2u-sub">表里还有 ${earlier.length} 行（这张表一般只留一行）</div>${earlier.map(row => genericCard(row, ctx)).join('')}` : '');
}

function eventView(data, ctx) {
    const config = summaryConfig();
    const banner = config.enabled ? (() => {
        const left = Math.max(0, config.eventThreshold - data.rows.length);
        const pct = Math.min(100, (data.rows.length / config.eventThreshold) * 100);
        return `<div class="v2u-banner"><div><span><b>${data.rows.length}</b> / ${config.eventThreshold} 条</span><small>${left ? `再记 ${left} 条，程序会自动写一条大总结` : '已经够数，下次填表后会写大总结'}</small></div><span class="v2u-meter is-teal"><i style="width:${pct}%"></i></span></div>`;
    })() : '';
    const rows = ctx.page(data.rows.slice().reverse());
    const groups = [];
    for (const row of rows.list) {
        const date = findCol(row, /日期|时间/);
        const key = clean(date?.value).split(/\s+/)[0] || '没写日期';
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.key === key) lastGroup.rows.push(row); else groups.push({ key, rows: [row] });
    }
    const item = (row) => {
        const main = findCol(row, /事件|简述|内容|经过/) || row.cells[0];
        const metas = row.cells.filter(cell => cell !== main && cell.value);
        return `<li class="v2u-ev${row.changed ? ' is-changed' : ''}" data-row="${row.r}" data-head="${esc(row.head)}"><i class="v2u-ev-dot"></i>
            <div class="v2u-ev-main"><button type="button" class="v2u-ev-text${clean(main?.value).length > 120 ? ' v2u-clamp3' : ''}" data-cell="${esc(main?.uid)}">${esc(main?.value || '（空）')}</button>
            <div class="v2u-ev-meta">${metas.map(cell => `<button type="button" class="v2u-tag is-tap" data-cell="${esc(cell.uid)}" title="${esc(stripColumnMark(cell.header))}">${esc(short(cell.value, 16))}</button>`).join('')}${row.isNew ? tag('本楼新增', 'is-ac') : row.changed ? NEW_TAG : ''}</div></div>${rowMenuButton(ctx.editable)}</li>`;
    };
    return banner + groups.map(group => `<section class="v2u-day"><div class="v2u-day-head"><b>${esc(group.key)}</b><span>${group.rows.length} 条</span></div><ul>${group.rows.map(item).join('')}</ul></section>`).join('') + rows.more + (data.rows.length ? '' : emptyState(ctx));
}

const TIER_CLS = { '大': 'is-teal', '卷': 'is-blue', '篇': 'is-vio' };

function summaryView(data, ctx, archive = false) {
    const col = (row, name) => row.cells.find(cell => stripColumnMark(cell.header) === name);
    const tierOf = (row) => clean(col(row, '层级')?.value) || '大';
    let cover = '';
    if (!archive && data.rows.length) {
        const spans = { '篇': 0, '卷': 0, '大': 0 };
        let end = 0;
        for (const row of data.rows) {
            const nums = (clean(col(row, '楼层范围')?.value).match(/\d+/g) || []).map(Number);
            if (nums.length >= 2) { spans[tierOf(row)] = (spans[tierOf(row)] || 0) + Math.max(1, nums[1] - nums[0] + 1); end = Math.max(end, nums[1]); }
        }
        const total = Math.max(ctx.chatLength, end);
        const counted = Object.values(spans).reduce((a, b) => a + b, 0);
        if (counted) {
            const count = (tier) => data.rows.filter(row => tierOf(row) === tier).length;
            cover = `<div class="v2u-banner"><div><small>已总结到第 ${end} 楼</small><small>共 ${total} 楼</small></div>
                <span class="v2u-cover">${['篇', '卷', '大'].map(tier => spans[tier] ? `<i class="${TIER_CLS[tier]}" style="flex:${spans[tier]}"></i>` : '').join('')}<i style="flex:${Math.max(0, total - counted)}"></i></span>
                <div class="v2u-legend">${['篇', '卷', '大'].filter(count).map(tier => `<span><i class="${TIER_CLS[tier]}"></i>${tier} ${count(tier)}</span>`).join('')}</div></div>`;
        }
    }
    const rows = ctx.page(data.rows.slice().reverse());
    const card = (row) => {
        const content = col(row, '内容') || row.cells[0];
        const tier = tierOf(row);
        const range = col(row, '楼层范围'), roles = col(row, '涉及角色');
        const used = new Set([content, col(row, '层级'), range, roles].filter(Boolean));
        const names = clean(roles?.value).split(/[|｜、,，/；;]+/).map(clean).filter(Boolean);
        const others = row.cells.filter(cell => !used.has(cell) && cell.value);
        return `<article class="v2u-card is-open is-flat${row.changed ? ' is-changed' : ''}" data-row="${row.r}" data-head="${esc(row.head)}">
            <header class="v2u-card-head">
                <button type="button" class="v2u-tier ${TIER_CLS[tier] || 'is-teal'}" ${col(row, '层级') ? `data-cell="${esc(col(row, '层级').uid)}"` : ''}>${esc(tier.slice(0, 1))}</button>
                <button type="button" class="v2u-card-title is-tap" ${range ? `data-cell="${esc(range.uid)}"` : ''}><b>${range?.value ? `第 ${esc(range.value)} 楼` : '没写楼层范围'}</b></button>
                ${row.changed ? NEW_TAG : ''}${rowMenuButton(ctx.editable)}
            </header>
            <div class="v2u-card-body">
                <button type="button" class="v2u-f is-full is-long" data-cell="${esc(content?.uid)}"><span class="v2u-f-v v2u-clamp3">${esc(content?.value || '（空）')}</span>${clean(content?.value).length > LONG_LIMIT ? `<span class="v2u-more-link">共 ${clean(content?.value).length} 字 · 展开 <i class="fa-solid fa-chevron-right"></i></span>` : ''}</button>
                ${names.length ? `<button type="button" class="v2u-people is-tap" data-cell="${esc(roles.uid)}">${names.slice(0, 6).map(name => `<span>${avatar(name, 'is-sm')}${esc(name)}</span>`).join('')}${names.length > 6 ? `<span>等 ${names.length} 人</span>` : ''}</button>` : ''}
                ${others.length ? `<div class="v2u-grid">${others.map(cell => field(cell)).join('')}</div>` : ''}
            </div>
        </article>`;
    };
    return cover + rows.list.map(card).join('') + rows.more + (data.rows.length ? '' : emptyState(ctx));
}

function pairView(data, ctx) {
    const rows = ctx.page(data.rows);
    const card = (row) => {
        const [a, b, ...rest] = row.cells;
        const rel = rest.find(cell => /关系/.test(stripColumnMark(cell.header)) && columnMode(cell.header) !== 'append') || rest[0];
        const others = rest.filter(cell => cell !== rel);
        return `<article class="v2u-card is-open is-flat${row.changed ? ' is-changed' : ''}" data-row="${row.r}" data-head="${esc(row.head)}">
            <div class="v2u-pair">
                <button type="button" class="v2u-pair-who" data-cell="${esc(a?.uid)}">${avatar(a?.value || '', 'is-lg')}<b>${esc(parseNameCell(a?.value || '').primary || '—')}</b></button>
                <button type="button" class="v2u-pair-rel${rel?.changed ? ' is-changed' : ''}" ${rel ? `data-cell="${esc(rel.uid)}"` : ''}><span>${esc(short(rel?.value || '没写关系', 14))}</span><i></i></button>
                <button type="button" class="v2u-pair-who" data-cell="${esc(b?.uid)}">${avatar(b?.value || '', 'is-lg')}<b>${esc(parseNameCell(b?.value || '').primary || '—')}</b></button>
                ${rowMenuButton(ctx.editable)}
            </div>
            ${others.some(cell => cell.value) || ctx.editable ? `<div class="v2u-grid">${others.map(cell => field(cell, { forceFull: true })).join('')}</div>` : ''}
        </article>`;
    };
    return rows.list.map(card).join('') + rows.more + (data.rows.length ? '' : emptyState(ctx));
}

function taskView(data, ctx) {
    const rows = ctx.page(data.rows);
    const card = (row) => {
        const main = findCol(row, /任务|约定|命令|内容|事项/) || row.cells[1] || row.cells[0];
        const who = row.cells[0] !== main ? row.cells[0] : null;
        const others = row.cells.filter(cell => cell !== main && cell !== who);
        return `<article class="v2u-card is-open is-flat${row.changed ? ' is-changed' : ''}" data-row="${row.r}" data-head="${esc(row.head)}">
            <div class="v2u-task">
                ${ctx.editable ? `<button type="button" class="v2u-check" data-act="done" aria-label="做完了，删掉这一行"><i></i></button>` : '<span class="v2u-check is-static"><i></i></span>'}
                <div class="v2u-task-main"><button type="button" class="v2u-task-text" data-cell="${esc(main?.uid)}">${esc(main?.value || '（空）')}</button>
                ${who ? `<button type="button" class="v2u-people is-tap" data-cell="${esc(who.uid)}"><span>${avatar(who.value || '', 'is-sm')}${esc(parseNameCell(who.value || '').primary || '—')}</span></button>` : ''}</div>
                ${row.changed ? NEW_TAG : ''}${rowMenuButton(ctx.editable)}
            </div>
            <div class="v2u-grid">${others.map(cell => field(cell)).join('')}</div>
        </article>`;
    };
    return rows.list.map(card).join('') + rows.more + (data.rows.length ? '' : emptyState(ctx));
}

function itemView(data, ctx) {
    const rows = ctx.page(data.rows);
    const tile = (row) => {
        const name = findCol(row, /物品名|名称|名字|道具名/) || row.cells[0];
        const owner = findCol(row, /拥有|持有|主人|归属/);
        const others = row.cells.filter(cell => cell !== name && cell !== owner);
        return `<article class="v2u-tile${row.changed ? ' is-changed' : ''}" data-row="${row.r}" data-head="${esc(row.head)}">
            <div class="v2u-tile-head"><span class="v2u-tile-icon"><i class="fa-solid fa-cube"></i></span><button type="button" class="v2u-tile-name" data-cell="${esc(name?.uid)}">${esc(short(name?.value || '（没写名字）', 20))}</button>${rowMenuButton(ctx.editable)}</div>
            ${others.map(cell => `<button type="button" class="v2u-tile-line${cell.value ? '' : ' is-empty'}" data-cell="${esc(cell.uid)}"><small>${esc(stripColumnMark(cell.header))}</small><span class="v2u-clamp3">${esc(cell.value || '—')}</span></button>`).join('')}
            <div class="v2u-tile-foot">${owner ? `<button type="button" class="v2u-people is-tap" data-cell="${esc(owner.uid)}"><span>${avatar(owner.value || '', 'is-sm')}${esc(short(parseNameCell(owner.value || '').primary || '—', 8))}</span></button>` : '<span></span>'}${row.changed ? NEW_TAG : ''}</div>
        </article>`;
    };
    return `<div class="v2u-tiles">${rows.list.map(tile).join('')}</div>` + rows.more + (data.rows.length ? '' : emptyState(ctx));
}

function listView(data, ctx, card) {
    const rows = ctx.page(data.rows);
    return rows.list.map(row => card(row, ctx)).join('') + rows.more + (data.rows.length ? '' : emptyState(ctx));
}

function emptyState(ctx) {
    if (ctx.query) return `<div class="v2u-empty">没有搜到「${esc(ctx.query)}」</div>`;
    return `<div class="v2u-empty">这张表还没有内容${ctx.editable ? '，可以点上面的「加一行」' : ''}</div>`;
}

/**
 * 画出一张表的卡片视图
 * @param {ReturnType<typeof readSheet>} data
 * @param {{ editable: boolean, query: string, limit: number, openState: Map<string, boolean>, present: Set<string>|null, chatLength: number }} opts
 * @returns {string} HTML
 */
export function renderCards(data, opts) {
    const query = clean(opts.query).toLowerCase();
    const filtered = query ? { ...data, rows: data.rows.filter(row => row.cells.some(cell => cell.value.toLowerCase().includes(query))) } : data;
    const firstRow = filtered.rows[0]?.head;
    const ctx = {
        ...opts,
        query: opts.query,
        isOpen: (row) => {
            const key = `${data.sheet.uid}:${row.head}`;
            if (opts.openState.has(key)) return opts.openState.get(key);
            return row.head === firstRow || row.changed || filtered.rows.length <= 2 || !!query;
        },
        page: (rows) => {
            const list = rows.slice(0, opts.limit);
            const left = rows.length - list.length;
            return { list, more: left > 0 ? `<button type="button" class="v2u-btn is-wide" data-act="more">再显示 ${Math.min(PAGE, left)} 行（还有 ${left} 行）</button>` : '' };
        },
    };
    switch (filtered.kind) {
        case 'spacetime': return spacetimeView(filtered, ctx);
        case 'event': return eventView(filtered, ctx);
        case 'summary': return summaryView(filtered, ctx, false);
        case 'archive': return summaryView(filtered, ctx, true);
        case 'pair': return pairView(filtered, ctx);
        case 'task': return taskView(filtered, ctx);
        case 'item': return itemView(filtered, ctx);
        case 'person': return listView(filtered, ctx, personCard);
        default: return listView(filtered, ctx, genericCard);
    }
}

export const CARD_PAGE = PAGE;

/** 每类表顶上的一句说明 */
export function kindHint(data) {
    const { summaryTable, archiveTable } = summaryConfig();
    if (data.kind === 'summary') return `「${summaryTable}」由程序维护，AI 只读。写错了可以点开改字。`;
    if (data.kind === 'archive') return `被压缩掉的总结原文存在「${archiveTable}」，不会整张发给 AI，程序按本轮出场的人自动找回相关的旧事。`;
    return '';
}

import {DERIVED, EDITOR, SYSTEM, USER} from "../../core/manager.js";
import {getChatSheetsView} from "../editor/chatSheetsDataView.js";
import {getEditView, updateTableContainerPosition} from "../editor/tableTemplateEditView.js";
import {renderOverview, renderRoster} from "./drawerHome.js";
import {enhanceSettings} from "../settings/settingsLayout.js";

let tableDrawer = null;
let tableDrawerIcon = null;
let tableDrawerContent = null;
let appHeaderTableContainer = null;
let inlineDrawerHeaderContent = null;

let tableViewDom = null;
let tableEditDom = null;
let settingContainer = null;

/** 五个页面：按钮 id → 内容容器 */
const pages = {};
const TAB_KEY = 'v2u_tab';

let isEventListenersBound = false;
let currentTab = null;

/** 需要每次切过去都重画的页面 */
function refreshPage(name) {
    try {
        if (name === 'overview') renderOverview(pages.overview.content[0]);
        if (name === 'roles') renderRoster(pages.roles.content[0]);
    } catch (error) {
        console.warn('[记忆增强 v2] 页面刷新失败', name, error);
    }
}

/** 切到某个页面；已经在这一页时只刷新 */
export function switchDrawerTab(name) {
    const page = pages[name];
    if (!page) return false;
    if (currentTab !== name) {
        Object.entries(pages).forEach(([key, p]) => {
            p.button.toggleClass('is-on', key === name);
            p.content.css('display', key === name ? '' : 'none');
        });
        currentTab = name;
        try { localStorage.setItem(TAB_KEY, name); } catch (_) { }
        const scroller = appHeaderTableContainer?.[0];
        if (scroller) scroller.scrollTop = 0;
    }
    refreshPage(name);
    return true;
}

/** 抽屉打开着时，刷新当前页（表格变了之后调用） */
export function refreshDrawerHome() {
    if (!isEventListenersBound || !currentTab) return;
    if (!tableDrawerContent?.hasClass('openDrawer')) return;
    refreshPage(currentTab);
}

/**
 * 初始化应用头部表格抽屉 (只调用一次)
 */
export async function initAppHeaderTableDrawer() {
    if (isEventListenersBound) {
        return;
    }

    tableDrawer = $('#table_database_settings_drawer');
    tableDrawerIcon = $('#table_drawer_icon');
    tableDrawerContent = $('#table_drawer_content');
    appHeaderTableContainer = $('#app_header_table_container');
    inlineDrawerHeaderContent = $('#inline_drawer_header_content');

    $('.fa-panorama').removeClass('fa-panorama').addClass('fa-image');
    $('.fa-user-cog').removeClass('fa-user-cog').addClass('fa-user');

    if (tableViewDom === null) {
        tableViewDom = await getChatSheetsView(-1);
    }
    if (tableEditDom === null) {
        tableEditDom = $(`<div style=""></div>`);
        tableEditDom.append(await getEditView(-1));
    }
    if (settingContainer === null) {
        const header = $(`<div></div>`).append($(`<div class="v2u-setting-head"></div>`).append(inlineDrawerHeaderContent));
        settingContainer = header.append($('.memory_enhancement_container').find('#memory_enhancement_settings_inline_drawer_content'));
    }

    const make = (id, cls = '') => $(`<div id="${id}" class="v2u-page ${cls}" style="display: none;"></div>`);
    pages.overview = { button: $('#overview_button'), content: make('overview-content') };
    pages.database = { button: $('#database_button'), content: make('database-content').append(tableViewDom) };
    pages.roles = { button: $('#roles_button'), content: make('roles-content') };
    pages.editor = { button: $('#editor_button'), content: make('editor-content').append(tableEditDom) };
    pages.setting = { button: $('#setting_button'), content: make('setting-content').append(settingContainer) };
    Object.values(pages).forEach(p => appHeaderTableContainer.append(p.content));

    try { enhanceSettings(settingContainer[0]); } catch (error) { console.warn('[记忆增强 v2] 设置页分组失败，按原样显示', error); }

    $('#tableUpdateTag').click(function() {
        $('#extensions_details').trigger('click');
    });

    Object.entries(pages).forEach(([name, p]) => {
        p.button.on('click', () => switchDrawerTab(name));
    });

    // 每次点开抽屉，把当前页刷新一下（总览、角色的数据是跟着聊天变的）
    $('#table_database_settings_drawer .drawer-toggle').on('click', () => {
        setTimeout(() => { if (tableDrawerContent.hasClass('openDrawer')) refreshPage(currentTab); }, 350);
    });

    isEventListenersBound = true;

    let first = 'overview';
    try { const saved = localStorage.getItem(TAB_KEY); if (saved && pages[saved]) first = saved; } catch (_) { }
    switchDrawerTab(first);

    // 移除旧版本元素 (只执行一次)
    $('.memory_enhancement_container').remove();
}

/**
 * 打开/关闭应用头部表格抽屉 (保持不变)
 */
export async function openAppHeaderTableDrawer(target = undefined) {
    if (!isEventListenersBound) {
        await initAppHeaderTableDrawer();
    }

    if (tableDrawerIcon.hasClass('closedIcon')) {
        // 关闭其他抽屉
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
        $('.openIcon').not('#table_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

        // 打开当前抽屉
        tableDrawerIcon.toggleClass('closedIcon openIcon');
        tableDrawerContent.toggleClass('closedDrawer openDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });

        if (target && pages[target]) switchDrawerTab(target);
    } else {
        // 关闭当前抽屉
        tableDrawerIcon.toggleClass('openIcon closedIcon');
        tableDrawerContent.toggleClass('openDrawer closedDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
    }
}

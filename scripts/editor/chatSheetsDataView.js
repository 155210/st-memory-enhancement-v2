import { summaryConfig } from '../../core/summaryManager.js';
import { V2 } from '../../core/v2keys.js';
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { findNextChatWhitTableData, undoSheets } from "../../index.js";
import { rebuildSheets } from "../runtime/absoluteRefresh.js";
import { openTableHistoryPopup } from "./tableHistory.js";
import { PopupMenu } from "../../components/popupMenu.js";
import { openTableStatisticsPopup } from "./tableStatistics.js";
import { openCellHistoryPopup } from "./cellHistory.js";
import { openSheetStyleRendererPopup } from "./sheetStyleEditor.js";
import { Cell } from "../../core/table/cell.js";
import { asEntries, kindHint, readSheet, renderCards } from "./sheetCards.js";
// 和 sheetCards.js 里的每页行数一致；不从那边导入，免得模块互相引用时拿不到值
const CARD_PAGE = 30;
import { closeBottomSheet, esc, openActionSheet, openBottomSheet } from "./bottomSheet.js";
import { computeTiers } from "../../core/sendTiers.js";
import { stripColumnMark } from "../../core/rowIdentity.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
let editModeSelectedRows = []
let viewSheetsContainer = null
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}

/**
 * 复制表格
 * @param {*} tables 所有表格数据
 */
export async function copyTable() {
    copyTableData = JSON.stringify(getTableJson({ type: 'chatSheets', version: 1 }))
    if (!copyTableData) return
    $('#table_drawer_icon').click()

    EDITOR.confirm(`正在复制表格数据 (#${SYSTEM.generateRandomString(4)})`, '取消', '粘贴到当前对话').then(async (r) => {
        if (r) {
            await pasteTable()
        }
        if ($('#table_drawer_icon').hasClass('closedIcon')) {
            $('#table_drawer_icon').click()
        }
    })
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} viewSheetsContainer 表格容器DOM
 */
async function pasteTable() {
    if (USER.getContext().chat.length === 0) {
        EDITOR.error("没有记录载体，表格是保存在聊天记录中的，请聊至少一轮后再重试")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('粘贴会清空原有的表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            if (!tables.mate === 'chatSheets') return EDITOR.error("导入失败：文件格式不正确")
            BASE.applyJsonToChatSheets(tables)
            await renderSheetsDOM()
            EDITOR.success('粘贴成功')
        } else {
            EDITOR.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 导入表格
 * @param {number} mesId 需要导入表格的消息id
 */
async function importTable(mesId, viewSheetsContainer) {
    if (mesId === -1) {
        EDITOR.error("没有记录载体，表格是保存在聊天记录中的，请聊至少一轮后再重试")
        return
    }

    // 1. 创建一个 input 元素，类型设置为 'file'，用于文件选择
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // 设置 accept 属性，限制只能选择 JSON 文件，提高用户体验
    fileInput.accept = '.json';

    // 2. 添加事件监听器，监听文件选择的变化 (change 事件)
    fileInput.addEventListener('change', function (event) {
        // 获取用户选择的文件列表 (FileList 对象)
        const files = event.target.files;

        // 检查是否选择了文件
        if (files && files.length > 0) {
            // 获取用户选择的第一个文件 (这里假设只选择一个 JSON 文件)
            const file = files[0];

            // 3. 创建 FileReader 对象，用于读取文件内容
            const reader = new FileReader();

            // 4. 定义 FileReader 的 onload 事件处理函数
            // 当文件读取成功后，会触发 onload 事件
            reader.onload = async function (loadEvent) {
                const button = { text: '导入模板及数据', result: 3 }
                const popup = new EDITOR.Popup("请选择导入的部分", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "导入模板及数据", cancelButton: "取消" });
                const result = await popup.show()
                if (result) {
                    const tables = JSON.parse(loadEvent.target.result)
                    console.log("导入内容", tables, tables.mate, !(tables.mate === 'chatSheets'))
                    if (!(tables.mate?.type === 'chatSheets')) return EDITOR.error("导入失败：文件格式不正确", "请检查你导入的是否是表格数据")
                    if (result === 3)
                        BASE.applyJsonToChatSheets(tables, "data")
                    else
                        BASE.applyJsonToChatSheets(tables)
                    await renderSheetsDOM()
                    EDITOR.success('导入成功')
                }
            };
            reader.readAsText(file, 'UTF-8'); // 建议指定 UTF-8 编码，确保中文等字符正常读取
        }
    });
    fileInput.click();
}

/**
 * 导出表格
 * @param {Array} tables 所有表格数据
 */
async function exportTable() {
    const jsonTables = getTableJson({ type: 'chatSheets', version: 1 })
    if (!jsonTables) return
    const bom = '\uFEFF';
    const blob = new Blob([bom + JSON.stringify(jsonTables)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    const chatId = USER.getContext().chatId;
    const round = USER.getContext().chat.length - 1;
    downloadLink.download = `${chatId}_${round}_table_data.json`;
    document.body.appendChild(downloadLink); // 必须添加到 DOM 才能触发下载
    downloadLink.click();
    document.body.removeChild(downloadLink); // 下载完成后移除

    URL.revokeObjectURL(url); // 释放 URL 对象

    EDITOR.success('已导出');
}

/**
 * 获取表格Json数据
 */
function getTableJson(mate) {
    if (!DERIVED.any.renderingSheets || DERIVED.any.renderingSheets.length === 0) {
        EDITOR.warning('当前表格没有数据，无法导出');
        return;
    }
    const sheets = DERIVED.any.renderingSheets.filter(sheet => sheet.enable)
    // const csvTables = sheets.map(sheet => "SHEET-START" + sheet.uid + "\n" + sheet.getSheetCSV(false) + "SHEET-END").join('\n')
    const jsonTables = {}
    sheets.forEach(sheet => {
        jsonTables[sheet.uid] = sheet.getJson()
    })
    jsonTables.mate = mate
    return jsonTables
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} viewSheetsContainer 表格容器DOM
 */
async function clearTable(mesId, viewSheetsContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('清空当前对话的所有表格数据，并重置历史记录，该操作无法回退，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        await USER.getContext().chat.forEach((piece => {
            // 只清 v2 自己的数据，原版的 hash_sheets / dataTable 不动
            if (piece[V2.pieceHash]) {
                delete piece[V2.pieceHash]
            }
        }))
        // 清空后不再回读导入前楼层的原版快照
        delete USER.getContext().chatMetadata[V2.chatImport]
        setTimeout(() => {
            USER.saveSettings()
            USER.saveChat();
            refreshContextView()
            EDITOR.success("表格数据清除成功")
            console.log("已清除表格数据")
        }, 100)
    }
}

/**
 * 设置表格编辑Tips
 * @param {Element} tableEditTips 表格编辑提示DOM
 */
function setTableEditTips(tableEditTips) {
    /* if (!tableEditTips || tableEditTips.length === 0) {
        console.error('tableEditTips is null or empty jQuery object');
        return;
    }
    const tips = $(tableEditTips); // 确保 tableEditTips 是 jQuery 对象
    tips.empty();
    if (USER.tableBaseSetting.isExtensionAble === false) {
        tips.append('目前插件已关闭，将不会要求AI更新表格。');
        tips.css("color", "rgb(211 39 39)");
    } else if (userTableEditInfo.editAble) {
        tips.append('点击单元格选择编辑操作。绿色单元格为本轮插入，蓝色单元格为本轮修改。');
        tips.css("color", "lightgreen");
    } else {
        tips.append('此表格为中间表格，为避免混乱，不可被编辑和粘贴。你可以打开最新消息的表格进行编辑');
        tips.css("color", "lightyellow");
    } */
}

async function cellDataEdit(cell) {
    const result = await EDITOR.callGenericPopup("编辑单元格", EDITOR.POPUP_TYPE.INPUT, cell.data.value, { rows: 3 })
    if (result) {
        cell.editCellData({ value: result })
        refreshContextView();
        if (cell.type === Cell.CellType.column_header) BASE.refreshTempView(true)
    }
}


async function columnDataEdit(cell) {
    const columnEditor = `
<div class="column-editor">
    <div class="column-editor-header">
        <h3>编辑列数据</h3>
    </div>
    <div class="column-editor-body">
        <div class="column-editor-content">
            <label for="column-editor-input">列数据:</label>
            <textarea id="column-editor-input" rows="5"></textarea>
        </div>
    </div>
</div>
`
    const columnCellDataPopup = new EDITOR.Popup(columnEditor, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "应用修改", cancelButton: "取消" });
    const historyContainer = $(columnCellDataPopup.dlg)[0];

    await columnCellDataPopup.show();

    if (columnCellDataPopup.result) {
        // cell.editCellData({ value: result })
        refreshContextView();
    }
}

function batchEditMode(cell) {
    DERIVED.any.batchEditMode = true;
    DERIVED.any.batchEditModeSheet = cell.parent;
    EDITOR.confirm(`正在编辑 #${cell.parent.name} 的行`, '取消', '完成').then((r) => {
        DERIVED.any.batchEditMode = false;
        DERIVED.any.batchEditModeSheet = null;
        renderSheetsDOM();
    })
    renderSheetsDOM();
}

// 新的事件处理函数
export function cellClickEditModeEvent(cell) {
    cell.element.style.cursor = 'pointer'
    if (cell.type === Cell.CellType.row_header) {
        cell.element.textContent = ''

        // 在 cell.element 中添加三个 div，一个用于显示排序，一个用于显示锁定按钮，一个用于显示删除按钮
        const containerDiv = $(`<div class="flex-container" style="display: flex; flex-direction: row; justify-content: space-between; width: 100%;"></div>`)
        const rightDiv = $(`<div class="flex-container" style="margin-right: 3px"></div>`)
        const indexDiv = $(`<span class="menu_button_icon interactable" style="margin: 0; padding: 0 6px; cursor: move; color: var(--SmartThemeBodyColor)">${cell.position[0]}</span>`)
        const lockDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-lock" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)
        const deleteDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-xmark redWarningBG" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)

        $(lockDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (cell._pre_deletion) return

            cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target.locked = !target.locked
                        target.element.style.backgroundColor = target.locked ? '#00ff0022' : ''
                    })
                }
            })
        })
        $(deleteDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleAction(cell, Cell.CellAction.deleteSelfRow)
            //if (cell.locked) return

            /* cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target._pre_deletion = !target._pre_deletion
                        target.element.style.backgroundColor = target._pre_deletion ? '#ff000044' : ''
                    })
                }
            }) */
        })

        $(rightDiv).append(deleteDiv)
        $(containerDiv).append(indexDiv).append(rightDiv)
        $(cell.element).append(containerDiv)

    } else if (cell.type === Cell.CellType.cell) {
        cell.element.style.cursor = 'text'
        cell.element.contentEditable = true
        cell.element.focus()
        cell.element.addEventListener('blur', (e) => {
            e.stopPropagation();
            e.preventDefault();
            cell.data.value = cell.element.textContent.trim()
        })
    }

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        const sheet = cell.parent;
        const element = event.currentTarget;
        const rowElement = element.parentElement;

        if (sheet.currentHighlightedCell === element) {
            return;
        }

        // 备份当前cell的style，以便在失焦时恢复
        const originalCellStyle = element.style.cssText;
        const originalRowStyle = rowElement ? rowElement.style.cssText : '';

        // 高亮cell
        //element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        //element.style.color = 'var(--SmartThemeQuoteColor)';
        element.style.outline = '2px solid var(--SmartThemeQuoteColor)';
        element.style.zIndex = '999';
        if (rowElement) {
            rowElement.style.outline = '2px dashed var(--SmartThemeQuoteColor)';
        }
        sheet.currentHighlightedCell = element;

        // 失焦
        const onBlur = () => {
            element.style.cssText = originalCellStyle;
            if (rowElement) {
                rowElement.style.cssText = originalRowStyle;
            }
            element.removeEventListener('blur', onBlur); // 执行一次后自动销毁监听器
        };

        element.addEventListener('blur', onBlur);
    })
}

async function confirmAction(event, text = '是否继续该操作？') {
    const confirmation = new EDITOR.Popup(text, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });

    await confirmation.show();
    if (!confirmation.result) return { filterData: null, confirmation: false };
    event()
}

async function cellHistoryView(cell) {
    await openCellHistoryPopup(cell)
}

/**
 * 自定义表格样式事件
 * @param {*} cell
 */
async function customSheetStyle(cell) {
    await openSheetStyleRendererPopup(cell.parent)
    await refreshContextView();
}

function cellClickEvent(cell) {
    cell.element.style.cursor = 'pointer'

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        // 重新获取hash
        BASE.getLastestSheets()

        const sheet = cell.parent;
        const element = event.currentTarget;
        const rowElement = element.parentElement;
        if (sheet.currentPopupMenu) {
            if (sheet.currentHighlightedCell === element) {
                return;
            }
            sheet.currentPopupMenu.destroy();
            sheet.currentPopupMenu = null;
            await Promise.resolve();
        }
        sheet.currentPopupMenu = new PopupMenu();

        const menu = sheet.currentPopupMenu;
        const [rowIndex, colIndex] = cell.position;
        const sheetType = sheet.type;

        if (rowIndex === 0 && colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 批量行编辑', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', () => handleAction(cell, Cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', () => handleAction(cell, Cell.CellAction.insertDownRow));
            menu.add('<i class="fa-solid fa-wand-magic-sparkles"></i> 自定义表格样式', async () => customSheetStyle(cell));
        } else if (colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 批量行编辑', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-up"></i> 向上插入行', () => handleAction(cell, Cell.CellAction.insertUpRow));
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', () => handleAction(cell, Cell.CellAction.insertDownRow));
            menu.add('<i class="fa fa-trash-alt"></i> 删除行', () => handleAction(cell, Cell.CellAction.deleteSelfRow), menu.ItemType.warning)
        } else if (rowIndex === 0) {
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该列', async () => await cellDataEdit(cell));
            menu.add('<i class="fa fa-arrow-left"></i> 向左插入列', () => handleAction(cell, Cell.CellAction.insertLeftColumn));
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', () => handleAction(cell, Cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-trash-alt"></i> 删除列', () => confirmAction(() => { handleAction(cell, Cell.CellAction.deleteSelfColumn) }, '确认删除列？'), menu.ItemType.warning);
        } else {
            menu.add('<i class="fa-solid fa-up-right-and-down-left-from-center"></i> 查看全文', () => openCellReader(cell.parent, cell.uid));
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async () => await cellDataEdit(cell));
            menu.add('<i class="fa-solid fa-clock-rotate-left"></i> 单元格历史记录', async () => await cellHistoryView(cell));
        }

        // 设置弹出菜单后的一些非功能性派生操作，这里必须使用setTimeout，否则会导致菜单无法正常显示
        setTimeout(() => {

        }, 0)

        // 备份当前cell的style，以便在菜单关闭时恢复
        const originalCellStyle = element.style.cssText;
        const originalRowStyle = rowElement ? rowElement.style.cssText : '';

        // 获取单元格位置
        const rect = element.getBoundingClientRect();
        const tableRect = viewSheetsContainer.getBoundingClientRect();

        // 计算菜单位置（相对于表格容器）
        const menuLeft = rect.left - tableRect.left;
        const menuTop = rect.bottom - tableRect.top;
        const menuElement = menu.renderMenu();
        $(viewSheetsContainer).append(menuElement);

        // 高亮cell
        //element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        //element.style.color = 'var(--SmartThemeQuoteColor)';
        element.style.outline = '2px solid var(--SmartThemeQuoteColor)';
        element.style.zIndex = '999';
        if (rowElement) {
            rowElement.style.outline = '2px dashed var(--SmartThemeQuoteColor)';
        }
        sheet.currentHighlightedCell = element;

        const originalDestroy = menu.destroy;
        menu.destroy = function () {
            element.style.cssText = originalCellStyle;
            if (rowElement) {
                rowElement.style.cssText = originalRowStyle;
            }
            if (sheet.currentHighlightedCell === element) {
                sheet.currentHighlightedCell = null;
            }
            if (originalDestroy) {
                originalDestroy.call(this);
            }
        };
        menu.show(menuLeft, menuTop);
        menu.frameUpdate((menu) => {
            // 重新定位菜单
            const rect = element.getBoundingClientRect();
            const tableRect = viewSheetsContainer.getBoundingClientRect();

            // 计算菜单位置（相对于表格容器）
            const menuLeft = rect.left - tableRect.left;
            const menuTop = rect.bottom - tableRect.top;
            menu.popupContainer.style.left = `${menuLeft}px`;
            menu.popupContainer.style.top = `${menuTop + 3}px`;
        })
    })
    cell.on('', () => {
        console.log('cell发生了改变:', cell)
    })
}

function handleAction(cell, action) {
    cell.newAction(action)
    refreshContextView();
    if (cell.type === Cell.CellType.column_header) BASE.refreshTempView(true)
}

// ---------------------------------------------------------------- v2 表格页：一次只画一张表

const VIEW_KEY = 'v2u_view';
const SHEET_KEY = 'v2u_sheet';
const lsGet = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { } };

const page = {
    root: null,
    sheets: [],
    data: new Map(),          // sheet.uid → readSheet 的结果
    sheetUid: null,
    view: lsGet(VIEW_KEY) === 'wide' ? 'wide' : 'card',
    query: '',
    limit: CARD_PAGE,
    openState: new Map(),     // `${sheetUid}:${行首 uid}` → 手动展开 / 收起
    present: null,
};

const editable = () => DERIVED.any.isRenderLastest === true && DERIVED.any.batchEditMode !== true;

/** 上一楼每张表里的格子 uid，用来标「本楼改了什么」；和宽表高亮用同一个来源，只读不写 */
function prevCellSets() {
    const deep = DERIVED.any.renderDeep;
    if (typeof deep !== 'number' || deep <= 0) return null;
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

function $in(selector) {
    return page.root?.querySelector(selector) || null;
}

/** 画表格页：楼层、表的标签、当前这张表 */
async function renderDataPage(sheets) {
    page.sheets = (sheets || []).filter(sheet => sheet.enable);
    const prev = prevCellSets();
    page.data = new Map(page.sheets.map(sheet => [sheet.uid, readSheet(sheet, prev ? (prev.get(sheet.uid) ?? null) : null)]));
    try { page.present = computeTiers(page.sheets)?.present ?? null; } catch (_) { page.present = null; }
    if (!page.data.has(page.sheetUid)) {
        const saved = lsGet(SHEET_KEY);
        page.sheetUid = page.data.has(saved) ? saved : (page.sheets[0]?.uid ?? null);
    }
    drawChrome();
    await drawSheet();
}

function drawChrome() {
    if (!page.root) return;
    const deep = DERIVED.any.renderDeep;
    const latest = DERIVED.any.isRenderLastest === true;
    const hasData = page.sheets.length > 0;
    const indicator = $in('#table_indicator');
    if (indicator) indicator.textContent = !hasData ? '还没有表格' : latest ? `第 ${deep} 楼 · 最新` : `第 ${deep} 楼`;
    const tip = $in('#v2u_old_floor_tip');
    if (tip) {
        tip.style.display = hasData && !latest ? '' : 'none';
        tip.textContent = `这是第 ${deep} 楼当时的表格，只能看，不能改。`;
    }
    const latestButton = $in('#table_latest_button');
    if (latestButton) latestButton.style.display = hasData && !latest ? '' : 'none';
    const chips = $in('#v2u_sheet_chips');
    if (chips) {
        chips.innerHTML = page.sheets.map(sheet => {
            const data = page.data.get(sheet.uid);
            return `<button type="button" class="v2u-chip${sheet.uid === page.sheetUid ? ' is-on' : ''}" data-sheet="${esc(sheet.uid)}"><span>${esc(sheet.name)}</span><small>${data.rows.length}</small>${data.changed ? '<i class="v2u-dot" title="本楼有改动"></i>' : ''}</button>`;
        }).join('');
        chips.querySelector('.is-on')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    }
    const add = $in('#v2u_add_row');
    if (add) add.disabled = !editable() || !page.sheetUid;
    page.root.querySelectorAll('#v2u_view_switch button').forEach(button => button.classList.toggle('is-on', button.dataset.view === page.view));
    const info = $in('#v2u_sheet_info');
    const data = page.data.get(page.sheetUid);
    if (info) info.textContent = data ? `${data.rows.length} 行 ${data.headers.length} 列${data.changed ? `，本楼改了 ${data.changed} 行` : ''}` : '';
}

/** 宽表里的长格子：固定显示两行，角上标字数，点格子从菜单里「查看全文」 */
function clampWideCells(table) {
    table.querySelectorAll('td.sheet-cell-other').forEach(td => {
        const text = td.textContent || '';
        if (text.length <= 40) return;
        td.textContent = '';
        td.classList.add('v2u-td-long');
        const box = document.createElement('div');
        box.className = 'v2u-td-clamp';
        box.textContent = text;
        const count = document.createElement('span');
        count.className = 'v2u-td-count';
        count.textContent = `${text.length} 字`;
        td.append(box, count);
    });
}

async function drawSheet() {
    if (!viewSheetsContainer) return;
    const batch = DERIVED.any.batchEditMode === true;
    let data = page.data.get(page.sheetUid);
    if (batch) {
        const target = page.sheets.find(sheet => sheet.name === DERIVED.any.batchEditModeSheet?.name);
        if (target) data = page.data.get(target.uid);
    }
    $(viewSheetsContainer).empty();
    viewSheetsContainer.style.paddingBottom = '24px';
    if (!data) {
        viewSheetsContainer.innerHTML = `<div class="v2u-empty">这个聊天还没有表格。正常聊一轮，AI 回复后表格会自动出现。</div>`;
        return;
    }
    if (page.view === 'wide' || batch) {
        const handler = batch ? cellClickEditModeEvent : (DERIVED.any.isRenderLastest ? cellClickEvent : () => { });
        const element = await data.sheet.renderSheet(handler);
        const wrap = document.createElement('div');
        wrap.className = 'v2u-wide table-directory-sheet-container';
        wrap.dataset.sheetUid = data.sheet.uid;
        wrap.append(element);
        if (!batch) clampWideCells(element);
        viewSheetsContainer.append(wrap);
        return;
    }
    const hint = kindHint(data);
    viewSheetsContainer.innerHTML = `${hint ? `<div class="v2u-tip is-info">${esc(hint)}</div>` : ''}<div class="v2u-cards" data-kind="${data.kind}">${renderCards(data, {
        editable: editable(),
        query: page.query,
        limit: page.limit,
        openState: page.openState,
        present: page.present,
        chatLength: USER.getContext().chat?.length || 0,
    })}</div>`;
}

/** 切到某张表（给「跳到原表」用）：传表名或 uid */
export async function selectSheet(nameOrUid) {
    const sheet = page.sheets.find(s => s.uid === nameOrUid) || page.sheets.find(s => s.name === nameOrUid);
    if (!sheet) return false;
    page.sheetUid = sheet.uid;
    page.query = '';
    page.limit = CARD_PAGE;
    const search = $in('#v2u_sheet_search');
    if (search) search.value = '';
    lsSet(SHEET_KEY, sheet.uid);
    drawChrome();
    await drawSheet();
    return true;
}

/** 当前这张表里的格子（只在最新一楼可改时返回，动手之前先把表对齐到最新一楼） */
function liveCell(uid) {
    if (!editable()) return null;
    BASE.getLastestSheets();
    const sheet = page.data.get(page.sheetUid)?.sheet;
    return sheet?.cells.get(uid) || null;
}

function rowTitleOf(data, row) {
    const first = row?.cells.find(cell => cell.value);
    return first ? first.value.split('\n')[0].slice(0, 24) : `第 ${row?.r ?? '?'} 行`;
}

/**
 * 整屏阅读一格：长内容在这里看全文、按条目看、搜索、编辑
 * @param {Object} sheet 表格实例
 * @param {string} uid 格子的 uid
 */
export function openCellReader(sheet, uid) {
    const cell = sheet?.cells.get(uid);
    if (!cell) return;
    const data = page.data.get(sheet.uid);
    const row = data?.rows.find(r => r.cells.some(c => c.uid === uid));
    const info = row?.cells.find(c => c.uid === uid);
    const header = info?.header ?? '';
    const text = String(cell.data?.value ?? '');
    const entries = asEntries(header, text) || [];
    const canEdit = editable();
    const body = document.createElement('div');
    body.className = 'v2u-reader';
    let mode = entries.length ? 'entries' : 'raw';
    let query = '';

    const paint = () => {
        const key = query.trim().toLowerCase();
        const hit = (s) => !key || s.toLowerCase().includes(key);
        const tools = (entries.length || text.length > 200) ? `<div class="v2u-reader-tools">
            <label class="v2u-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="在这一格里搜" value="${esc(query)}" autocomplete="off"></label>
            ${entries.length ? `<div class="v2u-seg"><button type="button" data-mode="entries" class="${mode === 'entries' ? 'is-on' : ''}">条目</button><button type="button" data-mode="raw" class="${mode === 'raw' ? 'is-on' : ''}">原文</button></div>` : ''}
        </div>` : '';
        let content;
        if (mode === 'entries') {
            const list = entries.map((entry, i) => ({ entry, n: i + 1 })).reverse().filter(x => hit(x.entry));
            content = list.length ? `<ol class="v2u-reader-list">${list.map((x, i) => `<li${i === 0 && !key && info?.changed ? ' class="is-new"' : ''}><span>${x.n}</span><p>${esc(x.entry)}</p></li>`).join('')}</ol>` : `<div class="v2u-empty">没有搜到</div>`;
        } else {
            content = text ? `<div class="v2u-reader-text">${key ? esc(text).split(new RegExp(`(${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i')).map((part, i) => i % 2 ? `<mark>${part}</mark>` : part).join('') : esc(text)}</div>` : `<div class="v2u-empty">这一格是空的${canEdit ? '，点下面的「编辑」填写' : ''}</div>`;
        }
        const keepFocus = document.activeElement?.matches?.('.v2u-reader-tools input');
        body.innerHTML = tools + content;
        if (keepFocus) { const input = body.querySelector('.v2u-reader-tools input'); input?.focus(); input?.setSelectionRange?.(query.length, query.length); }
    };

    const actionsRead = () => [
        { label: '复制', icon: 'fa-copy', grow: false, onClick: () => { navigator.clipboard?.writeText(text).then(() => EDITOR.success('已复制'), () => EDITOR.error('复制失败，请长按文字手动复制')); } },
        { label: '修改历史', icon: 'fa-clock-rotate-left', onClick: () => { closeBottomSheet(); openCellHistoryPopup(cell); } },
        ...(canEdit ? [{ label: '编辑', icon: 'fa-pen', kind: 'primary', onClick: startEdit }] : []),
    ];

    const sheetUi = openBottomSheet({
        title: stripColumnMark(header) || '格子',
        sub: [rowTitleOf(data, row), entries.length ? `${entries.length} 条` : '', `${text.length} 字`].filter(Boolean).join(' · '),
        body,
        actions: [],
    });
    if (!sheetUi) return cellDataEdit(cell);   // 抽屉没打开时退回原来的输入框

    function startEdit() {
        body.innerHTML = `<textarea class="v2u-reader-edit" spellcheck="false"></textarea>${entries.length ? `<div class="v2u-note">这一列是一条一条往后加的，新内容写在最后面，用「；」隔开。</div>` : ''}`;
        const area = body.querySelector('textarea');
        area.value = text;
        setTimeout(() => { area.focus(); area.setSelectionRange(area.value.length, area.value.length); }, 30);
        sheetUi.setActions([
            { label: '取消', onClick: () => { paint(); sheetUi.setActions(actionsRead()); } },
            {
                label: '保存', icon: 'fa-check', kind: 'primary', onClick: () => {
                    const value = area.value;
                    const live = liveCell(uid);
                    if (!live) return EDITOR.error('现在看的不是最新一楼的表格，不能改');
                    closeBottomSheet();
                    if (value === text) return;
                    live.editCellData({ value });
                    refreshContextView();
                },
            },
        ]);
    }

    body.addEventListener('input', (event) => {
        if (!event.target.matches('.v2u-reader-tools input')) return;
        query = event.target.value;
        paint();
    });
    body.addEventListener('click', (event) => {
        const button = event.target.closest('[data-mode]');
        if (!button) return;
        mode = button.dataset.mode;
        paint();
    });
    paint();
    sheetUi.setActions(actionsRead());
    if (canEdit && !text) startEdit();
}

function rowAction(headUid, action) {
    const cell = liveCell(headUid);
    if (!cell) return EDITOR.error('现在看的不是最新一楼的表格，不能改');
    handleAction(cell, action);
}

function openRowMenu(headUid) {
    const data = page.data.get(page.sheetUid);
    const row = data?.rows.find(r => r.head === headUid);
    if (!row) return;
    openActionSheet('这一行', [
        { label: '在上面加一行', icon: 'fa-arrow-up', onClick: () => rowAction(headUid, Cell.CellAction.insertUpRow) },
        { label: '在下面加一行', icon: 'fa-arrow-down', onClick: () => rowAction(headUid, Cell.CellAction.insertDownRow) },
        { label: '删掉这一行', icon: 'fa-trash-can', danger: true, hint: '之前楼层的表格不受影响', onClick: () => confirmAction(() => rowAction(headUid, Cell.CellAction.deleteSelfRow), `确认删掉「${rowTitleOf(data, row)}」这一行？`) },
    ], rowTitleOf(data, row));
}

function addRow() {
    const data = page.data.get(page.sheetUid);
    if (!data || !editable()) return;
    BASE.getLastestSheets();
    const hash = data.sheet.hashSheet || [];
    const lastHead = hash[hash.length - 1]?.[0];
    const cell = data.sheet.cells.get(lastHead);
    if (!cell) return EDITOR.error('这张表的结构不完整，加不了行');
    page.query = '';
    page.limit = Math.max(page.limit, hash.length + 1);
    handleAction(cell, Cell.CellAction.insertDownRow);
}

/** 绑定表格页的事件（只绑一次，全部用事件委托） */
function bindDataPage(root) {
    page.root = root;
    let searchTimer = null;
    root.addEventListener('click', (event) => {
        const chip = event.target.closest('#v2u_sheet_chips [data-sheet]');
        if (chip) return void selectSheet(chip.dataset.sheet);
        const viewButton = event.target.closest('#v2u_view_switch [data-view]');
        if (viewButton) {
            page.view = viewButton.dataset.view === 'wide' ? 'wide' : 'card';
            lsSet(VIEW_KEY, page.view);
            drawChrome();
            return void drawSheet();
        }
        if (event.target.closest('#v2u_add_row')) return void EDITOR.tryBlock(addRow, '加一行失败');
        if (event.target.closest('#v2u_more_button')) {
            const panel = $in('#v2u_more_panel');
            panel.style.display = panel.style.display === 'none' ? '' : 'none';
            return;
        }
        if (event.target.closest('#table_latest_button')) {
            const input = $in('#table_jump_input');
            if (input) input.value = '';
            return void renderSheetsDOM(-1);
        }
        if (!viewSheetsContainer?.contains(event.target) || page.view === 'wide' || DERIVED.any.batchEditMode === true) return;
        const hit = event.target.closest('[data-cell], [data-act]');
        if (!hit) return;
        const data = page.data.get(page.sheetUid);
        if (!data) return;
        if (hit.dataset.cell) return void openCellReader(data.sheet, hit.dataset.cell);
        const article = hit.closest('[data-head]');
        const head = article?.dataset.head;
        switch (hit.dataset.act) {
            case 'toggle': {
                if (!head) return;
                page.openState.set(`${data.sheet.uid}:${head}`, !article.classList.contains('is-open'));
                return void drawSheet();
            }
            case 'rowmenu': return void openRowMenu(head);
            case 'done': {
                const row = data.rows.find(r => r.head === head);
                return void confirmAction(() => rowAction(head, Cell.CellAction.deleteSelfRow), `「${rowTitleOf(data, row)}」做完了，从表里删掉？`);
            }
            case 'more': {
                page.limit += CARD_PAGE;
                return void drawSheet();
            }
        }
    });
    root.addEventListener('input', (event) => {
        if (event.target.id !== 'v2u_sheet_search') return;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            page.query = event.target.value;
            page.limit = CARD_PAGE;
            drawSheet();
        }, 200);
    });
}

/**
 * 恢复表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function undoTable(mesId, tableContainer) {
    if (mesId === -1) return
    //const button = { text: '撤销10轮', result: 3 }
    const popup = new EDITOR.Popup("撤销指定轮次内的所有手动修改及重整理数据，恢复表格", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "撤销本轮", cancelButton: "取消" });
    const result = await popup.show()
    if (result) {
        await undoSheets(0)
        EDITOR.success('恢复成功')
    }
}


async function renderSheetsDOM(mesId = -1) {
    const task = new SYSTEM.taskTiming('renderSheetsDOM_task')
    DERIVED.any.renderingMesId = mesId
    updateSystemMessageTableStatus();
    task.log()
    const { deep: lastestDeep, piece: lastestPiece } = BASE.getLastSheetsPiece()
    const { piece, deep } = mesId === -1 ? { piece: lastestPiece, deep: lastestDeep } : { piece: USER.getContext().chat[mesId], deep: mesId }
    if (!piece || !BASE.getPieceHash(piece)) {
        // 这个聊天还没有表格：把上一个聊天留下的画面清掉
        page.sheets = []; page.data = new Map(); page.sheetUid = null;
        drawChrome(); await drawSheet();
        return;
    }

    if (deep === lastestDeep) DERIVED.any.isRenderLastest = true;
    else DERIVED.any.isRenderLastest = false;
    DERIVED.any.renderDeep = deep;

    const sheets = BASE.hashSheetsToSheets(BASE.getPieceHash(piece));
    sheets.forEach((sheet) => {
        sheet.hashSheet = sheet.hashSheet.filter((row) => {
            return (sheet.cells.get(row[0])?.isDeleted !== true);
        })
        sheet.cells.forEach((cell) => {
            cell.isDeleted = false;
        })
    })
    console.log('renderSheetsDOM:', piece, sheets)
    DERIVED.any.renderingSheets = sheets

    task.log()
    await renderDataPage(sheets)
    task.log()
}

let initializedTableView = null
async function initTableView(mesId) {
    initializedTableView = $(await SYSTEM.getTemplate('manager')).get(0);
    viewSheetsContainer = initializedTableView.querySelector('#tableContainer');
    bindDataPage(initializedTableView)
    // setTableEditTips($(initializedTableView).find('#tableEditTips'));    // 确保在 table_manager_container 存在的情况下查找 tableEditTips

    // 设置编辑提示
    // 点击打开查看表格数据统计
    $(document).on('click', '#table_data_statistics_button', function () {
        EDITOR.tryBlock(openTableStatisticsPopup, "打开表格统计失败")
    })
    // 点击打开查看表格历史按钮
    $(document).on('click', '#dataTable_history_button', function () {
        EDITOR.tryBlock(openTableHistoryPopup, "打开表格历史失败")
    })
    // 点击清空表格按钮
    $(document).on('click', '#clear_table_button', function () {
        EDITOR.tryBlock(clearTable, "清空表格失败", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    $(document).on('click', '#table_rebuild_button', function () {
        EDITOR.tryBlock(rebuildSheets, "重建表格失败");
    })
    // 点击编辑表格按钮
    $(document).on('click', '#table_edit_mode_button', function () {
        // openTableEditorPopup();
    })
    // 点击恢复表格按钮
    $(document).on('click', '#table_undo', function () {
        EDITOR.tryBlock(undoTable, "恢复表格失败");
    })
    // 点击复制表格按钮
    $(document).on('click', '#copy_table_button', function () {
        EDITOR.tryBlock(copyTable, "复制表格失败");
    })
    // 点击导入表格按钮
    $(document).on('click', '#import_table_button', function () {
        EDITOR.tryBlock(importTable, "导入表格失败", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    // 点击导出表格按钮
    $(document).on('click', '#export_table_button', function () {
        EDITOR.tryBlock(exportTable, "导出表格失败");
    })
    // 点击前表按钮
    $(document).on('click', '#table_prev_button', function () {
        const deep = DERIVED.any.renderDeep;
        const { deep: prevDeep } = BASE.getLastSheetsPiece(deep - 1, 20, false);
        if (prevDeep === -1) {
            EDITOR.error("没有更多的表格数据了")
            return
        }
        renderSheetsDOM(prevDeep);
    })

    // 点击跳转按钮
    $(document).on('click', '#table_jump_button', function () {
        const inputVal = $('#table_jump_input').val();
        const deep = inputVal === "" ? USER.getContext().chat.length - 1: Number(inputVal);
        const { deep: prevDeep } = BASE.getLastSheetsPiece(Math.abs(deep), 20, deep < 0);
        if (prevDeep === -1) {
            EDITOR.error("没有更多的表格数据了")
            return
        }
        renderSheetsDOM(prevDeep);
    })

    // 点击后表按钮
    $(document).on('click', '#table_next_button', function () {
        const deep = DERIVED.any.renderDeep;
        console.log("当前深度：", deep)
        const { deep: nextDeep } = BASE.getLastSheetsPiece(deep + 1, 20, false, "down");
        if (nextDeep === -1) {
            EDITOR.error("没有更多的表格数据了")
            return
        }
        renderSheetsDOM(nextDeep);
    })

    return initializedTableView;
}

export async function refreshContextView(mesId = -1) {
    if (BASE.contextViewRefreshing) return
    BASE.contextViewRefreshing = true
    await renderSheetsDOM(mesId);
    console.log("刷新表格视图")
    BASE.contextViewRefreshing = false
}

export async function getChatSheetsView(mesId = -1) {
    // 如果已经初始化过，直接返回缓存的容器，避免重复创建
    if (initializedTableView) {
        // 更新表格内容，但不重新创建整个容器
        await renderSheetsDOM();
        return initializedTableView;
    }
    return await initTableView(mesId);
}

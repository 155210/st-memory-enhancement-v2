// 用法：node --import ./tests/v2-coexist/register.mjs tests/v2-coexist/test-review.mjs "$PWD"
// 最终审核时修的几处：分支聊天串档、同楼层数聊天回读原版、AI 指令写错、重 roll 归档重复、回填起点
import assert from 'node:assert/strict';
const REPO = process.argv[2];
const chain = () => { const f = function(){}; const p = new Proxy(f, { get: (t, k) => k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => '' : (k === 'length' ? 0 : p)), apply: () => p, construct: () => p }); return p; };
globalThis.$ = globalThis.jQuery = new Proxy(function(){}, { apply: () => chain(), get: () => chain() });
globalThis.document = chain(); globalThis.window = globalThis; globalThis.toastr = { warning(){}, success(){}, error(...a) { console.log('toast error', ...a); }, info(){} };
globalThis.localStorage = { getItem: () => null, setItem(){} };
const power_user = {}; const extension_settings = { disabledExtensions: [] }; const extensionNames = ['third-party/st-memory-enhancement-v2'];
const chat = []; let chatMetadata = {};
const context = { chat, get chatMetadata() { return chatMetadata; }, set chatMetadata(v) { chatMetadata = v; }, name1: '江辰', registerMacro(){}, macros: null };
const handlers = {};
globalThis.__ST = {
  DOMPurify: { sanitize: x => x }, Bowser: {}, slideToggle(){}, LoadLocal(){}, SaveLocal(){}, LoadLocalBool(){},
  POPUP_TYPE: { CONFIRM: 1, TEXT: 2 }, Popup: class {}, callGenericPopup: async () => true,
  extensionNames, extension_settings, getContext: () => context, renderExtensionTemplateAsync: async () => '',
  getCurrentLocale: () => 'zh-cn', power_user, applyPowerUserSettings(){}, getContextSettings(){}, loadPowerUserSettings(){},
  reloadCurrentChat(){}, saveSettingsDebounced(){}, saveSettings(){}, getSlideToggleOptions(){}, generateRaw(){}, saveChat: async () => {},
  eventSource: { on(name, fn) { (handlers[name] ||= []).push(fn); } },
  event_types: { CHAT_CHANGED: 'chat_changed', MESSAGE_DELETED: 'message_deleted', CHARACTER_MESSAGE_RENDERED: 'rendered', CHAT_COMPLETION_PROMPT_READY: 'ready', MESSAGE_EDITED: 'edited', MESSAGE_SWIPED: 'swiped' },
  getRequestHeaders: () => ({}), saveGroupChat(){}, selected_group: null,
};
globalThis.fetch = async () => ({ json: async () => ({}) });
const readyFns = [];
globalThis.$ = globalThis.jQuery = new Proxy(function(){}, { apply: (t, self, [a]) => { if (typeof a === 'function') readyFns.push(a); return chain(); }, get: () => chain() });

const { BASE, USER, DERIVED } = await import(REPO + '/core/manager.js');
const { V2, ORIGINAL } = await import(REPO + '/core/v2keys.js');
const index = await import(REPO + '/index.js');
const SM = await import(REPO + '/core/summaryManager.js');
const { planBackfill } = await import(REPO + '/core/backfill.js');
Object.assign(USER.tableBaseSetting, { v2_request_panel: false, v2_summary_enabled: true, v2_summary_event_threshold: 4, v2_summary_event_keep: 1, v2_summary_batch: 2, v2_summary_keep: 0, v2_task_cleanup: false });
const clone = (v) => JSON.parse(JSON.stringify(v));

const setRow = (s, r, values) => s.getCellsByRowIndex(r).forEach((c, i) => { if (i) c.data.value = values[i - 1] ?? ''; });
const mk = (name, headers, rows = []) => {
  const s = BASE.createChatSheet(headers.length + 1, 1); s.name = name; setRow(s, 0, headers); s.enable = true;
  rows.forEach(values => { s.findCellByPosition(s.getRowCount() - 1, 0).newAction('insertDownRow', {}, false); setRow(s, s.getRowCount() - 1, values); });
  return s;
};
const dump = (piece, name) => { const s = BASE.hashSheetsToSheets(BASE.getPieceHash(piece)).find(x => x.name === name); const out = []; for (let r = 1; r < s.getRowCount(); r++) out.push(s.getCellsByRowIndex(r).slice(1).map(c => c?.data?.value ?? '')); return out; };
const headerOf = (piece, name) => BASE.hashSheetsToSheets(BASE.getPieceHash(piece)).find(x => x.name === name).getCellsByRowIndex(0).slice(1).map(c => c.data.value);
const edit = (...lines) => `<tableEdit>\n<!--\n${lines.join('\n')}\n-->\n</tableEdit>`;
const reset = () => { chat.length = 0; chatMetadata = {}; DERIVED.any.chatSheetMap = {}; };

// ---------- 1. AI 指令写错不连累同一条消息里的其他指令 ----------
reset();
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '开场' });
[mk('时空表格', ['日期', '地点'], [['6月1日', '教室']]), mk('角色特征表格', ['角色名', '性格'], [['林悠悠', '开朗']])].forEach(s => s.save(chat[1], true));
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '正文' + edit('deleteRow(0)', 'updateRow(0, -1, {"0":"坏","1":"坏"})', 'updateRow(0, 0, {"1":"操场"})', 'insertRow(1, {"0":"陈默","1":"冷淡"})') });
index.parseTableEditTag(chat[3], -1, true);
assert.deepEqual(dump(chat[3], '时空表格'), [['6月1日', '操场']], '没写行号的 deleteRow 跳过，其余照常执行');
assert.deepEqual(headerOf(chat[3], '时空表格'), ['日期', '地点'], '负数行号不改表头');
assert.deepEqual(dump(chat[3], '角色特征表格').map(r => r[0]), ['林悠悠', '陈默']);
console.log('✓ 写错的 deleteRow / 负数行号只跳过这一条');

// ---------- 2. 分支聊天：表格 uid 相同，切换聊天后不能拿上一个聊天的格子来读写 ----------
const metaA = clone(chatMetadata); const chatA = clone(chat);
// 分支 B：从 A 复制出来，另外多记了一个人（只在 B 的元数据里有这个格子）
index.parseTableEditTag(Object.assign(chat[3], { mes: '正文' + edit('insertRow(1, {"0":"分支独有","1":"神秘"})') }), -1, true);
const metaB = clone(chatMetadata); const chatB = clone(chat);
const open = async (meta, pieces) => { chat.splice(0, chat.length, ...clone(pieces)); chatMetadata = clone(meta); for (const fn of handlers.chat_changed || []) await fn(); };
try { await readyFns[0](); } catch (e) { console.log('启动报错（桩环境，可忽略）:', e.message); }
assert.ok(handlers.chat_changed?.length, '注册了切换聊天的监听');
DERIVED.any.chatSheetMap = {};
await open(metaA, chatA);
assert.deepEqual(dump(chat[3], '角色特征表格').map(r => r[0]), ['林悠悠', '陈默']);
await open(metaB, chatB);
assert.deepEqual(dump(chat[3], '角色特征表格').map(r => r[0]), ['林悠悠', '分支独有'], '切到分支后读到分支自己的格子');
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '后续' + edit('insertRow(1, {"0":"后来的","1":"普通"})') });
index.parseTableEditTag(chat[5], -1, true);
const savedB = clone(chatMetadata);
DERIVED.any.chatSheetMap = {};
chatMetadata = savedB;
assert.deepEqual(dump(chat[5], '角色特征表格'), [['林悠悠', '开朗'], ['分支独有', '神秘'], ['后来的', '普通']], '分支里再存一次，分支独有的格子还在');
console.log('✓ 切换到分支聊天不串档、不丢格子');

// ---------- 3. 两个聊天楼层数一样时，导入前楼层照样能回读原版快照 ----------
reset();
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '开场' });
mk('角色特征表格', ['角色名', '性格'], [['林悠悠', '开朗']]).save(chat[1], true);
chatMetadata[ORIGINAL.chatSheets] = chatMetadata[V2.chatSheets]; delete chatMetadata[V2.chatSheets];
chat[1][ORIGINAL.pieceHash] = chat[1][V2.pieceHash]; delete chat[1][V2.pieceHash];
chatMetadata[V2.chatSheets] = clone(chatMetadata[ORIGINAL.chatSheets]);
chatMetadata[V2.chatImport] = { floor: 1 };
DERIVED.any.chatSheetMap = {};
assert.ok(BASE.getPieceHash(chat[1]), '先读一次，建好楼层号缓存');
// 酒馆换聊天：同一个数组，换成另一批消息对象，楼层数不变
chat.splice(0, chat.length, ...clone(chat));
assert.ok(BASE.getPieceHash(chat[1]), '楼层数一样的另一个聊天也能回读');
assert.equal(BASE.getLastSheetsPiece().deep, 1);
console.log('✓ 楼层数相同的聊天之间切换，原版快照照样回读');

// ---------- 4. 回填：导入前的楼层算已经有表格 ----------
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '新的一层' });
const plan = planBackfill({ batch: 5 });
assert.equal(plan.lastFilled, 1, '回读原版快照的楼层算已填');
assert.equal(plan.start, 2);
console.log('✓ 回填从导入楼层之后开始');

// ---------- 5. 在压缩过的那一层重 roll：归档不重复 ----------
reset();
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '开场' });
[
  mk('角色特征表格', ['角色名', '性格'], [['林悠悠', '开朗']]),
  mk('事件历史', ['事件', '日期'], []),
  mk('大总结', ['内容', '层级', '楼层范围', '涉及角色'], [['总结一', '大', '0-10', ''], ['总结二', '大', '11-20', '']]),
  mk('总结归档', ['内容', '层级', '楼层范围', '涉及角色'], []),
].forEach(s => s.save(chat[1], true));
SM.summaryHooks.ask = async () => '<summary>压缩后的卷</summary>';
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '第一次生成' + edit('insertRow(1, {"0":"事件甲","1":"6月1日"})') });
index.parseTableEditTag(chat[3], -1);
await SM.runSummaryPipeline(chat[3], 3);
assert.equal(dump(chat[3], '总结归档').length, 2, '两条大总结压成卷，原文进归档');
assert.deepEqual(dump(chat[3], '大总结').map(r => r[1]), ['卷']);
// 同一条消息换一个回复（swipe）
chat[3].mes = '第二次生成' + edit('insertRow(1, {"0":"事件乙","1":"6月1日"})');
index.parseTableEditTag(chat[3], -1);
assert.equal(dump(chat[3], '总结归档').length, 0, '重 roll 后归档和大总结一起回到上一层的样子');
await SM.runSummaryPipeline(chat[3], 3);
assert.equal(dump(chat[3], '总结归档').length, 2, '再压缩一次，归档还是两条，不重复');
assert.deepEqual(dump(chat[3], '事件历史').map(r => r[0]), ['事件乙']);
console.log('✓ 重 roll 压缩过的楼层，归档不重复');

// ---------- 6. 等模型回复时切了聊天：不往别的聊天里写 ----------
reset();
chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '开场' });
[
  mk('事件历史', ['事件', '日期'], [['a', '1'], ['b', '1'], ['c', '1'], ['d', '1']]),
  mk('大总结', ['内容', '层级', '楼层范围', '涉及角色'], []),
  mk('总结归档', ['内容', '层级', '楼层范围', '涉及角色'], []),
].forEach(s => s.save(chat[1], true));
const before = clone(chat[1][V2.pieceHash]);
SM.summaryHooks.ask = async () => { chat.splice(0, chat.length, ...clone(chat)); return '<summary>不该写进去</summary>'; };
assert.deepEqual(await SM.runSummaryPipeline(chat[1], 1), []);
assert.deepEqual(chat[1][V2.pieceHash], before, '换了聊天后表格没被改');
console.log('✓ 等回复期间切聊天，不写表');


// ---------- 7. 给外部插件用的 ext_getAllTables 能正常返回 ----------
{
  const { ext_getAllTables } = await import(REPO + '/scripts/settings/standaloneAPI.js');
  reset();
  chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '开场' });
  mk('角色特征表格', ['角色名', '性格'], [['林悠悠', '开朗']]).save(chat[1], true);
  assert.deepEqual(ext_getAllTables(), [{ name: '角色特征表格', data: [['角色名', '性格'], ['林悠悠', '开朗']] }]);
  console.log('✓ ext_getAllTables 返回表头和数据行');
}

// ---------- 8. 取消「发送到上下文」的表不占序号：执行时和发送时对得上，开关也会存下来 ----------
{
  reset();
  chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '开场' });
  const [a, b, c] = [mk('甲表', ['内容'], []), mk('乙表', ['内容'], []), mk('丙表', ['内容'], [])];
  b.sendToContext = false;
  [a, b, c].forEach(s => s.save(chat[1], true));
  DERIVED.any.chatSheetMap = {};
  assert.equal(BASE.getChatSheets().find(s => s.name === '乙表').sendToContext, false, '开关存进了聊天');
  const prompt = index.getTablePromptByPiece(chat[1]);
  assert.ok(prompt.includes('* 1:丙表') && !prompt.includes('乙表'), '发给 AI 时丙表是 1 号');
  chat.push({ is_user: true, mes: 'u' }, { is_user: false, mes: '正文' + edit('insertRow(1, {"0":"写给丙表的"})') });
  index.parseTableEditTag(chat[3], -1, true);
  assert.deepEqual(dump(chat[3], '丙表'), [['写给丙表的']]);
  assert.deepEqual(dump(chat[3], '乙表'), [], '没发给 AI 的乙表不会被写');
  console.log('✓ 不发送的表不占序号，AI 的指令不会写错表');
}
console.log('全部通过');

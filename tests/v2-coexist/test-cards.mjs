// 用法：node --import ./tests/v2-coexist/register.mjs tests/v2-coexist/test-cards.mjs "$PWD"
// 卡片视图：长内容拆条目、截断判断、读表时标出本楼改动（只读，不改表）
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


const C = await import(REPO + '/scripts/editor/sheetCards.js');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok', name); };

test('只追加的列按「；」和「/」拆条目，最后一条是最新的', () => {
  const e = C.splitEntries('知道旧伤；见过玉佩/听说不是本地人；6/1 一起吃饭', true);
  assert.deepEqual(e, ['知道旧伤', '见过玉佩', '听说不是本地人', '6/1 一起吃饭']);
});
test('普通列只按「；」和换行拆，不拆「/」', () => {
  assert.deepEqual(C.splitEntries('病患/同行者；旧识\n同僚', false), ['病患/同行者', '旧识', '同僚']);
});
test('# 列两条以上就按条目显示；普通列要够长而且分了三段', () => {
  assert.equal(C.asEntries('#对<user>的了解', '只有一条'), null);
  assert.equal(C.asEntries('#对<user>的了解', '一；二').length, 2);
  assert.equal(C.asEntries('其他重要信息', '短；短；短'), null);
  const long = '右臂刀伤已包扎，随身带银针囊；左腕旧疤是幼年采药时被毒蛇所伤；自幼随父亲出入太医署，通针灸与金创，尤擅解毒；不胜酒力，一杯即面红，习惯在紧张时摩挲袖中银针';
  assert.equal(C.asEntries('其他重要信息', long).length, 4);
  assert.equal(C.asEntries('身体特征', '没有分段的一大段文字'.repeat(10)), null);
});
test('读表：标出本楼新增的行和改过的格子，不改动表', () => {
  const cells = new Map(Object.entries({ o: '', h1: '角色名', h2: '#往事', r1: '', a1: '沈知微', a2: '旧事一；旧事二', r2: '', b1: '陆沉舟', b2: '' }).map(([uid, value]) => [uid, { data: { value } }]));
  const hash = [['o', 'h1', 'h2'], ['r1', 'a1', 'a2'], ['r2', 'b1', 'b2']];
  const sheet = { uid: 's1', name: '角色特征表格', hashSheet: hash, cells, getCellsByRowIndex: (i) => hash[i].map(uid => cells.get(uid)) };
  const before = JSON.stringify(hash);
  const data = C.readSheet(sheet, new Set(['o', 'h1', 'h2', 'r1', 'a1', 'old']));
  assert.equal(data.kind, 'person');
  assert.deepEqual(data.headers, ['角色名', '#往事']);
  assert.equal(data.rows[0].isNew, false);
  assert.deepEqual(data.rows[0].cells.map(c => c.changed), [false, true]);
  assert.equal(data.rows[1].isNew, true);
  assert.equal(data.changed, 2);
  assert.equal(C.readSheet(sheet, null).changed, 0);
  assert.equal(JSON.stringify(hash), before);
  const html = C.renderCards(data, { editable: true, query: '', limit: 30, openState: new Map(), present: new Set(['沈知微']), chatLength: 10 });
  assert.ok(html.includes('data-cell="a2"') && html.includes('在场') && html.includes('2 条'));
  const readonly = C.renderCards(data, { editable: false, query: '陆', limit: 30, openState: new Map(), present: null, chatLength: 10 });
  assert.ok(!readonly.includes('data-act="rowmenu"') && !readonly.includes('沈知微'));
});
console.log(`test-cards: ${n} passed`);

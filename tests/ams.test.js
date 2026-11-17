// Run with: node --test tests/ams.test.js. No browser, account, or network access needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

function fixture() {
    const course = { moduleCode: 'OTHER101', moduleTypeGroup: 'Lab-2', startTime: '2026-10-22 09:00' };
    const rows = Array.from({ length: 45 }, (_, i) => ({ ...course, studentId: String(i), status: 2 }));
    const vm = {
        $options: { name: 'sessionstudent' }, dialogVisible: true, activeName: '2', courseItem: course,
        searchForm: { name: '', studentId: '' }, pagination: { total: 45, pageNum: 2, pageSize: 20 },
        tableLoadData: rows, tableLoadDataOld: structuredClone(rows), tableLoadDataPage: rows.slice(20, 40),
        getPageList({ pageIndex, pageSize }) {
            this.pagination.pageNum = pageIndex;
            this.pagination.pageSize = pageSize;
            this.tableLoadDataPage = this.tableLoadData.slice(0, pageSize);
        }
    };
    let toolbar, mutation, hashchange;
    const make = tag => ({
        tag, children: [], textContent: '', attrs: {},
        append(...children) { this.children.push(...children); },
        setAttribute(key, value) { this.attrs[key] = value; },
        addEventListener(type, handler) { this[type] = handler; },
        querySelector(selector) { return this.children.find(c => selector === 'button' ? c.tag === 'button' : c.attrs.role === 'status'); },
        remove() { toolbar = null; }
    });
    const dialog = {
        getClientRects: () => [1], contains: element => element === toolbar,
        closest: () => ({ __vue__: { $options: { name: 'transition' }, $parent: vm } }),
        querySelector: () => ({ after(element) { toolbar = element; } })
    };
    const root = { enabled: 'true', getAttribute() { return this.enabled; } };
    const location = { hash: '#/signIn/myCourseSession?moduleCode=OTHER101&moudleTitle=Other%20Module' };
    runInNewContext(readFileSync(new URL('../ams.js', `file://${__filename}`), 'utf8'), {
        document: { documentElement: root, querySelectorAll: () => [dialog], getElementById: () => toolbar, createElement: make },
        location, window: { addEventListener(type, handler) { hashchange = handler; } }, queueMicrotask: fn => fn(),
        MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} }
    });
    return { vm, root, location, toolbar: () => toolbar, refresh: () => mutation([{ target: {} }]), navigate: () => hashchange() };
}

test('prepares all 45 absent students across three pages for native Confirm, without submitting', () => {
    const f = fixture();
    assert.equal(f.toolbar().querySelector('button').disabled, false);
    f.toolbar().querySelector('button').click();
    assert.equal(f.vm.tableLoadDataPage.length, 45);
    assert.equal(f.vm.pagination.pageNum, 1);
    assert.ok(f.vm.tableLoadData.every(row => row.status === 1));
    assert.ok(f.vm.tableLoadDataOld.every(row => row.status === 2));
    // These are the same old/current comparisons AMS Confirm uses to build its update payload.
    const changes = f.vm.tableLoadDataOld.flatMap(old => f.vm.tableLoadDataPage.filter(row =>
        row.studentId === old.studentId && row.status !== old.status));
    assert.equal(changes.length, 45);
    assert.match(f.toolbar().querySelector('[role="status"]').textContent, /45 students.*Confirm to save/);
    assert.equal(f.toolbar().querySelector('button').disabled, true);
    // Changing page size must not silently reduce the native Confirm payload.
    f.vm.tableLoadDataPage = f.vm.tableLoadData.slice(0, 20);
    f.refresh();
    assert.equal(f.vm.tableLoadDataPage.length, 45);
});

for (const [name, change] of [
    ['name filter', vm => { vm.searchForm.name = 'Student'; }],
    ['ID filter', vm => { vm.searchForm.studentId = '1'; }],
    ['incomplete list', vm => { vm.pagination.total = 46; }],
    ['empty list', vm => { vm.tableLoadData = []; }],
    ['existing edits', vm => { vm.tableLoadData[0].status = 3; }],
    ['non-absent original', vm => { vm.tableLoadDataOld[0].status = 0; }],
    ['different session', vm => { vm.tableLoadData[0].startTime = 'different'; }],
    ['different module', vm => { vm.tableLoadData[0].moduleCode = 'WRONG'; }]
]) test(`refuses ${name} without modifying rows`, () => {
    const f = fixture(); change(f.vm); f.refresh();
    const before = structuredClone(f.vm.tableLoadData);
    assert.equal(f.toolbar().querySelector('button').disabled, true);
    f.toolbar().querySelector('button').click();
    assert.deepEqual(f.vm.tableLoadData, before);
});

for (const activeName of ['0', '1', '3', '4']) test(`no control in status tab ${activeName}`, () => {
    const f = fixture(); f.vm.activeName = activeName; f.refresh(); assert.equal(f.toolbar(), null);
});

test('removes controls on disable, modal close, excluded sessions, and route changes', () => {
    for (const change of [f => { f.root.enabled = 'false'; }, f => { f.vm.dialogVisible = false; },
        f => { f.vm.courseItem.attendanceFlag = true; }, f => { f.location.hash = '#/signIn/myCourse'; }]) {
        const f = fixture(); change(f); f.refresh(); assert.equal(f.toolbar(), null);
    }
    const f = fixture(); f.location.hash = '#/other'; f.navigate(); assert.equal(f.toolbar(), null);
});

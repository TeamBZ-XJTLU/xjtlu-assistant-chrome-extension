const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { join } = require('node:path');
const source = readFileSync(join(__dirname, '../staff.js'), 'utf8');
const functions = source.slice(source.indexOf('    function getRangeMarkLinks('), source.indexOf('    function getReportTable('));
const groups = [{ start: '1', end: '15', mark: '3' }, { start: '16', end: '25', mark: '1.5' }];

function fixture() {
    const saved = [], recipes = [], progress = [];
    let current;
    const links = Array.from({ length: 27 }, (_, i) => ({ number: i + 1, click() { current = this; },
        closest() { return { querySelectorAll: () => [
            { textContent: `Question ${i + 3}`, offsetParent: null },
            { textContent: `Question ${this.number}`, offsetParent: {} }
        ] }; }
    }));
    const input = { focus() {}, select() {}, dispatchEvent() {},
        closest: () => ({ requestSubmit() { saved.push({ number: current.number, mark: input.value }); } }) };
    const context = { generation: 0, getMarkLinks: () => links,
        chrome: { storage: { local: { set: async value => recipes.push(structuredClone(value)) } } },
        document: { body: { contains: () => true } }, waitForMaxMarkInput: async () => input,
        waitForMaxMarkInputDisappear: async () => true, sleep: async () => {}, Event: class {}
    };
    runInNewContext(functions, context);
    return { context, links, saved, recipes, progress };
}

test('two groups apply their respective marks and preserve questions outside the ranges', async () => {
    const f = fixture(); const message = await f.context.setQuestionMarks(groups, value => f.progress.push(value));
    assert.deepEqual(f.saved, Array.from({ length: 25 }, (_, i) => ({ number: i + 1, mark: i < 15 ? '3' : '1.5' })));
    assert.match(message, /25 questions across 2/); assert.equal(f.progress.length, 25);
    assert.deepEqual(f.recipes, [{ quizMarkGroups: [{ start: 1, end: 15, mark: '3' }, { start: 16, end: 25, mark: '1.5' }] }]);
});

test('one full range supports setting marks for all questions', async () => {
    const f = fixture(); await f.context.setQuestionMarks([{ start: 1, end: 27, mark: '2' }]);
    assert.equal(f.saved.length, 27); assert.ok(f.saved.every(row => row.mark === '2'));
});

test('single-question ranges and zero marks work', async () => {
    const f = fixture(); await f.context.setQuestionMarks([{ start: 16, end: 16, mark: '0' }]);
    assert.deepEqual(f.saved, [{ number: 16, mark: '0' }]);
});

for (const mark of ['', '-1', 'Infinity', 'NaN', 'abc']) test(`invalid later mark ${JSON.stringify(mark)} stops before all writes`, async () => {
    const f = fixture(); await assert.rejects(f.context.setQuestionMarks([groups[0], { start: 16, end: 25, mark }]), /non-negative/);
    assert.equal(f.saved.length, 0); assert.equal(f.recipes.length, 0);
});

for (const [start, end] of [[0, 15], [25, 16], [1.5, 15], [16, 28], ['', 15], ['99999999999999999999', 25]]) test(`invalid or unavailable range ${start}-${end} stops the full batch`, async () => {
    const f = fixture(); await assert.rejects(f.context.setQuestionMarks([groups[0], { start, end, mark: '1.5' }]));
    assert.equal(f.saved.length, 0); assert.equal(f.recipes.length, 0);
});

test('overlapping ranges including shared endpoints are refused', async () => {
    const f = fixture(); await assert.rejects(f.context.setQuestionMarks([groups[0], { start: 15, end: 25, mark: '1.5' }]), /overlap/);
    assert.equal(f.saved.length, 0); assert.equal(f.recipes.length, 0);
});

test('a duplicate visible question number fails before saving', async () => {
    const f = fixture(); f.links[25].number = 16;
    await assert.rejects(f.context.setQuestionMarks(groups)); assert.equal(f.saved.length, 0);
});

test('an empty batch is refused', async () => {
    const f = fixture(); await assert.rejects(f.context.setQuestionMarks([]), /at least one/); assert.equal(f.saved.length, 0);
});

test('saved settings can be reused on a different quiz with new DOM elements', async () => {
    const first = fixture(); await first.context.setQuestionMarks(groups);
    const second = fixture(); await second.context.setQuestionMarks(first.recipes[0].quizMarkGroups);
    assert.deepEqual(second.saved, first.saved);
    assert.ok(!JSON.stringify(first.recipes).includes('link'));
});

test('storage failure stops before quiz updates', async () => {
    const f = fixture(); f.context.chrome.storage.local.set = async () => { throw Error('Storage unavailable'); };
    await assert.rejects(f.context.setQuestionMarks(groups), /Storage/); assert.equal(f.saved.length, 0);
});

test('settings changes before the first update stop the operation', async () => {
    const f = fixture(); f.context.chrome.storage.local.set = async () => { f.context.generation++; };
    await assert.rejects(f.context.setQuestionMarks(groups), /settings changed/); assert.equal(f.saved.length, 0);
});

test('stops when a question disappears rather than silently skipping it', async () => {
    const f = fixture(); f.context.document.body.contains = () => f.saved.length < 1;
    await assert.rejects(f.context.setQuestionMarks(groups), /question list changed/); assert.equal(f.saved.length, 1);
});

test('a failed native save stops remaining question updates', async () => {
    const f = fixture(); f.context.waitForMaxMarkInputDisappear = async () => false;
    await assert.rejects(f.context.setQuestionMarks(groups), /did not close/); assert.equal(f.saved.length, 1);
});

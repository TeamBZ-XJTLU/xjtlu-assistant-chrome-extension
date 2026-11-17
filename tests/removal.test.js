const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../staff.js'), 'utf8');
const functions = source.slice(source.indexOf('    async function waitForConfirmModal('), source.indexOf('    async function waitForMaxMarkInput('));

function fixture({ sections = 1, selected = false, selecting = false, confirmation = 'Are you sure you want to remove all the selected questions?' } = {}) {
    const calls = [], alerts = [];
    let time = 0, modalOpen = false;
    const checkboxes = Array.from({ length: 27 }, () => ({ checked: selected, disabled: false }));
    let questions = checkboxes.map(checkbox => ({ querySelector: () => checkbox }));
    const yes = { click() { calls.push('confirm'); questions = []; } };
    const modal = { offsetParent: {}, querySelector: selector => selector === '.modal-body' ? { innerText: confirmation } : yes };
    const controls = {
        selectmultiplecommand: { click() { calls.push('select multiple'); controls.questionselectall.offsetParent = {}; controls.selectmultipledeletecommand.offsetParent = {}; } },
        questionselectall: { offsetParent: selecting ? {} : null, click() { calls.push('select all'); checkboxes.forEach(c => { c.checked = true; }); } },
        selectmultipledeletecommand: { offsetParent: selecting ? {} : null, disabled: false, click() { calls.push('delete selected'); modalOpen = true; } }
    };
    const context = {
        document: { body: { contains: () => true }, getElementById: id => controls[id], querySelectorAll: selector => {
            if (selector === 'li.slot') return questions;
            if (selector === 'li.section') return Array(sections).fill({});
            if (selector === '.modal-content') return modalOpen ? [modal] : [];
            throw Error(`Unexpected selector: ${selector}`);
        } },
        alert: text => alerts.push(text), Date: { now: () => time }, sleep: async ms => { time += ms; }
    };
    runInNewContext(functions, context);
    return { context, controls, checkboxes, calls, alerts, empty: () => { questions = []; } };
}

test('opens selection mode, selects all, and performs one bulk deletion', async () => {
    const f = fixture(); await f.context.removeAllQuestions();
    assert.deepEqual(f.calls, ['select multiple', 'select all', 'delete selected', 'confirm']);
    assert.deepEqual(f.alerts, ['All questions are removed.']);
});

test('already-selected questions are not deselected by the select-all toggle', async () => {
    const f = fixture({ selected: true, selecting: true }); await f.context.removeAllQuestions();
    assert.deepEqual(f.calls, ['delete selected', 'confirm']);
});

test('a partial selection is expanded to all questions', async () => {
    const f = fixture({ selecting: true }); f.checkboxes[0].checked = true;
    await f.context.removeAllQuestions();
    assert.deepEqual(f.calls, ['select all', 'delete selected', 'confirm']);
});

test('multiple section headings stop before any selection or removal', async () => {
    const f = fixture({ sections: 3 });
    await assert.rejects(f.context.removeAllQuestions(), /extra section headings/);
    assert.deepEqual(f.calls, []);
});

test('failed Select all never reaches Delete selected', async () => {
    const f = fixture(); f.controls.questionselectall.click = () => { f.calls.push('select all'); };
    await assert.rejects(f.context.removeAllQuestions(), /did not select every/);
    assert.deepEqual(f.calls, ['select multiple', 'select all']);
});

test('missing or disabled question checkboxes never reach Delete selected', async () => {
    const f = fixture(); f.checkboxes[0].disabled = true;
    await assert.rejects(f.context.removeAllQuestions(), /Not every question/);
    assert.ok(!f.calls.includes('delete selected'));
});

test('missing bulk controls fail without individual deletion fallback', async () => {
    const f = fixture(); delete f.controls.selectmultipledeletecommand;
    await assert.rejects(f.context.removeAllQuestions(), /unavailable/);
    assert.deepEqual(f.calls, []);
});

test('unrelated confirmation dialogs are never accepted', async () => {
    const f = fixture({ confirmation: 'Are you sure you want to remove this question?' });
    await assert.rejects(f.context.removeAllQuestions(), /Confirmation modal not found/);
    assert.ok(!f.calls.includes('confirm'));
});

test('empty quiz does not open bulk controls', async () => {
    const f = fixture(); f.empty(); await f.context.removeAllQuestions();
    assert.deepEqual(f.calls, []); assert.deepEqual(f.alerts, ['Quiz is empty.']);
});

test('partial or failed deletion does not report success', async () => {
    const f = fixture();
    f.context.waitForQuestionRemoval = async () => false;
    await assert.rejects(f.context.removeAllQuestions(), /did not remove every/);
    assert.deepEqual(f.alerts, []);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = readFileSync(join(__dirname, '../staff.js'), 'utf8');
function fixture(saved = ['all']) {
    const inputs = ['1', '2', '3'].map(value => ({ dataset: { questionValue: value }, checked: true }));
    const container = { querySelectorAll: () => inputs };
    const context = { localStorage: { getItem: () => JSON.stringify(saved) }, getReportStorageKey: () => 'fixture' };
    runInNewContext(source.slice(source.indexOf('    function loadSelectedQuestions('), source.indexOf('    function getMarkLinks(')), context);
    runInNewContext(source.slice(source.indexOf('    function getQuestionCheckboxes('), source.indexOf('    function isQuestionCellCorrect(')), context);
    runInNewContext(source.slice(source.indexOf('    function applySavedQuestionSelection('), source.indexOf('    function createQuestionCheckbox(')), context);
    context.applySavedQuestionSelection('overview', container);
    return { inputs, container, context };
}
test('previous All questions selection migrates to every question checked', () => {
    const f = fixture(); assert.ok(f.inputs.every(input => input.checked));
});
test('Hide all persists an empty selection and shows no groups', () => {
    const f = fixture([]);
    assert.ok(f.inputs.every(input => !input.checked));
    assert.equal(f.context.loadSelectedQuestions('overview').length, 0);
    assert.equal(f.context.getShownQuestionGroups([{ questionNumber: 1 }], f.container).length, 0);
});
test('individual saved choices are preserved', () => {
    const f = fixture(['2']); assert.deepEqual(f.inputs.map(input => input.checked), [false, true, false]);
    assert.deepEqual(Array.from(f.context.getSelectedQuestionNumbers(f.container)), [2]);
});
test('unchecking the last question keeps all questions hidden', () => {
    const f = fixture(['2']); f.inputs[1].checked = false;
    assert.equal(f.context.getSelectedQuestionNumbers(f.container).size, 0);
});
test('obsolete nonempty saved choices fall back to all questions', () => {
    const f = fixture(['99']); assert.ok(f.inputs.every(input => input.checked));
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = readFileSync(join(__dirname, '../grades.js'), 'utf8');
const context = {};
runInNewContext(source.slice(source.indexOf('    function gradeGrid('), source.indexOf('    function restore(')), context);
const cell = (colSpan = 1, rowSpan = 1) => ({ colSpan, rowSpan });

test('grade grid aligns activity columns across merged category and identity headers', () => {
    const category = cell(3), first = cell(), second = cell(), total = cell();
    const table = { rows: [
        { cells: [cell(4, 2), category] },
        { cells: [first, second, total] },
        { cells: [cell(), cell(), cell(), cell(), cell(), cell(), cell()] },
        { cells: [cell(4), cell(), cell(), cell()] }
    ] };
    const grid = context.gradeGrid(table);
    assert.equal(grid.find(entry => entry.cell === first).start, 4);
    assert.equal(grid.find(entry => entry.cell === second).start, 5);
    assert.equal(grid.find(entry => entry.cell === category).width, 3);
    assert.deepEqual(Array.from(grid.slice(-4), entry => entry.start), [0, 4, 5, 6]);
});

test('nested categories keep activity positions consistent', () => {
    const table = { rows: [
        { cells: [cell(2, 3), cell(4)] },
        { cells: [cell(2), cell(2)] },
        { cells: [cell(), cell(), cell(), cell()] }
    ] };
    const grid = context.gradeGrid(table);
    assert.deepEqual(Array.from(grid.slice(-4), entry => entry.start), [2, 3, 4, 5]);
});

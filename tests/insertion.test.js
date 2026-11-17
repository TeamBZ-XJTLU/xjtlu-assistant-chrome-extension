const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = readFileSync(join(__dirname, '../staff.js'), 'utf8');
const functions = source.slice(source.indexOf('    function getHeadingInsertion('), source.indexOf('    function getCurrentHeadingRows('));
const rows = [
    { after: '15', before: '16', title: 'Section 2 Fill-in-the-blank questions' },
    { after: '25', before: '26', title: 'Section 3 Fill-in-the-blank questions' }
];

function fixture() {
    const requests = [], recipes = [];
    let reloads = 0, nextId = 200, lastPage = 0;
    const section = { id: 'section-100', dataset: { sectionname: '' }, querySelector: () => questions[0] };
    const sections = [section];
    const questions = Array.from({ length: 27 }, (_, i) => ({ id: `slot-${1000 + i}`,
        previousElementSibling: { matches: selector => selector === 'li.page', querySelector: () => ({ href: `https://core.xjtlu.edu.cn/mod/quiz/edit.php?cmid=45713&addsectionatpage=${i + 1}` }) },
        closest: () => section,
        querySelectorAll: () => [{ textContent: `Question ${i + 3}`, offsetParent: null }, { textContent: `Question ${i + 1}`, offsetParent: {} }] }));
    const context = { generation: 0, URL, URLSearchParams, AbortSignal,
        chrome: { storage: { local: { set: async value => recipes.push(structuredClone(value)) } } },
        document: { querySelector: () => section, querySelectorAll: selector => selector === 'li.slot' ? questions : sections },
        location: { origin: 'https://core.xjtlu.edu.cn', search: '?cmid=45713', reload: () => { reloads++; } },
        getHeadingRequestConfig: () => ({ endpoint: 'https://core.xjtlu.edu.cn/mod/quiz/edit_rest.php', sesskey: 'fixtureOnly', quizid: '1410', courseid: '', pageparams: {} }),
        DOMParser: class { parseFromString() {
            const snapshot = [...sections];
            return { querySelectorAll: selector => selector === 'li.slot' ? questions : snapshot };
        } },
        fetch: async (url, options) => {
            const body = Object.fromEntries(options.body);
            requests.push({ url, body });
            if (url.includes('addsectionatpage')) {
                lastPage = Number(new URL(url).searchParams.get('addsectionatpage'));
                const firstQuestion = questions[lastPage - 1];
                sections.push({ id: `section-${nextId++}`, querySelector: () => firstQuestion });
                return { ok: true, url: 'https://core.xjtlu.edu.cn/mod/quiz/edit.php?cmid=45713', text: async () => '<html>fixture</html>' };
            }
            return { ok: true, json: async () => body.action === 'DELETE' ? { deleted: true } : ({ instancesection: body.newheading }) };
        }
    };
    runInNewContext(functions, context);
    return { context, questions, sections, section, requests, recipes, reloads: () => reloads };
}

function existing(f, index, id, title) {
    const section = { id, dataset: { sectionname: title }, querySelector: selector => selector === 'li.slot' ? f.questions[index] : {} };
    f.sections.push(section);
    f.questions[index].closest = () => section;
    return section;
}

test('creates two headings with distinct IDs and refreshes once after both titles are saved', async () => {
    const f = fixture(); await f.context.modifySectionHeadings('', rows);
    assert.equal(f.requests.length, 4);
    assert.match(f.requests[0].url, /addsectionatpage=16/);
    assert.match(f.requests[2].url, /addsectionatpage=26/);
    assert.deepEqual(f.requests.filter(r => r.body.field).map(r => [r.body.id, r.body.newheading]), [['200', rows[0].title], ['201', rows[1].title]]);
    assert.equal(f.reloads(), 1);
    assert.ok(f.requests.filter(r => r.body.field).every(r => r.body.class === 'section'));
});

test('recipe contains only reusable first title, positions and titles', async () => {
    const f = fixture(); await f.context.modifySectionHeadings('Section 1 MCQs', rows);
    assert.deepEqual(f.recipes, [{ quizSectionHeadingPreset: { firstTitle: 'Section 1 MCQs', rows: rows.map(r => ({ ...r, after: Number(r.after), before: Number(r.before) })) } }]);
    assert.equal(f.requests.at(-1).body.id, '100');
    assert.equal(f.requests.at(-1).body.newheading, 'Section 1 MCQs');
});

test('existing matching headings are not duplicated and need no refresh', async () => {
    const f = fixture(); existing(f, 15, 'section-201', rows[0].title); existing(f, 25, 'section-202', rows[1].title);
    const message = await f.context.modifySectionHeadings('', rows);
    assert.equal(f.requests.length, 0); assert.equal(f.reloads(), 0); assert.match(message, /already match/);
    assert.equal(f.recipes.length, 1);
});

test('existing boundary heading is renamed rather than duplicated', async () => {
    const f = fixture(); existing(f, 25, 'section-201', 'Old coding title');
    await f.context.modifySectionHeadings('', [rows[1]]);
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].body.id, '201');
    assert.equal(f.requests[0].body.newheading, rows[1].title);
});

test('first heading can be changed or cleared without any boundary rows', async () => {
    for (const [oldTitle, newTitle] of [['', 'Section 1'], ['Section 1', '']]) {
        const f = fixture(); f.section.dataset.sectionname = oldTitle;
        await f.context.modifySectionHeadings(newTitle, []);
        assert.equal(f.requests.length, 1); assert.equal(f.requests[0].body.id, '100');
        assert.equal(f.requests[0].body.newheading, newTitle);
    }
});

test('all rows are validated before saving a recipe or sending any request', async () => {
    const f = fixture();
    await assert.rejects(f.context.modifySectionHeadings('', [rows[0], { after: 20, before: 26, title: 'Invalid' }]));
    assert.equal(f.requests.length, 0); assert.equal(f.recipes.length, 0);
});

test('duplicate boundaries are rejected before changing anything', async () => {
    const f = fixture(); await assert.rejects(f.context.modifySectionHeadings('', [rows[0], rows[0]]), /only once/);
    assert.equal(f.requests.length, 0); assert.equal(f.recipes.length, 0);
});

for (const row of [{ after: 16, before: 15, title: 'x' }, { after: 0, before: 1, title: 'x' },
    { after: 1.5, before: 2, title: 'x' }, { after: 15, before: 16, title: ' ' }, { after: 15, before: 16, title: 'x'.repeat(256) }]) {
    test(`rejects invalid row ${row.after}/${row.before}/${row.title.length}`, async () => {
        const f = fixture(); await assert.rejects(f.context.modifySectionHeadings('', [row])); assert.equal(f.requests.length, 0);
    });
}

test('first title is validated before any save', async () => {
    const f = fixture(); await assert.rejects(f.context.modifySectionHeadings('x'.repeat(256), rows)); assert.equal(f.requests.length, 0);
});

test('refuses boundaries without page breaks and links for other quizzes', async () => {
    for (const change of [f => { f.questions[15].previousElementSibling.matches = () => false; },
        f => { f.questions[15].previousElementSibling.querySelector = () => ({ href: 'https://core.xjtlu.edu.cn/mod/quiz/edit.php?cmid=999&addsectionatpage=16' }); }]) {
        const f = fixture(); change(f); await assert.rejects(f.context.modifySectionHeadings('', [rows[0]])); assert.equal(f.requests.length, 0);
    }
});

test('storage failure stops before quiz changes', async () => {
    const f = fixture(); f.context.chrome.storage.local.set = async () => { throw Error('Storage unavailable'); };
    await assert.rejects(f.context.modifySectionHeadings('', rows), /Storage/); assert.equal(f.requests.length, 0);
});

test('settings changes after creation stop the rename and later rows', async () => {
    const f = fixture(), fetch = f.context.fetch;
    f.context.fetch = async (...args) => { const result = await fetch(...args); f.context.generation++; return result; };
    await assert.rejects(f.context.modifySectionHeadings('', rows), /Remaining heading changes stopped/);
    assert.equal(f.requests.length, 1); assert.equal(f.reloads(), 0);
});

test('failed rename stops the batch and keeps the recipe without retrying creation', async () => {
    const f = fixture(), fetch = f.context.fetch;
    f.context.fetch = async (...args) => f.requests.length ? { ok: true, json: async () => ({ error: true }) } : fetch(...args);
    await assert.rejects(f.context.modifySectionHeadings('', rows), /Some headings may already be saved/);
    assert.equal(f.requests.length, 1); assert.equal(f.recipes.length, 1); assert.equal(f.reloads(), 0);
});

test('unexpected new section or changed question order stops before renaming', async () => {
    for (const reverse of [false, true]) {
        const f = fixture();
        f.context.DOMParser = class { parseFromString() { return { querySelectorAll: selector => selector === 'li.slot'
            ? reverse ? [...f.questions].reverse() : f.questions
            : [{ id: 'section-100' }, { id: 'section-200', querySelector: () => f.questions[14] }] }; } };
        await assert.rejects(f.context.modifySectionHeadings('', rows), /Could not verify/); assert.equal(f.requests.length, 1);
    }
});


test('renames a loaded heading and deletes another in the same batch without storing IDs', async () => {
    const f = fixture();
    existing(f, 15, 'section-201', 'Old title');
    existing(f, 25, 'section-202', 'Remove me');
    await f.context.modifySectionHeadings('First', [{ sectionId: 'section-201', after: 15, before: 16, title: 'New title' }], ['section-202']);
    assert.deepEqual(f.requests.map(r => [r.body.id, r.body.action || r.body.newheading]), [['201', 'New title'], ['202', 'DELETE'], ['100', 'First']]);
    assert.equal(f.reloads(), 1);
    assert.deepEqual(f.recipes[0].quizSectionHeadingPreset.rows, [{ after: 15, before: 16, title: 'New title' }]);
});

test('remove all deletes last to first and clears the required first title', async () => {
    const f = fixture(); f.section.dataset.sectionname = 'First';
    existing(f, 15, 'section-201', 'Second'); existing(f, 25, 'section-202', 'Third');
    await f.context.modifySectionHeadings('', [], ['section-201', 'section-202']);
    assert.deepEqual(f.requests.map(r => [r.body.id, r.body.action || r.body.newheading]), [['202', 'DELETE'], ['201', 'DELETE'], ['100', '']]);
    assert.equal(f.reloads(), 1);
    assert.deepEqual(f.recipes[0].quizSectionHeadingPreset.rows, []);
});

test('empty loaded sections can be renamed or cleared without question boundaries', async () => {
    const f = fixture(); existing(f, 25, 'section-201', 'Empty section');
    await f.context.modifySectionHeadings('', [{ sectionId: 'section-201', after: '', before: '', title: '' }]);
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].body.newheading, '');
    assert.deepEqual(f.recipes[0].quizSectionHeadingPreset.rows, []);
});

for (const ids of [['section-100'], ['section-999'], ['section-201', 'section-201']]) {
    test(`rejects invalid deletions ${ids.join(',')} before any save`, async () => {
        const f = fixture(); existing(f, 15, 'section-201', 'Second');
        await assert.rejects(f.context.modifySectionHeadings('', [], ids), /verify/);
        assert.equal(f.requests.length, 0); assert.equal(f.recipes.length, 0);
    });
}

test('missing native delete control stops all changes', async () => {
    const f = fixture(); const section = existing(f, 15, 'section-201', 'Second'); section.querySelector = () => null;
    await assert.rejects(f.context.modifySectionHeadings('New first', [], ['section-201']), /verify/);
    assert.equal(f.requests.length, 0);
});

test('cannot rename and delete the same section', async () => {
    const f = fixture(); existing(f, 15, 'section-201', 'Second');
    await assert.rejects(f.context.modifySectionHeadings('', [{ sectionId: 'section-201', after: 15, before: 16, title: 'New' }], ['section-201']), /verify/);
    assert.equal(f.requests.length, 0);
});

for (const result of [{ deleted: false }, { error: true }, {}]) {
    test(`failed individual deletion ${JSON.stringify(result)} stops batch with partial-save notice`, async () => {
        const f = fixture(); existing(f, 15, 'section-201', 'Second'); existing(f, 25, 'section-202', 'Third');
        let calls = 0; f.context.fetch = async () => { calls++; return { ok: true, json: async () => result }; };
        await assert.rejects(f.context.modifySectionHeadings('New first', [], ['section-201', 'section-202']), /Some headings may already be saved/);
        assert.equal(calls, 1); assert.equal(f.reloads(), 0);
    });
}

test('settings change stops further deletions', async () => {
    const f = fixture(); existing(f, 15, 'section-201', 'Second'); existing(f, 25, 'section-202', 'Third');
    const fetch = f.context.fetch;
    f.context.fetch = async (...args) => { const result = await fetch(...args); f.context.generation++; return result; };
    await assert.rejects(f.context.modifySectionHeadings('', [], ['section-201', 'section-202']), /Remaining heading changes stopped/);
    assert.equal(f.requests.length, 1);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const read = name => readFileSync(join(__dirname, '..', name), 'utf8');
const context = { URL };
runInNewContext(read('defaults.js'), context);

test('root URLs normalize trailing slashes, whitespace, case, and duplicates', () => {
    const roots = context.XJTLU_NORMALIZE_ROOTS(' https://CORE.xjtlu.edu.cn/\nhttps://core.xjtlu.edu.cn\n\nhttps://core-archive25-26.xjtlu.edu.cn/ ');
    assert.deepEqual(Array.from(roots), Array.from(context.XJTLU_DEFAULTS.learningMallRoots));
});

test('empty list disables Learning Mall sites', () => {
    assert.equal(context.XJTLU_NORMALIZE_ROOTS(' \n').length, 0);
});

for (const root of ['http://core.xjtlu.edu.cn', 'https://core.xjtlu.edu.cn/course/view.php',
    'https://core.xjtlu.edu.cn?x=1', 'https://core.xjtlu.edu.cn/#page',
    'https://core.xjtlu.edu.cn.evil.example', 'https://user:password@core.xjtlu.edu.cn',
    'https://core.xjtlu.edu.cn:8443', 'core.xjtlu.edu.cn']) {
    test(`rejects invalid root ${root}`, () => assert.throws(() => context.XJTLU_NORMALIZE_ROOTS(root)));
}

test('staff tools run only on configured roots and still require the master toggle', () => {
    const source = read('staff.js');
    const init = source.slice(source.indexOf('    function init()'), source.indexOf('    function reset()'));
    for (const [origin, enabled, allowed] of [
        ['https://core.xjtlu.edu.cn', true, true],
        ['https://core-archive25-26.xjtlu.edu.cn', true, true],
        ['https://other.xjtlu.edu.cn', true, false],
        ['https://core.xjtlu.edu.cn', false, false]]) {
        let calls = 0;
        const fixture = { settings: { ...context.XJTLU_DEFAULTS, staffEnabled: enabled }, location: { origin },
            isQuizEditPage: () => true, addEditPageBanner: () => calls++ };
        runInNewContext(init, fixture); fixture.init();
        assert.equal(calls, Number(allowed));
        fixture.settings.learningMallRoots = [];
        fixture.init(); assert.equal(calls, Number(allowed));
    }
});

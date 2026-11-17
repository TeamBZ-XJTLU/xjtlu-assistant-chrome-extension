const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = readFileSync(join(__dirname, '../staff.js'), 'utf8');
const functions = source.slice(source.indexOf('    function getHeadingRequestConfig('), source.indexOf('    function getHeadingInsertion('));

function fixture(count = 3) {
    const requests = [], alerts = [];
    let reloads = 0;
    const sections = Array.from({ length: count }, (_, i) => ({ id: `section-${100 + i}`,
        querySelector: selector => selector.includes('edit_section_title') || i > 0 ? {} : null }));
    const config = { quizid: '1410', courseid: [], ajaxurl: '/mod/quiz/edit_rest.php', config: { pageparams: [] } };
    const script = { textContent: `M.cfg = {"sesskey":"fixtureOnly"};M.mod_quiz.init_section_toolbox(${JSON.stringify(config)});` };
    const context = { generation: 0, URL, URLSearchParams, AbortSignal,
        location: { origin: 'https://core.xjtlu.edu.cn', reload: () => { reloads++; } },
        document: { scripts: [script], querySelectorAll: () => sections },
        alert: message => alerts.push(message),
        fetch: async (url, options) => {
            const body = Object.fromEntries(options.body);
            requests.push({ url, method: options.method, credentials: options.credentials, body });
            return { ok: true, json: async () => body.action === 'DELETE' ? { deleted: true } : { instancesection: '' } };
        }
    };
    runInNewContext(functions, context);
    return { context, config, script, sections, requests, alerts, reloads: () => reloads,
        updateConfig() { script.textContent = `M.cfg = {"sesskey":"fixtureOnly"};M.mod_quiz.init_section_toolbox(${JSON.stringify(config)});`; } };
}


test('extracts the native heading endpoint', () => {
    const f = fixture(); const config = f.context.getHeadingRequestConfig();
    assert.equal(config.endpoint, 'https://core.xjtlu.edu.cn/mod/quiz/edit_rest.php');
    assert.equal(config.quizid, '1410');
});

test('rejects foreign or unexpected endpoints', () => {
    for (const ajaxurl of ['https://other.example/mod/quiz/edit_rest.php', '/mod/quiz/delete.php']) {
        const f = fixture(); f.config.ajaxurl = ajaxurl; f.updateConfig();
        assert.throws(() => f.context.getHeadingRequestConfig(), /Could not verify/);
    }
});

test('rejects missing session key', () => {
    const f = fixture(); f.script.textContent = `M.mod_quiz.init_section_toolbox(${JSON.stringify(f.config)});`;
    assert.throws(() => f.context.getHeadingRequestConfig(), /Could not verify/);
});

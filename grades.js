(() => {
    'use strict';
    const courseId = new URLSearchParams(location.search).get('id');
    if (location.pathname !== '/grade/report/grader/index.php' || !courseId) return;
    const storageKey = `gradeActivities:${location.origin}:${courseId}`;
    const hiddenClass = 'xjtlu-grade-hidden';
    const spans = new Map();
    let settings, selected = null, panel, signature = '', pending = false;

    // Logical columns account for Moodle category headers and merged identity cells.
    function gradeGrid(table) {
        const occupied = [];
        return Array.from(table.rows, row => {
            let column = 0;
            const cells = Array.from(row.cells, cell => {
                while (occupied[column] > 0) column++;
                const start = column, width = cell.colSpan;
                for (let i = start; i < start + width; i++) occupied[i] = cell.rowSpan;
                column += width;
                return { cell, start, width };
            });
            for (let i = 0; i < occupied.length; i++) occupied[i] = Math.max(0, (occupied[i] || 0) - 1);
            return cells;
        }).flat();
    }

    function restore() {
        document.querySelectorAll(`.${hiddenClass}`).forEach(cell => cell.classList.remove(hiddenClass));
        for (const [cell, span] of spans) cell.colSpan = span;
        spans.clear();
    }

    function activities(table) {
        return Array.from(table.querySelectorAll('th.item')).flatMap(cell => {
            const link = cell.querySelector('a.gradeitemheader');
            const id = Array.from(cell.classList).find(value => /^i\d+$/.test(value));
            if (!link || !id) return [];
            const url = new URL(link.href, location.origin);
            if (url.origin !== location.origin || url.pathname !== '/mod/quiz/view.php') return [];
            return [{ id, title: link.textContent.trim(), cell }];
        }).filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
    }

    async function save(values) {
        try {
            await chrome.storage.local.set({ [storageKey]: values });
            selected = values;
            render();
        } catch (error) {
            panel.querySelector('[role="status"]').textContent = 'Could not save choices: ' + error.message;
        }
    }

    function render() {
        restore();
        if (!settings?.staffEnabled || !settings.gradeItemFilter || !settings.learningMallRoots.includes(location.origin)) {
            panel?.remove(); panel = null; signature = ''; return;
        }
        const table = document.querySelector('#user-grades');
        if (!table) { panel?.remove(); panel = null; signature = ''; return; }
        const items = activities(table);
        if (!items.length) { panel?.remove(); panel = null; signature = ''; return; }
        const nextSignature = JSON.stringify(items.map(({ id, title }) => [id, title]));
        if (!panel?.isConnected || signature !== nextSignature) {
            panel?.remove();
            panel = document.createElement('section');
            panel.id = 'xjtlu-grade-selector';
            panel.className = 'xjtlu-tools-panel';
            panel.setAttribute('aria-label', 'Grade report activity visibility');
            panel.innerHTML = `<div class="xjtlu-tools-heading"><strong class="xjtlu-tools-title">Show grade report activities<span class="xjtlu-assistant-badge">XJTLU Assistant</span></strong><button type="button" class="xjtlu-tool-button" data-action="show">Show all</button><button type="button" class="xjtlu-tool-button" data-action="hide">Hide all</button></div><details><summary>Choose exercises and quizzes</summary><div class="xjtlu-grade-choices"></div></details><p role="status" aria-live="polite"></p>`;
            panel.querySelector('[data-action="show"]').addEventListener('click', () => save(null));
            panel.querySelector('[data-action="hide"]').addEventListener('click', () => save([]));
            const choices = panel.querySelector('.xjtlu-grade-choices');
            for (const item of items) {
                const label = document.createElement('label');
                const input = document.createElement('input');
                input.type = 'checkbox'; input.value = item.id;
                const text = document.createElement('span'); text.textContent = item.title;
                label.append(input, text); choices.append(label);
            }
            choices.addEventListener('change', () => {
                const checked = Array.from(choices.querySelectorAll('input:checked'), input => input.value);
                save(checked.length === items.length ? null : checked);
            });
            (document.querySelector('#region-main') || table.parentElement).prepend(panel);
            signature = nextSignature;
        }
        const valid = new Set(items.map(item => item.id));
        const stale = selected?.length > 0 && !selected.some(id => valid.has(id));
        const visible = new Set(selected === null || stale ? valid : selected);
        const grid = gradeGrid(table);
        const hiddenColumns = new Set();
        for (const item of items) {
            if (visible.has(item.id)) continue;
            const entry = grid.find(entry => entry.cell === item.cell);
            if (entry) for (let i = entry.start; i < entry.start + entry.width; i++) hiddenColumns.add(i);
        }
        for (const { cell, start, width } of grid) {
            let remaining = 0;
            for (let i = start; i < start + width; i++) if (!hiddenColumns.has(i)) remaining++;
            if (!remaining) cell.classList.add(hiddenClass);
            else if (remaining !== width) { spans.set(cell, width); cell.colSpan = remaining; }
        }
        for (const input of panel.querySelectorAll('input')) input.checked = visible.has(input.value);
        panel.querySelector('[role="status"]').textContent = `${items.filter(item => visible.has(item.id)).length} of ${items.length} activities shown. Saved for this course on this browser. Grades and student visibility are unchanged.`;
    }

    const observer = new MutationObserver(records => {
        if (pending || records.every(record => record.target.closest?.('#xjtlu-grade-selector'))) return;
        pending = true;
        queueMicrotask(() => { pending = false; if (settings) render(); });
    });
    // Ignore text/status and our own controls to avoid observing our rendering loop.
    observer.observe(document.body, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (!settings) return;
        if (area === 'sync') {
            for (const key of ['staffEnabled', 'gradeItemFilter', 'learningMallRoots']) {
                if (changes[key]) settings[key] = changes[key].newValue ?? XJTLU_DEFAULTS[key];
            }
        } else if (area === 'local' && changes[storageKey]) {
            const value = changes[storageKey].newValue;
            selected = Array.isArray(value) ? value : null;
        } else return;
        render();
    });
    Promise.all([chrome.storage.sync.get(XJTLU_DEFAULTS), chrome.storage.local.get(storageKey)]).then(([values, saved]) => {
        settings = values;
        selected = Array.isArray(saved[storageKey]) ? saved[storageKey] : null;
        render();
    }).catch(error => console.error('XJTLU grade visibility settings unavailable:', error));
})();

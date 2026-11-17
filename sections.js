(() => {
    'use strict';
    if (location.pathname !== '/course/view.php') return;
    const courseId = new URLSearchParams(location.search).get('id');
    if (!courseId) return;
    const storageKey = `courseSections:${courseId}${location.hostname === 'core.xjtlu.edu.cn' ? '' : ':' + location.origin}`;
    const hiddenClass = 'xjtlu-section-hidden';
    let enabled = false;
    let roots = XJTLU_DEFAULTS.learningMallRoots;
    let featureEnabled = true;
    let selected = null;
    let toolbar;
    let signature = '';
    let pending = false;
    let ready = false;
    let saving = false;

    function sections() {
        return [...document.querySelectorAll('#region-main [data-for="section"][id^="section-"]')]
            .filter(node => !node.parentElement.closest('[data-for="section"][id^="section-"]'))
            .map(node => ({
                node,
                id: node.dataset.id || node.id,
                anchor: node.id,
                title: node.querySelector('.sectionname')?.textContent.replace(/\s+/g, ' ').trim()
                    || node.dataset.sectionname || node.id
            }));
    }

    function restore() {
        document.querySelectorAll(`.${hiddenClass}`).forEach(node => node.classList.remove(hiddenClass));
        toolbar?.remove();
        toolbar = null;
        signature = '';
    }

    async function save(values) {
        if (saving) return;
        saving = true;
        toolbar?.querySelectorAll('input, button').forEach(input => { input.disabled = true; });
        try {
            await chrome.storage.local.set({ [storageKey]: values });
            selected = values;
        } catch (error) {
            const status = toolbar?.querySelector('[role="status"]');
            if (status) status.textContent = `Could not save selection: ${error.message}`;
            return;
        } finally {
            saving = false;
            toolbar?.querySelectorAll('input, button').forEach(input => { input.disabled = false; });
        }
        render();
    }

    function button(text, action) {
        const element = document.createElement('button');
        element.type = 'button';
        element.textContent = text;
        element.addEventListener('click', action);
        return element;
    }

    function render() {
        if (!ready) return;
        if (!enabled) { restore(); return; }
        const items = sections();
        if (!items.length) { restore(); return; }
        const nextSignature = JSON.stringify(items.map(({ id, title }) => [id, title]));
        if (!toolbar?.isConnected || signature !== nextSignature) {
            toolbar?.remove();
            toolbar = document.createElement('section');
            toolbar.id = 'xjtlu-section-selector';
            toolbar.setAttribute('aria-label', 'Course section selector');
            const heading = document.createElement('div');
            heading.className = 'xjtlu-section-heading';
            const title = document.createElement('strong');
            title.textContent = 'Show course sections';
            const badge = document.createElement('span');
            badge.className = 'xjtlu-assistant-badge';
            badge.textContent = 'XJTLU Assistant';
            title.append(badge);
            const actions = document.createElement('div');
            actions.className = 'xjtlu-section-actions';
            actions.append(button('Show all', () => save(null)), button('Hide all', () => save([])));
            heading.append(title, actions);
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Choose sections';
            const choices = document.createElement('div');
            choices.className = 'xjtlu-section-choices';
            for (const item of items) {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = item.id;
                checkbox.addEventListener('change', () => {
                    const checked = [...choices.querySelectorAll('input:checked')].map(input => input.value);
                    save(checked.length === items.length ? null : checked);
                });
                const text = document.createElement('span');
                text.textContent = item.title;
                label.append(checkbox, text);
                choices.append(label);
            }
            details.append(summary, choices);
            const status = document.createElement('p');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            toolbar.append(heading, details, status);
            document.querySelector('#region-main').prepend(toolbar);
            signature = nextSignature;
        }
        const valid = new Set(items.map(item => item.id));
        const stale = Array.isArray(selected) && selected.length > 0 && !selected.some(id => valid.has(id));
        const all = selected === null || stale;
        const visibleIds = new Set(all ? items.map(item => item.id) : selected);
        document.querySelectorAll(`.${hiddenClass}`).forEach(node => node.classList.remove(hiddenClass));
        for (const item of items) {
            const hide = !visibleIds.has(item.id);
            item.node.classList.toggle(hiddenClass, hide);
            // Moodle's course index is loaded asynchronously. Match its stable section ID,
            // with anchor links as a fallback for themes that omit that attribute.
            const index = document.querySelector('#courseindex');
            if (index) {
                for (const node of index.querySelectorAll('.courseindex-section, [data-for="section"]')) {
                    if (node.dataset.id === item.id || node.querySelector(`a[href$="#${item.anchor}"]`)) {
                        node.classList.toggle(hiddenClass, hide);
                    }
                }
            }
        }
        for (const checkbox of toolbar.querySelectorAll('input')) checkbox.checked = visibleIds.has(checkbox.value);
        const count = items.filter(item => visibleIds.has(item.id)).length;
        toolbar.querySelector('[role="status"]').textContent = stale
            ? 'Saved sections are no longer available. Showing all; choose a new selection.'
            : `${count} of ${items.length} sections shown. ${count ? 'Saved for this course on this browser.' : 'Choose a section or Show all to restore the page.'}`;
    }

    const observer = new MutationObserver(records => {
        if (records.every(record => toolbar?.contains(record.target))) return;
        if (pending) return;
        pending = true;
        queueMicrotask(() => { pending = false; render(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (!ready) return;
        if (area === 'sync' && (changes.courseSectionFilter || changes.learningMallRoots)) {
            if (changes.courseSectionFilter) featureEnabled = changes.courseSectionFilter.newValue ?? true;
            if (changes.learningMallRoots) roots = changes.learningMallRoots.newValue ?? XJTLU_DEFAULTS.learningMallRoots;
            enabled = featureEnabled && roots.includes(location.origin);
            render();
        }
        if (area === 'local' && changes[storageKey]) {
            const values = changes[storageKey].newValue;
            selected = Array.isArray(values) ? values.filter(value => typeof value === 'string') : null;
            render();
        }
    });
    Promise.all([
        chrome.storage.sync.get({ courseSectionFilter: true, learningMallRoots: XJTLU_DEFAULTS.learningMallRoots }),
        chrome.storage.local.get(storageKey)
    ]).then(([settings, saved]) => {
        roots = settings.learningMallRoots;
        featureEnabled = settings.courseSectionFilter;
        enabled = featureEnabled && roots.includes(location.origin);
        selected = Array.isArray(saved[storageKey]) ? saved[storageKey].filter(value => typeof value === 'string') : null;
        ready = true;
        render();
    }).catch(error => console.error('XJTLU section settings unavailable:', error));
})();

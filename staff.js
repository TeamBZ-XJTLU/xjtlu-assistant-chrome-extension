(function () {
    'use strict';

    let settings = { ...XJTLU_DEFAULTS };
    let generation = 0;
    const observers = new Set();
    const timers = new Set();
    const originalDisplays = new Map();
    const originalBackgrounds = new Map();

    const CORRECT_ROW_BACKGROUND = 'lightgreen';

    function sleep(ms) {
        const current = generation;
        return new Promise(resolve => setTimeout(resolve, ms)).then(() => {
            if (current !== generation) throw new Error('Staff settings changed. Operation stopped.');
        });
    }

    function styleButton(button) {
        button.classList.add('xjtlu-tool-button');
    }

    function styleBanner(banner) {
        banner.classList.add('xjtlu-tools-panel');
    }

    function styleBannerTopLine(line) {
        line.classList.add('xjtlu-tools-heading');
    }

    function addAssistantBadge(title) {
        title.classList.add('xjtlu-tools-title');
        const badge = document.createElement('span');
        badge.className = 'xjtlu-assistant-badge';
        badge.textContent = 'XJTLU Assistant';
        title.appendChild(badge);
    }

    function styleSelect(select) {
        select.classList.add('xjtlu-tool-select');
    }

    function getMainTarget() {
        return (
            document.querySelector('#region-main') ||
            document.querySelector('#page-content') ||
            document.querySelector('main') ||
            document.body
        );
    }

    function isQuizEditPage() {
        return location.pathname === '/mod/quiz/edit.php';
    }

    function isCourseOverviewPage() {
        return location.pathname === '/course/view.php';
    }

    function getReportMode() {
        if (location.pathname !== '/mod/quiz/report.php') return null;
        return new URLSearchParams(location.search).get('mode');
    }

    function getReportStorageKey(mode) {
        const params = new URLSearchParams(location.search);
        const quizId = params.get('id') || 'unknown';
        return `tm-quiz-report-display-${mode}-${quizId}${location.hostname === 'core.xjtlu.edu.cn' ? '' : ':' + location.origin}`;
    }

    function saveSelectedQuestions(mode, selectedValues) {
        localStorage.setItem(
            getReportStorageKey(mode),
            JSON.stringify(selectedValues)
        );
    }

    function loadSelectedQuestions(mode) {
        try {
            const raw = localStorage.getItem(getReportStorageKey(mode));
            if (!raw) return ['all'];

            const values = JSON.parse(raw);
            return Array.isArray(values) ? values : ['all'];
        } catch {
            return ['all'];
        }
    }

    function getMarkLinks() {
        return Array.from(
            document.querySelectorAll(
                'a.editing_maxmark[data-action="editmaxmark"]'
            )
        ).filter(a => a.offsetParent !== null);
    }

    function addEditPageBanner() {
        if (document.getElementById('tm-quiz-tools-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'tm-quiz-tools-banner';
        styleBanner(banner);

        const topLine = document.createElement('div');
        styleBannerTopLine(topLine);

        const text = document.createElement('span');
        text.textContent = 'Quiz Question Tools';
        text.className = 'xjtlu-tools-title';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = 'Remove All Questions';
        styleButton(removeButton);

        removeButton.addEventListener('click', async () => {
            const confirmed = confirm(
                'Remove ALL questions from this quiz? This changes the quiz for everyone. Questions remain in the question bank. Continue?'
            );

            if (!confirmed) return;

            try {
                removeButton.disabled = true;
                markButton.disabled = true;
                insertHeadingButton.disabled = true;
                removeButton.textContent = 'Removing...';
                await removeAllQuestions();
            } catch (error) {
                console.error(error);
                alert('Error: ' + error.message);
            } finally {
                removeButton.disabled = false;
                markButton.disabled = false;
                insertHeadingButton.disabled = false;
                removeButton.textContent = 'Remove All Questions';
            }
        });

        const markButton = document.createElement('button');
        markButton.type = 'button';
        markButton.textContent = 'Set Question Marks';
        styleButton(markButton);

        const insertHeadingButton = document.createElement('button');
        insertHeadingButton.type = 'button';
        insertHeadingButton.textContent = 'Modify Section Headings';
        styleButton(insertHeadingButton);
        insertHeadingButton.addEventListener('click', async () => {
            const buttons = [removeButton, markButton, insertHeadingButton];
            try {
                buttons.forEach(button => { button.disabled = true; });
                await showInsertHeadingDialog();
            } finally {
                buttons.forEach(button => { button.disabled = false; });
            }
        });

        markButton.addEventListener('click', async () => {
            const button = markButton;
            const label = button.textContent;
            try {
                markButton.disabled = true;
                insertHeadingButton.disabled = true;
                removeButton.disabled = true;
                button.textContent = 'Setting marks...';
                await showMarksDialog();
            } catch (error) {
                console.error(error);
                alert('Error: ' + error.message);
            } finally {
                markButton.disabled = false;
                insertHeadingButton.disabled = false;
                removeButton.disabled = false;
                button.textContent = label;
            }
        });

        addAssistantBadge(text);
        topLine.appendChild(text);
        if (settings.removeQuestions) topLine.appendChild(removeButton);
        if (settings.insertSectionHeading) topLine.appendChild(insertHeadingButton);
        if (settings.setMarks) topLine.appendChild(markButton);
        banner.appendChild(topLine);

        getMainTarget().prepend(banner);
    }

    function getHeadingRequestConfig() {
        const scripts = Array.from(document.scripts, script => script.textContent).join('\n');
        const match = scripts.match(/M\.mod_quiz\.init_section_toolbox\((\{[^\n]+?\})\);/);
        if (!match) throw new Error('Moodle heading controls are unavailable. No headings were changed.');
        const config = JSON.parse(match[1]);
        const endpoint = new URL(config.ajaxurl, location.origin);
        const sesskey = scripts.match(/"sesskey"\s*:\s*"([a-zA-Z0-9]+)"/)?.[1];
        if (endpoint.origin !== location.origin || endpoint.pathname !== '/mod/quiz/edit_rest.php'
            || !/^\d+$/.test(String(config.quizid)) || !sesskey) {
            throw new Error('Could not verify Moodle heading controls. No headings were changed.');
        }
        return { endpoint: endpoint.href, quizid: String(config.quizid), sesskey,
            courseid: String(config.courseid || ''), pageparams: config.config?.pageparams || {} };
    }

    function getHeadingInsertion(after, before, title) {
        after = Number(after);
        before = Number(before);
        title = title.trim();
        if (!Number.isSafeInteger(after) || after < 1 || !Number.isSafeInteger(before) || before < 1) {
            throw new Error('Enter two positive whole question numbers.');
        }
        if (!title || title.length > 255) throw new Error('Enter a section title between 1 and 255 characters.');
        const questions = Array.from(document.querySelectorAll('li.slot'));
        const numbered = questions.map(node => {
            const label = Array.from(node.querySelectorAll('.slotnumber')).find(label => label.offsetParent !== null);
            return { node, number: Number(label?.textContent.trim().match(/(\d+)$/)?.[1]) };
        });
        const left = numbered.filter(item => item.number === after);
        const right = numbered.filter(item => item.number === before);
        if (left.length !== 1 || right.length !== 1 || questions.indexOf(right[0].node) !== questions.indexOf(left[0].node) + 1) {
            throw new Error('Choose two adjacent displayed questions, in their current order.');
        }
        const section = right[0].node.closest('li.section');
        if (!section) throw new Error('Could not identify the target quiz section.');
        if (section.querySelector('li.slot') === right[0].node) {
            return { existing: true, sectionId: section.id, currentTitle: section.dataset.sectionname || '', title, after, before };
        }
        const page = right[0].node.previousElementSibling;
        const link = page?.matches('li.page') && page.querySelector('a[data-action="addasection"]');
        if (!link) throw new Error('Moodle needs a page break here. Add a page break between these questions, then retry.');
        const url = new URL(link.href, location.origin);
        if (url.origin !== location.origin || url.pathname !== '/mod/quiz/edit.php'
            || url.searchParams.get('cmid') !== new URLSearchParams(location.search).get('cmid')
            || !/^\d+$/.test(url.searchParams.get('addsectionatpage') || '')) {
            throw new Error('Could not verify the Moodle section insertion link.');
        }
        return { url: url.href, title, after, before, beforeId: right[0].node.id,
            questionIds: questions.map(node => node.id), sectionIds: Array.from(document.querySelectorAll('li.section'), node => node.id) };
    }

    async function modifySectionHeadings(firstTitle, rows, deletedIds = []) {
        firstTitle = firstTitle.trim();
        if (firstTitle.length > 255) throw new Error('The first title must be at most 255 characters.');
        const first = document.querySelector('li.section');
        if (!first || !/^section-\d+$/.test(first.id)) throw new Error('The first quiz section could not be identified.');
        const sections = Array.from(document.querySelectorAll('li.section'));
        const deletions = sections.slice(1).filter(section => deletedIds.includes(section.id)).reverse();
        if (new Set(deletedIds).size !== deletedIds.length || deletions.length !== deletedIds.length
            || deletions.some(section => !/^section-\d+$/.test(section.id)
                || !section.querySelector('a[data-action="deletesection"]'))) {
            throw new Error('Could not verify the headings selected for deletion. No headings were changed.');
        }
        const plans = rows.map(row => {
            if (!row.sectionId) return getHeadingInsertion(row.after, row.before, row.title);
            const section = sections.slice(1).find(section => section.id === row.sectionId);
            const title = row.title.trim();
            if (!section || !/^section-\d+$/.test(section.id) || deletedIds.includes(section.id)
                || !section.querySelector('a[data-action="edit_section_title"]') || title.length > 255) {
                throw new Error('Could not verify an existing heading. Load current headings and retry.');
            }
            return { existing: true, sectionId: section.id, currentTitle: section.dataset.sectionname || '',
                title, after: Number(row.after), before: Number(row.before) };
        });
        const boundaries = plans.filter(plan => Number.isSafeInteger(plan.before) && plan.before > 0);
        const existingIds = plans.filter(plan => plan.existing).map(plan => plan.sectionId);
        if (new Set(existingIds).size !== existingIds.length
            || new Set(boundaries.map(plan => plan.before)).size !== boundaries.length
            || plans.some(plan => deletedIds.includes(plan.sectionId))) throw new Error('Use each question boundary only once.');
        const config = getHeadingRequestConfig();
        const current = generation;
        const checkSettings = () => {
            if (current !== generation) throw new Error('Staff settings changed. Remaining heading changes stopped.');
        };
        // Keep a reusable recipe, never quiz-specific IDs, URLs, or session keys.
        await chrome.storage.local.set({ quizSectionHeadingPreset: { firstTitle,
            rows: plans.filter(plan => Number.isSafeInteger(plan.after) && plan.after > 0
                && Number.isSafeInteger(plan.before) && plan.before > 0 && plan.title)
                .map(({ after, before, title }) => ({ after, before, title })) } });
        let root = document;
        let attempted = false;
        let changed = 0;
        const rename = async (id, title) => {
            checkSettings();
            attempted = true;
            const response = await fetch(config.endpoint, { method: 'POST', credentials: 'same-origin',
                body: new URLSearchParams({ ...config.pageparams, class: 'section', field: 'updatesectiontitle',
                    id: id.replace('section-', ''), newheading: title, quizid: config.quizid,
                    courseid: config.courseid, sesskey: config.sesskey }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`Moodle heading rename failed (HTTP ${response.status}).`);
            const result = await response.json();
            if (result.error || result.instancesection !== title) throw new Error('Moodle did not confirm the supplied heading title.');
            changed++;
        };
        try {
            for (const plan of plans) {
                checkSettings();
                if (plan.existing) {
                    if (plan.currentTitle !== plan.title) await rename(plan.sectionId, plan.title);
                    continue;
                }
                const previousIds = Array.from(root.querySelectorAll('li.section'), node => node.id);
                // Follow the creation redirect without navigating away from the batch.
                attempted = true;
                const response = await fetch(plan.url, { method: 'POST', credentials: 'same-origin',
                    body: new URLSearchParams({ sesskey: config.sesskey }), signal: AbortSignal.timeout(15000) });
                const resultUrl = new URL(response.url);
                if (!response.ok || resultUrl.origin !== location.origin || resultUrl.pathname !== '/mod/quiz/edit.php'
                    || resultUrl.searchParams.get('cmid') !== new URLSearchParams(location.search).get('cmid')) {
                    throw new Error('Moodle did not return this quiz editor after adding a heading.');
                }
                root = new DOMParser().parseFromString(await response.text(), 'text/html');
                const ids = Array.from(root.querySelectorAll('li.slot'), node => node.id);
                const added = Array.from(root.querySelectorAll('li.section')).filter(node => !previousIds.includes(node.id));
                if (JSON.stringify(ids) !== JSON.stringify(plan.questionIds) || added.length !== 1
                    || !/^section-\d+$/.test(added[0].id) || added[0].querySelector('li.slot')?.id !== plan.beforeId) {
                    throw new Error('Could not verify a new heading at the requested question boundary.');
                }
                await rename(added[0].id, plan.title);
            }
            // Delete from the end so sections merge into their predecessor without moving questions.
            for (const section of deletions) {
                checkSettings();
                attempted = true;
                const response = await fetch(config.endpoint, { method: 'POST', credentials: 'same-origin',
                    body: new URLSearchParams({ ...config.pageparams, class: 'section', action: 'DELETE',
                        id: section.id.replace('section-', ''), quizid: config.quizid,
                        courseid: config.courseid, sesskey: config.sesskey }), signal: AbortSignal.timeout(15000) });
                if (!response.ok) throw new Error(`Moodle heading removal failed (HTTP ${response.status}).`);
                const result = await response.json();
                if (result.error || !result.deleted) throw new Error('Moodle did not confirm heading removal.');
                changed++;
            }
            if ((first.dataset.sectionname || '') !== firstTitle) await rename(first.id, firstTitle);
        } catch (error) {
            if (attempted) error.message += ' Some headings may already be saved. Refresh and check before retrying. Your recipe is saved; no automatic retry was made.';
            throw error;
        }
        if (changed) location.reload();
        return changed ? `Saved ${changed} heading changes. Recipe saved for other quizzes. Refreshing…`
            : 'All headings already match. Recipe saved for reuse on other quizzes.';
    }

    function getCurrentHeadingRows() {
        const questions = Array.from(document.querySelectorAll('li.slot'));
        const number = node => {
            const label = Array.from(node.querySelectorAll('.slotnumber')).find(label => label.offsetParent !== null);
            return Number(label?.textContent.trim().match(/(\d+)$/)?.[1]);
        };
        return Array.from(document.querySelectorAll('li.section')).slice(1).flatMap(section => {
            const question = section.querySelector('li.slot');
            const index = questions.indexOf(question);
            return [{ sectionId: section.id, after: index > 0 ? number(questions[index - 1]) : '',
                before: question ? number(question) : '', title: section.dataset.sectionname || '' }];
        });
    }

    async function showInsertHeadingDialog() {
        const saved = await chrome.storage.local.get('quizSectionHeadingPreset');
        const preset = saved.quizSectionHeadingPreset;
        const dialog = document.createElement('dialog');
        dialog.id = 'xjtlu-insert-heading-dialog';
        dialog.className = 'xjtlu-quiz-dialog xjtlu-headings-dialog';
        dialog.setAttribute('aria-labelledby', 'xjtlu-insert-heading-title');
        dialog.innerHTML = `<form>
            <h2 id="xjtlu-insert-heading-title">Modify section headings</h2>
            <p>Edit titles or add headings at page breaks. Deletions apply when you save and merge questions into the preceding section; separate shuffle settings are lost. Unlisted headings stay unchanged.</p>
            <label>First section heading<input name="firstTitle" type="text" maxlength="255" placeholder="No heading text"></label>
            <button type="button" data-action="clear-first">Clear first heading</button>
            <div class="xjtlu-heading-rows"></div>
            <div class="xjtlu-heading-add"><button type="button" data-action="add-row">Add another heading</button><button type="button" data-action="load-preset">Use saved headings</button><button type="button" data-action="load-current">Load current headings</button><button type="button" data-action="remove-all">Remove all headings</button></div>
            <p role="status" aria-live="polite">Your last submitted headings are saved locally for reuse on other quizzes. Changes finish before the quiz refreshes once.</p>
            <div class="xjtlu-range-footer"><button type="button" data-action="cancel">Cancel</button><button type="submit">Save headings</button></div>
        </form>`;
        const form = dialog.querySelector('form');
        const status = dialog.querySelector('[role="status"]');
        const container = dialog.querySelector('.xjtlu-heading-rows');
        const firstTitle = document.querySelector('li.section')?.dataset.sectionname || '';
        form.elements.firstTitle.value = firstTitle;
        const addRow = (values = {}) => {
            const row = document.createElement('div');
            row.className = 'xjtlu-heading-row';
            row.innerHTML = `<label>After question<input name="after" type="number" min="1" step="1" required></label>
                <label>Before question<input name="before" type="number" min="1" step="1" required></label>
                <label>Section title<input name="title" type="text" maxlength="255" required></label>
                <button type="button" aria-label="Remove heading row">Remove row</button>`;
            for (const key of ['after', 'before', 'title']) row.querySelector(`[name="${key}"]`).value = values[key] ?? '';
            if (values.sectionId) {
                row.dataset.sectionId = values.sectionId;
                for (const key of ['after', 'before']) {
                    const input = row.querySelector(`[name="${key}"]`);
                    input.readOnly = true;
                    input.required = false;
                }
                row.querySelector('[name="title"]').required = false;
                const button = row.querySelector('button');
                button.textContent = 'Delete heading';
                button.setAttribute('aria-label', 'Delete heading');
                button.addEventListener('click', () => {
                    const deleting = row.dataset.deleted !== 'true';
                    row.dataset.deleted = String(deleting);
                    row.querySelectorAll('input').forEach(input => { input.disabled = deleting; });
                    button.textContent = deleting ? 'Undo deletion' : 'Delete heading';
                    button.setAttribute('aria-label', button.textContent);
                    status.textContent = deleting ? 'Heading marked for deletion. Save headings to apply.' : 'Heading kept.';
                });
            } else row.querySelector('button').addEventListener('click', () => row.remove());
            container.append(row);
        };
        const loadCurrent = () => {
            container.replaceChildren();
            getCurrentHeadingRows().forEach(addRow);
            form.elements.firstTitle.value = document.querySelector('li.section')?.dataset.sectionname || '';
            status.textContent = 'Current headings loaded. Edit titles or mark individual headings for deletion, then save.';
        };
        dialog.querySelector('[data-action="load-current"]').addEventListener('click', loadCurrent);
        dialog.querySelector('[data-action="clear-first"]').addEventListener('click', () => {
            form.elements.firstTitle.value = '';
            status.textContent = 'The first heading title will be cleared when you save. Moodle requires this first section.';
        });
        dialog.querySelector('[data-action="remove-all"]').addEventListener('click', () => {
            loadCurrent();
            form.elements.firstTitle.value = '';
            for (const row of container.children) row.querySelector('button').click();
            status.textContent = 'All extra headings marked for deletion; the first title will be cleared. Save headings to apply. Questions and marks are kept.';
        });
        const currentRows = getCurrentHeadingRows();
        const initialRows = currentRows.length ? currentRows : Array.isArray(preset?.rows) ? preset.rows : [];
        initialRows.forEach(addRow);
        dialog.querySelector('[data-action="add-row"]').addEventListener('click', () => addRow());
        const load = dialog.querySelector('[data-action="load-preset"]');
        load.disabled = !Array.isArray(preset?.rows);
        load.addEventListener('click', () => {
            container.replaceChildren();
            preset.rows.forEach(addRow);
            form.elements.firstTitle.value = preset.firstTitle || '';
            status.textContent = 'Saved headings loaded. Review them, then Save headings to apply to this quiz.';
        });
        let running = false;
        dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());
        dialog.addEventListener('cancel', event => { if (running) event.preventDefault(); });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (running) return;
            const activeRows = Array.from(container.children).filter(row => row.dataset.deleted !== 'true');
            const rows = activeRows.map(row => ({ sectionId: row.dataset.sectionId,
                ...Object.fromEntries(['after', 'before', 'title'].map(key => [key, row.querySelector(`[name="${key}"]`).value])) }));
            const deletedIds = Array.from(container.children).filter(row => row.dataset.deleted === 'true').map(row => row.dataset.sectionId);
            running = true;
            for (const input of form.querySelectorAll('input, button')) input.disabled = true;
            status.classList.remove('xjtlu-range-error');
            status.textContent = 'Validating and saving headings…';
            try {
                status.textContent = await modifySectionHeadings(form.elements.firstTitle.value, rows, deletedIds);
            } catch (error) {
                status.textContent = error.message;
                status.classList.add('xjtlu-range-error');
            } finally {
                running = false;
                for (const input of form.querySelectorAll('input, button')) input.disabled = false;
                load.disabled = !Array.isArray(preset?.rows);
                for (const row of container.children) if (row.dataset.deleted === 'true') row.querySelectorAll('input').forEach(input => { input.disabled = true; });
            }
        });
        return new Promise(resolve => {
            dialog.addEventListener('close', () => { dialog.remove(); resolve(); }, { once: true });
            document.body.append(dialog);
            dialog.showModal();
        });
    }

    async function waitForConfirmModal(timeout = 10000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const modals = document.querySelectorAll('.modal-content');

            for (const modal of modals) {
                const body = modal.querySelector('.modal-body');
                const yesButton = modal.querySelector(
                    'button.btn.btn-primary[data-action="save"]'
                );

                if (!body || !yesButton || modal.offsetParent === null) {
                    continue;
                }

                const text = body.innerText.trim();

                if (text === 'Are you sure you want to remove all the selected questions?') {
                    return modal;
                }
            }

            await sleep(200);
        }

        throw new Error('Confirmation modal not found.');
    }

    async function waitForQuestionRemoval(timeout = 15000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            await sleep(300);

            if (document.querySelectorAll('li.slot').length === 0) {
                return true;
            }
        }

        return false;
    }

    async function removeAllQuestions() {
        const questions = Array.from(document.querySelectorAll('li.slot'));
        if (questions.length === 0) {
            alert('Quiz is empty.');
            return;
        }

        // Moodle refuses bulk removal of a whole section when multiple headings exist.
        if (document.querySelectorAll('li.section').length > 1) {
            throw new Error('Moodle cannot bulk-delete every question when a quiz has multiple section headings. Remove the extra section headings first (keeping their questions), then retry. No questions were removed.');
        }

        const selectMultiple = document.getElementById('selectmultiplecommand');
        const selectAll = document.getElementById('questionselectall');
        const deleteSelected = document.getElementById('selectmultipledeletecommand');
        if (!selectMultiple || !selectAll || !deleteSelected) {
            throw new Error('Moodle bulk-selection controls are unavailable. No questions were removed.');
        }
        if (selectAll.offsetParent === null) selectMultiple.click();
        await sleep(200);
        if (selectAll.offsetParent === null || deleteSelected.offsetParent === null) {
            throw new Error('Could not open Moodle bulk-selection controls. No questions were removed.');
        }

        const checkboxes = questions.map(question => question.querySelector('input.select-multiple-checkbox'));
        if (checkboxes.some(checkbox => !checkbox || checkbox.disabled)) {
            throw new Error('Not every question can be selected. No questions were removed.');
        }
        if (!checkboxes.every(checkbox => checkbox.checked)) selectAll.click();
        await sleep(200);
        if (!checkboxes.every(checkbox => checkbox.checked && document.body.contains(checkbox))
            || document.querySelectorAll('li.slot').length !== questions.length || deleteSelected.disabled) {
            throw new Error('Moodle did not select every question. No questions were removed.');
        }

        deleteSelected.click();
        const modal = await waitForConfirmModal();
        const yesButton = modal.querySelector('button.btn.btn-primary[data-action="save"]');
        yesButton.click();
        if (!await waitForQuestionRemoval()) {
            throw new Error('Moodle did not remove every selected question. Check the quiz before trying again.');
        }
        alert('All questions are removed.');
    }

    async function waitForMaxMarkInput(timeout = 10000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const input = document.querySelector('input[name="maxmark"]');

            if (input && input.offsetParent !== null) {
                return input;
            }

            await sleep(200);
        }

        throw new Error('Max mark input not found.');
    }

    async function waitForMaxMarkInputDisappear(timeout = 10000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const input = document.querySelector('input[name="maxmark"]');

            if (!input || input.offsetParent === null) {
                return true;
            }

            await sleep(200);
        }

        return false;
    }

    function getRangeMarkLinks(markLinks, range) {
        const match = range.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
        const start = match ? Number(match[1]) : NaN;
        const end = match ? Number(match[2] || match[1]) : NaN;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
            throw new Error('Enter a question range such as 16-25, or a single number such as 16.');
        }
        const numbers = new Set();
        const links = markLinks.filter(link => {
            const labels = link.closest('li.slot')?.querySelectorAll('.slotnumber') || [];
            const label = Array.from(labels).find(node => node.offsetParent !== null);
            const number = Number(label?.textContent.trim().match(/(\d+)$/)?.[1]);
            if (number < start || number > end || !Number.isSafeInteger(number)) return false;
            numbers.add(number);
            return true;
        });
        if (numbers.size !== end - start + 1 || links.length !== numbers.size) {
            throw new Error('Every question in the range must have one visible question number and an editable mark. No marks were changed.');
        }
        return links;
    }

    function planQuestionMarks(groups) {
        if (!Array.isArray(groups) || !groups.length) throw new Error('Add at least one group of marks.');
        const links = getMarkLinks();
        const assigned = new Set();
        const recipe = [];
        const updates = [];
        for (const group of groups) {
            const start = Number(group.start);
            const end = Number(group.end);
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
                throw new Error('Each group needs a positive whole Start question and an End question at least as large.');
            }
            const mark = String(group.mark ?? '').trim();
            if (!mark || !Number.isFinite(Number(mark)) || Number(mark) < 0) throw new Error('Enter a finite, non-negative mark for every group.');
            const selected = getRangeMarkLinks(links, `${start}-${end}`);
            for (const link of selected) {
                if (assigned.has(link)) throw new Error('Question ranges must not overlap. Each question can belong to only one group.');
                assigned.add(link);
                updates.push({ link, mark });
            }
            recipe.push({ start, end, mark });
        }
        return { updates, recipe };
    }

    async function showMarksDialog() {
        const stored = await chrome.storage.local.get('quizMarkGroups');
        let previous = Array.isArray(stored.quizMarkGroups) ? stored.quizMarkGroups : null;
        const dialog = document.createElement('dialog');
        dialog.id = 'xjtlu-range-marks-dialog';
        dialog.className = 'xjtlu-quiz-dialog xjtlu-headings-dialog';
        dialog.setAttribute('aria-labelledby', 'xjtlu-range-marks-title');
        dialog.innerHTML = `<form>
            <h2 id="xjtlu-range-marks-title">Set question marks</h2>
            <p>Use one row for all questions, or add groups with different marks. Questions outside the ranges keep their marks.</p>
            <div class="xjtlu-mark-rows"></div>
            <div class="xjtlu-heading-add"><button type="button" data-action="add-group">Add another group</button><button type="button" data-action="all">All questions</button><button type="button" data-action="load">Use saved marks</button></div>
            <p role="status" aria-live="polite">All groups are checked before saving. Your last submitted settings are saved locally for reuse on other quizzes.</p>
            <div class="xjtlu-range-footer"><button type="button" data-action="cancel">Cancel</button><button type="submit">Apply marks</button></div>
        </form>`;
        const form = dialog.querySelector('form');
        const container = dialog.querySelector('.xjtlu-mark-rows');
        const status = dialog.querySelector('[role="status"]');
        const cancel = dialog.querySelector('[data-action="cancel"]');
        const load = dialog.querySelector('[data-action="load"]');
        const addGroup = (group = {}) => {
            const row = document.createElement('div');
            row.className = 'xjtlu-heading-row';
            row.innerHTML = `<label>Start question<input name="start" type="number" min="1" step="1" required></label>
                <label>End question<input name="end" type="number" min="1" step="1" required></label>
                <label>Marks per question<input name="mark" type="number" min="0" step="any" required></label>
                <button type="button" aria-label="Remove marks group">Remove group</button>`;
            for (const key of ['start', 'end', 'mark']) row.querySelector(`[name="${key}"]`).value = group[key] ?? '';
            row.querySelector('button').addEventListener('click', () => row.remove());
            container.append(row);
        };
        const showGroups = groups => { container.replaceChildren(); groups.forEach(addGroup); };
        const allQuestions = () => {
            const numbers = Array.from(document.querySelectorAll('li.slot')).map(node => {
                const label = Array.from(node.querySelectorAll('.slotnumber')).find(label => label.offsetParent !== null);
                return Number(label?.textContent.trim().match(/(\d+)$/)?.[1]);
            }).filter(Number.isSafeInteger);
            showGroups([{ start: numbers.length ? Math.min(...numbers) : '', end: numbers.length ? Math.max(...numbers) : '', mark: '' }]);
        };
        if (previous?.length) showGroups(previous);
        else allQuestions();
        load.disabled = !previous?.length;
        load.addEventListener('click', () => {
            showGroups(previous);
            status.textContent = 'Saved marks loaded. Review the ranges for this quiz, then Apply marks.';
        });
        dialog.querySelector('[data-action="add-group"]').addEventListener('click', () => addGroup());
        dialog.querySelector('[data-action="all"]').addEventListener('click', allQuestions);
        let running = false;
        cancel.addEventListener('click', () => dialog.close());
        dialog.addEventListener('cancel', event => { if (running) event.preventDefault(); });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (running) return;
            const groups = Array.from(container.children, row => Object.fromEntries(['start', 'end', 'mark'].map(key => [key, row.querySelector(`[name="${key}"]`).value])));
            running = true;
            for (const input of form.querySelectorAll('input, button')) input.disabled = true;
            status.classList.remove('xjtlu-range-error');
            try {
                status.textContent = await setQuestionMarks(groups, message => { status.textContent = message; });
                previous = groups.map(({ start, end, mark }) => ({ start: Number(start), end: Number(end), mark: String(mark).trim() }));
                cancel.textContent = 'Close';
            } catch (error) {
                status.textContent = error.message;
                status.classList.add('xjtlu-range-error');
            } finally {
                running = false;
                for (const input of form.querySelectorAll('input, button')) input.disabled = false;
                load.disabled = !previous?.length;
            }
        });
        return new Promise(resolve => {
            dialog.addEventListener('close', () => { dialog.remove(); resolve(); }, { once: true });
            document.body.append(dialog);
            dialog.showModal();
        });
    }

    async function setQuestionMarks(groups, progress = () => {}) {
        const { updates, recipe } = planQuestionMarks(groups);
        const current = generation;
        await chrome.storage.local.set({ quizMarkGroups: recipe });
        let completed = 0;
        for (const { link, mark } of updates) {
            if (current !== generation) throw new Error('Staff settings changed. Operation stopped; earlier updates remain saved.');
            progress(`Saving question marks: ${completed + 1} of ${updates.length}…`);
            if (!document.body.contains(link)) {
                throw new Error('The question list changed. Operation stopped; earlier updates remain saved. Reload the page before trying again.');
            }

            link.click();

            const input = await waitForMaxMarkInput();

            input.focus();
            input.select();
            input.value = mark;

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            const form = input.closest('form');

            if (form && typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else if (form) {
                form.submit();
            } else {
                input.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    })
                );

                input.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    })
                );
            }

            const saved = await waitForMaxMarkInputDisappear();

            if (!saved) {
                throw new Error(
                    'The mark input did not close after submitting.'
                );
            }

            await sleep(500);
            completed++;
        }
        return `Marks updated for ${completed} questions across ${recipe.length} group(s). Settings saved for reuse.`;
    }

    function getReportTable() {
        const tables = Array.from(document.querySelectorAll('table'));

        return tables.find(table => {
            return (
                table.querySelector('thead th a[data-sortby^="qsgrade"]') ||
                table.querySelector('thead th a[data-sortby^="question"]') ||
                table.querySelector('thead th a[data-sortby^="response"]') ||
                table.querySelector('thead th a[data-sortby^="right"]')
            );
        });
    }

    function getOverviewQuestionColumns(table) {
        const headerCells = Array.from(table.querySelectorAll('thead th'));

        return headerCells
            .map((th, index) => {
                const sortLink = th.querySelector('a[data-sortby^="qsgrade"]');

                if (!sortLink) return null;

                const text = th.innerText.replace(/\s+/g, ' ').trim();
                const questionMatch = text.match(/Q\.\s*(\d+)/i);
                const maxMarkMatch = text.match(/\/\s*([0-9.]+)/);

                return {
                    questionNumber: questionMatch
                        ? Number(questionMatch[1])
                        : index + 1,
                    label: questionMatch
                        ? `Q. ${questionMatch[1]}${maxMarkMatch ? ` /${maxMarkMatch[1]}` : ''}`
                        : text,
                    columns: [index]
                };
            })
            .filter(Boolean);
    }

    function getResponsesQuestionGroups(table) {
        const headerCells = Array.from(table.querySelectorAll('thead th'));
        const groups = new Map();

        for (let index = 0; index < headerCells.length; index++) {
            const th = headerCells[index];

            const sortLink = th.querySelector(
                'a[data-sortby^="question"], a[data-sortby^="response"], a[data-sortby^="right"]'
            );

            if (!sortLink) continue;

            const text = th.innerText.replace(/\s+/g, ' ').trim();

            const questionMatch = text.match(/^Question\s+(\d+)/i);
            const responseMatch = text.match(/^Response\s+(\d+)/i);
            const rightMatch = text.match(/^Right answer\s+(\d+)/i);

            const questionNumber = questionMatch
                ? Number(questionMatch[1])
                : responseMatch
                    ? Number(responseMatch[1])
                    : rightMatch
                        ? Number(rightMatch[1])
                        : null;

            if (!questionNumber) continue;

            if (!groups.has(questionNumber)) {
                groups.set(questionNumber, {
                    questionNumber,
                    label: `Question ${questionNumber}`,
                    columns: []
                });
            }

            groups.get(questionNumber).columns.push(index);
        }

        return Array.from(groups.values()).sort(
            (a, b) => a.questionNumber - b.questionNumber
        );
    }

    function setColumnVisible(table, columnIndex, visible) {
        const rows = Array.from(table.querySelectorAll('tr'));

        for (const row of rows) {
            const cells = Array.from(row.children);
            const cell = cells[columnIndex];

            if (cell) {
                if (!originalDisplays.has(cell)) originalDisplays.set(cell, cell.style.display);
                cell.style.display = visible ? originalDisplays.get(cell) : 'none';
            }
        }
    }

    function getQuestionCheckboxes(container) {
        return Array.from(
            container.querySelectorAll('input[type="checkbox"][data-question-value]')
        );
    }

    function getSelectedQuestionValues(container) {
        return getQuestionCheckboxes(container)
            .filter(input => input.checked)
            .map(input => input.dataset.questionValue);
    }

    function getSelectedQuestionNumbers(container) {
        const selectedValues = getSelectedQuestionValues(container);

        if (
            selectedValues.includes('all')
        ) {
            return null;
        }

        return new Set(selectedValues.map(value => Number(value)));
    }

    function getShownQuestionGroups(questionGroups, container) {
        const selectedQuestionNumbers = getSelectedQuestionNumbers(container);

        if (selectedQuestionNumbers === null) {
            return questionGroups;
        }

        return questionGroups.filter(group =>
            selectedQuestionNumbers.has(group.questionNumber)
        );
    }

    function isQuestionCellCorrect(cell) {
        if (!cell) return false;

        if (
            cell.querySelector('.incorrect') ||
            cell.querySelector('.partiallycorrect') ||
            cell.querySelector('[title="Incorrect"]') ||
            cell.querySelector('[title="Partially correct"]') ||
            cell.querySelector('[aria-label="Incorrect"]') ||
            cell.querySelector('[aria-label="Partially correct"]')
        ) {
            return false;
        }

        return Boolean(
            cell.querySelector('.correct') ||
            cell.querySelector('[title="Correct"]') ||
            cell.querySelector('[aria-label="Correct"]')
        );
    }

    function clearRowHighlight(row) {
        for (const element of [row, ...row.children]) {
            if (originalBackgrounds.has(element)) {
                element.style.backgroundColor = originalBackgrounds.get(element);
                originalBackgrounds.delete(element);
            }
        }
    }

    function highlightRow(row) {
        for (const element of [row, ...row.children]) {
            if (!originalBackgrounds.has(element)) originalBackgrounds.set(element, element.style.backgroundColor);
            element.style.backgroundColor = CORRECT_ROW_BACKGROUND;
        }
    }

    function updateCorrectRowHighlights(table, questionGroups, container, mode) {
        if (mode !== 'overview' || !settings.correctHighlight) return;

        const shownGroups = getShownQuestionGroups(questionGroups, container);
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));

        for (const row of bodyRows) {
            clearRowHighlight(row);

            if (shownGroups.length === 0) {
                continue;
            }

            const cells = Array.from(row.children);

            const allShownCorrect = shownGroups.every(group => {
                return group.columns.every(columnIndex => {
                    return isQuestionCellCorrect(cells[columnIndex]);
                });
            });

            if (allShownCorrect) {
                highlightRow(row);
            }
        }
    }

    function showSelectedQuestionGroups(table, questionGroups, container, mode) {
        const selectedQuestionNumbers = getSelectedQuestionNumbers(container);

        for (const group of questionGroups) {
            const visible =
                selectedQuestionNumbers === null ||
                selectedQuestionNumbers.has(group.questionNumber);

            for (const columnIndex of group.columns) {
                setColumnVisible(table, columnIndex, visible);
            }
        }

        updateCorrectRowHighlights(table, questionGroups, container, mode);
    }

    function applySavedQuestionSelection(mode, container) {
        const savedValues = loadSelectedQuestions(mode);
        const checkboxes = getQuestionCheckboxes(container);
        const validValues = new Set(
            checkboxes.map(input => input.dataset.questionValue)
        );

        const showAll = savedValues.includes('all') || (savedValues.length > 0
            && !savedValues.some(value => validValues.has(value)));
        for (const checkbox of checkboxes) {
            checkbox.checked = showAll || savedValues.includes(checkbox.dataset.questionValue);
        }
    }

    function createQuestionCheckbox(value, text, checked = false) {
        const label = document.createElement('label');
        label.className = 'xjtlu-report-question';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.questionValue = value;
        checkbox.checked = checked;

        const span = document.createElement('span');
        span.textContent = text;

        label.appendChild(checkbox);
        label.appendChild(span);

        return label;
    }

    function getQuizLinksFromCoursePage() {
        const links = Array.from(
            document.querySelectorAll('a[href*="/mod/quiz/view.php?id="]')
        );

        const quizzes = [];
        const seenIds = new Set();

        for (const link of links) {
            const url = new URL(link.href, location.origin);
            const quizId = url.searchParams.get('id');

            if (!quizId || seenIds.has(quizId)) {
                continue;
            }

            seenIds.add(quizId);

            const activity =
                link.closest('.activity') ||
                link.closest('li') ||
                link.closest('.modtype_quiz') ||
                link;

            const instanceName =
                activity.querySelector('.instancename') ||
                link.querySelector('.instancename');

            const label = (
                instanceName?.innerText ||
                link.innerText ||
                link.getAttribute('aria-label') ||
                `Quiz ${quizId}`
            )
                .replace(/\s+/g, ' ')
                .replace(/\bQuiz\b$/i, '')
                .trim();

            quizzes.push({
                id: quizId,
                label: label || `Quiz ${quizId}`,
                url: url.href
            });
        }

        return quizzes;
    }

    function addCourseOverviewBanner() {
        if (document.getElementById('tm-course-quiz-tools-banner')) return;

        const quizzes = getQuizLinksFromCoursePage();

        if (quizzes.length === 0) return;

        const banner = document.createElement('div');
        banner.id = 'tm-course-quiz-tools-banner';
        styleBanner(banner);

        const topLine = document.createElement('div');
        styleBannerTopLine(topLine);

        const title = document.createElement('span');
        title.textContent = 'Course Quiz Tools';
        title.className = 'xjtlu-tools-title';

        const count = document.createElement('span');
        count.className = 'xjtlu-tools-count';
        count.textContent = `Total quizzes: ${quizzes.length}`;

        const label = document.createElement('span');
        label.textContent = 'Open quiz:';

        const select = document.createElement('select');
        styleSelect(select);

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'All Quizzes';
        select.appendChild(placeholder);

        for (const quiz of quizzes) {
            const option = document.createElement('option');
            option.value = quiz.url;
            option.textContent = `${quiz.label} (id=${quiz.id})`;
            select.appendChild(option);
        }

        select.addEventListener('change', () => {
            if (!select.value) return;

            window.open(select.value, '_blank', 'noopener');
            select.value = '';
        });

        addAssistantBadge(title);
        topLine.appendChild(title);
        topLine.appendChild(count);
        topLine.appendChild(label);
        topLine.appendChild(select);

        banner.appendChild(topLine);
        getMainTarget().prepend(banner);
    }

    function waitForCourseQuizzesAndAddBanner(timeout = 10000) {
        if (getQuizLinksFromCoursePage().length > 0) {
            addCourseOverviewBanner();
            return;
        }

        const observer = new MutationObserver(() => {
            if (getQuizLinksFromCoursePage().length > 0) {
                observer.disconnect();
                observers.delete(observer);
                addCourseOverviewBanner();
            }
        });

        observers.add(observer);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        const timer = setTimeout(() => {
            timers.delete(timer);
            observer.disconnect();
            observers.delete(observer);
        }, timeout);
        timers.add(timer);
    }

    function addReportPageBanner(mode) {
        if (document.getElementById('tm-quiz-report-tools-banner')) return;

        const table = getReportTable();

        if (!table) return;

        const questionGroups =
            mode === 'overview'
                ? getOverviewQuestionColumns(table)
                : getResponsesQuestionGroups(table);

        if (questionGroups.length === 0) return;

        const banner = document.createElement('div');
        banner.id = 'tm-quiz-report-tools-banner';
        styleBanner(banner);

        const topLine = document.createElement('div');
        styleBannerTopLine(topLine);

        const title = document.createElement('span');
        title.textContent =
            mode === 'responses'
                ? 'Quiz Responses Report Tools'
                : 'Quiz Overview Report Tools';

        addAssistantBadge(title);
        topLine.appendChild(title);
        const buttonLine = document.createElement('div');
        buttonLine.id = 'tm-quiz-report-question-buttons';
        buttonLine.className = 'xjtlu-report-choices';
        for (const group of questionGroups) {
            buttonLine.appendChild(createQuestionCheckbox(String(group.questionNumber), group.label, true));
        }
        if (settings.reportFilter) applySavedQuestionSelection(mode, buttonLine);
        const status = document.createElement('p');
        status.className = 'xjtlu-report-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const update = (save = false) => {
            showSelectedQuestionGroups(table, questionGroups, buttonLine, mode);
            const values = getSelectedQuestionValues(buttonLine);
            status.textContent = `${values.length} of ${questionGroups.length} questions shown. Saved for this quiz on this browser.`;
            if (save) {
                try { saveSelectedQuestions(mode, values); }
                catch { status.textContent += ' Could not save these choices.'; }
            }
        };
        if (settings.reportFilter) {
            for (const [label, checked] of [['Show all', true], ['Hide all', false]]) {
                const button = document.createElement('button');
                button.type = 'button'; button.textContent = label; styleButton(button);
                button.addEventListener('click', () => {
                    for (const checkbox of getQuestionCheckboxes(buttonLine)) checkbox.checked = checked;
                    update(true);
                });
                topLine.appendChild(button);
            }
            buttonLine.addEventListener('change', event => {
                if (event.target.matches('input[type="checkbox"][data-question-value]')) update(true);
            });
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Choose questions';
            details.append(summary, buttonLine);
            banner.append(topLine, details, status);
        } else {
            status.textContent = 'Highlighting attempts with all questions correct.';
            banner.append(topLine, status);
        }
        if (settings.reportFilter) update();
        else showSelectedQuestionGroups(table, questionGroups, buttonLine, mode);

        getMainTarget().prepend(banner);
    }

    function waitForReportTableAndAddBanner(mode, timeout = 10000) {
        if (getReportTable()) {
            addReportPageBanner(mode);
            return;
        }

        const observer = new MutationObserver(() => {
            if (getReportTable()) {
                observer.disconnect();
                observers.delete(observer);
                addReportPageBanner(mode);
            }
        });

        observers.add(observer);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        const timer = setTimeout(() => {
            timers.delete(timer);
            observer.disconnect();
            observers.delete(observer);
        }, timeout);
        timers.add(timer);
    }

    function init() {
        if (!settings.learningMallRoots.includes(location.origin) || !settings.staffEnabled) return;

        if (isQuizEditPage() && (settings.removeQuestions || settings.insertSectionHeading || settings.setMarks)) {
            addEditPageBanner();
            return;
        }

        if (isCourseOverviewPage() && settings.courseQuizzes) {
            waitForCourseQuizzesAndAddBanner();
            return;
        }

        const mode = getReportMode();

        if ((mode === 'overview' && (settings.reportFilter || settings.correctHighlight)) || (mode === 'responses' && settings.reportFilter)) {
            waitForReportTableAndAddBanner(mode);
        }
    }

    function reset() {
        generation++;
        document.getElementById('xjtlu-range-marks-dialog')?.close();
        document.getElementById('xjtlu-insert-heading-dialog')?.close();
        for (const observer of observers) observer.disconnect();
        observers.clear();
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        for (const [cell, display] of originalDisplays) cell.style.display = display;
        originalDisplays.clear();
        for (const [element, background] of originalBackgrounds) element.style.backgroundColor = background;
        originalBackgrounds.clear();
        for (const id of ['tm-quiz-tools-banner', 'tm-course-quiz-tools-banner', 'tm-quiz-report-tools-banner']) {
            document.getElementById(id)?.remove();
        }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !Object.keys(changes).some(key => key !== 'courseSectionFilter' && key in XJTLU_DEFAULTS)) return;
        for (const key of Object.keys(XJTLU_DEFAULTS)) {
            if (changes[key]) settings[key] = changes[key].newValue ?? XJTLU_DEFAULTS[key];
        }
        reset();
        init();
    });
    chrome.storage.sync.get(XJTLU_DEFAULTS).then(values => {
        settings = values;
        init();
    }).catch(error => console.error('XJTLU Assistant settings unavailable:', error));
})();

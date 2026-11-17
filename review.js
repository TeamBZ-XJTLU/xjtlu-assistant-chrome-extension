(() => {
    'use strict';
    if (location.pathname !== '/mod/quiz/review.php') return;
    const hiddenClass = 'xjtlu-review-hidden';
    const textClass = 'xjtlu-review-text';
    const answerSelector = '.answer, .ablock, .subquestion, input:not([type="hidden"]), textarea, select';
    let settings = { ...XJTLU_DEFAULTS };
    let revealed = false;
    let toolbar;

    function maskBody(node) {
        if (node.matches(answerSelector)) return;
        if (!node.querySelector(answerSelector)) {
            node.classList.add(hiddenClass);
            return;
        }
        // Cloze answers can be nested in paragraphs or syntax-highlighted code, without a .qtext wrapper.
        for (const child of [...node.childNodes]) {
            if (child.nodeType === Node.TEXT_NODE) {
                if (!child.textContent.trim()) continue;
                const span = document.createElement('span');
                span.className = `${textClass} ${hiddenClass}`;
                child.replaceWith(span);
                span.append(child);
            } else if (child.nodeType === Node.ELEMENT_NODE) maskBody(child);
        }
    }

    function restore() {
        document.querySelectorAll(`.${hiddenClass}`).forEach(node => node.classList.remove(hiddenClass));
        document.querySelectorAll(`.${textClass}`).forEach(node => node.replaceWith(...node.childNodes));
        document.querySelectorAll('.xjtlu-review-masked').forEach(node => node.classList.remove('xjtlu-review-masked'));
    }

    function render() {
        observer.disconnect();
        restore();
        const enabled = settings.reviewHideBody && settings.learningMallRoots.includes(location.origin);
        const questions = document.querySelectorAll('.que .formulation');
        if (!enabled || !questions.length) {
            toolbar?.remove();
            toolbar = null;
        } else {
            if (!toolbar?.isConnected) {
                toolbar = document.createElement('button');
                toolbar.id = 'xjtlu-review-tools';
                toolbar.type = 'button';
                toolbar.title = 'XJTLU Assistant · Attempt review';
                toolbar.addEventListener('click', () => { revealed = !revealed; render(); });
                document.body.append(toolbar);
            }
            toolbar.textContent = revealed ? 'Hide question bodies' : 'Show question bodies';
            toolbar.setAttribute('aria-pressed', String(revealed));
            if (!revealed) for (const question of questions) {
                maskBody(question);
                question.classList.add('xjtlu-review-masked');
            }
        }
        observer.observe(document.body, { childList: true, subtree: true });
    }

    const observer = new MutationObserver(render);
    render();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const key of ['reviewHideBody', 'learningMallRoots']) {
            if (changes[key]) settings[key] = changes[key].newValue ?? XJTLU_DEFAULTS[key];
        }
        render();
    });
    chrome.storage.sync.get(XJTLU_DEFAULTS).then(value => {
        settings = value;
        render();
    }).catch(error => console.error('XJTLU review settings unavailable:', error));
})();

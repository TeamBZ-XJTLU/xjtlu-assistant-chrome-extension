(() => {
    'use strict';
    if (globalThis.xjtluFloatingLoaded) return;
    globalThis.xjtluFloatingLoaded = true;
    const selector = '.xjtlu-tools-panel, #xjtlu-section-selector, #xjtlu-ams-actions, #xjtlu-review-tools';
    let root, menu, toggle;

    function close() {
        if (!menu) return;
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    }

    function render() {
        const panels = [...document.querySelectorAll(selector)];
        if (!panels.length) {
            root?.remove();
            root = menu = toggle = null;
            return;
        }
        if (!root?.isConnected) {
            root = document.createElement('aside');
            root.id = 'xjtlu-floating-tools';
            root.setAttribute('aria-label', 'XJTLU Assistant tools');
            menu = document.createElement('div');
            menu.id = 'xjtlu-floating-menu';
            menu.hidden = true;
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'xjtlu-floating-toggle';
            toggle.textContent = 'XJTLU tools';
            toggle.setAttribute('aria-controls', menu.id);
            toggle.setAttribute('aria-expanded', 'false');
            toggle.addEventListener('click', () => {
                menu.hidden = !menu.hidden;
                toggle.setAttribute('aria-expanded', String(!menu.hidden));
            });
            root.append(menu, toggle);
            // Keep AMS actions inside its modal so the native focus trap still includes them.
            const host = panels.find(panel => panel.id === 'xjtlu-ams-actions')?.closest('.el-dialog') || document.body;
            host.append(root);
        }
        for (const panel of panels) if (panel.parentElement !== menu) menu.append(panel);
    }

    document.addEventListener('click', event => {
        if (root && !root.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menu && !menu.hidden) {
            close();
            toggle.focus();
        }
    });
    new MutationObserver(render).observe(document.body, { childList: true, subtree: true });
    render();
})();

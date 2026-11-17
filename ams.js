(() => {
    'use strict';
    const toolbarId = 'xjtlu-ams-actions';
    const preparedLists = new WeakSet();

    function studentModal() {
        if (location.hash.split('?')[0] !== '#/signIn/myCourseSession') return null;
        for (const dialog of document.querySelectorAll('.el-dialog')) {
            if (!dialog.getClientRects().length) continue;
            // AMS's Vue component owns the complete list, including undisplayed pages.
            let vm = dialog.closest('.el-dialog__wrapper')?.__vue__;
            while (vm && vm.$options?.name !== 'sessionstudent') vm = vm.$parent;
            if (vm?.dialogVisible && String(vm.activeName) === '2' && !vm.courseItem.attendanceFlag) {
                return { dialog, vm };
            }
        }
        return null;
    }

    function canPrepare(vm) {
        const rows = vm.tableLoadData;
        const original = vm.tableLoadDataOld;
        return !vm.searchForm.name && !vm.searchForm.studentId
            && rows.length > 0 && rows.length === vm.pagination.total && rows.length === original.length
            && rows.every((row, index) => String(row.status) === '2'
                && String(original[index].status) === '2' && row.studentId === original[index].studentId
                && row.moduleCode === vm.courseItem.moduleCode
                && row.moduleTypeGroup === vm.courseItem.moduleTypeGroup
                && row.startTime === vm.courseItem.startTime);
    }

    function prepare() {
        const current = studentModal();
        if (!current || document.documentElement.getAttribute('data-xjtlu-ams-enabled') !== 'true') return;
        const { vm } = current;
        if (!canPrepare(vm)) return;
        for (const row of vm.tableLoadData) row.status = 1;
        preparedLists.add(vm.tableLoadData);
        // AMS Confirm only submits tableLoadDataPage; include every absent student for review.
        vm.getPageList({ pageIndex: 1, pageSize: vm.tableLoadData.length });
        render();
    }

    function render() {
        const current = document.documentElement.getAttribute('data-xjtlu-ams-enabled') === 'true'
            ? studentModal() : null;
        let toolbar = document.getElementById(toolbarId);
        if (!current) { toolbar?.remove(); return; }
        const { dialog, vm } = current;
        if (preparedLists.has(vm.tableLoadData) && vm.tableLoadDataPage.length !== vm.tableLoadData.length) {
            vm.getPageList({ pageIndex: 1, pageSize: vm.tableLoadData.length });
        }
        if (toolbar && !dialog.contains(toolbar)) { toolbar.remove(); toolbar = null; }
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = toolbarId;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'el-button el-button--primary el-button--small';
            button.textContent = 'Mark all as present';
            button.addEventListener('click', prepare);
            const status = document.createElement('span');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            toolbar.append(button, status);
            dialog.querySelector('.el-tabs').after(toolbar);
        }
        const button = toolbar.querySelector('button');
        button.disabled = !canPrepare(vm);
        const staged = vm.tableLoadData.length > 0 && vm.tableLoadData.every(row => row.status === 1);
        const message = staged
            ? `${vm.tableLoadData.length} students marked Present for review. Click Confirm to save or Cancel to discard.`
            : 'Applies to all pages in this session. Clear search filters and finish or discard other edits first. Confirm saves the changes.';
        const status = toolbar.querySelector('[role="status"]');
        if (status.textContent !== message) status.textContent = message;
    }

    let pending = false;
    new MutationObserver(records => {
        if (records.every(record => record.target.closest?.(`#${toolbarId}`))) return;
        if (pending) return;
        pending = true;
        queueMicrotask(() => { pending = false; render(); });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-xjtlu-ams-enabled', 'class', 'style', 'aria-selected'] });
    window.addEventListener('hashchange', render);
    render();
})();

globalThis.XJTLU_DEFAULTS = Object.freeze({"learningMallRoots": ["https://core.xjtlu.edu.cn", "https://core-archive25-26.xjtlu.edu.cn"], "staffEnabled": false, "courseSectionFilter": true, "reviewHideBody": true, "amsMarkPresent": true, "removeQuestions": true, "insertSectionHeading": true, "setMarks": true, "gradeItemFilter": true, "reportFilter": true, "correctHighlight": true, "courseQuizzes": true});

globalThis.XJTLU_NORMALIZE_ROOTS = function (text) {
    const roots = text.split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(value => {
        let url;
        try { url = new URL(value); } catch { throw new Error('Enter a complete HTTPS root URL: ' + value); }
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.xjtlu.edu.cn')
            || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
            throw new Error('Use HTTPS XJTLU root URLs without paths, ports, or query strings: ' + value);
        }
        return url.origin;
    });
    return [...new Set(roots)];
};

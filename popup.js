document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
chrome.storage.sync.get(XJTLU_DEFAULTS).then(settings => {
    const count = Object.keys(XJTLU_DEFAULTS).filter(key => !['staffEnabled', 'courseSectionFilter', 'amsMarkPresent', 'learningMallRoots', 'reviewHideBody'].includes(key) && settings[key]).length;
    document.getElementById('summary').textContent = settings.staffEnabled ? `Staff Features enabled · ${count} tools selected` : 'Staff Features disabled. Enable tools in settings.';
    document.getElementById('summary').textContent += settings.courseSectionFilter ? ' · Course section selector enabled' : '';
    document.getElementById('summary').textContent += settings.reviewHideBody ? ' · Review question bodies hidden' : '';
    document.getElementById('summary').textContent += settings.amsMarkPresent ? ' · AMS helper enabled' : '';
}).catch(() => { document.getElementById('summary').textContent = 'Settings unavailable. Try opening feature settings.'; });

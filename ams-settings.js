(() => {
    'use strict';
    const attribute = 'data-xjtlu-ams-enabled';
    const update = enabled => document.documentElement.setAttribute(attribute, String(enabled));
    chrome.storage.sync.get({ amsMarkPresent: true }).then(settings => update(settings.amsMarkPresent))
        .catch(error => console.error('XJTLU AMS settings unavailable:', error));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.amsMarkPresent) update(changes.amsMarkPresent.newValue ?? true);
    });
})();

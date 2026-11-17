const features = [["gradeItemFilter", "Show selected grade report activities", "Show or hide exercise and quiz columns in the Grader report. Choices are remembered per site and course and only affect your browser view."], ["insertSectionHeading", "Modify quiz section headings", "Load current headings to edit or delete individual headings, remove all headings, or add multiple headings in one batch. Save positions and titles for reuse on other quizzes."], ["removeQuestions", "Remove all quiz questions", "Uses Moodle’s Select all and Delete selected after confirmation. Extra section headings must be removed first."], ["setMarks", "Set question marks", "Set marks for all questions or multiple ranges in one modal. Reuse saved groups across quizzes."], ["reportFilter", "Filter report questions", "Choose question columns in overview and responses reports. Selections are remembered per quiz."], ["correctHighlight", "Highlight correct report rows", "Highlights attempts where every shown question is fully correct in overview reports."], ["courseQuizzes", "Course quiz launcher", "Lists course quizzes with a total count and opens a selected quiz in a new tab."]];
const master = document.getElementById('staffEnabled');
const status = document.getElementById('status');
const learning = document.getElementById('courseSectionFilter');
const review = document.getElementById('reviewHideBody');
const ams = document.getElementById('amsMarkPresent');
const inputs = [master];
for (const [key, title, description] of features) {
    const label = document.createElement('label');
    label.className = 'feature';
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = title;
    const detail = document.createElement('p');
    detail.textContent = description;
    text.append(name, detail);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = key;
    input.disabled = true;
    label.append(text, input);
    document.getElementById('features').append(label);
    inputs.push(input);
}
function updateAvailability() {
    for (const input of inputs.slice(1)) input.disabled = !master.checked;
    document.getElementById('features').classList.toggle('inactive', !master.checked);
}
chrome.storage.sync.get(XJTLU_DEFAULTS).then(settings => {
    for (const input of [...inputs, learning, review, ams]) {
        input.checked = settings[input.id];
        input.disabled = false;
        input.addEventListener('change', async () => {
            input.disabled = true;
            status.textContent = 'Saving…';
            try {
                await chrome.storage.sync.set({ [input.id]: input.checked });
                status.textContent = 'Settings saved.';
            } catch (error) {
                input.checked = !input.checked;
                status.textContent = 'Could not save settings: ' + error.message;
            } finally {
                master.disabled = false;
                learning.disabled = false;
                review.disabled = false;
                ams.disabled = false;
                updateAvailability();
            }
        });
    }
    updateAvailability();
    status.textContent = 'Settings save automatically.';
}).catch(error => { status.textContent = 'Could not load settings: ' + error.message; });

const rootsForm = document.getElementById('roots-form');
const rootsInput = document.getElementById('learningMallRoots');
chrome.storage.sync.get({ learningMallRoots: XJTLU_DEFAULTS.learningMallRoots }).then(settings => {
    rootsInput.value = settings.learningMallRoots.join('\n');
    rootsInput.disabled = false;
    rootsForm.querySelector('button').disabled = false;
}).catch(error => { status.textContent = 'Could not load root URLs: ' + error.message; });
rootsForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = rootsForm.querySelector('button');
    try {
        const roots = XJTLU_NORMALIZE_ROOTS(rootsInput.value);
        button.disabled = true;
        await chrome.storage.sync.set({ learningMallRoots: roots });
        rootsInput.value = roots.join('\n');
        status.textContent = 'Root URLs saved. Tools apply to listed Learning Mall sites.';
    } catch (error) {
        status.textContent = 'Could not save root URLs: ' + error.message;
    } finally { button.disabled = false; }
});

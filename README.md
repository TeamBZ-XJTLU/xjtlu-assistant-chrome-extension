# XJTLU Assistant

A standalone Chrome Manifest V3 extension porting the supplied Moodle Quiz Tools userscript. No Tampermonkey or build step is needed.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open the extension → **Open feature settings** → enable **Staff Features**.
5. Refresh any CORE page that was already open when the extension was installed.

## Staff Features

- Remove all questions from a quiz, after explicit confirmation, using Moodle’s **Select multiple items → Select all → Delete selected** bulk action. Questions remain in the question bank. Moodle blocks this when multiple section headings exist; remove extra headings first while keeping their questions, then retry.
- **Modify Section Headings** edits the first section title and adds, renames, or deletes headings in one batch. **Load current headings** restores this quiz’s actual headings; edit their text or choose **Delete heading** (with **Undo deletion** before saving). **Remove all headings** stages deletion of extra sections and clears the first title; Moodle requires the first section. Questions, order, and marks are kept, but deleted sections lose their separate shuffle settings. New rows contain After question, Before question, and Title; **Add another heading** adds a row. All changes apply with **Save headings**, followed by one refresh. The last submitted positions and titles are saved locally; **Use saved headings** restores that recipe for another quiz. Deletion targets are never included in reusable recipes.
- **Set Question Marks** supports one all-question range or multiple groups. Each row has Start question, End question, and Marks per question. **Add another group** adds a row; **All questions** resets to one full range; **Use saved marks** restores your previous submitted groups across quizzes. All groups are checked before saving; overlapping ranges are rejected. Questions outside the selected ranges keep their marks. Progress and errors appear in the modal.
- Quiz overview and responses report menus use **Show all**, **Hide all**, and an expandable **Choose questions** checklist. Selections, including hiding every question, are remembered per quiz and report mode.
- Highlight overview attempts where all displayed questions are correct.
- List course quizzes, show their count, and open a selected quiz in a new tab.

Each tool has its own toggle. The master switch starts off; individual selections start on. Settings sync through Chrome storage and update open matching pages. Switching settings restores report styles and stops pending bulk work after the current Moodle action. It does not undo completed Moodle changes.

Learning Mall tools run on quiz editor, quiz report, Grader report, and course pages at the root URLs listed in Settings. The defaults are `https://core.xjtlu.edu.cn` and `https://core-archive25-26.xjtlu.edu.cn`. Add or remove HTTPS XJTLU subdomains under **Learning Mall root URLs**, one per line, then click **Save root URLs**. Root changes apply to open matching pages. An empty list disables Learning Mall tools. Course section and report selections are separated by site; existing live-site selections are preserved. The manifest covers XJTLU subdomains so future archive roots can be enabled without editing the extension. It requests only the storage permission and uses Moodle's existing controls and permissions. The AMS helper also runs at `https://ams.xjtlu.edu.cn/pc/`. No credentials, analytics, remote code, or background network requests are included. Report column selections stay in each site's local storage (compatible with the original script).

Disable the original Tampermonkey script to avoid duplicate controls. Moodle selectors and English report headings follow the supplied script; verify on your institution's current Moodle UI before using bulk tools.

## Verification

Run `node --check defaults.js`, `node --check staff.js`, `node --check settings.js`, and `node --check popup.js`. Load unpacked to verify settings and test the staff controls on CORE with your own staff account.

## Learning Mall section selector

Enabled by default, independently of Staff Features. On a course page, use **Show course sections → Choose sections** to keep only the sections you want. The menu’s **Show all** and **Hide all** buttons show or hide every section.

Selections are stored locally in Chrome, separately for each course. Filtering affects your personal main-page view and course index; nested assessments follow their parent section. It does not change Moodle's section visibility for students. Turn the feature off under **Learning Mall Features** in extension settings to restore all sections while retaining your selections.

Version 1.1.0 was loaded and checked on the live SOE102 course (20 top-level sections). Browser fixture checks also cover saved selections, nested sections, course index, disabling/re-enabling, Show all, and Hide all.

## AMS attendance helper

Enabled by default under **AMS Features**, independently of Staff Features. On any module’s session page (`#/signIn/myCourseSession`, with any `moduleCode` and the AMS spelling `moudleTitle`), open a session’s student list and select **Absent**. Clear student search filters, then click **Mark all as present**. It prepares every absent student across all pages in that session and displays them together. Review the rows, then click AMS **Confirm** to save or **Cancel** to discard. Other attendance tabs and sessions are untouched. The button is unavailable for excluded sessions, incomplete lists, or existing edits.

Reload the extension in Chrome and refresh AMS after updating. Live attendance changes were not tested; use the local fixture checks in `tests/ams.test.js` to verify preparation and safeguards without touching attendance records.

- **Show grade report activities** adds Show all / Hide all and an exercise/quiz checklist to the Grader report. Choices are local to each site and course, persist across report pages, and leave identity columns, non-quiz items, totals, grades, and Moodle visibility settings intact. Enable it under Staff Features.

## Attempt review

On quiz attempt review pages (`/mod/quiz/review.php?attempt=…`), question bodies are hidden by default, independently of Staff Features. Multiple-choice options and existing answers remain visible. Fill-in-the-blank and coding questions keep only their inline blanks and entered answers, hiding surrounding sentences and code. Moodle feedback and response history remain available. The **Show question bodies** action in the floating tools menu reveals the original content for the current page; **Hide question bodies** covers it again. Disable **Hide question bodies in attempt reviews** under Learning Mall Features to restore the normal view. This only changes your browser view and does not change answers or Moodle review permissions. Reload the extension and refresh an already-open review page after updating.

## Floating tools menu

On course, quiz editor, quiz report, grade report, attempt review, and AMS student-list pages, use the bottom-right **XJTLU tools** button to open the available actions. Course section choices and the course quiz launcher share one menu. Existing action buttons, checklists, saved choices, and confirmations work as before. Click outside the menu or press Escape to close it. The button disappears when no tools are enabled or available.

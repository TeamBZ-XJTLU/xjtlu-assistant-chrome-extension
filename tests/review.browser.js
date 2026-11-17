// Browser self-check: call with the contents of review.js and review.css on a disposable page.
async (source, css) => {
    document.body.innerHTML = `<main>
      <div class="que"><div class="formulation"><h4>Question text</h4>
        <div class="qtext">SECRET MC PROMPT <img alt="SECRET IMAGE"></div>
        <div class="ablock"><div class="answer"><input type="radio" disabled checked>Option A</div></div>
      </div><div class="history">Response history</div></div>
      <div class="que"><div class="formulation"><input type="hidden" value="sequence">
        <p>SECRET BLANK PROMPT <span class="subquestion"><label for="blank">Answer 1</label><input id="blank" readonly value="saved answer"></span> SECRET SUFFIX</p>
      </div></div>
      <div class="que"><div class="formulation"><p>SECRET CODE PROMPT</p>
        <pre><code><span>SECRET CODE <span class="subquestion"><input id="code1" readonly value="arr.length"></span> SECRET CODE END</span>
        <span class="subquestion"><input id="code2" readonly value=""></span></code></pre>
      </div></div>
      <div class="que"><div class="formulation">SECRET QUESTION WITHOUT ANSWERS</div></div>
    </main>`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const markup = () => document.querySelector('main').innerHTML.replace(/ class=""/g, '');
    const original = markup();
    const fields = [...document.querySelectorAll('input')];
    const assert = (value, message) => { if (!value) throw Error(message); };
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    let changed;
    const defaults = { reviewHideBody: true, learningMallRoots: ['https://core.xjtlu.edu.cn'] };
    const chrome = { storage: {
        sync: { get: async () => defaults },
        onChanged: { addListener: listener => { changed = listener; } }
    } };
    new Function('location', 'chrome', 'XJTLU_DEFAULTS', source)(
        { pathname: '/mod/quiz/review.php', origin: 'https://core.xjtlu.edu.cn' }, chrome, defaults);
    await settle();
    const checkMasked = () => {
        assert(!document.body.innerText.includes('SECRET'), 'Question body leaked');
        assert(document.body.innerText.includes('Option A'), 'Options disappeared');
        assert(document.body.innerText.includes('Response history'), 'History disappeared');
        for (const field of fields.filter(node => node.type !== 'hidden')) {
            assert(field.getClientRects().length, `Answer field ${field.id} disappeared`);
            assert(!field.closest('.xjtlu-review-hidden'), 'Answer hidden by ancestor');
        }
        assert(document.getElementById('blank').value === 'saved answer', 'Blank answer changed');
        assert(document.getElementById('code1').value === 'arr.length', 'Code answer changed');
        assert(document.getElementById('code2').value === '', 'Empty blank changed');
        assert(document.querySelector('input[type=radio]').checked, 'Selected option changed');
    };
    checkMasked();
    document.querySelector('#xjtlu-review-tools').click();
    assert(document.body.innerText.includes('SECRET CODE'), 'Reveal failed');
    document.querySelector('#xjtlu-review-tools').click();
    checkMasked();
    const extra = document.createElement('div');
    extra.className = 'que';
    extra.innerHTML = '<div class="formulation"><p>SECRET DYNAMIC PROMPT</p><div class="answer">Dynamic option</div></div>';
    document.querySelector('main').append(extra);
    await settle();
    checkMasked();
    assert(document.body.innerText.includes('Dynamic option'), 'Dynamic answer disappeared');
    extra.remove();
    await settle();
    changed({ reviewHideBody: { newValue: false } }, 'sync');
    assert(!document.getElementById('xjtlu-review-tools'), 'Disabled toolbar remains');
    assert(markup() === original, 'Original markup was not restored');
    assert(fields.every(field => field.isConnected), 'Original fields were replaced');
    changed({ reviewHideBody: { newValue: true } }, 'sync');
    checkMasked();
    changed({ learningMallRoots: { newValue: [] } }, 'sync');
    assert(markup() === original, 'Root removal did not restore page');
    return 'Passed: options, nested inline/code blanks, empty answers, reveal/hide, dynamic questions, disabling, roots, original DOM and values';
}

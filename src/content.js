(() => {
  const DICT_URL = 'https://sonaveeb.ee/search/unif/dlall/dsall/';
  const LINK_ID = 'edvibe-sonaveeb-link';
  const CONTAINER_ID = 'edvibe-sonaveeb-link-container';
  const FORMS_ID = 'edvibe-sonaveeb-forms';

  const TRAINING_BLOCK_SELECTOR = '.form-training-view-word';
  const TRAINING_CARD_SELECTOR = '.form-training-word-card';
  const ACTIVE_WORD_SELECTOR = '.form-training-word-card_inner_scroll_text';
  const CYRILLIC_RE = /[\p{Script=Cyrillic}]/u;
  const AUDIO_BLOCKER_SCRIPT_ID = 'edvibe-audio-blocker-script';
  const CONTENT_LOG_PREFIX = '[edvibe-content]';
  const formsCache = new Map();
  const formsInFlight = new Set();
  const formsFailedAt = new Map();
  const FAILED_RETRY_MS = 60000;
  let formsRequestSeq = 0;
  let rafScheduled = false;
  let lastDictionaryWord = '';

  function normalizeWord(text) {
    if (!text) return '';
    return text
      .trim()
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  }

  function isReasonableWord(word) {
    return /^\p{L}[\p{L}'’\- ]{0,80}$/u.test(word);
  }

  function isDictionarySourceWord(word) {
    return Boolean(word) && !CYRILLIC_RE.test(word);
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findCurrentWord() {
    const wordNode = document.querySelector(`${TRAINING_BLOCK_SELECTOR} ${ACTIVE_WORD_SELECTOR}`);
    if (!wordNode || !isVisible(wordNode)) return '';

    const word = normalizeWord(wordNode.textContent || '');
    return isReasonableWord(word) ? word : '';
  }

  function isTrainingVisible() {
    const trainingBlock = document.querySelector(TRAINING_BLOCK_SELECTOR);
    return Boolean(trainingBlock && isVisible(trainingBlock));
  }

  function positionLink(linkContainer) {
    const card = document.querySelector(`${TRAINING_BLOCK_SELECTOR} ${TRAINING_CARD_SELECTOR}`);
    if (!card || !isVisible(card)) {
      linkContainer.dataset.hidden = 'true';
      return;
    }

    const rect = card.getBoundingClientRect();
    const linkHeight = linkContainer.offsetHeight || 38;
    const top = Math.max(8, rect.top - linkHeight - 14);
    const left = rect.left + rect.width / 2;

    linkContainer.style.top = `${top}px`;
    linkContainer.style.left = `${left}px`;
  }

  function ensureLinkMounted(linkContainer) {
    if (linkContainer.parentElement !== document.body) {
      document.body.appendChild(linkContainer);
    }
  }

  function buildLink() {
    const linkContainer = document.createElement('div');
    linkContainer.id = CONTAINER_ID;
    linkContainer.dataset.hidden = 'true';

    const link = document.createElement('a');
    link.id = LINK_ID;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const forms = document.createElement('div');
    forms.id = FORMS_ID;
    forms.dataset.hidden = 'true';

    linkContainer.appendChild(link);
    linkContainer.appendChild(forms);
    return { linkContainer, link, forms };
  }

  function installWordAudioAutoplayBlocker() {
    if (document.getElementById(AUDIO_BLOCKER_SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = AUDIO_BLOCKER_SCRIPT_ID;
    script.src = chrome.runtime.getURL('src/injected-audio-blocker.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  function setFormsUI(formsEl, forms) {
    if (!Array.isArray(forms) || forms.length === 0) {
      formsEl.dataset.hidden = 'true';
      formsEl.textContent = '';
      return;
    }

    formsEl.dataset.hidden = 'false';
    formsEl.textContent = `Vormid: ${forms.join(' · ')}`;
  }

  function setFormsFallback(formsEl, withErrorHint = false) {
    formsEl.dataset.hidden = 'false';
    formsEl.textContent = withErrorHint ? 'Vormid: — (err)' : 'Vormid: —';
  }

  function setFormsLoading(formsEl) {
    formsEl.dataset.hidden = 'false';
    formsEl.textContent = 'Vormid: …';
  }

  function requestWordForms(word, formsEl) {
    if (!word) {
      setFormsUI(formsEl, []);
      return;
    }

    if (formsCache.has(word)) {
      const cachedForms = formsCache.get(word);
      if (Array.isArray(cachedForms) && cachedForms.length > 0) {
        setFormsUI(formsEl, cachedForms);
      } else {
        setFormsFallback(formsEl);
      }
      return;
    }

    const failedAt = formsFailedAt.get(word);
    if (typeof failedAt === 'number' && Date.now() - failedAt < FAILED_RETRY_MS) {
      setFormsFallback(formsEl, true);
      return;
    }

    if (formsInFlight.has(word)) {
      return;
    }

    const requestId = ++formsRequestSeq;
    formsInFlight.add(word);
    setFormsLoading(formsEl);
    console.debug(`${CONTENT_LOG_PREFIX} forms request start`, { word, requestId });
    let resolved = false;
    const timeoutId = window.setTimeout(() => {
      if (resolved || requestId !== formsRequestSeq) return;
      resolved = true;
      formsInFlight.delete(word);
      formsFailedAt.set(word, Date.now());
      setFormsFallback(formsEl);
    }, 1300);

    chrome.runtime.sendMessage({ type: 'getWordForms', word }, (response) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      formsInFlight.delete(word);
      if (requestId !== formsRequestSeq) return;
      if (chrome.runtime.lastError) {
        formsFailedAt.set(word, Date.now());
        console.error(`${CONTENT_LOG_PREFIX} runtime error`, {
          word,
          requestId,
          error: chrome.runtime.lastError.message
        });
        setFormsFallback(formsEl, true);
        return;
      }
      console.debug(`${CONTENT_LOG_PREFIX} forms response`, { word, requestId, response });
      if (!response || !response.ok || !Array.isArray(response.forms)) {
        formsFailedAt.set(word, Date.now());
        setFormsFallback(formsEl, true);
        return;
      }

      const forms = response.forms.slice(0, 3);
      formsFailedAt.delete(word);
      if (forms.length === 0) {
        formsCache.set(word, null);
        setFormsFallback(formsEl);
      } else {
        formsCache.set(word, forms);
        setFormsUI(formsEl, forms);
      }
    });
  }

  function updateLink({ linkContainer, link, forms }) {
    ensureLinkMounted(linkContainer);

    const detectedWord = findCurrentWord();
    if (isDictionarySourceWord(detectedWord)) {
      lastDictionaryWord = detectedWord;
    }

    if (!lastDictionaryWord || !isTrainingVisible()) {
      linkContainer.dataset.hidden = 'true';
      return;
    }

    link.textContent = `Открыть в Sõnaveeb: ${lastDictionaryWord}`;
    link.href = `${DICT_URL}${encodeURIComponent(lastDictionaryWord)}/1/est`;
    requestWordForms(lastDictionaryWord, forms);
    linkContainer.dataset.hidden = 'false';
    positionLink(linkContainer);
  }

  function init() {
    installWordAudioAutoplayBlocker();

    const refs = buildLink();
    updateLink(refs);

    const observer = new MutationObserver(() => {
      if (rafScheduled) return;
      rafScheduled = true;
      window.requestAnimationFrame(() => {
        rafScheduled = false;
        updateLink(refs);
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener('resize', () => updateLink(refs));
    window.addEventListener('scroll', () => updateLink(refs), { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

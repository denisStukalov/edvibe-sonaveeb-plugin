(() => {
  const DICT_URL = 'https://sonaveeb.ee/search/unif/dlall/dsall/';
  const LINK_ID = 'edvibe-sonaveeb-link';
  const CONTAINER_ID = 'edvibe-sonaveeb-link-container';
  const FORMS_ID = 'edvibe-sonaveeb-forms';

  const TRAINING_BLOCK_SELECTORS = [
    '.form-training-view-word',
    '.form-training',
    '.wrapper-add-words'
  ];
  const TRAINING_CARD_SELECTORS = [
    '.form-training-word-card',
    '.form-training-word-card_inner'
  ];
  const ACTIVE_WORD_SELECTORS = [
    '.form-training-word-card_inner_scroll_text',
    '.form-training-word-card_inner',
    '.form-training-word-card [class*="inner_scroll_text"]',
    '.form-training-word-card [class*="word"]'
  ];
  const CYRILLIC_RE = /[\p{Script=Cyrillic}]/u;
  const AUDIO_BLOCKER_SCRIPT_ID = 'edvibe-audio-blocker-script';
  const ACTIVE_POLL_MS = 250;
  const DEBUG = false;
  const CONTENT_LOG_PREFIX = '[edvibe-content]';
  const DEFAULT_SETTINGS = {
    position: 'top',
    disableAutoplay: true
  };
  const OVERLAY_SELECTORS = [
    '[role="dialog"]',
    '.tir-modal',
    '.modal',
    '.ReactModal__Overlay',
    '.swal2-container',
    '.cdk-overlay-container'
  ];
  const formsCache = new Map();
  const formsInFlight = new Set();
  const formsFailedAt = new Map();
  const FAILED_RETRY_MS = 60000;
  const INTERRUPT_SUPPRESS_MS = 2500;
  let formsRequestSeq = 0;
  let rafScheduled = false;
  let lastDictionaryWord = '';
  let lastPathname = window.location.pathname;
  let suppressUntilTs = 0;
  let currentSettings = { ...DEFAULT_SETTINGS };

  function normalizeWord(text) {
    if (!text) return '';
    return text
      .trim()
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  }

  function debugLog(...args) {
    if (!DEBUG) return;
    console.debug(...args);
  }

  function debugError(...args) {
    if (!DEBUG) return;
    console.error(...args);
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

  function findFirstVisibleElement(selectors, root = document) {
    for (const selector of selectors) {
      const nodes = root.querySelectorAll(selector);
      for (const node of nodes) {
        if (isVisible(node)) return node;
      }
    }
    return null;
  }

  function getTrainingContext() {
    for (const blockSelector of TRAINING_BLOCK_SELECTORS) {
      const blocks = document.querySelectorAll(blockSelector);
      for (const block of blocks) {
        if (!isVisible(block)) continue;
        if (!hasTrainingControls(block)) continue;
        const card = findFirstVisibleElement(TRAINING_CARD_SELECTORS, block) || block;

        if (!isVisible(card)) continue;
        return { block, card };
      }
    }

    return { block: null, card: null };
  }

  function hasTrainingControls(block) {
    const buttons = block.querySelectorAll('button');
    for (const button of buttons) {
      const label = (button.textContent || '').toLowerCase();
      if (label.includes('дальше') || label.includes('назад')) {
        return true;
      }
    }
    return false;
  }

  function findCurrentWord() {
    const { card } = getTrainingContext();
    if (!card) return '';

    const wordNode = findFirstVisibleElement(ACTIVE_WORD_SELECTORS, card);
    if (wordNode) {
      const raw = normalizeWord(wordNode.textContent || '');
      if (isReasonableWord(raw)) return raw;
    }

    return '';
  }

  function isTrainingVisible() {
    const { block, card } = getTrainingContext();
    return Boolean(block && card && isVisible(block) && isVisible(card));
  }

  function positionLink(linkContainer) {
    const { card } = getTrainingContext();
    if (!card || !isVisible(card)) {
      linkContainer.dataset.hidden = 'true';
      return;
    }

    const rect = card.getBoundingClientRect();
    const linkHeight = linkContainer.offsetHeight || 38;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const position = currentSettings.position;

    let top;
    let left;
    if (position === 'bottom') {
      top = rect.bottom + 14;
      left = rect.left + rect.width / 2;
    } else if (position === 'right') {
      top = rect.top + rect.height / 2 - linkHeight / 2;
      left = rect.right + 14;
    } else {
      top = rect.top - linkHeight - 14;
      left = rect.left + rect.width / 2;
    }

    top = Math.min(Math.max(8, top), Math.max(8, viewportHeight - linkHeight - 8));
    if (position === 'right') {
      left = Math.min(Math.max(8, left), Math.max(8, viewportWidth - 340));
    }

    linkContainer.style.top = `${top}px`;
    linkContainer.style.left = `${left}px`;
  }

  function ensureLinkMounted(linkContainer) {
    if (linkContainer.parentElement !== document.body) {
      document.body.appendChild(linkContainer);
    }
  }

  function getSettingsFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
        if (chrome.runtime.lastError) {
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }
        resolve({
          position: result.position || DEFAULT_SETTINGS.position,
          disableAutoplay: typeof result.disableAutoplay === 'boolean'
            ? result.disableAutoplay
            : DEFAULT_SETTINGS.disableAutoplay
        });
      });
    });
  }

  function applySettings(settings, linkContainer) {
    currentSettings = {
      position: settings.position || DEFAULT_SETTINGS.position,
      disableAutoplay: typeof settings.disableAutoplay === 'boolean'
        ? settings.disableAutoplay
        : DEFAULT_SETTINGS.disableAutoplay
    };

    document.documentElement.dataset.edvibeDisableAutoplay = currentSettings.disableAutoplay ? 'true' : 'false';
    if (linkContainer) {
      linkContainer.dataset.position = currentSettings.position;
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

  function hideLink(linkContainer) {
    linkContainer.dataset.hidden = 'true';
  }

  function isBlockingOverlayVisible() {
    for (const selector of OVERLAY_SELECTORS) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.id === CONTAINER_ID) continue;
        if (!isVisible(node)) continue;
        return true;
      }
    }
    return false;
  }

  function isInterruptActionClick(target) {
    if (!(target instanceof Element)) return false;
    const button = target.closest('button, [role="button"]');
    if (!button) return false;
    const label = (button.textContent || '').trim().toLowerCase();
    return label.includes('прервать');
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
      setFormsFallback(formsEl);
      return;
    }

    if (formsInFlight.has(word)) {
      return;
    }

    const requestId = ++formsRequestSeq;
    formsInFlight.add(word);
    setFormsLoading(formsEl);
    debugLog(`${CONTENT_LOG_PREFIX} forms request start`, { word, requestId });
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
        debugError(`${CONTENT_LOG_PREFIX} runtime error`, {
          word,
          requestId,
          error: chrome.runtime.lastError.message
        });
        setFormsFallback(formsEl, true);
        return;
      }
      debugLog(`${CONTENT_LOG_PREFIX} forms response`, { word, requestId, response });
      if (!response || !response.ok || !Array.isArray(response.forms)) {
        formsFailedAt.set(word, Date.now());
        setFormsFallback(formsEl);
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

    if (Date.now() < suppressUntilTs) {
      hideLink(linkContainer);
      return;
    }

    if (window.location.pathname !== lastPathname) {
      lastPathname = window.location.pathname;
      lastDictionaryWord = '';
    }

    if (isBlockingOverlayVisible()) {
      hideLink(linkContainer);
      return;
    }

    const detectedWord = findCurrentWord();
    if (isDictionarySourceWord(detectedWord)) {
      lastDictionaryWord = detectedWord;
    }

    if (!detectedWord || !lastDictionaryWord || !isTrainingVisible()) {
      hideLink(linkContainer);
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
    applySettings(currentSettings, refs.linkContainer);

    const update = () => updateLink(refs);
    const observer = new MutationObserver(() => {
      if (rafScheduled) return;
      rafScheduled = true;
      window.requestAnimationFrame(() => {
        rafScheduled = false;
        update();
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    document.addEventListener('click', (event) => {
      if (isInterruptActionClick(event.target)) {
        suppressUntilTs = Date.now() + INTERRUPT_SUPPRESS_MS;
        hideLink(refs.linkContainer);
      }
      update();
    }, true);
    document.addEventListener('keydown', update, true);
    window.addEventListener('pagehide', () => hideLink(refs.linkContainer));
    window.addEventListener('beforeunload', () => hideLink(refs.linkContainer));
    window.setInterval(update, ACTIVE_POLL_MS);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      if (!changes.position && !changes.disableAutoplay) return;
      applySettings({
        position: changes.position ? changes.position.newValue : currentSettings.position,
        disableAutoplay: changes.disableAutoplay
          ? changes.disableAutoplay.newValue
          : currentSettings.disableAutoplay
      }, refs.linkContainer);
      update();
    });

    getSettingsFromStorage().then((settings) => {
      applySettings(settings, refs.linkContainer);
      update();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

(() => {
  const DICT_URL = 'https://sonaveeb.ee/search/unif/dlall/dsall/';
  const LINK_ID = 'edvibe-sonaveeb-link';
  const CONTAINER_ID = 'edvibe-sonaveeb-link-container';
  const FORMS_ID = 'edvibe-sonaveeb-forms';
  const DETAILS_ID = 'edvibe-sonaveeb-details';

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
    disableAutoplay: true,
    autoCopyExample: false
  };
  const POSITION_VALUES = new Set(['top', 'bottom']);
  const OVERLAY_SELECTORS = [
    '[role="dialog"]',
    '.tir-modal',
    '.modal',
    '.ReactModal__Overlay',
    '.swal2-container',
    '.cdk-overlay-container'
  ];
  const wordDetailsCache = new Map();
  const wordDetailsInFlight = new Set();
  const wordDetailsFailedAt = new Map();
  const FAILED_RETRY_MS = 60000;
  const INTERRUPT_SUPPRESS_MS = 2500;
  const CARD_TRANSITION_SUPPRESS_MS = 15;
  let wordDetailsRequestSeq = 0;
  let rafScheduled = false;
  let lastDictionaryWord = '';
  let activeDetailsWord = '';
  let lastPathname = window.location.pathname;
  let suppressUntilTs = 0;
  let currentSettings = { ...DEFAULT_SETTINGS };
  let extensionContextInvalidated = false;
  let activePollIntervalId = null;
  let lastAutoCopiedExampleKey = '';
  let displayedExampleWord = '';
  let displayedExample = '';

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

  function isExtensionContextError(error) {
    const message = error?.message || String(error || '');
    return message.includes('Extension context invalidated')
      || message.includes('Extension context was invalidated');
  }

  function markExtensionContextInvalidated(error) {
    if (!isExtensionContextError(error)) return false;
    extensionContextInvalidated = true;
    if (activePollIntervalId !== null) {
      window.clearInterval(activePollIntervalId);
      activePollIntervalId = null;
    }
    debugError(`${CONTENT_LOG_PREFIX} extension context invalidated`, error);
    return true;
  }

  function getRuntimeLastError() {
    try {
      return chrome.runtime.lastError || null;
    } catch (error) {
      if (markExtensionContextInvalidated(error)) return error;
      throw error;
    }
  }

  function isReasonableWord(word) {
    return /^\p{L}[\p{L}'’\- ]{0,80}$/u.test(word);
  }

  function isDictionarySourceWord(word) {
    return Boolean(word) && !CYRILLIC_RE.test(word);
  }

  function normalizePosition(value) {
    return POSITION_VALUES.has(value) ? value : DEFAULT_SETTINGS.position;
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
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const position = currentSettings.position;

    let top;
    let left;
    if (position === 'bottom') {
      top = rect.bottom + 14;
      left = rect.left + rect.width / 2;
    } else {
      top = rect.top - linkHeight - 14;
      left = rect.left + rect.width / 2;
    }

    top = Math.min(Math.max(8, top), Math.max(8, viewportHeight - linkHeight - 8));

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
      try {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
          const runtimeError = getRuntimeLastError();
          if (runtimeError) {
            markExtensionContextInvalidated(runtimeError);
            resolve({ ...DEFAULT_SETTINGS });
            return;
          }
          resolve({
            position: normalizePosition(result.position),
            disableAutoplay: typeof result.disableAutoplay === 'boolean'
              ? result.disableAutoplay
              : DEFAULT_SETTINGS.disableAutoplay,
            autoCopyExample: typeof result.autoCopyExample === 'boolean'
              ? result.autoCopyExample
              : DEFAULT_SETTINGS.autoCopyExample
          });
        });
      } catch (error) {
        if (markExtensionContextInvalidated(error)) {
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }
        throw error;
      }
    });
  }

  function applySettings(settings, linkContainer) {
    currentSettings = {
      position: normalizePosition(settings.position),
      disableAutoplay: typeof settings.disableAutoplay === 'boolean'
        ? settings.disableAutoplay
        : DEFAULT_SETTINGS.disableAutoplay,
      autoCopyExample: typeof settings.autoCopyExample === 'boolean'
        ? settings.autoCopyExample
        : DEFAULT_SETTINGS.autoCopyExample
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

    const details = document.createElement('div');
    details.id = DETAILS_ID;
    details.dataset.hidden = 'true';

    linkContainer.appendChild(link);
    linkContainer.appendChild(forms);
    linkContainer.appendChild(details);
    return { linkContainer, link, forms, details };
  }

  function installWordAudioAutoplayBlocker() {
    if (document.getElementById(AUDIO_BLOCKER_SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = AUDIO_BLOCKER_SCRIPT_ID;
    try {
      script.src = chrome.runtime.getURL('src/injected-audio-blocker.js');
    } catch (error) {
      if (markExtensionContextInvalidated(error)) return;
      throw error;
    }
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

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }

  function autoCopyExample(word, example) {
    if (!currentSettings.autoCopyExample) return;
    if (!example) return;
    const key = `${word}\n${example}`;
    if (key === lastAutoCopiedExampleKey) return;
    lastAutoCopiedExampleKey = key;
    copyText(example).catch((error) => {
      debugError(`${CONTENT_LOG_PREFIX} example auto-copy failed`, {
        word,
        message: error?.message || String(error)
      });
    });
  }

  function pickRandomItem(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    return items[Math.floor(Math.random() * items.length)] || '';
  }

  function getDisplayExample(details, word) {
    const examples = Array.isArray(details?.examples)
      ? details.examples.filter((item) => typeof item === 'string' && item.trim())
      : [];
    const fallback = typeof details?.example === 'string' ? details.example.trim() : '';

    if (word && word === displayedExampleWord) {
      if (examples.length === 0 && displayedExample === fallback) return displayedExample;
      if (examples.includes(displayedExample)) return displayedExample;
    }

    displayedExampleWord = word;
    displayedExample = pickRandomItem(examples) || fallback;
    return displayedExample;
  }

  function setDetailsUI(detailsEl, details, word = '') {
    const rection = typeof details?.rection === 'string' ? details.rection.trim() : '';
    const example = getDisplayExample(details, word);
    detailsEl.textContent = '';

    if (!rection && !example) {
      detailsEl.dataset.hidden = 'true';
      return;
    }

    detailsEl.dataset.hidden = 'false';

    if (rection) {
      const rectionEl = document.createElement('div');
      rectionEl.className = 'edvibe-sonaveeb-detail-line';
      rectionEl.textContent = `Rektsioon: ${rection}`;
      detailsEl.appendChild(rectionEl);
    }

    if (example) {
      const exampleEl = document.createElement('div');
      exampleEl.className = 'edvibe-sonaveeb-detail-line edvibe-sonaveeb-example-line';
      const textEl = document.createElement('span');
      textEl.className = 'edvibe-sonaveeb-example-text';
      textEl.textContent = `Näide: ${example}`;
      exampleEl.appendChild(textEl);
      detailsEl.appendChild(exampleEl);
      autoCopyExample(word, example);
    }
  }

  function hideDetails(detailsEl) {
    detailsEl.dataset.hidden = 'true';
    detailsEl.textContent = '';
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

  function isCardNavigationClick(target) {
    if (!(target instanceof Element)) return false;
    const button = target.closest('button, [role="button"]');
    if (!button) return false;
    const label = (button.textContent || '').trim().toLowerCase();
    return label.includes('дальше') || label.includes('назад');
  }

  function requestWordDetails(word, formsEl, detailsEl) {
    if (extensionContextInvalidated) {
      setFormsUI(formsEl, []);
      hideDetails(detailsEl);
      return;
    }

    activeDetailsWord = word;

    if (!word) {
      setFormsUI(formsEl, []);
      hideDetails(detailsEl);
      return;
    }

    if (wordDetailsCache.has(word)) {
      const cachedDetails = wordDetailsCache.get(word);
      if (cachedDetails && Array.isArray(cachedDetails.forms) && cachedDetails.forms.length > 0) {
        setFormsUI(formsEl, cachedDetails.forms);
        setDetailsUI(detailsEl, cachedDetails, word);
      } else {
        setFormsFallback(formsEl);
        hideDetails(detailsEl);
      }
      return;
    }

    const failedAt = wordDetailsFailedAt.get(word);
    if (typeof failedAt === 'number' && Date.now() - failedAt < FAILED_RETRY_MS) {
      setFormsFallback(formsEl);
      hideDetails(detailsEl);
      return;
    }

    if (wordDetailsInFlight.has(word)) {
      setFormsLoading(formsEl);
      hideDetails(detailsEl);
      return;
    }

    const requestId = ++wordDetailsRequestSeq;
    wordDetailsInFlight.add(word);
    setFormsLoading(formsEl);
    hideDetails(detailsEl);
    debugLog(`${CONTENT_LOG_PREFIX} forms request start`, { word, requestId });
    let resolved = false;
    const timeoutId = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      wordDetailsInFlight.delete(word);
      if (requestId !== wordDetailsRequestSeq || word !== activeDetailsWord) return;
      wordDetailsFailedAt.set(word, Date.now());
      setFormsFallback(formsEl);
      hideDetails(detailsEl);
    }, 1300);

    const handleResponse = (response) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      wordDetailsInFlight.delete(word);
      if (requestId !== wordDetailsRequestSeq || word !== activeDetailsWord) return;
      const runtimeError = getRuntimeLastError();
      if (runtimeError) {
        markExtensionContextInvalidated(runtimeError);
        wordDetailsFailedAt.set(word, Date.now());
        debugError(`${CONTENT_LOG_PREFIX} runtime error`, {
          word,
          requestId,
          error: runtimeError.message
        });
        setFormsFallback(formsEl, true);
        hideDetails(detailsEl);
        return;
      }
      debugLog(`${CONTENT_LOG_PREFIX} forms response`, { word, requestId, response });
      if (!response || !response.ok || !Array.isArray(response.forms)) {
        wordDetailsFailedAt.set(word, Date.now());
        setFormsFallback(formsEl);
        hideDetails(detailsEl);
        return;
      }

      const forms = response.forms.slice(0, 4);
      const details = {
        forms,
        example: typeof response.example === 'string' ? response.example : '',
        examples: Array.isArray(response.examples) ? response.examples : [],
        rection: typeof response.rection === 'string' ? response.rection : ''
      };
      wordDetailsFailedAt.delete(word);
      if (forms.length === 0) {
        wordDetailsCache.set(word, null);
        setFormsFallback(formsEl);
        hideDetails(detailsEl);
      } else {
        wordDetailsCache.set(word, details);
        setFormsUI(formsEl, forms);
        setDetailsUI(detailsEl, details, word);
      }
    };

    try {
      chrome.runtime.sendMessage({ type: 'getWordForms', word }, handleResponse);
    } catch (error) {
      if (!markExtensionContextInvalidated(error)) throw error;
      resolved = true;
      window.clearTimeout(timeoutId);
      wordDetailsInFlight.delete(word);
      setFormsUI(formsEl, []);
      hideDetails(detailsEl);
    }
  }

  function updateLink({ linkContainer, link, forms, details }) {
    if (extensionContextInvalidated) {
      hideLink(linkContainer);
      return;
    }

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
    } else {
      lastDictionaryWord = '';
      activeDetailsWord = '';
    }

    if (!lastDictionaryWord || !isTrainingVisible()) {
      hideLink(linkContainer);
      setFormsUI(forms, []);
      hideDetails(details);
      return;
    }

    link.textContent = `Открыть в Sõnaveeb: ${lastDictionaryWord}`;
    link.href = `${DICT_URL}${encodeURIComponent(lastDictionaryWord)}/1/est`;
    requestWordDetails(lastDictionaryWord, forms, details);
    linkContainer.dataset.hidden = 'false';
    positionLink(linkContainer);
  }

  function init() {
    installWordAudioAutoplayBlocker();
    if (extensionContextInvalidated) return;

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
      if (event.target instanceof Node && refs.linkContainer.contains(event.target)) {
        return;
      }

      if (isInterruptActionClick(event.target)) {
        suppressUntilTs = Date.now() + INTERRUPT_SUPPRESS_MS;
        hideLink(refs.linkContainer);
      } else if (isCardNavigationClick(event.target)) {
        suppressUntilTs = Date.now() + CARD_TRANSITION_SUPPRESS_MS;
        hideLink(refs.linkContainer);
      }
      update();
    }, true);
    document.addEventListener('keydown', update, true);
    window.addEventListener('pagehide', () => hideLink(refs.linkContainer));
    window.addEventListener('beforeunload', () => hideLink(refs.linkContainer));
    activePollIntervalId = window.setInterval(update, ACTIVE_POLL_MS);

    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        if (!changes.position && !changes.disableAutoplay && !changes.autoCopyExample) return;
        applySettings({
          position: changes.position ? changes.position.newValue : currentSettings.position,
          disableAutoplay: changes.disableAutoplay
            ? changes.disableAutoplay.newValue
            : currentSettings.disableAutoplay,
          autoCopyExample: changes.autoCopyExample
            ? changes.autoCopyExample.newValue
            : currentSettings.autoCopyExample
        }, refs.linkContainer);
        update();
      });
    } catch (error) {
      if (!markExtensionContextInvalidated(error)) throw error;
      hideLink(refs.linkContainer);
      return;
    }

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

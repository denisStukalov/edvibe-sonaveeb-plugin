(() => {
  const DICT_URL = 'https://sonaveeb.ee/search/unif/dlall/dsall/';
  const LINK_ID = 'edvibe-sonaveeb-link';
  const CONTAINER_ID = 'edvibe-sonaveeb-link-container';

  const TRAINING_BLOCK_SELECTOR = '.form-training-view-word';
  const TRAINING_CARD_SELECTOR = '.form-training-word-card';
  const ACTIVE_WORD_SELECTOR = '.form-training-word-card_inner_scroll_text';
  const CYRILLIC_RE = /[\p{Script=Cyrillic}]/u;
  const AUDIO_BLOCKER_SCRIPT_ID = 'edvibe-audio-blocker-script';

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

    linkContainer.appendChild(link);
    return { linkContainer, link };
  }

  function installWordAudioAutoplayBlocker() {
    if (document.getElementById(AUDIO_BLOCKER_SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = AUDIO_BLOCKER_SCRIPT_ID;
    script.src = chrome.runtime.getURL('src/injected-audio-blocker.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  function updateLink({ linkContainer, link }) {
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
    linkContainer.dataset.hidden = 'false';
    positionLink(linkContainer);
  }

  let rafScheduled = false;
  let lastDictionaryWord = '';

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

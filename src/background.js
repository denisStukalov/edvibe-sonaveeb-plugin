const SONAPI_API_BASE = 'https://api.sonapi.ee';
const REQUEST_TIMEOUT_MS = 2000;
const DEBUG = false;
const BG_LOG_PREFIX = '[edvibe-bg]';

function debugLog(...args) {
  if (!DEBUG) return;
  console.debug(...args);
}

function debugError(...args) {
  if (!DEBUG) return;
  console.error(...args);
}

function pickFirstThreeValues(payload) {
  if (!payload || !Array.isArray(payload.searchResult) || payload.searchResult.length === 0) {
    return [];
  }

  const firstResult = payload.searchResult[0];
  if (!firstResult || !Array.isArray(firstResult.wordForms)) {
    return [];
  }

  const isVerb = Array.isArray(firstResult.wordClasses)
    && firstResult.wordClasses.some((item) => String(item).toLowerCase() === 'verb');

  if (isVerb) {
    const base = (typeof payload.estonianWord === 'string' && payload.estonianWord.trim())
      || (typeof payload.requestedWord === 'string' && payload.requestedWord.trim())
      || '';

    const byCode = new Map();
    for (const item of firstResult.wordForms) {
      const code = typeof item?.code === 'string' ? item.code.trim() : '';
      const value = typeof item?.value === 'string' ? item.value.trim() : '';
      if (!code || !value) continue;
      if (!byCode.has(code)) byCode.set(code, value);
    }

    const forms = [];
    const pushUnique = (value) => {
      if (!value) return;
      if (forms.includes(value)) return;
      forms.push(value);
    };

    // 1) lemma/base
    pushUnique(base);
    // 2) da-infinitive
    pushUnique(byCode.get('Inf'));
    // 3) indicative present 1st person singular
    pushUnique(byCode.get('IndPrSg1'));
    // Optional fallback often used for -ma form if one of above is missing.
    if (forms.length < 3) {
      pushUnique(byCode.get('SupIps'));
    }

    return forms.slice(0, 3);
  }

  const forms = [];
  for (const item of firstResult.wordForms.slice(0, 3)) {
    const value = typeof item?.value === 'string' ? item.value.trim() : '';
    if (!value) continue;
    forms.push(value);
  }
  return forms;
}

async function fetchWordForms(word) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${SONAPI_API_BASE}/v2/${encodeURIComponent(word)}`;
    debugLog(`${BG_LOG_PREFIX} fetch start`, { word, url });
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    debugLog(`${BG_LOG_PREFIX} fetch response`, {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type') || ''
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Sonapi request failed: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return [];
    }

    const payload = await response.json();
    const forms = pickFirstThreeValues(payload);
    debugLog(`${BG_LOG_PREFIX} parsed forms`, { word, formsCount: forms.length, forms });
    return forms;
  } catch (error) {
    debugError(`${BG_LOG_PREFIX} fetch error`, {
      word,
      message: error?.message || String(error),
      name: error?.name || null
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'getWordForms') return;

  const word = typeof message.word === 'string' ? message.word.trim() : '';
  debugLog(`${BG_LOG_PREFIX} message`, { word, senderOrigin: sender.origin || null });
  if (!word) {
    sendResponse({ ok: true, forms: [] });
    return;
  }

  fetchWordForms(word)
    .then((forms) => sendResponse({ ok: true, forms }))
    .catch((error) => sendResponse({ ok: false, error: error.message || 'Unknown Sonapi error' }));

  return true;
});

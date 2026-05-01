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

function isVerbResult(result) {
  return Array.isArray(result?.wordClasses)
    && result.wordClasses.some((item) => String(item).toLowerCase() === 'verb');
}

function normalizeFormValue(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized && normalized !== '-' && normalized !== '—' ? normalized : '';
}

function pickDisplayForms(payload) {
  if (!payload || !Array.isArray(payload.searchResult) || payload.searchResult.length === 0) {
    return [];
  }

  const firstResult = payload.searchResult[0];
  if (!firstResult || !Array.isArray(firstResult.wordForms)) {
    return [];
  }

  if (isVerbResult(firstResult)) {
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

  const byCode = new Map();
  for (const item of firstResult.wordForms) {
    const code = typeof item?.code === 'string' ? item.code.trim() : '';
    const value = normalizeFormValue(item?.value);
    if (!code || !value) continue;
    if (!byCode.has(code)) byCode.set(code, value);
  }

  const forms = [];
  const pushForm = (value) => {
    if (!value) return;
    forms.push(value);
  };
  const pushFallback = (value) => {
    if (!value || forms.includes(value)) return;
    forms.push(value);
  };

  const pluralPartitive = byCode.get('PlP');

  for (const code of ['SgN', 'SgG', 'SgP']) {
    pushForm(byCode.get(code));
  }

  for (const item of firstResult.wordForms) {
    if (forms.length >= (pluralPartitive ? 3 : 4)) break;
    const value = normalizeFormValue(item?.value);
    if (value === pluralPartitive) continue;
    pushFallback(value);
  }

  pushForm(pluralPartitive);

  return forms;
}

function normalizeTextValue(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : '';
}

function pickDisplayDetails(payload) {
  const firstResult = Array.isArray(payload?.searchResult) ? payload.searchResult[0] : null;
  const meanings = Array.isArray(firstResult?.meanings) ? firstResult.meanings : [];
  const details = {
    example: '',
    rection: ''
  };

  if (isVerbResult(firstResult)) {
    for (const meaning of meanings) {
      const rection = normalizeTextValue(meaning?.rection);
      if (rection) {
        details.rection = rection;
        break;
      }
    }
  }

  const examples = [];
  for (const meaning of meanings) {
    if (!Array.isArray(meaning?.examples)) continue;
    for (const item of meaning.examples) {
      const example = normalizeTextValue(item);
      if (example && !examples.includes(example)) {
        examples.push(example);
      }
    }
  }

  details.example = examples.find((example) => example.length <= 110) || examples[0] || '';
  return details;
}

async function fetchWordDetails(word) {
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
      return { forms: [], example: '', rection: '' };
    }

    if (!response.ok) {
      throw new Error(`Sonapi request failed: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { forms: [], example: '', rection: '' };
    }

    const payload = await response.json();
    const forms = pickDisplayForms(payload);
    const details = forms.length > 0 ? pickDisplayDetails(payload) : { example: '', rection: '' };
    debugLog(`${BG_LOG_PREFIX} parsed details`, {
      word,
      formsCount: forms.length,
      forms,
      hasExample: Boolean(details.example),
      hasRection: Boolean(details.rection)
    });
    return { forms, ...details };
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
    sendResponse({ ok: true, forms: [], example: '', rection: '' });
    return;
  }

  fetchWordDetails(word)
    .then((details) => sendResponse({ ok: true, ...details }))
    .catch((error) => sendResponse({ ok: false, error: error.message || 'Unknown Sonapi error' }));

  return true;
});

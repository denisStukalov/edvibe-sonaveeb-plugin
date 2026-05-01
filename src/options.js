const DEFAULT_SETTINGS = {
  position: 'top',
  disableAutoplay: true,
  autoCopyExample: false
};
const POSITION_VALUES = new Set(['top', 'bottom']);

function normalizePosition(value) {
  return POSITION_VALUES.has(value) ? value : DEFAULT_SETTINGS.position;
}

function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
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
  });
}

function setSettings(nextSettings) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(nextSettings, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve();
    });
  });
}

async function init() {
  const positionEl = document.getElementById('position');
  const disableAutoplayEl = document.getElementById('disableAutoplay');
  const autoCopyExampleEl = document.getElementById('autoCopyExample');
  const saveEl = document.getElementById('save');
  const statusEl = document.getElementById('status');

  try {
    const settings = await getSettings();
    positionEl.value = settings.position;
    disableAutoplayEl.checked = settings.disableAutoplay;
    autoCopyExampleEl.checked = settings.autoCopyExample;
  } catch (error) {
    statusEl.textContent = `Ошибка загрузки настроек: ${error.message || 'неизвестная ошибка'}`;
  }

  saveEl.addEventListener('click', async () => {
    const payload = {
      position: normalizePosition(positionEl.value),
      disableAutoplay: disableAutoplayEl.checked,
      autoCopyExample: autoCopyExampleEl.checked
    };

    try {
      await setSettings(payload);
      statusEl.textContent = 'Сохранено';
      window.setTimeout(() => {
        statusEl.textContent = '';
      }, 1400);
    } catch (error) {
      statusEl.textContent = `Ошибка сохранения: ${error.message || 'неизвестная ошибка'}`;
    }
  });
}

init();

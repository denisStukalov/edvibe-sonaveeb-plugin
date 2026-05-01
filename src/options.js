const DEFAULT_SETTINGS = {
  position: 'top',
  disableAutoplay: true
};

function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
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
  const saveEl = document.getElementById('save');
  const statusEl = document.getElementById('status');

  try {
    const settings = await getSettings();
    positionEl.value = settings.position;
    disableAutoplayEl.checked = settings.disableAutoplay;
  } catch (error) {
    statusEl.textContent = `Ошибка загрузки настроек: ${error.message || 'неизвестная ошибка'}`;
  }

  saveEl.addEventListener('click', async () => {
    const payload = {
      position: positionEl.value,
      disableAutoplay: disableAutoplayEl.checked
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

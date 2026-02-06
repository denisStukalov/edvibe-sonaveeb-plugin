const DEFAULT_SETTINGS = {
  position: 'top',
  disableAutoplay: true
};

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
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
  return new Promise((resolve) => {
    chrome.storage.sync.set(nextSettings, () => resolve());
  });
}

async function init() {
  const positionEl = document.getElementById('position');
  const disableAutoplayEl = document.getElementById('disableAutoplay');
  const saveEl = document.getElementById('save');
  const statusEl = document.getElementById('status');

  const settings = await getSettings();
  positionEl.value = settings.position;
  disableAutoplayEl.checked = settings.disableAutoplay;

  saveEl.addEventListener('click', async () => {
    const payload = {
      position: positionEl.value,
      disableAutoplay: disableAutoplayEl.checked
    };

    await setSettings(payload);
    statusEl.textContent = 'Сохранено';
    window.setTimeout(() => {
      statusEl.textContent = '';
    }, 1400);
  });
}

init();

(() => {
  if (window.__edvibeWordAudioBlockerInstalled) return;
  window.__edvibeWordAudioBlockerInstalled = true;

  const WORD_AUDIO_PATH_PART = '/files/WordAudios/';
  const MANUAL_AUDIO_SELECTOR = [
    '.form-training-word-card_inner_scroll_audio',
    '.form-training-word-card_inner_scroll_icon',
    '.iconedv-Speaker'
  ].join(', ');

  let allowAudioUntil = 0;

  const isAutoplayDisabled = () =>
    document.documentElement?.dataset?.edvibeDisableAutoplay === 'true';

  const markManualAudioIntent = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest(MANUAL_AUDIO_SELECTOR)) {
      allowAudioUntil = Date.now() + 1500;
    }
  };

  document.addEventListener('pointerdown', markManualAudioIntent, true);
  document.addEventListener('click', markManualAudioIntent, true);

  const isWordAudio = (mediaEl) => {
    const src = mediaEl.currentSrc || mediaEl.src || '';
    return src.includes(WORD_AUDIO_PATH_PART);
  };

  const shouldBlock = (mediaEl) => {
    if (!isAutoplayDisabled()) return false;
    if (!isWordAudio(mediaEl)) return false;
    return Date.now() > allowAudioUntil;
  };

  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (shouldBlock(this)) {
      try {
        this.pause();
        this.currentTime = 0;
      } catch {}
      return Promise.resolve();
    }

    return nativePlay.apply(this, args);
  };

  document.addEventListener('play', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLMediaElement)) return;
    if (!shouldBlock(target)) return;

    target.pause();
    try {
      target.currentTime = 0;
    } catch {}
  }, true);
})();

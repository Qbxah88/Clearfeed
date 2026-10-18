// ---------------------------------------------------------------------------
// ClearFeed TV: start-up
// ---------------------------------------------------------------------------

function cfOnKey(ev) {
  // Blue button on Samsung remotes (keyCode 406) opens the hidden-items log
  if (ev && (ev.keyCode === 406 || ev.key === 'ColorF3Blue')) {
    ev.preventDefault();
    ev.stopPropagation();
    cfShowLogModal();
    return false;
  }
  return true;
}

function cfStart() {
  if (window.__clearfeedTV) return;
  window.__clearfeedTV = { version: CF_VERSION, log: cfReadLog, settings: function () { return cfSettings; } };

  cfRebuildSettings();
  cfInstallParseHook();
  cfInstallFetchHook();
  cfInstallXhrHook();
  cfStartSettingsRefresh();

  try { document.addEventListener('keydown', cfOnKey, true); } catch (e) { }

  // Wait for the YouTube app to finish booting, then patch its command
  // resolver and reload the home feed so the first screen is filtered too.
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (cfPatchResolveCommand()) {
      clearInterval(timer);
      setTimeout(function () {
        cfSoftReload();
        cfToast('ClearFeed is on', 'Blue button shows what was hidden');
      }, 1500);
    } else if (tries > 300) {
      clearInterval(timer);
    }
  }, 200);
}

cfStart();

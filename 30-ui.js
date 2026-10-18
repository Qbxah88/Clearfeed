// ---------------------------------------------------------------------------
// ClearFeed TV: talking to the YouTube TV app (toasts, modals, commands)
// ---------------------------------------------------------------------------

function cfFindResolver() {
  var yttv = window._yttv;
  if (!yttv) return null;
  for (var key in yttv) {
    var e = yttv[key];
    if (e && e.instance && typeof e.instance.resolveCommand === 'function') return e.instance;
  }
  return null;
}

function cfResolve(cmd) {
  var inst = cfFindResolver();
  if (!inst) return false;
  try { return inst.resolveCommand(cmd, undefined); } catch (e) { return false; }
}

function cfToast(title, subtitle) {
  if (!cfGet('showToasts')) return;
  cfResolve({
    openPopupAction: {
      popupType: 'TOAST',
      popup: {
        overlayToastRenderer: {
          title: { simpleText: title },
          subtitle: { simpleText: subtitle || '' }
        }
      }
    }
  });
}

function cfModal(title, subtitle, message) {
  cfResolve({
    openPopupAction: {
      popupType: 'MODAL',
      uniqueId: 'clearfeed-modal',
      popup: {
        overlaySectionRenderer: {
          overlay: {
            overlayTwoPanelRenderer: {
              actionPanel: {
                overlayPanelRenderer: {
                  header: {
                    overlayPanelHeaderRenderer: {
                      title: { simpleText: title },
                      subtitle: { simpleText: subtitle || '' }
                    }
                  },
                  content: {
                    overlayPanelItemListRenderer: {
                      items: [
                        {
                          compactLinkRenderer: {
                            title: { simpleText: message || '' },
                            subtitle: { simpleText: 'Press back to return' },
                            icon: { iconType: 'INFO' },
                            serviceEndpoint: { signalAction: { signal: 'POPUP_BACK' } }
                          }
                        }
                      ],
                      selectedIndex: 0
                    }
                  }
                }
              },
              backButton: {
                buttonRenderer: {
                  accessibilityData: { accessibilityData: { label: 'Back' } },
                  command: { signalAction: { signal: 'POPUP_BACK' } }
                }
              }
            }
          },
          dismissalCommand: { signalAction: { signal: 'POPUP_BACK' } }
        }
      }
    }
  });
}

function cfSoftReload() {
  cfResolve({ signalAction: { signal: 'SOFT_RELOAD_PAGE' } });
}

// ---------------------------------------------------------------------------
// Hidden-items log, kept on the TV
// ---------------------------------------------------------------------------
var cfSessionHidden = 0;
var cfToastTimer = null;
var cfToastBatch = 0;

function cfLog(entry) {
  cfSessionHidden++;
  try {
    var raw = window.localStorage.getItem(CF_LOG_KEY);
    var log = raw ? JSON.parse(raw) : [];
    entry.t = Date.now();
    log.unshift(entry);
    var max = Number(cfGet('logSize')) || 200;
    if (log.length > max) log.length = max;
    window.localStorage.setItem(CF_LOG_KEY, JSON.stringify(log));
  } catch (e) { }
}

function cfReadLog() {
  try {
    var raw = window.localStorage.getItem(CF_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

// Batch toasts so a page with 30 hidden videos shows one message, not 30
function cfNotifyHidden(n) {
  cfToastBatch += n;
  if (cfToastTimer) return;
  cfToastTimer = setTimeout(function () {
    var count = cfToastBatch;
    cfToastBatch = 0;
    cfToastTimer = null;
    if (count > 0) cfToast('ClearFeed', 'Hidden ' + count + (count === 1 ? ' video' : ' videos'));
  }, 1500);
}

// Show the last few hidden items in a modal (opened with the remote's blue button)
function cfShowLogModal() {
  var log = cfReadLog();
  var items = [];
  var n = Math.min(log.length, 12);
  for (var i = 0; i < n; i++) {
    var e = log[i];
    items.push({
      compactLinkRenderer: {
        title: { simpleText: (e.title || e.detail || '(untitled)').substring(0, 70) },
        subtitle: { simpleText: 'Hidden: ' + e.reason + (e.detail && e.reason !== 'video' ? ' (' + e.detail + ')' : '') },
        icon: { iconType: 'VISIBILITY_OFF' },
        serviceEndpoint: { signalAction: { signal: 'POPUP_BACK' } }
      }
    });
  }
  if (!items.length) {
    items.push({
      compactLinkRenderer: {
        title: { simpleText: 'Nothing hidden yet' },
        icon: { iconType: 'CHECK' },
        serviceEndpoint: { signalAction: { signal: 'POPUP_BACK' } }
      }
    });
  }
  cfResolve({
    openPopupAction: {
      popupType: 'MODAL',
      uniqueId: 'clearfeed-log',
      popup: {
        overlaySectionRenderer: {
          overlay: {
            overlayTwoPanelRenderer: {
              actionPanel: {
                overlayPanelRenderer: {
                  header: {
                    overlayPanelHeaderRenderer: {
                      title: { simpleText: 'ClearFeed v' + CF_VERSION },
                      subtitle: { simpleText: log.length + ' hidden in total, ' + cfSessionHidden + ' this session' }
                    }
                  },
                  content: { overlayPanelItemListRenderer: { items: items, selectedIndex: 0 } }
                }
              },
              backButton: {
                buttonRenderer: {
                  accessibilityData: { accessibilityData: { label: 'Back' } },
                  command: { signalAction: { signal: 'POPUP_BACK' } }
                }
              }
            }
          },
          dismissalCommand: { signalAction: { signal: 'POPUP_BACK' } }
        }
      }
    }
  });
}

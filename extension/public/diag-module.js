// Step 3-7: module context progressive tests
import { chunkValue, chunkPing } from './diag-chunk.js';

function mark(id, ok, msg) {
  try {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('ok', 'fail');
    el.classList.add(ok ? 'ok' : 'fail');
    el.querySelector('.msg').textContent = msg;
  } catch (_) {}
}

// 3: module script itself executed
mark('s3', true, 'module script executed = OK');

// 4: static import from sibling module already succeeded (top-level import above)
try {
  mark('s4', true, 'imported: ' + chunkValue + ' ping=' + chunkPing());
} catch (e) { mark('s4', false, 'FAIL: ' + (e && e.message)); }

// 5: preact import (dynamic so failure is catchable)
(async () => {
  try {
    const mod = await import('preact');
    mark('s5', !!mod.h, 'preact h typeof=' + typeof mod.h);
  } catch (e) { mark('s5', false, 'FAIL: ' + (e && e.message)); }

  // 6: document.getElementById availability
  try {
    const probe = document.getElementById('s6');
    mark('s6', !!probe, 'getElementById works, probe=' + (probe ? 'found' : 'null'));
  } catch (e) { mark('s6', false, 'FAIL: ' + (e && e.message)); }

  // 7: chrome.storage.local.get
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      mark('s7', false, 'chrome.storage.local undefined');
    } else {
      chrome.storage.local.get(null, (items) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          mark('s7', false, 'lastError: ' + chrome.runtime.lastError.message);
        } else {
          mark('s7', true, 'keys=' + Object.keys(items || {}).join(',') || '(empty)');
        }
      });
    }
  } catch (e) { mark('s7', false, 'FAIL: ' + (e && e.message)); }
})();

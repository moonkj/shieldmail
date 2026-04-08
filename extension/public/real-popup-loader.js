// Load real popup.js with error capturing
(function() {
  var errors = [];
  function showErrors() {
    if (errors.length === 0) return;
    var box = document.getElementById('errs');
    var msg = document.getElementById('errmsg');
    box.style.display = 'block';
    msg.textContent = errors.join('\n---\n');
  }
  function mark(id, ok, text) {
    var el = document.getElementById(id);
    el.classList.remove('ok', 'fail');
    el.classList.add(ok ? 'ok' : 'fail');
    el.querySelector('.msg').textContent = text;
  }

  window.addEventListener('error', function(e) {
    errors.push('[error] ' + (e.message || 'unknown') + ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?') + (e.error && e.error.stack ? '\n' + e.error.stack : ''));
    showErrors();
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    var r = e.reason;
    errors.push('[reject] ' + (r && r.message ? r.message : String(r)) + (r && r.stack ? '\n' + r.stack : ''));
    showErrors();
  });
  mark('s2', true, 'window.error + unhandledrejection listeners attached');

  // Now dynamically load popup.js
  var s = document.createElement('script');
  s.src = './popup.js';
  s.onload = function() {
    mark('s3', true, 'popup.js script loaded successfully');
    setTimeout(function() {
      var root = document.getElementById('root');
      var html = root.innerHTML;
      var children = root.children.length;
      mark('s4', children > 0,
        'root.children=' + children +
        ', innerHTML.length=' + html.length +
        (html.length > 0 ? ' first 200 chars:\n' + html.substring(0, 200) : ' (EMPTY)'));
    }, 1500);
  };
  s.onerror = function() {
    mark('s3', false, 'popup.js failed to load (404 or network error)');
  };
  document.body.appendChild(s);
})();

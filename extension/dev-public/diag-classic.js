// Step 2: classic <script src> execution
(function () {
  try {
    var el = document.getElementById('s2');
    if (!el) {
      document.body && document.body.insertAdjacentHTML('beforeend',
        '<div class="row fail"><span class="lbl">2. classic</span><div class="msg">s2 div missing</div></div>');
      return;
    }
    el.classList.add('ok');
    el.querySelector('.msg').textContent = 'classic script executed = OK';
  } catch (e) {
    var f = document.getElementById('s2');
    if (f) {
      f.classList.add('fail');
      f.querySelector('.msg').textContent = 'classic FAIL: ' + (e && e.message);
    }
  }
})();

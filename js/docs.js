(function () {
  var KEYS = [
    ['Try it', 'try'],
    ['connect', 'connect'],
    ['requestAccounts', 'connect'],
    ['getAccounts', 'getAccounts'],
    ['getNetwork', 'getNetwork'],
    ['switchNetwork', 'switchNetwork'],
    ['getPublicKey', 'getPublicKey'],
    ['getUtxoEntries', 'getUtxoEntries'],
    ['getBalance', 'getBalance'],
    ['getHoldings', 'getHoldings'],
    ['getTokenBalance', 'getTokenBalance'],
    ['getState', 'getState'],
    ['detect', 'detect'],
    ['signPskt', 'signPskt'],
    ['signInputs', 'signPskt'],
    ['PSKT', 'signPskt'],
    ['pushTx', 'pushTx'],
    ['sendToken', 'sendToken'],
    ['payKcc20', 'sendToken'],
    ['fundCredits', 'sendToken'],
    ['KKDAG', 'sendToken'],
    ['disconnect', 'disconnect'],
    ['events', 'events'],
    ['request()', 'request'],
    ['KIP-12', 'kip12'],
    ['KasWare', 'kasware'],
    ['popup', 'popup'],
    ['silent', 'popup'],
    ['session', 'session'],
    ['sdkVersion', 'install'],
    ['errors', 'errors'],
    ['security', 'security'],
    ['PIN', 'security'],
    ['phishing', 'security'],
    ['iframe', 'embed'],
    ['mobile', 'embed'],
    ['Tap2Tip', 'ttt'],
    ['buyKron', 'buyKron'],
    ['buyToken', 'buyKron'],
    ['Tokens', 'tokens'],
    ['tokenlist', 'tokens'],
    ['Nilla Gorilla', 'nilla'],
    ['Nilla', 'nilla'],
    ['Argent', 'argent'],
    ['compileVault', 'argent'],
    ['sendKas', 'argent'],
    ['grandson', 'argent'],
    ['sentinel', 'argent'],
    ['vault', 'argent'],
    ['TTT', 'recipes'],
    ['KRON', 'nilla'],
    ['false stack', 'nilla']
  ];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function go(id, query) {
    if (id === 'nilla' && !document.getElementById('nilla')) {
      location.href = 'nilla.html';
      return;
    }
    if (id === 'argent' && !document.getElementById('fact')) {
      location.href = 'argent.html';
      return;
    }
    if ((id === 'ttt' || id === 'buy') && !document.getElementById('ttt') && !document.getElementById('buy')) {
      location.href = 'taptotip.html';
      return;
    }
    if (id === 'tokens' && !document.getElementById('tokens-hero')) {
      location.href = 'tokens.html';
      return;
    }
    if (id === 'buyKron' && !document.getElementById('buyKron')) {
      if (document.getElementById('buy')) { id = 'buy'; }
      else { location.href = 'docs.html#buyKron'; return; }
    }
    var el = document.getElementById(id);
    if (!el) return;
    $all('.doc-sec').forEach(function (s) { s.classList.remove('hidden', 'flash'); });
    if (query) filter(query, true);
    el.classList.remove('hidden');
    el.classList.add('flash');
    history.replaceState(null, '', '#' + id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $all('.kw').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === id); });
    setTimeout(function () { el.classList.remove('flash'); }, 1400);
  }

  function hay(sec) {
    return ((sec.getAttribute('data-keywords') || '') + ' ' + (sec.textContent || '')).toLowerCase();
  }

  function filter(q, keepAllIfEmpty) {
    q = String(q || '').trim().toLowerCase();
    var secs = $all('.doc-sec');
    var n = 0;
    secs.forEach(function (s) {
      var ok = !q || hay(s).indexOf(q) !== -1;
      s.classList.toggle('hidden', !ok);
      if (ok) n += 1;
    });
    var meta = $('#search-meta');
    if (meta) {
      meta.textContent = q ? (n + ' section' + (n === 1 ? '' : 's') + ' for “' + q + '”') : '';
    }
    if (!q && keepAllIfEmpty) secs.forEach(function (s) { s.classList.remove('hidden'); });
    return n;
  }

  function paintKeys() {
    var box = $('#keywords');
    if (!box) return;
    box.innerHTML = KEYS.map(function (pair) {
      return '<button type="button" class="kw" data-go="' + pair[1] + '">' + pair[0] + '</button>';
    }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.kw');
      if (!b) return;
      var input = $('#q');
      if (input) input.value = b.textContent;
      go(b.getAttribute('data-go'), b.textContent);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    paintKeys();
    var input = $('#q');
    if (input) {
      input.addEventListener('input', function () { filter(input.value); });
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var first = $('.doc-sec:not(.hidden)');
        if (first && first.id) go(first.id, input.value);
      });
    }
    if (location.hash) {
      var id = location.hash.slice(1);
      if (document.getElementById(id)) go(id);
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (!id || !document.getElementById(id)) return;
      e.preventDefault();
      go(id);
    });
  });
})();

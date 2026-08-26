(function () {
  var SDK = 'https://kcc-20-wallet.vercel.app/sdk.js?v=166';
  var loading = null;

  function $(id) { return document.getElementById(id); }

  function shortAddr(a) {
    var s = String(a || '');
    if (s.length < 18) return s;
    return s.slice(0, 12) + '…' + s.slice(-8);
  }

  function safe(x) {
    if (x == null) return x;
    if (typeof x === 'string') {
      if (/^kaspa:/.test(x) && x.length > 20) return shortAddr(x);
      if (/^[0-9a-fA-F]{64,}$/.test(x)) return x.slice(0, 10) + '…' + x.slice(-8) + ' (' + x.length + ' hex)';
      return x;
    }
    if (Array.isArray(x)) {
      if (x.length && x[0] && (x[0].outpoint || x[0].transactionId || x[0].utxoEntry)) {
        return { count: x.length, note: 'UTXOs redacted — count only' };
      }
      return x.map(safe);
    }
    if (typeof x === 'object') {
      var o = {};
      Object.keys(x).forEach(function (k) {
        if (k === 'utxos' || k === 'utxoEntries') o[k] = { count: Array.isArray(x[k]) ? x[k].length : 0 };
        else o[k] = safe(x[k]);
      });
      return o;
    }
    return x;
  }

  function log(x) {
    var el = $('pg-out');
    if (!el) return;
    el.textContent = typeof x === 'string' ? x : JSON.stringify(safe(x), null, 2);
  }

  function setStatus(t) {
    var el = $('pg-status');
    if (el) el.textContent = t;
  }

  function loadSdk() {
    if (window.kcc20 && window.kcc20.isKcc20) return Promise.resolve(window.kcc20);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK;
      s.onload = function () {
        if (window.kcc20) resolve(window.kcc20);
        else reject(new Error('sdk.js loaded but window.kcc20 missing'));
      };
      s.onerror = function () { reject(new Error('Could not load sdk.js')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function run(fn) {
    return function () {
      loadSdk().then(fn).catch(function (e) { log(e.message || String(e)); });
    };
  }

  function paintConnected(acc) {
    var a = (acc && acc[0]) || (window.kcc20 && window.kcc20.accounts && window.kcc20.accounts[0]) || '';
    setStatus(a ? ('Connected · ' + shortAddr(a) + ' · sdk ' + (window.kcc20.sdkVersion || '?')) : 'Not connected');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('pg-out')) return;
    setStatus('Tap Connect — opens the real KCC20 PWA (allow popups)');
    log({ ready: true, hint: 'Connect is a user click. Popup then closes. Reads stay silent.' });

    var bind = [
      ['pg-connect', run(function (kcc) {
        return kcc.connect().then(function (acc) {
          paintConnected(acc);
          log({ accounts: acc, sdkVersion: kcc.sdkVersion, origin: kcc.origin });
        });
      })],
      ['pg-accounts', run(function (kcc) { return kcc.getAccounts().then(function (a) { paintConnected(a); log(a); }); })],
      ['pg-network', run(function (kcc) { return kcc.getNetwork().then(log); })],
      ['pg-pubkey', run(function (kcc) { return kcc.getPublicKey().then(log); })],
      ['pg-utxos', run(function (kcc) {
        return kcc.getUtxoEntries().then(function (u) {
          log({ count: Array.isArray(u) ? u.length : 0, firstAmount: u && u[0] && (u[0].amount || (u[0].utxoEntry && u[0].utxoEntry.amount)) });
        });
      })],
      ['pg-bal', run(function (kcc) { return kcc.getBalance().then(log); })],
      ['pg-hold', run(function (kcc) { return kcc.getHoldings().then(log); })],
      ['pg-kkdag', run(function (kcc) { return kcc.getTokenBalance('KKDAG').then(log); })],
      ['pg-disc', run(function (kcc) {
        return kcc.disconnect().then(function () {
          setStatus('Disconnected');
          log('disconnected');
        });
      })],
      ['pg-sign', run(function (kcc) {
        var json = ($('pg-pskt') && $('pg-pskt').value.trim()) || '';
        var raw = ($('pg-indexes') && $('pg-indexes').value.trim()) || '';
        var signInputs = raw
          ? raw.split(/[,\s]+/).filter(Boolean).map(function (n) { return { index: Number(n), sighashType: 1 }; })
          : [];
        return kcc.signPskt({ txJsonString: json, options: { signInputs: signInputs } }).then(function (r) {
          log({ signed: typeof r === 'string', length: String(r || '').length, note: 'string only — not printed' });
          if (typeof r === 'string' && $('pg-pskt')) $('pg-pskt').value = r;
        });
      })],
      ['pg-push', run(function (kcc) {
        var json = ($('pg-pskt') && $('pg-pskt').value.trim()) || '';
        return kcc.pushTx(json).then(log);
      })],
      ['pg-send', run(function (kcc) {
        return kcc.sendToken({
          tick: ($('pg-tick') && $('pg-tick').value.trim()) || 'KKDAG',
          amount: ($('pg-amt') && $('pg-amt').value.trim()) || '10',
          dest: ($('pg-dest') && $('pg-dest').value.trim()) || ''
        }).then(log);
      })]
    ];
    bind.forEach(function (pair) {
      var el = $(pair[0]);
      if (el) el.addEventListener('click', pair[1]);
    });
  });
})();

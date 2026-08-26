(function (root) {
  var SDK = 'https://kcc-20-wallet.vercel.app/sdk.js?v=167';
  var SESS = 'kcc20_sdk_gate_v1';
  var loading = null;

  function loadSess() {
    try { return JSON.parse(sessionStorage.getItem(SESS) || 'null'); } catch (e) { return null; }
  }
  function saveSess(acc) {
    try {
      sessionStorage.setItem(SESS, JSON.stringify({ accounts: acc || [], at: Date.now() }));
    } catch (e) {}
  }
  function clearSess() {
    try { sessionStorage.removeItem(SESS); } catch (e) {}
  }

  function shortAddr(a) {
    var s = String(a || '');
    if (s.length < 16) return s;
    return s.slice(0, 10) + '…' + s.slice(-6);
  }

  function loadSdk() {
    if (root.kcc20 && root.kcc20.isKcc20) return Promise.resolve(root.kcc20);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK;
      s.onload = function () {
        if (root.kcc20) resolve(root.kcc20);
        else reject(new Error('sdk.js loaded without window.kcc20'));
      };
      s.onerror = function () { reject(new Error('Could not load KCC20 sdk.js')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function accountsNow() {
    var k = root.kcc20;
    if (k && k.accounts && k.accounts.length) return k.accounts.slice();
    var s = loadSess();
    return (s && s.accounts) || [];
  }

  function connected() {
    return accountsNow().length > 0;
  }

  function paint() {
    var acc = accountsNow();
    var on = acc.length > 0;
    document.querySelectorAll('[data-need-wallet]').forEach(function (el) {
      el.classList.toggle('gate-hid', !on);
    });
    document.querySelectorAll('[data-need-guest]').forEach(function (el) {
      el.classList.toggle('gate-hid', on);
    });
    document.querySelectorAll('[data-addr]').forEach(function (el) {
      el.textContent = on ? shortAddr(acc[0]) : '';
    });
    var lock = document.getElementById('sdk-lock');
    if (lock && lock.getAttribute('data-strict') === '1') {
      lock.style.display = on ? 'none' : 'grid';
    }
  }

  function connect() {
    return loadSdk().then(function (kcc) {
      return kcc.connect().then(function (acc) {
        saveSess(acc || kcc.accounts || []);
        paint();
        return acc;
      });
    });
  }

  function disconnect() {
    return loadSdk().then(function (kcc) {
      return kcc.disconnect().then(function () {
        clearSess();
        paint();
      });
    }).catch(function () { clearSess(); paint(); });
  }

  function boot() {
    var s = loadSess();
    if (s && s.accounts && s.accounts.length) paint();
    loadSdk().then(function (kcc) {
      if (kcc.getAccounts) {
        return kcc.getAccounts().then(function (a) {
          if (a && a.length) saveSess(a);
          paint();
        }).catch(function () { paint(); });
      }
      paint();
    }).catch(function () { paint(); });
    document.querySelectorAll('[data-connect]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        connect().catch(function (e) {
          var st = document.getElementById('gate-status');
          if (st) st.textContent = e.message || String(e);
        }).then(function () { b.disabled = false; });
      });
    });
    document.querySelectorAll('[data-disconnect]').forEach(function (b) {
      b.addEventListener('click', function () { disconnect(); });
    });
  }

  root.kcc20Gate = { loadSdk: loadSdk, connect: connect, disconnect: disconnect, connected: connected, accounts: accountsNow, paint: paint, boot: boot };
  document.addEventListener('DOMContentLoaded', boot);
})(window);

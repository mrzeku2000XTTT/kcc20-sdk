(function () {
  var SDK = 'https://kcc-20-wallet.vercel.app/sdk.js?v=167';
  var LIVE = [
    'api/tokenlist',
    'https://api.kron.technology/api/registry/tokenlist?all=1',
    'tokens.json'
  ];
  var loadingSdk = null;
  var tokens = [];
  var filter = 'all';
  var query = '';

  function $(id) { return document.getElementById(id); }

  function skipTick(tick) {
    var t = String(tick || '').trim().toUpperCase();
    return !t || t.indexOf('?') !== -1;
  }

  function normalize(raw) {
    var list = [];
    var seen = {};
    var arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && Array.isArray(raw.tokens)) arr = raw.tokens;
    arr.forEach(function (t) {
      var tick = String(t.tick || t.symbol || '').trim().toUpperCase();
      if (skipTick(tick) || seen[tick]) return;
      seen[tick] = 1;
      var ext = t.extensions || {};
      list.push({
        tick: tick,
        name: String(t.name || tick).trim(),
        decimals: Number(t.decimals || 0),
        logoURI: t.logoURI || '',
        covenantId: t.covenantId || '',
        curveCovenantId: t.curveCovenantId || ext.curveCovenantId || '',
        poolCovenantId: t.poolCovenantId || ext.poolCovenantId || null,
        graduated: !!(t.graduated || ext.graduated),
        genesisTxid: t.genesisTxid || ext.genesisTxid || '',
        creator: t.creator || ext.creator || '',
        descriptorURI: t.descriptorURI || ext.descriptorURI || ''
      });
    });
    return list;
  }

  function fetchOne(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  function loadList() {
    var i = 0;
    function next() {
      if (i >= LIVE.length) return Promise.reject(new Error('tokenlist unavailable'));
      var url = LIVE[i++];
      return fetchOne(url).then(function (data) {
        var list = normalize(data);
        if (!list.length) throw new Error('empty');
        return { list: list, url: url, stamp: data.updated || data.timestamp || '' };
      }).catch(function () { return next(); });
    }
    return next();
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function buySnippet(tick) {
    return [
      '<script src="' + SDK + '"><\/script>',
      'const kcc = window.kcc20; // sdkVersion >= "167"',
      'await kcc.connect(); // user click only',
      'const bought = await kcc.buyKron({ tick: \'' + tick + '\', amount: \'10\' });',
      '// amount = KAS to spend. bought.txId  bought.quote  bought.explorer',
      '// do NOT use sendToken to buy. sendToken moves a bag they already hold.'
    ].join('\n');
  }

  function vibePrompt(t) {
    return [
      'You are a vibe-coding agent. Build a REAL mobile app whose users can BUY the KCC20 token $' + t.tick + ' (' + t.name + ') with KAS, directly on the app.',
      '',
      'Sources (read these):',
      '- https://kcc20-sdk.vercel.app/llms.txt',
      '- https://kcc20-sdk.vercel.app/tokens.json',
      '- https://kcc20-sdk.vercel.app/tokens.html#' + t.tick,
      '- Live KRON list: https://api.kron.technology/api/registry/tokenlist?all=1',
      '- Wallet: https://kcc-20-wallet.vercel.app',
      '- SDK: ' + SDK,
      '',
      'Rules:',
      '- Keys NEVER leave the KCC20 PWA. Never ask for seed, PIN, or 64-hex.',
      '- Load sdk.js once, on a Connect click (not on every route).',
      '- window.kcc20.sdkVersion must be "167" or higher (buyKron exists).',
      '- Connect ONLY on a button tap. After Approve the popup CLOSES on purpose.',
      '- Then silent: getAccounts, getNetwork, getTokenBalance("' + t.tick + '").',
      '- BUY: await kcc.buyKron({ tick: "' + t.tick + '", amount: String(kas) })',
      '  amount is KAS to spend, NOT tokens. Wallet quotes + builds Home TRADE. User PIN-signs.',
      '- Optional preview: try quoteKron({ tick:"' + t.tick + '", side:"buy", amount }). If it throws, skip — Buy still quotes.',
      '- SEND a held bag: sendToken({ tick:"' + t.tick + '", amount, dest:"kaspa:q…" }). Full address. Not for buying.',
      '- GATE: if Number((await kcc.getTokenBalance("' + t.tick + '")).balance) >= N unlock, else CTA buyKron.',
      '- pushTx returns { txId, node }. Read result.txId.',
      '- Mainnet. Do not build KRON curve/pool PSKTs for this shop.',
      '- Do not overwrite window.kasware if a real extension exists.',
      '',
      'Token:',
      '  tick ' + t.tick,
      '  name ' + t.name,
      '  decimals ' + t.decimals,
      '  covenantId ' + t.covenantId,
      '  graduated ' + t.graduated,
      '',
      'UI: Connect, tick locked to ' + t.tick + ' (or a picker of KRON ticks from tokens.json), KAS amount default 10, bag, BUY, txId + explorer.',
      'Done when: Connect once, buy 10 KAS of ' + t.tick + ', Sign in KCC20, bag increases, no popups on route change.'
    ].join('\n');
  }

  function gateSnippet(tick) {
    return [
      'const bag = await kcc.getTokenBalance(\'' + tick + '\');',
      'if (Number(bag.balance) >= 1) unlock();',
      'else await kcc.buyKron({ tick: \'' + tick + '\', amount: \'10\' });'
    ].join('\n');
  }

  function copy(text, btn) {
    var ok = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(ok).catch(function () {
        window.prompt('Copy', text);
      });
    }
    window.prompt('Copy', text);
  }

  function visible(t) {
    if (filter === 'grad' && !t.graduated) return false;
    if (filter === 'curve' && t.graduated) return false;
    if (!query) return true;
    var hay = (t.tick + ' ' + t.name + ' ' + t.covenantId).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function render() {
    var grid = $('tok-grid');
    var shown = tokens.filter(visible);
    $('tok-count').textContent = shown.length + ' of ' + tokens.length + ' KCC20 tokens';
    if (!shown.length) {
      grid.textContent = 'No tokens match.';
      return;
    }
    grid.innerHTML = shown.map(function (t) {
      var badge = t.graduated ? '<span class="tag quiet">pool</span>' : '<span class="tag pop">curve</span>';
      var img = t.logoURI
        ? '<img class="tok-logo" src="' + esc(t.logoURI) + '" alt="' + esc(t.tick.slice(0, 1)) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'tok-logo tok-letter\',textContent:this.alt}))">'
        : '<div class="tok-logo tok-letter">' + esc(t.tick.slice(0, 1)) + '</div>';
      return (
        '<article class="tok-card" id="' + esc(t.tick) + '" data-tick="' + esc(t.tick) + '">' +
          '<div class="tok-head">' + img +
            '<div><b>$' + esc(t.tick) + '</b><small>' + esc(t.name) + '</small></div>' +
            badge +
          '</div>' +
          '<p class="tok-id">' + esc((t.covenantId || '').slice(0, 12)) + (t.covenantId ? '…' : '') + '</p>' +
          '<div class="tok-actions">' +
            '<button type="button" class="btn gold" data-act="use">Use tick</button>' +
            '<button type="button" class="btn ghost" data-act="buy">Copy buy</button>' +
            '<button type="button" class="btn ghost" data-act="prompt">Copy vibe prompt</button>' +
            '<button type="button" class="btn ghost" data-act="gate">Copy gate</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function byTick(tick) {
    tick = String(tick || '').toUpperCase();
    for (var i = 0; i < tokens.length; i++) if (tokens[i].tick === tick) return tokens[i];
    return { tick: tick, name: tick, decimals: 0, covenantId: '', graduated: false };
  }

  function setTick(tick) {
    var el = $('tok-tick');
    if (el) el.value = tick;
    var card = document.getElementById(tick);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var buy = $('tok-buy');
    if (buy) buy.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function loadSdk() {
    if (window.kcc20 && window.kcc20.isKcc20) return Promise.resolve(window.kcc20);
    if (loadingSdk) return loadingSdk;
    loadingSdk = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK;
      s.onload = function () {
        if (window.kcc20) resolve(window.kcc20);
        else reject(new Error('sdk missing'));
      };
      s.onerror = function () { reject(new Error('sdk load failed')); };
      document.head.appendChild(s);
    });
    return loadingSdk;
  }

  function log(x) {
    var el = $('tok-out');
    if (!el) return;
    el.textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2);
  }

  function setStatus(t) {
    var el = $('tok-status');
    if (el) el.textContent = t;
  }

  function bindBuy() {
    function run(fn) {
      return function (ev) {
        ev.preventDefault();
        loadSdk().then(fn).catch(function (e) {
          setStatus(e.message || String(e));
          log(e.message || String(e));
        });
      };
    }
    $('tok-connect').addEventListener('click', run(function (kcc) {
      return kcc.connect().then(function (acc) {
        setStatus('Connected ' + (acc && acc[0] ? acc[0] : ''));
        log({ accounts: acc, sdkVersion: kcc.sdkVersion });
      });
    }));
    $('tok-hold').addEventListener('click', run(function (kcc) {
      var tick = ($('tok-tick').value || 'KKDAG').trim().toUpperCase();
      return kcc.getTokenBalance(tick).then(function (b) {
        setStatus(tick + ' bag');
        log(b);
      });
    }));
    $('tok-disc').addEventListener('click', run(function (kcc) {
      return kcc.disconnect().then(function () {
        setStatus('Disconnected');
        log('disconnected');
      });
    }));
    $('tok-buy-btn').addEventListener('click', run(function (kcc) {
      if (typeof kcc.buyKron !== 'function') throw new Error('Need sdk.js?v=167 for buyKron');
      var tick = ($('tok-tick').value || 'KKDAG').trim().toUpperCase();
      var amount = ($('tok-amt').value || '10').trim();
      return kcc.buyKron({ tick: tick, amount: amount }).then(function (r) {
        setStatus('Bought ' + tick);
        log(r);
      });
    }));
    $('tok-copy-buy').addEventListener('click', function () {
      var tick = ($('tok-tick').value || 'KKDAG').trim().toUpperCase();
      copy(buySnippet(tick), this);
    });
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-act]');
    if (!btn) return;
    var card = btn.closest('.tok-card');
    if (!card) return;
    var t = byTick(card.getAttribute('data-tick'));
    var act = btn.getAttribute('data-act');
    if (act === 'use') {
      setTick(t.tick);
      history.replaceState(null, '', '#' + t.tick);
    } else if (act === 'buy') copy(buySnippet(t.tick), btn);
    else if (act === 'prompt') copy(vibePrompt(t), btn);
    else if (act === 'gate') copy(gateSnippet(t.tick), btn);
  });

  $('tok-q').addEventListener('input', function () {
    query = String(this.value || '').trim().toLowerCase();
    render();
  });

  document.querySelectorAll('#tok-filters [data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.getAttribute('data-filter') || 'all';
      document.querySelectorAll('#tok-filters [data-filter]').forEach(function (x) {
        x.classList.toggle('on', x === b);
      });
      render();
    });
  });

  bindBuy();

  loadList().then(function (res) {
    tokens = res.list;
    var meta = $('tok-meta');
    var live = res.url.indexOf('kron.technology') !== -1 || res.url.indexOf('tokenlist') !== -1;
    meta.textContent = (live ? 'Live KRON · ' : 'Snapshot · ') + tokens.length + ' tokens' + (res.stamp ? ' · ' + res.stamp : '');
    render();
    var hash = (location.hash || '').replace('#', '').toUpperCase();
    if (hash && document.getElementById(hash)) {
      setTimeout(function () {
        document.getElementById(hash).scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('tok-tick').value = hash;
      }, 50);
    }
  }).catch(function (e) {
    $('tok-grid').textContent = 'Could not load tokenlist: ' + (e.message || e);
  });
})();

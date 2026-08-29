/* Argent vault-compiler SDK — fact-checked against KCC20 Wallet Argent.
   Load: <script src="https://kcc20-sdk.vercel.app/argent.js"></script>
   Then: window.kcc20Argent.parseIntent("lock 10 kas for 7 days")

   What Argent actually is (do not invent a remote compiler):
   - Local English → intent JSON (this file, same rules as wallet/js/intent.js)
   - Local P2SH compile in the PWA (wallet/js/tx.js + app.js buildCovenant)
   - Optional remote chat merge via backend /kccApi { action:'chat', agent:'argent' }
   - Keys never leave the wallet. This SDK does not hold funds or compile opcodes.
   - LLM (Nilla-style) DIRECTS Argent. Argent compiles. User PIN-signs.

   Honest product map:
   - send            plain KAS transfer (not a vault). Needs kaspa:q destination.
   - timelock/life   CLTV P2SH; when time is up it returns to the OWNER, not a grandson.
   - sentinel        dead-man hop chain; timeout pays beneficiary. Wallet uses Schnorr CHECKSIG
                     (same script shape as covenants/sentinel, not XMSS unless you use type xmss).
   - recurring       check-in pays a payee (x402 / sentinel-x402 analog).
   - hashlock        HTLC: claim with secret or refund after timer.
   - escrow          seller refunds; buyer claims if that kaspa:q is imported in the PWA.
   - multisig        2-of-2; both keys must live on this device for Sweep.
   - xmss            real post-quantum vault from kaspa-xmss-covenants/covenants/xmsslock.
                     Keys from keygen/xmss_keygen.py offline. Wallet only funds P2SH + broadcasts witness.
   - kcc20lock       freeze a KCC20 bag until a date (same CLTV as Time Capsule).
   - onramp          5-min KAS/USD quote + POS (you integrate Stripe/etc). After card success,
                     treasury sendKas to buyer OR hashlock (5 min) receiver=buyer. We do not process cards.

   Repo: https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants
   Wallet: https://kcc-20-wallet.vercel.app  (Vault tab + Argent orb)
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.kcc20Argent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.2.0';
  var WALLET = 'https://kcc-20-wallet.vercel.app';
  var REPO = 'https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants';
  var SDK = 'https://kcc-20-wallet.vercel.app/sdk.js?v=168';

  var ADDR_RE = /kaspa:[a-z0-9]{20,}/i;
  var SKIP_TICK = {
    KAS: 1, KASPA: 1, FOR: 1, MIN: 1, MINS: 1, MINUTE: 1, MINUTES: 1, HOUR: 1, HOURS: 1, HRS: 1,
    DAY: 1, DAYS: 1, SEC: 1, SECS: 1, SECOND: 1, SECONDS: 1, WEEK: 1, WEEKS: 1,
    LOCK: 1, HOLD: 1, SEND: 1, PAY: 1, THE: 1, AND: 1, WITH: 1, THIS: 1, THAT: 1, FROM: 1,
    TIME: 1, CAPSULE: 1, FREEZE: 1, VAULT: 1, TOKEN: 1, TOKENS: 1,
    RENT: 1, HOUSE: 1, CAR: 1, NOTE: 1, DATE: 1, UNTIL: 1, DUE: 1, SAVE: 1, SAVINGS: 1, BILL: 1
  };

  var LIFE_LABEL = { rent: 'House rent', car: 'Car note', spend: 'Spending', control: 'Control', save: 'Savings' };
  var RENT_LABEL = { house: 'House rent', apartment: 'Apartment rent', room: 'Room rent', office: 'Office rent', storage: 'Storage rent', parking: 'Parking rent' };

  var LIFE_KINDS = [
    { id: 'rent', label: 'House rent', hint: 'Lock until rent is due. Sweep only after that time.' },
    { id: 'car', label: 'Car note', hint: 'Lock until the car payment date.' },
    { id: 'spend', label: 'Spending', hint: 'Bills and everyday spend, locked to a date.' },
    { id: 'control', label: 'Control', hint: 'Earmarked KAS. Unlock anytime you say.' },
    { id: 'save', label: 'Savings', hint: 'Save until a date, or unlock anytime if you say so.' }
  ];

  var PRODUCTS = [
    { id: 'timelock', group: 'simple', name: 'Time Capsule', type: 'timelock', compiler: 'buildTimelockCovenant', repo: 'wallet/js/tx.js (CLTV analog of covenants/time_capsule)', returnsTo: 'owner', why: 'Lock KAS. It comes back to the same wallet when time is up.' },
    { id: 'life', group: 'simple', name: 'Real life', type: 'life', compiler: 'buildTimelockCovenant | buildOwnerEnvelope', repo: 'wallet/js/tx.js', returnsTo: 'owner', why: 'Rent / car / save / spend / control. Unlock-anytime is an owner envelope, not a timer.' },
    { id: 'escrow', group: 'simple', name: 'Hold for buyer', type: 'escrow', compiler: 'buildEscrowCovenant', repo: 'wallet/js/tx.js', returnsTo: 'buyer (claim) or seller (refund)', why: 'Seller refunds. Buyer claims if that kaspa:q is imported in this PWA.' },
    { id: 'multisig', group: 'simple', name: 'Two keys', type: 'multisig', compiler: 'buildMultisigCovenant', repo: 'wallet/js/tx.js (Schnorr 2-of-2; XMSS 2-of-2 is covenants/multisig_2of2)', returnsTo: 'requires both keys on this device', why: 'Both wallets on this phone must agree to spend.' },
    { id: 'kcc20freeze', group: 'simple', name: 'Freeze tokens', type: 'kcc20lock', compiler: 'executeKcc20Freeze', repo: 'wallet/js/app.js', returnsTo: 'owner', why: 'Freeze a KCC20 bag until a date.' },
    { id: 'sentinel', group: 'alive', name: 'Dead-man switch', type: 'sentinel', compiler: 'buildSentinelChain', repo: 'wallet/js/tx.js Schnorr hop chain shaped like covenants/sentinel (XMSS version is the Python/Node CLI)', returnsTo: 'beneficiary on timeout; owner on check-in', why: 'Check in to prove you are around. Miss it and the heir can take the KAS.' },
    { id: 'recurring', group: 'alive', name: 'Pay on a timer', type: 'recurring', compiler: 'buildRecurringChain', repo: 'x402-kaspa/sentinel-x402 + wallet/js/tx.js', returnsTo: 'payee each check-in; leftover refunds to owner if missed', why: 'Each check-in pays someone and relocks the rest.' },
    { id: 'hashlock', group: 'quantum', name: 'Secret lock', type: 'hashlock', compiler: 'buildHashlockCovenant', repo: 'wallet/js/tx.js', returnsTo: 'receiver with preimage, else sender after timer', why: 'Claim with a secret, or refund when time is up.' },
    { id: 'onramp', group: 'simple', name: 'Card sale', type: 'onramp', compiler: 'buildHashlockCovenant (5 min, receiver = buyer)', repo: 'wallet/js/tx.js hashlock', returnsTo: 'buyer after they claim; else seller refund', why: 'On-ramp escrow. Seller locks quoted KAS. Buyer claims after card pay. Unpaid refunds in 5 min.' },
    { id: 'xmss', group: 'quantum', name: 'XMSS vault', type: 'xmss', compiler: 'p2shFromRedeemHex(public kit)', repo: 'covenants/xmsslock + keygen/xmss_keygen.py + xmss_sign.py', returnsTo: 'whoever the witness spends to', why: 'Real post-quantum vault. Paste a PUBLIC kit. Never the private JSON. Spend needs ~0.32 KAS extra.' },
    { id: 'send', group: 'simple', name: 'Send KAS', type: 'send', compiler: 'sendKas', repo: null, returnsTo: 'destination', why: 'Plain transfer. Not a P2SH vault. Argent only routes this; it does not compile a covenant.' }
  ];

  var MONTHS = { january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11 };

  var UNIT_TO_DAYS = {
    s: 1 / 86400, sec: 1 / 86400, secs: 1 / 86400, second: 1 / 86400, seconds: 1 / 86400,
    m: 1 / 1440, min: 1 / 1440, mins: 1 / 1440, minute: 1 / 1440, minutes: 1 / 1440,
    h: 1 / 24, hr: 1 / 24, hrs: 1 / 24, hour: 1 / 24, hours: 1 / 24,
    d: 1, day: 1, days: 1,
    w: 7, week: 7, weeks: 7
  };

  var WORD_FIX = {
    loc: 'lock', lok: 'lock', locck: 'lock', lokc: 'lock',
    freezee: 'freeze', freze: 'freeze', frreze: 'freeze', frze: 'freeze',
    capusle: 'capsule', capsle: 'capsule', capsul: 'capsule',
    minuts: 'minutes', minuite: 'minutes', minuets: 'minutes', mins: 'minutes',
    ours: 'hours', hr: 'hours', hrs: 'hours',
    escroww: 'escrow', escro: 'escrow',
    sentinal: 'sentinel',
    mutlisig: 'multisig', multisgn: 'multisig',
    kdag: 'KKDAG', kkdag: 'KKDAG', kasnight: 'KKDAG', kknight: 'KKDAG',
    kronn: 'KRON',
    kaspa: 'KAS',
    transfert: 'transfer'
  };

  var KNOWN = ['lock', 'freeze', 'send', 'pay', 'escrow', 'multisig', 'sentinel', 'capsule', 'minutes', 'hours', 'days', 'kas', 'kkdag', 'kron', 'kpulse', 'vault', 'hold', 'rent', 'until', 'due', 'save', 'sale', 'onramp', 'deadman', 'card'];

  function num(raw) {
    if (raw == null) return null;
    var n = parseFloat(String(raw).replace(',', '.').replace(/^\./, '0.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function parseRentKind(text) {
    var t = String(text || '').toLowerCase();
    if (/\b(apartment|apt|flat|condo)\b/.test(t)) return 'apartment';
    if (/\b(room|studio)\b/.test(t)) return 'room';
    if (/\b(office|shop|storefront|retail)\b/.test(t)) return 'office';
    if (/\b(storage|unit|garage)\b/.test(t)) return 'storage';
    if (/\b(parking|car\s*park)\b/.test(t)) return 'parking';
    if (/\b(house|home|housing)\b/.test(t)) return 'house';
    return null;
  }

  function parseLifeKind(text) {
    var t = String(text || '').toLowerCase();
    if (/\b(rent|lease|landlord|apartment|house\s*rent|housing)\b/.test(t)) return 'rent';
    if (/\b(car\s*note|car\s*payment|auto\s*loan|vehicle|car\s+loan)\b/.test(t)) return 'car';
    if (/\b(sav(e|ing|ings)|emergency\s*fund|rainy\s*day)\b/.test(t)) return 'save';
    if (/\b(control|envelope|earmark|allowance)\b/.test(t)) return 'control';
    if (/\b(spend|spending|grocery|utilities|wifi|electric|bill)\b/.test(t)) return 'spend';
    return null;
  }

  function parseUnlockAnytime(text) {
    return /\b(unlock\s+any\s*time|whenever\s+i\s+say|can\s+unlock|no\s+timer|flexible|unlock\s+whenever|i\s+can\s+unlock)\b/i.test(String(text || ''));
  }

  function parseClock(text) {
    var m = String(text || '').match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (!m) return { h: 0, mi: 0, hit: false };
    var h = Number(m[1]);
    var mi = m[2] != null ? Number(m[2]) : 0;
    var ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h > 23) return { h: 0, mi: 0, hit: false };
    return { h: h, mi: mi, hit: true };
  }

  function dueStamp(y, mo, d, h, mi) {
    var dt = new Date(Date.UTC(y, mo, d, h, mi, 0));
    if (Number.isNaN(dt.getTime())) return null;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return { at: dt.getTime(), label: y + '-' + p(mo + 1) + '-' + p(d) + ' ' + p(h) + ':' + p(mi) + ' UTC' };
  }

  function parseDueAt(text) {
    var t = String(text || '');
    var clock = parseClock(t);
    var m = t.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) {
      var h = m[4] != null ? Number(m[4]) : clock.h;
      var mi = m[5] != null ? Number(m[5]) : clock.mi;
      return dueStamp(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi);
    }
    m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i);
    if (m) {
      var mo = MONTHS[m[1].toLowerCase()];
      var d = Number(m[2]);
      var y = m[3] ? Number(m[3]) : new Date().getUTCFullYear();
      var s = dueStamp(y, mo, d, clock.h, clock.mi);
      if (s && s.at < Date.now() - 3600000 && !m[3]) s = dueStamp(y + 1, mo, d, clock.h, clock.mi);
      return s;
    }
    m = t.match(/\b(?:until|on|by)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
    if (m) {
      var day = Number(m[1]);
      var now = new Date();
      var yy = now.getUTCFullYear();
      var mm = now.getUTCMonth();
      var s2 = dueStamp(yy, mm, day, clock.h, clock.mi);
      if (s2 && s2.at < Date.now()) {
        mm += 1;
        if (mm > 11) { mm = 0; yy += 1; }
        s2 = dueStamp(yy, mm, day, clock.h, clock.mi);
      }
      return s2;
    }
    if (/\btomorrow\b/i.test(t)) {
      var n = new Date(Date.now() + 86400000);
      return dueStamp(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), clock.hit ? clock.h : 12, clock.mi);
    }
    var week = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    m = t.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (m) {
      var want = week.indexOf(m[1].toLowerCase());
      var now2 = new Date();
      var add = (want - now2.getUTCDay() + 7) % 7;
      if (add === 0) add = 7;
      var n2 = new Date(Date.now() + add * 86400000);
      return dueStamp(n2.getUTCFullYear(), n2.getUTCMonth(), n2.getUTCDate(), clock.hit ? clock.h : 12, clock.mi);
    }
    if (/\bnext\s+month\b/i.test(t)) {
      var now3 = new Date();
      var y3 = now3.getUTCFullYear();
      var mo3 = now3.getUTCMonth() + 1;
      if (mo3 > 11) { mo3 = 0; y3 += 1; }
      return dueStamp(y3, mo3, Math.min(now3.getUTCDate(), 28), clock.hit ? clock.h : 12, clock.mi);
    }
    return null;
  }

  function parseAmount(text) {
    var t = String(text || '');
    var labeled = t.match(/(?:^|[\s:])(\.\d+|\d+\.\d+|\d+)\s*(?:kaspa|kas)\b/i);
    if (labeled) return num(labeled[1]);
    if (parseTicker(t)) return null;
    var afterVerb = t.match(/\b(?:lock|timelock|escrow|send|pay|hold|freeze|vault|stake|deposit)\s+(?:for\s+)?(\.\d+|\d+\.\d+|\d+)/i);
    if (afterVerb) return num(afterVerb[1]);
    var bare = t.match(/^(?:[\s]*)(\.\d+|\d+\.\d+|\d+)\s*(?:k)?\s*$/i);
    if (bare) return num(bare[1]);
    return null;
  }

  function parseTicker(text) {
    var t = String(text || '');
    var labeled = t.match(/(?:^|[\s:])(\.\d+|\d+\.\d+|\d+)\s*([A-Za-z][A-Za-z0-9]{2,9})\b/);
    if (!labeled) return null;
    var tick = labeled[2].toUpperCase();
    if (SKIP_TICK[tick]) return null;
    return tick;
  }

  function parseTokenAmount(text) {
    var t = String(text || '');
    var labeled = t.match(/(?:^|[\s:])(\.\d+|\d+\.\d+|\d+)\s*([A-Za-z][A-Za-z0-9]{2,9})\b/);
    if (!labeled) return null;
    var tick = labeled[2].toUpperCase();
    if (SKIP_TICK[tick]) return null;
    var amount = num(labeled[1]);
    return amount ? { amount: amount, tick: tick } : null;
  }

  function parseDuration(text) {
    var t = String(text || '');
    var m = t.match(/(\.\d+|\d+\.\d+|\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|s|m|h|d|w)\b/i);
    if (!m) return null;
    var value = num(m[1]);
    if (!value) return null;
    var unit = m[2].toLowerCase();
    var days = value * (UNIT_TO_DAYS[unit] != null ? UNIT_TO_DAYS[unit] : 1);
    var minutes = Math.max(1, Math.round(days * 1440));
    return { value: value, unit: unit, days: days, minutes: minutes, label: value + ' ' + unit };
  }

  var HARD_TYPES = { send: 1, sentinel: 1, escrow: 1, multisig: 1, recurring: 1, hashlock: 1, onramp: 1, xmss: 1, kcc20lock: 1 };

  function normalizeVaultType(raw) {
    var s = String(raw || '').toLowerCase().replace(/[_/]+/g, ' ').replace(/['’]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var exact = {
      send: 'send', pay: 'send', transfer: 'send',
      timelock: 'timelock', 'time lock': 'timelock', 'time capsule': 'timelock', capsule: 'timelock', lock: 'timelock',
      life: 'life', rent: 'life',
      escrow: 'escrow', 'hold for buyer': 'escrow',
      multisig: 'multisig', 'multi sig': 'multisig', 'two keys': 'multisig', '2 of 2': 'multisig', '2of2': 'multisig',
      kcc20lock: 'kcc20lock', kcc20freeze: 'kcc20lock', freeze: 'kcc20lock', 'freeze tokens': 'kcc20lock',
      sentinel: 'sentinel', deadman: 'sentinel', 'dead man': 'sentinel', 'dead man switch': 'sentinel',
      'deadmans switch': 'sentinel', 'dead man s switch': 'sentinel', dms: 'sentinel', heir: 'sentinel',
      'deadmanswitch': 'sentinel',
      recurring: 'recurring', subscription: 'recurring', x402: 'recurring', 'pay on a timer': 'recurring',
      hashlock: 'hashlock', 'hash lock': 'hashlock', htlc: 'hashlock', 'secret lock': 'hashlock',
      onramp: 'onramp', 'on ramp': 'onramp', 'card sale': 'onramp', cardsale: 'onramp', 'debit card': 'onramp',
      xmss: 'xmss', 'xmss vault': 'xmss'
    };
    if (exact[s]) return exact[s];
    if (/dead\s*mans?|deadmanswitch|sentinel|\bdms\b|\bheir\b|check\s*in/.test(s)) return 'sentinel';
    if (/time\s*capsule|time\s*lock/.test(s)) return 'timelock';
    if (/multi\s*sig|2\s*of\s*2/.test(s)) return 'multisig';
    if (/escrow/.test(s)) return 'escrow';
    if (/on\s*ramp|card\s*sale|debit\s*card/.test(s)) return 'onramp';
    if (/hash\s*lock|htlc/.test(s)) return 'hashlock';
    if (/xmss|post\s*quantum/.test(s)) return 'xmss';
    if (/recurring|x402/.test(s)) return 'recurring';
    if (/kcc20\s*freeze|freeze tokens/.test(s)) return 'kcc20lock';
    return s.replace(/\s+/g, '');
  }

  function isSentinelTalk(t) {
    t = String(t || '').toLowerCase();
    return /sentinel|dead\s*-?\s*mans?|deadmanswitch|\bdms\b|check-?in|when i die|if i (die|pass)|after i.?m gone|inherit|\bheir\b|beneficiar/.test(t);
  }

  function parseAddress(text) {
    var m = String(text || '').match(ADDR_RE);
    if (!m) return null;
    var a = m[0].toLowerCase();
    var parts = a.split(':');
    if (parts.length !== 2 || parts[0] !== 'kaspa') return null;
    if (!/^[qpz][a-z0-9]{20,}$/.test(parts[1])) return null;
    return a;
  }

  function detectType(text, prev) {
    var t = text.toLowerCase();
    if (/\b(escrow|buyer|seller|arbiter|arbitrator)\b/.test(t)) return 'escrow';
    if (/\b(multi-?sig|2\s*of\s*2|both must sign)\b/.test(t)) return 'multisig';
    if (isSentinelTalk(t)) return 'sentinel';
    if (/\b(on-?ramp|card\s*sale|buy\s+kas(pa)?\s+with\s+(a\s+)?(card|debit|usd|dollar)|debit\s*card)\b/.test(t)) return 'onramp';
    if (/\b(recurring|subscription|x402)\b/.test(t)) return 'recurring';
    if (/\b(hash\s*lock|htlc|hash vault)\b/.test(t)) return 'hashlock';
    if (/\b(xmss|post-?quantum|quantum.?safe vault|public kit)\b/.test(t)) return 'xmss';
    if (/\b(send|pay|transfer)\b/.test(t) && parseAddress(t)) return 'send';
    if (/\b(send|pay|transfer)\b/.test(t) && !/\b(lock|hold|freeze|vault|sentinel|heir)\b/.test(t)) return 'send';
    if (parseLifeKind(t) || parseUnlockAnytime(t) || (/\b(lock|hold|save|put\s+aside)\b/.test(t) && parseDueAt(t))) return 'life';
    if (/\b(lock|timelock|time\s*capsule|hold|freeze|vault)\b/.test(t) && parseTicker(t)) return 'kcc20lock';
    if (/\b(lock|timelock|time\s*capsule|hold|freeze|vault)\b/.test(t)) return 'timelock';
    if (parseDuration(t) && !parseAddress(t) && parseTicker(t)) return 'kcc20lock';
    if (parseDuration(t) && !parseAddress(t)) return 'timelock';
    return (prev && prev.type) || null;
  }

  function editDist(a, b) {
    a = String(a); b = String(b);
    if (Math.abs(a.length - b.length) > 2) return 9;
    var dp = [];
    var i, j;
    for (i = 0; i <= a.length; i++) {
      dp[i] = new Array(b.length + 1);
      dp[i][0] = i;
    }
    for (j = 0; j <= b.length; j++) dp[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[a.length][b.length];
  }

  function normalizeChat(text) {
    var t = String(text || '').trim();
    t = t.replace(/(?:^|[^\d])(\.\d+)/g, function (m, d) { return m.replace(d, '0' + d); });
    t = t.replace(/\b([A-Za-z][A-Za-z0-9]{1,11})\b/g, function (w, _g, offset, whole) {
      if (String(whole || '').charAt((offset || 0) + w.length) === ':') return w;
      var k = w.toLowerCase();
      if (WORD_FIX[k]) return WORD_FIX[k];
      if (k.length < 4) return w;
      var best = null, bestD = 2, n;
      for (var i = 0; i < KNOWN.length; i++) {
        n = KNOWN[i];
        var d = editDist(k, n);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best && bestD <= 1) return best === 'kkdag' ? 'KKDAG' : best;
      return w;
    });
    t = t.replace(/\bwallet\s*([12]|one|two)\b/ig, function (_, n) {
      return 'wallet ' + (/2|two/i.test(n) ? 2 : 1);
    });
    return t;
  }

  function parseIntent(text, prev) {
    prev = prev || null;
    var raw = normalizeChat(String(text || '').trim());
    if (!raw) return { error: 'empty' };

    var tokenAmt = parseTokenAmount(raw);
    var amountKas = parseAmount(raw);
    if (amountKas == null && prev && prev.params) amountKas = prev.params.amountKas != null ? prev.params.amountKas : null;
    var duration = parseDuration(raw);
    if (!duration && prev && prev.params && (prev.params.lockMinutes || prev.params.lockDays)) {
      duration = { days: prev.params.lockDays, minutes: prev.params.lockMinutes, label: prev.params.durationLabel };
    }
    var address = parseAddress(raw);
    if (!address && prev && prev.params) {
      address = prev.params.buyerAddress || prev.params.counterparty || prev.params.destination || prev.params.beneficiary || prev.params.payee || null;
    }
    var lifeKind = parseLifeKind(raw) || (prev && prev.params && prev.params.lifeKind) || null;
    var due = parseDueAt(raw);
    if (!due && prev && prev.params && prev.params.dueAt) due = { at: prev.params.dueAt, label: prev.params.dueLabel };
    var unlockAnytime = parseUnlockAnytime(raw) || (!!(prev && prev.params && prev.params.unlockAnytime) && !due);
    var type = detectType(raw, prev);
    if (prev && prev.type) {
      var prevT = normalizeVaultType(prev.type);
      if (HARD_TYPES[prevT] && !type) type = prevT;
      if (HARD_TYPES[type] && HARD_TYPES[prevT] && type !== prevT && isSentinelTalk(raw)) type = 'sentinel';
    }
    type = normalizeVaultType(type) || type;
    if (!HARD_TYPES[type] && (lifeKind || unlockAnytime || (due && amountKas))) type = 'life';

    if (!type && !amountKas && !tokenAmt && !duration && !address && !lifeKind && !due) {
      return { error: 'unparsed', hint: 'Try: Lock 1000 KAS for rent until September 1 2026 9:00 UTC' };
    }

    var params = {};
    if (amountKas) params.amountKas = amountKas;
    if (tokenAmt) {
      params.amountToken = tokenAmt.amount;
      params.tick = tokenAmt.tick;
    } else if (prev && prev.params && prev.params.amountToken) {
      params.amountToken = prev.params.amountToken;
      if (prev.params.tick) params.tick = prev.params.tick;
    }
    var tickOnly = parseTicker(raw);
    if (tickOnly) params.tick = tickOnly;
    if (duration) {
      params.lockDays = duration.days;
      params.lockMinutes = duration.minutes;
      params.durationLabel = duration.label;
    }
    if (type === 'life') {
      params.lifeKind = lifeKind || (unlockAnytime ? 'control' : (tokenAmt ? 'spend' : null)) || (prev && prev.params && prev.params.lifeKind) || null;
      var rentKind = parseRentKind(raw) || (prev && prev.params && prev.params.rentKind) || null;
      if (rentKind) params.rentKind = rentKind;
      if (params.lifeKind === 'rent' && rentKind) params.lifeLabel = RENT_LABEL[rentKind] || 'House rent';
      else if (params.lifeKind) params.lifeLabel = LIFE_LABEL[params.lifeKind] || 'Real life';
      params.unlockAnytime = !!(unlockAnytime || (params.lifeKind === 'control' && !due && !duration));
      if (tokenAmt) {
        params.amountToken = tokenAmt.amount;
        params.tick = tokenAmt.tick;
        delete params.amountKas;
        if (params.unlockAnytime) params.unlockAnytime = false;
      }
      if (due && !params.unlockAnytime) {
        params.dueAt = due.at;
        params.dueLabel = due.label;
        var mins = Math.max(1, Math.round((due.at - Date.now()) / 60000));
        params.lockMinutes = mins;
        params.lockDays = mins / 1440;
        params.durationLabel = 'until ' + due.label;
      }
    }
    if (type === 'escrow' && address) params.buyerAddress = address;
    if (type === 'multisig' && address) params.counterparty = address;
    if (type === 'send' && address) params.destination = address;
    if (type === 'sentinel' && address) params.beneficiary = address;
    if (type === 'sentinel' && !params.beneficiary && params.destination) params.beneficiary = params.destination;
    if (type === 'recurring' && address) params.payee = address;
    if (type === 'hashlock' && address) params.receiver = address;
    if (type === 'onramp') {
      if (address) params.receiver = address;
      if (!params.lockMinutes && !params.lockDays) {
        params.lockMinutes = 5;
        params.lockDays = 5 / 1440;
        params.durationLabel = '5 minutes';
      }
    }

    var missing = [];
    if (!type) missing.push('what to do (lock, escrow, send, freeze, rent, savings, sentinel)');
    if (type === 'kcc20lock') {
      if (!params.amountToken) missing.push('token amount (e.g. 20 KKDAG)');
      if (!params.tick) missing.push('KCC20 ticker');
      if (!params.lockMinutes && !params.lockDays) missing.push('how long (e.g. 3 minutes)');
    } else if (type === 'life') {
      if (!params.lifeKind) missing.push('which real-life case (house rent, car note, spending, savings, or control)');
      if (params.lifeKind === 'rent' && !params.rentKind) missing.push('what kind of rent (house, apartment, room, office, storage, parking)');
      if (!(params.amountToken && params.tick) && !params.amountKas) {
        missing.push('amount in KAS or a KCC20 amount like 50 KKDAG');
      }
      if (params.tick && params.amountToken && !params.unlockAnytime && !params.lockMinutes && !params.dueAt) {
        missing.push('when it is due (KCC20 locks until a date)');
      } else if (!params.tick && !params.unlockAnytime && !params.lockMinutes && !params.dueAt) {
        missing.push('when it is due (a date/time, or say unlock anytime)');
      }
      if (params.dueAt && params.dueAt < Date.now() - 60000 && !params.unlockAnytime) {
        missing.push('a future due date');
      }
    } else if (type === 'xmss') {
      if (!params.amountKas) missing.push('amount in KAS');
      if (!params.kit) missing.push('XMSS public kit JSON from keygen/xmss_keygen.py (never the private file)');
    } else if (type === 'send') {
      if (!params.amountKas) missing.push('amount in KAS');
      if (!params.destination) missing.push('destination kaspa: address');
    } else {
      if (!params.amountKas) missing.push('amount in KAS');
      if ((type === 'timelock' || type === 'sentinel' || type === 'recurring' || type === 'hashlock') && !params.lockMinutes && !params.lockDays) {
        missing.push('how long (e.g. 3 minutes)');
      }
    }
    if ((type === 'hashlock' || type === 'onramp') && !params.receiver) missing.push('buyer kaspa: address who can claim');
    if (type === 'escrow' && !params.buyerAddress) missing.push('buyer kaspa: address');
    if (type === 'multisig' && !params.counterparty) missing.push('counterparty kaspa: address');
    if (type === 'sentinel' && !params.beneficiary) missing.push('heir / beneficiary kaspa: address');
    if (type === 'recurring' && !params.payee) missing.push('payee kaspa: address');
    if (type === 'recurring' && !params.payKas) missing.push('how much KAS to pay each check-in');

    return {
      type: type || 'timelock',
      params: params,
      missing: missing,
      complete: missing.length === 0,
      source: 'local'
    };
  }

  function describeIntent(intent) {
    if (!intent) return '';
    var p = intent.params || {};
    var amt = (p.amountToken && p.tick)
      ? (p.amountToken + ' ' + p.tick)
      : (p.amountKas != null ? p.amountKas + ' KAS' : 'an amount');
    var tokenAmt = p.amountToken != null ? (p.amountToken + ' ' + (p.tick || 'KCC20')) : null;
    var dur = p.durationLabel || (p.lockMinutes ? p.lockMinutes + ' minutes' : (p.lockDays ? p.lockDays + ' days' : 'a duration'));
    if (intent.type === 'life') {
      var kind = p.lifeLabel || LIFE_LABEL[p.lifeKind] || 'Real life';
      if (p.unlockAnytime) return kind + ': lock ' + amt + ' in a control envelope. You can unlock anytime with PIN.';
      return kind + ': lock ' + amt + ' until ' + (p.dueLabel || dur) + '. Cannot unlock early. Returns to YOU, not a third party.';
    }
    if (intent.type === 'kcc20lock') return 'KCC20 freeze: lock ' + (tokenAmt || ('KCC20' + (p.tick ? ' ' + p.tick : ''))) + ' for ' + dur + '. Same CLTV as native KAS.';
    if (intent.type === 'timelock') return 'Time capsule: lock ' + amt + ' for ' + dur + '. Returns to the owner wallet when time is up.';
    if (intent.type === 'sentinel') return 'Sentinel: lock ' + amt + ' for ' + dur + ', check-in or release to heir ' + (p.beneficiary || '…') + '.';
    if (intent.type === 'recurring') return 'Recurring: lock ' + amt + ' and pay ' + (p.payKas || '?') + ' KAS on each check-in to ' + (p.payee || '…') + '.';
    if (intent.type === 'hashlock') return 'Hash vault: lock ' + amt + ' for ' + dur + ' (secret or refund).';
    if (intent.type === 'onramp') return 'Card sale: lock ' + amt + ' for ' + dur + ' for buyer ' + (p.receiver || '…') + '. They claim after they pay. Unpaid refunds to you.';
    if (intent.type === 'escrow') return 'Escrow ' + amt + ' for buyer ' + (p.buyerAddress || '…') + '.';
    if (intent.type === 'multisig') return '2-of-2 vault of ' + amt + ' with ' + (p.counterparty || 'a counterparty') + '.';
    if (intent.type === 'xmss') return 'XMSS vault: lock ' + amt + '. Paste a public kit from xmss_keygen.py. Never the private file.';
    if (intent.type === 'send') return 'Send ' + amt + ' to ' + (p.destination || '…') + '. Plain transfer — not a vault.';
    return intent.type + ': ' + amt;
  }

  function askFor(missing) {
    if (!missing || !missing.length) return '';
    var first = missing[0];
    if (first.indexOf('what kind of rent') !== -1) return 'What kind of rent — house, apartment, room, office, storage, or parking?';
    if (first.indexOf('which real-life case') !== -1) return 'Which case — house rent, car note, spending, savings, or control?';
    if (first.indexOf('token amount') !== -1) return 'How many tokens? Example: “20 KKDAG”.';
    if (first.indexOf('KCC20 ticker') !== -1) return 'Which KCC20 ticker? Example: KKDAG.';
    if (first.indexOf('KAS or a KCC20') !== -1) return 'How much? Example: “1000 kas” or “50 KKDAG”.';
    if (first.indexOf('amount') !== -1) return 'How much KAS? You can say “.15 kas”.';
    if (first.indexOf('when it is due') !== -1 || first.indexOf('future due') !== -1) return 'When is it due? Example: “September 1 2026 9:00 UTC”, or say “unlock anytime”.';
    if (first.indexOf('how long') !== -1) return 'How long should it stay locked? Example: “3 minutes” or “30 days”.';
    if (first.indexOf('who can claim') !== -1 || first.indexOf('buyer kaspa') !== -1) return 'Paste the buyer’s kaspa:q. Only that address can claim this sale lock.';
    if (first.indexOf('buyer') !== -1) return 'Paste the buyer’s kaspa: address.';
    if (first.indexOf('counterparty') !== -1) return 'Paste the other signer’s kaspa: address.';
    if (first.indexOf('destination') !== -1) return 'Paste the destination kaspa: address.';
    if (first.indexOf('heir') !== -1 || first.indexOf('beneficiary') !== -1) return 'Paste the heir’s kaspa:q address (grandson, etc). Timeout pays that address.';
    if (first.indexOf('payee') !== -1) return 'Paste the payee’s kaspa: address.';
    if (first.indexOf('each check-in') !== -1) return 'How much KAS should each check-in pay?';
    if (first.indexOf('public kit') !== -1 || first.indexOf('XMSS') !== -1) return 'Paste the PUBLIC kit JSON from python3 keygen/xmss_keygen.py. Never the private file.';
    return 'I still need ' + first + '.';
  }

  function interpretVaultChat(text, prev) {
    var raw = String(text || '').trim();
    var norm = normalizeChat(raw);
    var low = norm.toLowerCase();
    if (/\b(dag.?knight|argent|covenant\+\+|getting ready|michael sutton|kip-?2)\b/i.test(low)) {
      return {
        kind: 'talk',
        text: 'Argent — vault agent for this wallet. I turn messy English into covenant actions this app can actually fund on mainnet: Time Capsule (KAS CLTV), KCC20 Freeze, escrow, 2-of-2, sentinel, hashlock, XMSS (public kit). I do not hold keys. Say what to lock.'
      };
    }
    if (/^(hi|hey|hello|yo|sup|help|what can you do|\?)\b/i.test(low) || low.length < 3) {
      return {
        kind: 'talk',
        text: 'Tell me in plain words. Examples: “lock 1000 kas for rent until September 1 2026 9:00 UTC”, “save 200 kas, unlock anytime”, “send 10 kas to kaspa:q…”, “dead-man 50 kas for 30 days, heir kaspa:q…”.'
      };
    }
    var intent = parseIntent(norm, prev);
    return { kind: 'intent', intent: intent, normalized: norm };
  }

  function familyTalk(text) {
    return /\b(grandson|granddaughter|grandchild|son|daughter|heir|kids?|children|wife|husband|spouse|beneficiary|nephew|niece)\b/i.test(String(text || ''));
  }

  function deathTalk(text) {
    return /\b(when i die|if i die|if i pass|dead.?man|check-?in|sentinel|inherit|pass(es)? away|after i.?m gone|if something happens to me)\b/i.test(String(text || ''));
  }

  function laterTalk(text) {
    return /\b(until (he|she|they)|when (he|she) (turns|is) \d+|18th|birthday|grows up|lock (it )?for (him|her)|hold (it )?for)\b/i.test(String(text || ''));
  }

  function directorHints(text, intent) {
    var hints = [];
    if (!intent || intent.error) return hints;
    var family = familyTalk(text);
    var death = deathTalk(text);
    var later = laterTalk(text);
    if (family && intent.type === 'send' && !death && !later) {
      hints.push({
        code: 'send-now',
        suggest: 'send',
        why: '“Send to my grandson” with no lock/heir words is a plain KAS transfer. Need amount + a full kaspa:q address. Argent does not compile a vault for this.'
      });
      hints.push({
        code: 'ask-lock',
        ask: 'If you meant he only gets it later: say “dead-man for my grandson” (sentinel — timeout pays his address) or “lock until DATE” (Time Capsule returns to YOU, then you send).'
      });
    }
    if (family && (death || intent.type === 'sentinel')) {
      hints.push({
        code: 'heir',
        suggest: 'sentinel',
        why: 'Heir / dead-man language → sentinel. Timeout pays beneficiary. Check-in keeps it yours. Time Capsule would return to you, not him.'
      });
    }
    if (family && later && intent.type !== 'sentinel' && intent.type !== 'hashlock' && intent.type !== 'escrow') {
      hints.push({
        code: 'capsule-not-heir',
        warn: 'Time Capsule / life lock returns to the OWNER when the timer ends, not to the grandson. To pay him on timeout use sentinel with beneficiary = his kaspa:q. To let him claim with a secret use hashlock. To let him claim while you can refund use escrow.'
      });
    }
    if (intent.type === 'timelock' || intent.type === 'life') {
      hints.push({
        code: 'returns-to-owner',
        info: 'This product unlocks to the funding wallet, not a third party.'
      });
    }
    if (intent.type === 'xmss') {
      hints.push({
        code: 'xmss-offline',
        info: 'XMSS keys are generated offline (keygen/xmss_keygen.py). This wallet only funds the P2SH and later broadcasts a witness. Never paste the private kit.'
      });
    }
    if (intent.type === 'sentinel') {
      hints.push({
        code: 'schnorr-analog',
        info: 'In-app Argent sentinel is a Schnorr + CLTV hop chain with the same IF/ELSE + OpTxOutputSpk shape as covenants/sentinel. The Python/Node XMSS sentinel in the repo is the post-quantum CLI. Use type xmss + public kit for the real XMSS vault.'
      });
    }
    return hints;
  }

  function compilePlan(intent) {
    var type = normalizeVaultType(intent && intent.type) || (intent && intent.type);
    var product = null;
    var i;
    for (i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].type === type || PRODUCTS[i].id === type) { product = PRODUCTS[i]; break; }
    }
    if (!product) product = PRODUCTS[0];
    var method = type === 'send' ? 'sendKas' : 'compileVault';
    return {
      product: product,
      method: method,
      p2sh: type !== 'send',
      addressPrefix: type === 'send' ? 'kaspa:q' : 'kaspa:p',
      walletFn: product.compiler,
      repo: product.repo,
      returnsTo: product.returnsTo,
      payload: type === 'send'
        ? { dest: (intent.params && intent.params.destination) || '', amount: String((intent.params && intent.params.amountKas) || '') }
        : { type: type, params: (intent && intent.params) || {} },
      fact: type === 'send'
        ? 'Argent will not compile a covenant. The wallet sends native KAS after PIN.'
        : 'Argent compiles a P2SH kaspa:p in the PWA (rusty-kaspa WASM). The SDK never sees keys. User Approves, then PIN/KasWare funds the covenant.'
    };
  }

  function validateIntent(intent) {
    if (!intent) return { ok: false, error: 'no intent' };
    if (intent.error) return { ok: false, error: intent.error, hint: intent.hint };
    var missing = intent.missing || [];
    if (missing.length) return { ok: false, complete: false, missing: missing, ask: askFor(missing) };
    var types = {};
    var i;
    for (i = 0; i < PRODUCTS.length; i++) types[PRODUCTS[i].type] = 1;
    if (!types[intent.type]) return { ok: false, error: 'unknown type ' + intent.type };
    return { ok: true, complete: true, intent: intent };
  }

  function walletDeepLink(input) {
    var msg = '';
    if (typeof input === 'string') msg = input;
    else if (input && input.message) msg = input.message;
    else if (input && input.type) {
      var p = input.params || {};
      if (input.type === 'send') msg = 'send ' + (p.amountKas || '') + ' kas to ' + (p.destination || '');
      else if (input.type === 'sentinel') msg = 'dead-man ' + (p.amountKas || '') + ' kas for ' + (p.durationLabel || (p.lockMinutes ? p.lockMinutes + ' minutes' : '30 days')) + (p.beneficiary ? (' heir ' + p.beneficiary) : '');
      else if (input.type === 'timelock' || input.type === 'life') msg = 'lock ' + (p.amountKas || '') + ' kas for ' + (p.durationLabel || p.dueLabel || (p.lockMinutes + ' minutes') || '7 days');
      else msg = describeIntent(input);
    }
    return WALLET + '/?tab=vault&argent=' + encodeURIComponent(String(msg || '').trim());
  }

  function toCompileVaultParams(intent) {
    var v = validateIntent(intent);
    if (!v.ok) return { error: v.error || v.ask, missing: v.missing, ask: v.ask };
    var ctype = normalizeVaultType(intent.type) || intent.type;
    if (ctype === 'send') {
      return { method: 'sendKas', dest: intent.params.destination, amount: String(intent.params.amountKas) };
    }
    return { method: 'compileVault', type: ctype, params: intent.params };
  }

  function direct(text, prev) {
    var view = interpretVaultChat(text, prev);
    if (view.kind === 'talk') {
      return { kind: 'talk', text: view.text, normalized: normalizeChat(text) };
    }
    var intent = view.intent;
    var hints = directorHints(text, intent);
    var plan = intent && !intent.error ? compilePlan(intent) : null;
    var ask = intent && intent.missing && intent.missing.length ? askFor(intent.missing) : '';
    return {
      kind: 'intent',
      normalized: view.normalized,
      intent: intent,
      summary: describeIntent(intent),
      ask: ask,
      complete: !!(intent && intent.complete),
      hints: hints,
      plan: plan,
      deepLink: walletDeepLink(typeof text === 'string' ? text : intent),
      walletCall: intent && !intent.error ? toCompileVaultParams(intent) : null
    };
  }

  function intentSchema() {
    return {
      $id: 'https://kcc20-sdk.vercel.app/argent.schema.json',
      title: 'ArgentIntent',
      type: 'object',
      required: ['type', 'params'],
      properties: {
        type: { enum: ['send', 'timelock', 'life', 'escrow', 'multisig', 'kcc20lock', 'sentinel', 'recurring', 'hashlock', 'onramp', 'xmss'] },
        params: {
          type: 'object',
          properties: {
            amountKas: { type: 'number' },
            amountToken: { type: 'number' },
            tick: { type: 'string' },
            lockMinutes: { type: 'number' },
            lockDays: { type: 'number' },
            durationLabel: { type: 'string' },
            dueAt: { type: 'number' },
            dueLabel: { type: 'string' },
            unlockAnytime: { type: 'boolean' },
            lifeKind: { enum: ['rent', 'car', 'spend', 'control', 'save'] },
            rentKind: { enum: ['house', 'apartment', 'room', 'office', 'storage', 'parking'] },
            destination: { type: 'string', pattern: '^kaspa:[qpz][a-z0-9]{20,}$' },
            buyerAddress: { type: 'string' },
            counterparty: { type: 'string' },
            beneficiary: { type: 'string' },
            payee: { type: 'string' },
            payKas: { type: 'number' },
            periods: { type: 'number' },
            hopCount: { type: 'number' },
            receiver: { type: 'string' },
            secretHex: { type: 'string' },
            kit: { type: 'string', description: 'XMSS public kit JSON only' }
          }
        },
        missing: { type: 'array', items: { type: 'string' } },
        complete: { type: 'boolean' }
      }
    };
  }

  function directorLines(userText) {
    var lines = [
      'You are a vault director for Argent (KCC20 Wallet / SCORPION). You do NOT hold keys. You do NOT compile scripts. You turn the user’s English into one ArgentIntent JSON, then the wallet Argent compiles and the user PIN-signs.',
      '',
      'Load in the dApp:',
      '  <script src="' + SDK + '"></script>',
      '  <script src="https://kcc20-sdk.vercel.app/argent.js"></script>',
      'Parse locally first (no LLM required): const directed = window.kcc20Argent.direct(userText);',
      'Turn ANY llmDirectorPrompt() value into a string with: window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt())',
      'Do NOT call .join on a string. promptText() accepts a string, an array, or a joinable object.',
      'If directed.complete, on a user click:',
      '  await window.kcc20.connect();',
      '  if (directed.plan.method === "sendKas") await window.kcc20.sendKas(directed.plan.payload);',
      '  else await window.kcc20.compileVault(directed.plan.payload);',
      'If not complete, ask directed.ask. Never invent a kaspa: address. Never ask for seed, PIN, or 64-hex.',
      '',
      'FACT-CHECK (how Argent actually works in https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants wallet/):',
      '1. Argent is a local parser (wallet/js/intent.js) plus local P2SH builders (wallet/js/tx.js buildTimelockCovenant, buildSentinelChain, …). Optional remote /kccApi chat merge. It is not a hosted XMSS compiler.',
      '2. type=send is a plain KAS transfer. It is NOT a vault. Example: “I want to send Kaspa to my grandson” → send. Need amount + grandson’s kaspa:q. Argent will not compile.',
      '3. Time Capsule / life lock RETURNS TO THE OWNER when time is up. It does not pay the grandson. Do not tell the user it will.',
      '4. Heir / “when I die” / dead-man → type=sentinel, params.beneficiary = grandson kaspa:q, amountKas, lockMinutes. Timeout pays the heir. Check-in keeps it with the owner. In-app sentinel is Schnorr+CLTV hops shaped like covenants/sentinel. Full XMSS sentinel is the repo CLI.',
      '5. “Lock until he turns 18 then he gets it” is NOT a Time Capsule. Use sentinel (timeout → heir) or hashlock (he claims with a secret) or escrow (he claims, owner can refund). Say this honestly.',
      '6. XMSS vault: user generates keys offline with python3 keygen/xmss_keygen.py. Paste PUBLIC kit only. Wallet funds kaspa:p and later broadcasts xmss_sign.py witness. Spend needs ~0.32 KAS extra.',
      '7. Escrow buyer and 2-of-2 counterparty must be kaspa:q addresses; Sweep for 2-of-2 needs both keys imported in this PWA.',
      '8. Recurring needs payee + payKas + lock window. Missed window refunds leftover to owner.',
      '9. KCC20 freeze is type kcc20lock (amountToken + tick + duration). sendToken is a bag transfer, not this.',
      '10. After compileVault the result is { address: "kaspa:p…", txId, type }. pushTx returns { txId, node }. Keys stay at ' + WALLET + '.',
      '11. SCORPION is window.kcc20. Buy tokens with buyKron({ tick, amount }) where amount is KAS. Do not signPskt for vaults — Argent compiles. Do not overwrite a real window.kasware.',
      '',
      'JSON only when the intent is ready. Schema types: send, timelock, life, escrow, multisig, kcc20lock, sentinel, recurring, hashlock, xmss.',
      'If the user says “send kaspa to his grandson” and has no address, ask for the kaspa:q and the amount. Offer: send now vs dead-man (sentinel) vs lock-for-yourself-then-you-send.',
      '',
      'Repos: ' + REPO + '  SDK: https://github.com/mrzeku2000XTTT/kcc20-sdk  Docs: https://kcc20-sdk.vercel.app/argent.html  Prompts: https://kcc20-sdk.vercel.app/argent.html#prompts'
    ];
    if (userText) {
      lines.push('', 'USER:', String(userText));
    }
    return lines;
  }

  function promptText(raw) {
    if (raw == null) return '';
    if (typeof raw === 'function') {
      try { return promptText(raw()); } catch (e) { return ''; }
    }
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    if (raw && typeof raw.text === 'string') return raw.text;
    if (raw && typeof raw.join === 'function') {
      try {
        var joined = raw.join('\n');
        if (typeof joined === 'string') return joined;
      } catch (e) {}
    }
    return String(raw);
  }

  function llmDirectorLines(userText) {
    return directorLines(userText);
  }

  function llmDirectorText(userText) {
    return directorLines(userText).join('\n');
  }

  function llmDirectorPrompt(userText) {
    var lines = directorLines(userText);
    var text = lines.join('\n');
    var out = lines.slice();
    out.join = function (sep) {
      return Array.prototype.join.call(this, sep == null ? '\n' : sep);
    };
    out.toString = function () { return text; };
    out.valueOf = function () { return text; };
    out.toJSON = function () { return text; };
    out.text = text;
    return out;
  }

  var QUOTE_MS = 5 * 60 * 1000;
  var PRICE_URLS = [
    'https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd',
    'https://api.coinpaprika.com/v1/tickers/kas-kaspa'
  ];

  function quoteId() {
    return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function quoteFromPrice(opts) {
    var usd = Number(opts && opts.usd);
    var usdPerKas = Number(opts && opts.usdPerKas);
    var dest = (opts && opts.dest) ? String(opts.dest).toLowerCase() : '';
    var windowMs = Number(opts && opts.windowMs) > 0 ? Number(opts.windowMs) : QUOTE_MS;
    if (!(usd > 0)) throw new Error('Enter a USD amount greater than 0');
    if (!(usdPerKas > 0)) throw new Error('Need a live KAS/USD price');
    if (dest && !parseAddress(dest)) throw new Error('Buyer dest must be a full kaspa:q address');
    var kas = usd / usdPerKas;
    var kasAmount = Math.floor(kas * 1e8) / 1e8;
    if (!(kasAmount > 0)) throw new Error('USD amount is too small for one sompi of KAS');
    var now = Date.now();
    return {
      quoteId: (opts && opts.quoteId) || quoteId(),
      usd: usd,
      usdPerKas: usdPerKas,
      kasAmount: kasAmount,
      dest: dest || '',
      windowMs: windowMs,
      windowMinutes: windowMs / 60000,
      createdAt: now,
      expiresAt: now + windowMs,
      source: (opts && opts.source) || 'manual',
      fact: 'Quote is live for 5 minutes. Card POS is YOUR Stripe/Base44 payment — Argent does not charge cards. After paid=true, treasury sendKas or hashlock claim to dest.'
    };
  }

  function quoteValid(q) {
    if (!q || !(Number(q.kasAmount) > 0) || !(Number(q.usd) > 0)) return false;
    return Date.now() < Number(q.expiresAt);
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('price HTTP ' + r.status);
      return r.json();
    });
  }

  function quoteKasUsd() {
    return fetchJson(PRICE_URLS[0]).then(function (j) {
      var p = j && j.kaspa && Number(j.kaspa.usd);
      if (!(p > 0)) throw new Error('CoinGecko gave no kaspa.usd');
      return { usdPerKas: p, source: 'coingecko' };
    }).catch(function () {
      return fetchJson(PRICE_URLS[1]).then(function (j) {
        var p = j && j.quotes && j.quotes.USD && Number(j.quotes.USD.price);
        if (!(p > 0)) throw new Error('No KAS/USD from backup oracle');
        return { usdPerKas: p, source: 'coinpaprika' };
      });
    });
  }

  function quoteOnramp(opts) {
    opts = opts || {};
    return quoteKasUsd().then(function (px) {
      return quoteFromPrice({
        usd: opts.usd,
        dest: opts.dest,
        usdPerKas: px.usdPerKas,
        source: px.source,
        windowMs: opts.windowMs
      });
    });
  }

  function onrampCompile(quote) {
    if (!quoteValid(quote)) throw new Error('Quote expired. Fetch a new 5-minute price.');
    if (!parseAddress(quote.dest)) throw new Error('Need buyer kaspa:q before compiling the faucet lock');
    return {
      type: 'onramp',
      params: {
        amountKas: quote.kasAmount,
        lockMinutes: Math.max(1, Math.round(quote.windowMinutes || 5)),
        durationLabel: '5 minute on-ramp window',
        receiver: quote.dest,
        quoteId: quote.quoteId,
        usd: quote.usd,
        usdPerKas: quote.usdPerKas
      }
    };
  }

  function onrampFaucet(quote) {
    if (!quoteValid(quote)) throw new Error('Quote expired. Do not send. Fetch a new quote.');
    if (!parseAddress(quote.dest)) throw new Error('Need buyer kaspa:q');
    return { dest: quote.dest, amount: String(quote.kasAmount), amountKas: String(quote.kasAmount), quoteId: quote.quoteId };
  }

  function onrampPaidMessage(quote) {
    if (!quote || !parseAddress(quote.dest)) throw new Error('Need buyer kaspa:q');
    return 'on-ramp paid quote ' + (quote.quoteId || '') + ': send ' + quote.kasAmount + ' kas to ' + quote.dest + ' only that address may spend it';
  }

  function onrampPaidIntent(quote) {
    var faucet = onrampFaucet(quote);
    return {
      type: 'send',
      params: { amountKas: Number(faucet.amountKas), destination: faucet.dest, quoteId: faucet.quoteId },
      complete: true,
      missing: [],
      argentChat: onrampPaidMessage(quote),
      wallet: { method: 'sendKas', dest: faucet.dest, amount: faucet.amount },
      spendRule: 'P2PK to dest. After the treasury send confirms, only that kaspa:q can spend the KAS. Argent does not need a second covenant for that.',
      ui: 'Receipt tab: paid. Loading KAS… then show txId. If treasury is watch-only, fail with: import signing key.'
    };
  }

  function onrampFlow() {
    return [
      { step: 1, who: 'seller', do: 'Create a SIGNING treasury in KCC20 (native PIN or KasWare). Not watch-only. Fund it with KAS to sell.' },
      { step: 2, who: 'buyer', do: 'Connect or paste their kaspa:q. Quote 5 min: quoteOnramp({ usd, dest }).' },
      { step: 3, who: 'app POS', do: 'Charge $ on Stripe. Receipt tab: paid. Await KAS loading animation. Do not send if !quoteValid.' },
      { step: 4, who: 'detect', do: 'Webhook paid=true → tell Argent onrampPaidMessage(q). AI must not invent dest.' },
      { step: 5, who: 'Argent', do: 'Treasury chip Approves sendKas(onrampFaucet(q)). Optional first: compileVault(onrampCompile(q)) hashlock so only buyer can claim, else 5 min refund to treasury.' },
      { step: 6, who: 'chain', do: 'KAS sits on buyer kaspa:q (P2PK). Only they can spend. $ sits in Stripe bank, not Kaspa.' }
    ];
  }

  var CN_BASE = 'https://api.changenow.io';
  var CN_WIDGET = 'https://changenow.io/embeds/exchange-widget/v2/widget.html';

  function cnTicker(raw) {
    var s = String(raw || 'usdc').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (s === 'kas' || s === 'kaspa') return { currency: 'kas', network: 'kaspa', v1: 'kas' };
    if (s === 'usdcerc20' || s === 'usdceth' || s === 'usdce') return { currency: 'usdc', network: 'eth', v1: 'usdcerc20' };
    if (s === 'usdttrc20' || s === 'usdttrc' || s === 'usdttron') return { currency: 'usdt', network: 'trx', v1: 'usdttrc20' };
    if (s === 'usdtbsc' || s === 'usdtbep20') return { currency: 'usdt', network: 'bsc', v1: 'usdtbsc' };
    if (s === 'usdterc20' || s === 'usdteth' || s === 'usdt') return { currency: 'usdt', network: 'eth', v1: 'usdterc20' };
    if (s === 'usdc' || s === 'usd') return { currency: 'usdc', network: 'eth', v1: 'usdcerc20' };
    if (s === 'eth' || s === 'ethereum') return { currency: 'eth', network: 'eth', v1: 'eth' };
    if (s === 'btc' || s === 'bitcoin') return { currency: 'btc', network: 'btc', v1: 'btc' };
    return { currency: s, network: '', v1: s };
  }

  function changenowApiKey(explicit) {
    if (explicit) return String(explicit);
    try {
      if (typeof window !== 'undefined' && window.CHANGENOW_API_KEY) return String(window.CHANGENOW_API_KEY);
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem('kcc20_changenow_key') || '';
    } catch (e2) {}
    return '';
  }

  function changenowWidgetUrl(opts) {
    opts = opts || {};
    var from = cnTicker(opts.from || 'usdc');
    var to = cnTicker(opts.to || 'kas');
    var amt = opts.amount != null ? String(opts.amount) : '20';
    var dest = String(opts.address || opts.dest || '').trim();
    var q = [
      'FAQ=false',
      'darkMode=true',
      'backgroundColor=0B0B0C',
      'primaryColor=C9A36A',
      'logo=false',
      'locales=false',
      'horizontal=false',
      'lang=en-US',
      'from=' + encodeURIComponent(from.v1 || from.currency),
      'to=' + encodeURIComponent(to.v1 || to.currency),
      'amount=' + encodeURIComponent(amt)
    ];
    if (dest) q.push('toAddress=' + encodeURIComponent(dest));
    if (opts.linkId) q.push('link_id=' + encodeURIComponent(opts.linkId));
    return CN_WIDGET + '?' + q.join('&');
  }

  function changenowMin(opts) {
    opts = opts || {};
    var from = cnTicker(opts.from || 'usdc');
    var to = cnTicker(opts.to || 'kas');
    var url = CN_BASE + '/v1/min-amount/' + from.v1 + '_' + to.v1;
    return fetchJson(url).then(function (j) {
      return { min: Number(j && (j.minAmount != null ? j.minAmount : j.min)), from: from.v1, to: to.v1 };
    });
  }

  function changenowEstimate(opts) {
    opts = opts || {};
    var from = cnTicker(opts.from || 'usdc');
    var to = cnTicker(opts.to || 'kas');
    var amount = Number(opts.amount);
    if (!(amount > 0)) throw new Error('Enter how much you send (e.g. 20 USDC)');
    var url = CN_BASE + '/v1/exchange-amount/' + encodeURIComponent(String(amount)) + '/' + from.v1 + '_' + to.v1 + '/';
    return fetchJson(url).then(function (j) {
      var estimated = Number(j && (j.estimatedAmount != null ? j.estimatedAmount : j.amount));
      if (!(estimated > 0) && j && j.error) throw new Error(String(j.error));
      if (!(estimated > 0)) throw new Error('ChangeNOW has no floating quote for that pair right now');
      return {
        from: from.v1,
        to: to.v1,
        fromAmount: amount,
        toAmount: estimated,
        flow: 'standard',
        networkFee: j.networkFee,
        transactionSpeedForecast: j.transactionSpeedForecast,
        warningMessage: j.warningMessage || ''
      };
    });
  }

  function changenowCreate(opts) {
    opts = opts || {};
    var key = changenowApiKey(opts.apiKey);
    var from = cnTicker(opts.from || 'usdc');
    var to = cnTicker(opts.to || 'kas');
    var amount = Number(opts.amount);
    var address = String(opts.address || opts.dest || '').trim();
    if (!(amount > 0)) throw new Error('Enter an amount to send');
    if (!parseAddress(address) && to.currency === 'kas') throw new Error('Payout must be a kaspa:q receive address');
    if (!key) {
      return Promise.resolve({
        mode: 'widget',
        widgetUrl: changenowWidgetUrl({ from: from.v1, to: to.v1, amount: amount, address: address, linkId: opts.linkId }),
        address: address,
        from: from.v1,
        to: to.v1,
        fromAmount: amount,
        fact: 'No ChangeNOW API key. User completes the swap in the widget. KAS pays out to address. Set CHANGENOW_API_KEY or localStorage kcc20_changenow_key for payinAddress API mode.'
      });
    }
    var body = {
      from: from.v1,
      to: to.v1,
      address: address,
      amount: String(amount),
      extraId: opts.extraId || '',
      refundAddress: opts.refundAddress || '',
      refundExtraId: opts.refundExtraId || '',
      contactEmail: opts.contactEmail || ''
    };
    return fetch(CN_BASE + '/v1/transactions/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || (j && j.error)) throw new Error((j && (j.message || j.error)) || ('ChangeNOW HTTP ' + r.status));
        return {
          mode: 'api',
          id: j.id,
          payinAddress: j.payinAddress,
          payinExtraId: j.payinExtraId || '',
          payoutAddress: j.payoutAddress || address,
          from: j.fromCurrency || from.v1,
          to: j.toCurrency || to.v1,
          fromAmount: j.fromAmount || amount,
          toAmount: j.toAmount,
          validUntil: j.validUntil,
          widgetUrl: changenowWidgetUrl({ from: from.v1, to: to.v1, amount: amount, address: address }),
          statusUrl: 'https://changenow.io/exchange/txs/' + j.id,
          fact: 'Floating (standard) rate. User sends FROM amount to payinAddress. ChangeNOW pays KAS to payoutAddress (the intent dest).'
        };
      });
    });
  }

  function changenowStatus(id, apiKey) {
    var key = changenowApiKey(apiKey);
    if (!id) return Promise.reject(new Error('Need ChangeNOW tx id'));
    var url = CN_BASE + '/v1/transactions/' + encodeURIComponent(id) + '/' + encodeURIComponent(key || ' ');
    return fetchJson(url);
  }

  function changenowIntent(opts) {
    opts = opts || {};
    var dest = String(opts.address || opts.dest || '').trim();
    var amount = Number(opts.amount);
    var from = opts.from || 'usdc';
    if (!parseAddress(dest)) {
      return Promise.resolve({
        kind: 'ask',
        ask: 'Paste the kaspa:q that should receive KAS (Connect SCORPION, then we fill it).',
        widgetUrl: changenowWidgetUrl({ from: from, to: 'kas', amount: amount || 20 })
      });
    }
    return changenowEstimate({ from: from, to: 'kas', amount: amount || 20 }).then(function (est) {
      return changenowCreate({
        from: from,
        to: 'kas',
        amount: est.fromAmount,
        address: dest,
        apiKey: opts.apiKey,
        refundAddress: opts.refundAddress
      }).then(function (tx) {
        return {
          kind: 'swap',
          summary: 'Send ' + est.fromAmount + ' ' + est.from + ' to ChangeNOW. They pay ~' + est.toAmount + ' KAS to ' + dest + ' (floating rate).',
          estimate: est,
          tx: tx,
          dest: dest,
          argentChat: 'changenow: send ' + est.fromAmount + ' ' + est.from + ' to ' + (tx.payinAddress || 'the widget') + ' — payout ' + dest
        };
      });
    });
  }

  function oneShot(id) {
    var all = oneShots();
    return all[id] || all.director;
  }

  function oneShots() {
    var load = 'Load ONLY on a Connect click path:\n  <script src="' + SDK + '"></script>\n  <script src="https://kcc20-sdk.vercel.app/argent.js"></script>\nRequire window.kcc20.sdkVersion >= "168". Wallet BUILD 178+. Origin https://kcc-20-wallet.vercel.app';
    var money = [
      'Keys NEVER leave the PWA. Never ask seed, PIN, or 64-hex. Never invent a kaspa: address.',
      'SCORPION = window.kcc20. Connect only from a user click. After Approve the popup closes on purpose.',
      'Local parse (no LLM): const directed = window.kcc20Argent.direct(userText);',
      'System prompt for an extra LLM: const sys = window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt());',
      'llmDirectorPrompt() may be a string OR an array. ALWAYS wrap with promptText(). NEVER do llmDirectorPrompt().join unless you checked typeof join === "function".',
      'If directed.complete and directed.plan.method === "sendKas": await kcc.sendKas(directed.plan.payload)',
      'Else vaults: await kcc.compileVault({ type: directed.intent.type, params: directed.intent.params })',
      'send = plain KAS to kaspa:q. Time Capsule returns to OWNER. Dead-man/heir = sentinel with beneficiary. sendToken is a bag transfer, not a buy. buyKron({ tick, amount }) amount is KAS.',
      'Handle User rejected. No retry loop. Show txId. Docs: https://kcc20-sdk.vercel.app/argent.html#prompts'
    ].join('\n');
    return {
      director: [
        'Build Argent Director — a mobile chat that turns English into KCC20 vaults / sends. One-shot. Do not invent a compiler.',
        '',
        load,
        '',
        'UI: dark, Connect SCORPION button, chat log, input “Type your intent (e.g. Lock 10 KAS for 30 days)…”. First bubble: Hello — I compile Kaspa vaults or send KAS. Example: I want to send 10 KAS to my grandson.',
        'On each message: directed = kcc20Argent.direct(text). Show directed.ask or directed.summary + hints. If complete, gold button Review in wallet.',
        'On that click: connect() if needed, then sendKas or compileVault. Print txId. If compileVault/sendKas missing, tell them to hard-refresh KCC20 to BUILD 177.',
        '',
        'OPTIONAL LLM (do not require an API key to ship):',
        '  const sys = window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt());',
        '  If your LLM SDK wants an array of lines, use window.kcc20Argent.llmDirectorLines() then .join("\\n"), or still promptText().',
        '  If the LLM throws, fall back to local direct() — that is enough.',
        '',
        money,
        '',
        'Done when: “send 1 kas to my friends wallet” asks for the kaspa:q (do not crash). “lock 10 kas for 7 days” offers compileVault. Grandson line asks amount + address + now vs dead-man. No .join error.'
      ].join('\n'),
      scorpion: [
        'Build a SCORPION agent app with KCC20 rules. Powerful AI agent. One-shot.',
        '',
        load,
        '',
        'This agent has THREE money tools, nothing else:',
        '1) Trade KCC20 — await kcc.buyKron({ tick, amount }) amount = KAS. Live ticks: https://kcc20-sdk.vercel.app/tokens.json Skip “?” ticks. sendToken is NOT a buy.',
        '2) Vault / rules — kcc20Argent.direct(text) then kcc.compileVault or kcc.sendKas. Argent compiles P2SH. You do not signPskt for vaults.',
        '3) Bag send — kcc.sendToken({ tick, amount, dest }) only if they already hold the tick. dest full kaspa:q.',
        '',
        'Chat: user talks. You parse. You ask missing fields. You never hold keys. User taps Approve in SCORPION.',
        'Scorpion in the wallet is the A-Trade agent (range/dip/trend). Your dApp does not copy that loop unless asked — default is buyKron + Argent.',
        '',
        'LLM system prompt MUST be:',
        '  window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt())',
        'Then append: you may also buyKron. Do not call .join on a string.',
        '',
        money,
        '',
        'Done when: Connect works, Buy 10 KAS of KKDAG, and “lock 10 kas for 7 days” compiles a vault, and “send kas to grandson” asks dest instead of crashing.'
      ].join('\n'),
      llm: llmDirectorText(),
      vibe: [
        'Build TTT Vibe Economics: vibe-code an app that is an economic actor on Kaspa. From the Agent Internet diagram (tttz.xyz).',
        '',
        'You → any LLM → INTENT → TTT Agent (action) + ARGENT (compile rules) → KCC-20 baked rules → Kaspa L1 → Wallet A AI ↔ Wallet B AI.',
        '',
        load,
        '',
        'LLM directs. Argent compiles. Kaspa enforces. Each app gets a KCC20 wallet (SCORPION connect). Rules are compileVault intents, not a server signer.',
        'Use kcc20Argent.direct locally so the app works even if the LLM is down.',
        'System prompt: window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt())',
        '',
        money,
        '',
        'Vibe code it. Give it a wallet. Give it rules. Connect it to AI. Let it interact. No human in every payment.',
        'Done when: two intents work — sendKas to a pasted kaspa:q, and compileVault timelock — both signed in SCORPION with a txId.'
      ].join('\n'),
      nilla: [
        'You are Nilla Gorilla. Build a WORKING app: anyone types intent → KCC20 SDK (SCORPION) routes it → Argent compiles vaults → user Approves in the PWA → broadcast. One-shot. Do not invent a wallet. Do not invent a compiler.',
        '',
        'THIS IS THE WORKING REALITY (fact-checked):',
        'User English',
        '  → local kcc20Argent.direct(text)  (no LLM required; optional LLM uses promptText(llmDirectorPrompt()))',
        '  → route by intent:',
        '       buy / KRON / KKDAG / token     → await kcc.buyKron({ tick, amount })   // amount = KAS. Wallet builds TRADE. NOT sendToken. NOT signPskt.',
        '       send KAS / grandson / friend   → await kcc.sendKas({ dest, amount })  // dest = full kaspa:q. Argent does not compile a vault.',
        '       lock / vault / rent / sentinel → await kcc.compileVault({ type, params }) // Argent in the PWA compiles kaspa:p. You do not assemble redeem scripts.',
        '       send a held bag                → await kcc.sendToken({ tick, amount, dest })',
        '       YOU built unsigned Safe JSON   → signPskt P2PK-only global indexes → pushTx',
        '  → SCORPION popup: user Approves / PIN or KasWare',
        '  → { txId }  pushTx returns { txId, node } — read .txId not the whole object',
        '',
        load,
        '',
        'UI (dark, mobile): Connect SCORPION (click only). Chat: “Type intent…”. Examples in the empty state:',
        '  “buy 10 kas of KKDAG”',
        '  “send 1 kas to kaspa:q…”',
        '  “I want to send Kaspa to my grandson”',
        '  “lock 10 kas for 7 days”',
        '  “dead-man 50 kas for 30 days heir kaspa:q…”',
        'On each message: directed = window.kcc20Argent.direct(text).',
        'If a buy: tick from tokens.json / KRON tokenlist, amount KAS, button BUY → buyKron on that click.',
        'If directed.complete and plan.method === "sendKas": Review send → sendKas.',
        'If directed.complete and vault: Review vault → compileVault. Time Capsule RETURNS TO OWNER. Grandson now = send. Heir = sentinel.',
        'If !complete: show directed.ask. Never invent a kaspa: address. Never crash on llmDirectorPrompt().join — use promptText().',
        '',
        'OPTIONAL extra LLM (app must work with LLM down):',
        '  const sys = window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt());',
        '',
        'signPskt path (only if YOU built the unsigned Safe JSON — Nilla builder, not buyKron/compileVault):',
        '  await kcc.signPskt({ txJsonString, options: { signInputs: G.map(i => ({ index: i, sighashType: 1 })) } })',
        '  index is GLOBAL tx.inputs[i]. P2PK funding only. Never curve / pool / inventory / P2SH (false stack).',
        '  Funding input MUST include utxo { amount, scriptPublicKey, address }.',
        '  Return is a STRING. const r = await kcc.pushTx(signed); const txId = r && r.txId || r;',
        '  Do not re-serialize. Do not rebroadcast a false-stack blob. User rejected → stop.',
        '',
        money,
        '',
        'Do not overwrite a real window.kasware. Do not load sdk.js on page load. Connect is not payment.',
        'Docs: https://kcc20-sdk.vercel.app/nilla.html  https://kcc20-sdk.vercel.app/argent.html#prompts',
        'Wallet: https://kcc-20-wallet.vercel.app  BUILD 177+',
        '',
        'Done when: Connect once, type “buy 10 kas of KKDAG” → txId, type “lock 10 kas for 7 days” → compileVault kaspa:p txId, type “send 1 kas to my friend” → asks kaspa:q then sendKas txId. No .join error. No false stack on buyKron (wallet builds).'
      ].join('\n'),
      onramp: [
        'Build a KAS debit-card on-ramp on Base44 / Replit. One-shot. Argent + SCORPION. YOU integrate POS (Stripe Checkout, Square, MoonPay widget). This SDK does NOT charge cards and does NOT hold keys.',
        '',
        load,
        '',
        'HONEST SPLIT:',
        '1) Price oracle (us): 5-minute KAS/USD quote.',
        '     const q = await window.kcc20Argent.quoteOnramp({ usd: 20, dest: buyerKaspaQ });',
        '     q.kasAmount  q.usdPerKas  q.expiresAt  q.quoteId',
        '     if (!window.kcc20Argent.quoteValid(q)) fetch again.',
        '2) POS (you): Stripe/Base44 payment for q.usd. Never send PAN/CVV to KCC20. Never ask for seed.',
        '3) After paid=true AND quoteValid(q): DETECT payment (Stripe webhook / Base44 paid). Receipt tab: “Paid. Waiting for Kaspa…” spinner.',
        '     Push that event to Argent with the REAL dest (do not invent):',
        '       const paid = window.kcc20Argent.onrampPaidIntent(q);',
        '       // paid.argentChat → “on-ramp paid … send X kas to kaspa:q…”',
        '       await kcc.sendKas(paid.wallet);  // treasury SIGNING chip Approves once',
        '     That send is P2PK to the buyer. After confirm, ONLY that address can spend. No extra covenant required for spend-lock.',
        '     COVENANT++ (optional, lock inventory BEFORE card):',
        '       await kcc.compileVault(window.kcc20Argent.onrampCompile(q));',
        '       hashlock 5 min, receiver = buyer. Unpaid → treasury refund after window. Paid → buyer claims (they sign the claim).',
        '     There is no server auto-signer. Watch-only treasury cannot send. Keys stay in SCORPION. Seller Approves the faucet (or pre-locks hashlock).',
        '     Flow: window.kcc20Argent.onrampFlow()',
        '',
        'WHO GETS WHAT — two different rails, never mixed:',
        '- $1 from the card goes to YOUR Stripe/Square BANK (payouts). It never appears in KCC20. Argent cannot withdraw USD. If you did not connect a real POS with a bank, there is NO $1 — do not fake a Pay button.',
        '- KAS leaves the SELLER treasury kaspa:q and lands on the BUYER kaspa:q. That is the only on-chain move.',
        '',
        'TREASURY CANNOT BE READ-ONLY / WATCH-ONLY.',
        'compileVault and sendKas need a signing chip: native 64-hex + PIN, or KasWare that can sign that address.',
        'Setup (once, seller): Create wallet in KCC20 (not watch-only) → fund it with the KAS you will sell → Connect THAT chip as treasury.',
        'Then either (a) sendKas on each paid webhook, or (b) compileVault hashlock FROM that same signing treasury (rules attach when it SIGNS the fund tx). A read-only address cannot write a covenant. Viewing a kaspa:p later is fine; funding it is not.',
        'If getPublicKey / sign throws “no native signing key”, stop. Import the hex or turn KasWare on. Do not use the ews treasury chip unless you own it.',
        '',
        'UI: USD input, live KAS amount, 5:00 countdown, dest kaspa:q, Pay with card (your POS), then Show txId.',
        'Connect SCORPION on a click. Two chips: Buyer (receive, can be watch) and Treasury/seller (MUST sign + hold KAS).',
        '',
        money,
        '',
        'Dead-man is sentinel, not this. Time Capsule is not an on-ramp (returns to owner).',
        'Docs: https://kcc20-sdk.vercel.app/argent.html#shot-onramp',
        'Done when: quote 20 USD → ~KAS for 5 min, fake/test POS success, treasury sendKas to buyer txId, expired quote refuses send.'
      ].join('\n'),
      base44Onramp: [
        'BEST WAY — KAS shop on Base44 with Argent ONRAMP escrow (Card sale vault in KCC20 BUILD 179+).',
        'compileVault({ type: "onramp" }) — seller locks quoted KAS; only buyer kaspa:q can claim after they pay; unpaid refunds in 5 min.',
        'Do not invent auto-sign or a script that sees Stripe.',
        '',
        'Load only on Connect click:',
        '  <script src="https://kcc-20-wallet.vercel.app/sdk.js?v=168"></script>',
        '  <script src="https://kcc20-sdk.vercel.app/argent.js"></script>',
        'window.kcc20.sdkVersion >= "168". Wallet BUILD 179+ (Vault tile Card sale). Origin https://kcc-20-wallet.vercel.app',
        '',
        'SELLABLE FLOW (Argent type onramp — this IS the escrow):',
        '1) Quote 5 min: q = await kcc20Argent.quoteOnramp({ usd, dest: buyerQ })',
        '2) Seller SIGNING treasury: await kcc.compileVault(kcc20Argent.onrampCompile(q))',
        '     type onramp, 5 min, receiver = buyer. Returns kaspa:p + secretHex (keep in YOUR app, never print to buyer until paid).',
        '3) Buyer pays Stripe. $1 → Stripe bank. Receipt: “Paid. Claim your KAS…”',
        '4) After paid: give buyer the secret. They Claim in SCORPION (PIN). KAS lands on their kaspa:q — then only they spend.',
        '5) If they never pay/claim: seller Sweep after 5 min, KAS refunds to treasury.',
        'Stripe cannot be seen on-chain. You reveal the secret only after paid=true. That is the escrow rule.',
        '',
        'LAW:',
        '- compileVault type "onramp" (aliases: card sale). Not timelock. Not sendKas as the shop default.',
        '- Seller PIN to LOCK. Buyer PIN to CLAIM. No auto-sign. Watch-only cannot lock.',
        '- Secret stays on seller/app until paid. Then buyer claims. Do not put secret in the receipt before paid.',
        '- No Stripe = no $1. Do not fake Pay.',
        '',
        'BUYER UI: USD, kaspa:q, countdown, Pay card, then Claim KAS (secret after paid) + spinner until claim txId.',
        'SELLER UI: Connect signing treasury, Lock this quote (compileVault onrampCompile), list locks, Sweep unpaid.',
        'Never ask seed/PIN/hex. Never overwrite window.kasware. never llmDirectorPrompt().join without promptText.',
        'Docs: https://kcc20-sdk.vercel.app/argent.html#shot-base44',
        'Done when: seller locks Card sale vault for buyer q; after Stripe paid, buyer claims; unpaid 5 min Sweep refunds seller.'
      ].join('\n'),
      changenow: [
        'Build USDC→KAS (and USDT→KAS) via ChangeNOW floating (standard) rate inside a SCORPION / Argent app. One-shot.',
        '',
        load,
        '',
        'THIS IS NOT a card on-ramp and NOT compileVault. ChangeNOW is a swap: user sends USDC to a payin address; ChangeNOW sends KAS to their kaspa:q.',
        '',
        'Intent: dest = user kaspa:q (from kcc.connect()[0]). from = usdcerc20 (default) or usdterc20. amount = USDC they will send.',
        '  const swap = await window.kcc20Argent.changenowIntent({ from: "usdc", amount: 20, dest: accounts[0] });',
        'If swap.tx.mode === "widget": iframe or open swap.tx.widgetUrl (toAddress already set).',
        'If swap.tx.mode === "api": show swap.tx.payinAddress + fromAmount. User sends that USDC themselves. Poll changenowStatus(id).',
        'Optional partner key: window.CHANGENOW_API_KEY or localStorage kcc20_changenow_key (the dApp’s ChangeNOW partner key, never a wallet key).',
        'Estimate only: await kcc20Argent.changenowEstimate({ from:"usdc", to:"kas", amount:20 })',
        'Min: await kcc20Argent.changenowMin({ from:"usdc", to:"kas" })',
        '',
        'UI: From USDC, amount, live ~KAS, Receive kaspa:q, button Get pay-in / Open ChangeNOW, then status. Floating rate — amount out can move until they send.',
        'Do not compileVault. Do not sendKas for this. User does not give you USDC keys.',
        'Docs: https://changenow.io/en/api  Widget: changenowWidgetUrl()',
        'Done when: Connect SCORPION, estimate 20 USDC → KAS, show where to send USDC or embed widget, payout address is the connected kaspa:q.'
      ].join('\n')
    };
  }

  function grandsonExample() {
    return {
      user: 'I want to send Kaspa to my grandson.',
      local: 'Argent parseIntent maps send+no-address → type send, missing amount + destination. It does NOT pick sentinel unless the user says dead-man / heir / when I die.',
      directorAsks: [
        'How much KAS?',
        'Paste his kaspa:q address (not kaspa:p).',
        'Pay him now (send), or only if you miss check-ins (sentinel dead-man), or lock it for yourself until a date (Time Capsule — still yours)?'
      ],
      now: {
        type: 'send',
        params: { amountKas: 10, destination: 'kaspa:q…grandson' },
        wallet: 'kcc.sendKas({ dest, amount: "10" })'
      },
      heir: {
        type: 'sentinel',
        params: { amountKas: 50, lockMinutes: 43200, durationLabel: '30 days', beneficiary: 'kaspa:q…grandson' },
        wallet: 'kcc.compileVault({ type: "sentinel", params })',
        fact: 'Timeout pays grandson. Check-in resets. Time Capsule would not pay him.'
      },
      laterYouSend: {
        type: 'timelock',
        params: { amountKas: 10, lockMinutes: 1440, durationLabel: '1 day' },
        fact: 'Unlocks back to YOU. Then you sendKas to grandson. Do not claim the capsule pays him.'
      }
    };
  }

  return {
    version: VERSION,
    wallet: WALLET,
    repo: REPO,
    sdk: SDK,
    PRODUCTS: PRODUCTS,
    LIFE_KINDS: LIFE_KINDS,
    normalizeVaultType: normalizeVaultType,
    parseRentKind: parseRentKind,
    parseLifeKind: parseLifeKind,
    parseUnlockAnytime: parseUnlockAnytime,
    parseDueAt: parseDueAt,
    parseAmount: parseAmount,
    parseTicker: parseTicker,
    parseTokenAmount: parseTokenAmount,
    parseDuration: parseDuration,
    parseAddress: parseAddress,
    normalizeChat: normalizeChat,
    parseIntent: parseIntent,
    describeIntent: describeIntent,
    askFor: askFor,
    interpretVaultChat: interpretVaultChat,
    directorHints: directorHints,
    compilePlan: compilePlan,
    validateIntent: validateIntent,
    walletDeepLink: walletDeepLink,
    toCompileVaultParams: toCompileVaultParams,
    direct: direct,
    intentSchema: intentSchema,
    promptText: promptText,
    llmDirectorLines: llmDirectorLines,
    llmDirectorText: llmDirectorText,
    llmDirectorPrompt: llmDirectorPrompt,
    oneShot: oneShot,
    oneShots: oneShots,
    quoteKasUsd: quoteKasUsd,
    quoteFromPrice: quoteFromPrice,
    quoteOnramp: quoteOnramp,
    quoteValid: quoteValid,
    onrampCompile: onrampCompile,
    onrampFaucet: onrampFaucet,
    onrampPaidMessage: onrampPaidMessage,
    onrampPaidIntent: onrampPaidIntent,
    onrampFlow: onrampFlow,
    changenowTicker: cnTicker,
    changenowWidgetUrl: changenowWidgetUrl,
    changenowMin: changenowMin,
    changenowEstimate: changenowEstimate,
    changenowCreate: changenowCreate,
    changenowStatus: changenowStatus,
    changenowIntent: changenowIntent,
    oneShotChangenow: function () { return oneShot('changenow'); },
    onrampFacts: function () {
      return {
        usdGoesTo: 'Your Stripe/Square bank account. Never Kaspa. Never Argent.',
        kasGoesTo: 'Buyer kaspa:q only AFTER sendKas confirms, or AFTER they claim a hashlock. A lock (kaspa:p) is not yet theirs.',
        treasury: 'Must sign (native PIN or KasWare). Watch-only cannot compileVault or sendKas.',
        noPos: 'If you did not connect a real POS, there is no $1 to withdraw.',
        scriptCannotSeeDollars: 'Argent cannot compile “if they paid $1 then send”. Stripe is off-chain. App detects paid, then seller PIN-sends (or buyer claims hashlock).',
        faucetMeans: 'One paid order → one quote → one dest → one seller signature. Not a vault that pays any future buyer by itself.'
      };
    },
    grandsonExample: grandsonExample
  };
});

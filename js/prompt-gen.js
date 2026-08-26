(function (root) {
  var SDK = 'https://kcc-20-wallet.vercel.app/sdk.js?v=167';
  var WALLET = 'https://kcc-20-wallet.vercel.app';
  var DOCS = 'https://github.com/mrzeku2000XTTT/kcc20-sdk';

  var KINDS = [
    { id: 'buy', label: 'Buy KRON tokens', re: /buy|purchase|checkout|shop|swap|kron|kkdag|ifwen|token market/i },
    { id: 'vault', label: 'Covenant++ vault', re: /vault|capsule|timelock|freeze|escrow|covenant|lock kas|rent|heir|multisig|hashlock/i },
    { id: 'pay', label: 'Pay / tip / fund', re: /pay|tip|fund|send token|invoice|checkout kaspa|donate/i },
    { id: 'gate', label: 'Token-gated app', re: /gated|membership|holder|discord|access pass|paywall/i },
    { id: 'sign', label: 'You build PSKT (Nilla-style)', re: /pskt|signpskt|nilla|unsigned|copilot|builder/i },
    { id: 'dapp', label: 'General KCC20 dApp', re: /.*/ }
  ];

  function detect(text) {
    var t = String(text || '');
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].id !== 'dapp' && KINDS[i].re.test(t)) return KINDS[i];
    }
    return KINDS[KINDS.length - 1];
  }

  function baseRules() {
    return [
      'You are a vibe-coding agent building a REAL dApp on Kaspa.',
      'Use KCC20 Wallet (SCORPION). Not a Chrome extension. Keys NEVER leave the wallet. NEVER ask for seed, PIN, or 64-hex.',
      'Load once, on a user click path (Connect button), not on every page load:',
      '  <script src="' + SDK + '"></script>',
      '  const kcc = window.kcc20;  // require kcc.sdkVersion >= "167"',
      'Connect ONLY on a button tap: const accounts = await kcc.connect();',
      'After Connect the popup CLOSES on purpose. Then silent reads work:',
      '  getAccounts, getNetwork, getPublicKey, getUtxoEntries, getBalance, getHoldings, getTokenBalance',
      'If you see "Connect KCC20 Wallet first" after a successful Connect, the SDK is stale. Reload sdk.js?v=167.',
      'User must already have created/imported a wallet at ' + WALLET + ' and unlocked with PIN.',
      'Allow popups. No dApp PIN pad. Do not overwrite window.kasware if a real extension exists.',
      'Do not credit the user without a real txId. Connect is not payment.',
      'Docs: ' + DOCS + '  Nilla: nilla.html  Tap2Tip: taptotip.html'
    ].join('\n');
  }

  function tmplBuy(intent) {
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD: a mobile-friendly platform to BUY any KRON / KCC20 token with KAS.\n' +
      'The wallet builds the swap (same as Home → TRADE). You do NOT assemble curve/pool PSKTs.\n\n' +
      'UI:\n- Connect KCC20 button\n- Tick input (default KKDAG; user can type KRON, IFWEN, any KRON tick)\n- KAS amount (default 10)\n- Optional preview: try await kcc.quoteKron({ tick, side:"buy", amount }). If it throws, skip — Buy sheet still quotes.\n- Live bag: await kcc.getTokenBalance(tick)\n- Button BUY → only on that tap:\n' +
      '    const bought = await kcc.buyKron({ tick: tick.toUpperCase(), amount: String(kas) });\n' +
      '    // bought.txId, bought.quote.tokenHuman, bought.explorer\n' +
      '- Show txId + explorer. Handle User rejected.\n\n' +
      'Do NOT use sendToken for buying. sendToken transfers a bag they already hold.\n' +
      'Do NOT call signPskt for this buy (that is Nilla’s builder path).\n' +
      'Mainnet only. If wallet is TN10, show the error from buyKron.\n' +
      'Sell later: kcc.sellKron({ tick, amount }) where amount is tokens.\n' +
      'Done when: Connect once, Buy 10 KAS of KKDAG, Sign in KCC20, bag increases, no popups on route change.';
  }

  function tmplVault(intent) {
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD: a Covenant++ vault app. User describes RULES in your UI. You do NOT hold keys. You do NOT run a signer server.\n\n' +
      'Vault types this wallet already has (map intent → type):\n' +
      '- timelock / Time Capsule — lock KAS until a time, then sweep\n' +
      '- kcc20freeze — freeze KCC20 tokens until a time\n' +
      '- escrow — seller can refund; buyer claims if that kaspa:q is in KCC20\n' +
      '- multisig — two keys on the user’s phone must agree\n' +
      '- life / rent / save — lock until a date, optional unlock-anytime\n' +
      '- hashlock — pay now, preimage later\n' +
      '- sentinel / recurring — check-in or drip (advanced)\n\n' +
      'TODAY (Checkout-style — wallet builds, like buyKron):\n' +
      'There is no lockVault RPC yet. Two honest paths:\n' +
      '1) Deep-link the user to ' + WALLET + ' Vault tab with a prefilled message (amount + hours + type) and tell them to PIN-lock there. Your app stores the returned kaspa:p / txId they paste, or you poll getHoldings.\n' +
      '2) Builder path: YOU build unsigned Safe JSON for the covenant using rusty-kaspa + the published script templates, then:\n' +
      '    await kcc.signPskt({\n' +
      '      txJsonString,\n' +
      '      options: { signInputs: [{ index: FUNDING_P2PK_GLOBAL_INDEX, sighashType: 1 }] }\n' +
      '    });\n' +
      '    index is GLOBAL tx.inputs[] — never list P2SH/covenant/curve inputs (false stack on node).\n' +
      '    const r = await kcc.pushTx(signed); const txId = r.txId || r;\n\n' +
      'Your app UI: intent form (type, amount KAS or tick, hours, heir/buyer address). Generate a plain-language policy the user reads. Then Sign. Store only: userId, address, type, unlockAt, txId. NEVER keys.\n' +
      'If the company server dies, the vault is still on Kaspa; user opens KCC20 and sweeps.\n' +
      'Done when: user Connects, describes a rule (e.g. lock 50 KAS 7 days), Signs in SCORPION, you show txId + unlock time.';
  }

  function tmplPay(intent) {
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD: pay / tip / fund with a KCC20 tick the user already holds.\n' +
      'await kcc.sendToken({ tick: "KKDAG", amount: "10", dest: "kaspa:q…" }); // FULL address\n' +
      'Need dest kaspa:q not kaspa:p. Mainnet. User must buy the tick first (buyKron or Home TRADE).\n' +
      'Credit off-chain only after paid.txId. Unique on txId.';
  }

  function tmplGate(intent) {
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD: token-gated experience.\n' +
      'After connect: const bag = await kcc.getTokenBalance("KKDAG");\n' +
      'If Number(bag.balance) >= threshold, unlock. Else CTA: buyKron({ tick:"KKDAG", amount:"10" }).\n' +
      'Poll getTokenBalance while the gated view is open. Never store keys. Connect is not a membership until they hold the tick.';
  }

  function tmplSign(intent) {
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD: you construct unsigned rusty-kaspa Safe JSON (KRON/Cook/covenant). Wallet only signs P2PK.\n' +
      'See Nilla tab. signInputs.index = GLOBAL input index. Typical KRON buy: last input is user P2PK, not 0.\n' +
      'Funding input MUST include utxo { amount, scriptPublicKey, address }.\n' +
      'pushTx returns { txId, node } — read result.txId, not the whole object as a hex string.';
  }

  function tmplDapp(intent) {
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD a mobile-first dApp that uses window.kcc20 for all money.\n' +
      'Pick the smallest API:\n- Buy KRON: buyKron({ tick, amount })\n- Send bag: sendToken({ tick, amount, dest })\n- Custom tx: you build + signPskt P2PK only\n' +
      'Ship Connect + one money button first. Dark, native-friendly. No fake balances.';
  }

  var FNS = { buy: tmplBuy, vault: tmplVault, pay: tmplPay, gate: tmplGate, sign: tmplSign, dapp: tmplDapp };

  function generate(text) {
    var kind = detect(text);
    var body = (FNS[kind.id] || tmplDapp)(String(text || '').trim() || kind.label);
    return { kind: kind, prompt: body };
  }

  root.kcc20PromptGen = { detect: detect, generate: generate, kinds: KINDS };
})(window);

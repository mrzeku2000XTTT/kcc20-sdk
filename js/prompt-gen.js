(function (root) {
  var SDK = 'https://kcc-20-wallet.vercel.app/sdk.js?v=168';
  var WALLET = 'https://kcc-20-wallet.vercel.app';
  var DOCS = 'https://github.com/mrzeku2000XTTT/kcc20-sdk';

  var KINDS = [
    { id: 'buy', label: 'Buy KRON tokens', re: /buy|purchase|checkout|shop|swap|kron|kkdag|ifwen|token market|utility|my token|launched/i },
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
      '  const kcc = window.kcc20;  // require kcc.sdkVersion >= "168"',
      'Connect ONLY on a button tap: const accounts = await kcc.connect();',
      'After Connect the popup CLOSES on purpose. Then silent reads work:',
      '  getAccounts, getNetwork, getPublicKey, getUtxoEntries, getBalance, getHoldings, getTokenBalance',
      'If you see "Connect KCC20 Wallet first" after a successful Connect, the SDK is stale. Reload sdk.js?v=168.',
      'User must already have created/imported a wallet at ' + WALLET + ' and unlocked with PIN.',
      'Allow popups. No dApp PIN pad. Do not overwrite window.kasware if a real extension exists.',
      'Do not credit the user without a real txId. Connect is not payment.',
      'Docs: ' + DOCS,
      'Tokens (live KRON list + per-tick prompts): https://kcc20-sdk.vercel.app/tokens.html',
      'AI sources: https://kcc20-sdk.vercel.app/llms.txt  and  https://kcc20-sdk.vercel.app/tokens.json',
      'Canonical tokenlist: https://api.kron.technology/api/registry/tokenlist?all=1  Indexer: https://idx.kron.technology/v1/kcc20',
      'Nilla: nilla.html  Argent vault compiler: argent.html  Tap2Tip: taptotip.html'
    ].join('\n');
  }

  function tmplBuy(intent) {
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD: a mobile-friendly platform to BUY any KRON / KCC20 token with KAS.\n' +
      'The wallet builds the swap (same as Home → TRADE). You do NOT assemble curve/pool PSKTs.\n\n' +
      'Load ticks from https://kcc20-sdk.vercel.app/tokens.json (or live KRON tokenlist). Skip empty / "?" ticks. Use symbol as tick.\n' +
      'UI:\n- Connect KCC20 button\n- Tick picker (default KKDAG; include KRON, IFWEN, and every launched tick)\n- KAS amount (default 10)\n- Optional preview: try await kcc.quoteKron({ tick, side:"buy", amount }). If it throws, skip — Buy sheet still quotes.\n- Live bag: await kcc.getTokenBalance(tick)\n- Button BUY → only on that tap:\n' +
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
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD: your own Argent vault director. An LLM (Nilla-style) turns English into an ArgentIntent. Argent in the KCC20 PWA COMPILES the P2SH. You do NOT hold keys. You do NOT compile opcodes on a server.\n\n' +
      'Load BOTH scripts (Connect still only on a user click):\n' +
      '  <script src="' + SDK + '"></script>\n' +
      '  <script src="https://kcc20-sdk.vercel.app/argent.js"></script>\n' +
      'FACT-CHECK (https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants wallet/):\n' +
      '- Argent = local parseIntent + local buildCovenant. Optional /kccApi chat merge. Not a hosted XMSS compiler.\n' +
      '- “Send Kaspa to my grandson” = type send (plain transfer). Need amount + his kaspa:q. Argent does not compile a vault.\n' +
      '- Time Capsule / life RETURNS TO THE OWNER. It does not pay the grandson. Say this honestly.\n' +
      '- Heir / dead-man / when I die = type sentinel, params.beneficiary = his kaspa:q. Timeout pays him. In-app sentinel is Schnorr+CLTV hops shaped like covenants/sentinel. Full XMSS is type xmss + public kit from keygen/xmss_keygen.py.\n' +
      'Parse locally (no Connect): const directed = window.kcc20Argent.direct(userText);\n' +
      'If !directed.complete, show directed.ask. Never invent a kaspa: address.\n' +
      'On a user click: await kcc.connect();\n' +
      '  if (directed.plan.method === "sendKas") await kcc.sendKas(directed.plan.payload);\n' +
      '  else await kcc.compileVault({ type: directed.intent.type, params: directed.intent.params });\n' +
      'compileVault returns { address: "kaspa:p…", txId, type }. sendKas returns { txId, dest, amountKas }.\n' +
      'Optional LLM layer: const sys = window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt());\n' +
      'Never call .join on llmDirectorPrompt() unless you checked it is an array. promptText() always returns a string.\n' +
      'One-shot prompts: https://kcc20-sdk.vercel.app/argent.html#prompts  window.kcc20Argent.oneShot("director"|"scorpion"|"vibe")\n' +
      'Deep-link: ' + WALLET + '/?tab=vault&argent=' + encodeURIComponent('lock 10 kas for 7 days') + '\n' +
      'Docs: https://kcc20-sdk.vercel.app/argent.html  ARGENT.md\n' +
      'Store only: userId, kaspa:p, type, unlockAt, txId. NEVER keys.\n' +
      'Done when: user says “send kas to my grandson”, you ask dest+amount+now vs dead-man, then Connect + sendKas or compileVault, txId shows.';
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
    return baseRules() + '\n\nUSER INTENT:\n' + intent + '\n\nBUILD Nilla Gorilla as a WORKING app: anyone types intent, KCC20 SDK routes, Argent compiles vaults, SCORPION broadcasts.\n' +
      'Copy the canonical prompt from https://kcc20-sdk.vercel.app/nilla.html#prompt or window.kcc20Argent.oneShot("nilla").\n' +
      'Also load https://kcc20-sdk.vercel.app/argent.js\n' +
      'Route: buyKron (tick buy, amount=KAS) | sendKas | compileVault | sendToken (held bag) | signPskt only if YOU built unsigned Safe JSON.\n' +
      'signInputs.index = GLOBAL tx.inputs[]. P2PK only. Typical KRON builder path: last input is user P2PK, not 0.\n' +
      'Funding input MUST include utxo { amount, scriptPublicKey, address }.\n' +
      'pushTx returns { txId, node } — read result.txId.\n' +
      'const sys = window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt()); never .join a string.';
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

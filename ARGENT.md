# Argent vault compiler SDK

Anyone can run their own Argent (or sit an LLM in front of it) **without inventing a compiler**. This file is fact-checked against how Argent actually works in [kaspa-xmss-covenants](https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants) `wallet/`.

| Piece | What it really is |
|---|---|
| **Argent** | Vault agent in the KCC20 PWA. Local English parser (`wallet/js/intent.js`) + local P2SH builders (`wallet/js/tx.js`, `buildCovenant` in `app.js`). Optional remote `/kccApi` `{ action:'chat', agent:'argent' }` merge. |
| **This SDK** | `argent.js` — same parser + product catalog + LLM director prompt. **Does not hold keys. Does not compile opcodes.** |
| **Compiler** | The **wallet**. `window.kcc20.compileVault(intent)` opens the PWA, Argent builds a `kaspa:p` P2SH, user PIN/KasWare funds it. |
| **LLM layer** | Nilla-style director. User says “send Kaspa to my grandson.” The LLM fills an Argent intent. Argent compiles (or `sendKas` if it is a plain transfer). |

Live: [argent.html](https://kcc20-sdk.vercel.app/argent.html) · script `https://kcc20-sdk.vercel.app/argent.js` · wallet [kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app)

---

## Stack (do not reverse this)

```
User English
    → your LLM (copy kcc20Argent.llmDirectorPrompt())
    → ArgentIntent JSON   // or kcc20Argent.direct(text) locally, no LLM
    → window.kcc20.compileVault({ type, params })   // vaults
       or window.kcc20.sendKas({ dest, amount })    // plain send
    → KCC20 PWA Argent compiles P2SH / builds the send
    → user Approves + PIN (or KasWare)
    → { address: 'kaspa:p…', txId } or { txId } for send
```

Keys never leave `https://kcc-20-wallet.vercel.app`. If your server dies, the vault is still on Kaspa; the user opens Vault and sweeps.

---

## Fact-check: “send Kaspa to his grandson”

Argent’s **local** `detectType` maps `send` + a `kaspa:` address to type **`send`**, not a vault.

| User means | Honest type | What Argent compiles |
|---|---|---|
| Pay him **now** | `send` | Nothing. Wallet `sendKas`. Need amount + **his** `kaspa:q`. |
| If I miss check-ins / when I die | `sentinel` | Dead-man hop chain. `params.beneficiary` = grandson. Timeout pays him. Check-in keeps it yours. |
| Lock until a date, **then I** send | `timelock` / `life` | CLTV capsule. **Returns to the owner**, not the grandson. Do not tell the user it pays him. |
| He claims with a secret | `hashlock` | HTLC. `receiver` = grandson. |
| He can claim, I can refund | `escrow` | `buyerAddress` = grandson (that `kaspa:q` must be importable in this PWA to claim). |
| Post-quantum lock | `xmss` | Paste **public** kit from `keygen/xmss_keygen.py`. Never the private file. |

**Time Capsule does not pay a grandchild.** In-app sentinel is a **Schnorr + CLTV** hop chain with the same IF/ELSE + `OpTxOutputSpk` shape as `covenants/sentinel`. The Python/Node XMSS sentinel in the repo is the post-quantum CLI. Use `type: 'xmss'` + a public kit for the real XMSS vault (`covenants/xmsslock`).

---

## Install

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=168"></script>
<script src="https://kcc20-sdk.vercel.app/argent.js"></script>
```

```js
const argent = window.kcc20Argent;
const kcc = window.kcc20;

const directed = argent.direct('I want to send Kaspa to my grandson.');
// directed.complete === false
// directed.ask → destination + amount
// directed.hints → send now vs sentinel vs lock-for-yourself

const ready = argent.direct('send 10 kas to kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6');
await kcc.connect(); // user click
if (ready.plan.method === 'sendKas') {
  const sent = await kcc.sendKas(ready.plan.payload); // { txId, dest, amountKas }
} else {
  const vault = await kcc.compileVault(ready.plan.payload);
  // { address: 'kaspa:p…', txId, type, name }
}
```

Local parse needs **no** Connect. Compile/send opens the PWA.

---

## Intent JSON (same as `parseIntent`)

```json
{
  "type": "sentinel",
  "params": {
    "amountKas": 50,
    "lockMinutes": 43200,
    "durationLabel": "30 days",
    "beneficiary": "kaspa:q…"
  },
  "missing": [],
  "complete": true
}
```

Types: `send` · `timelock` · `life` · `escrow` · `multisig` · `kcc20lock` · `sentinel` · `recurring` · `hashlock` · `xmss`

`argent.intentSchema()` returns the JSON Schema. `argent.PRODUCTS` is the catalog (compiler function + repo path).

---

## Create your own Argent

1. Load `argent.js`. Use `parseIntent` / `direct` / `askFor` — same rules as the PWA orb.
2. Sit any LLM in front with:

```js
const sys = window.kcc20Argent.promptText(window.kcc20Argent.llmDirectorPrompt());
```

`llmDirectorPrompt()` may be a string **or** an array (vibe apps call `.join`). Always wrap with `promptText()`. Never `llmDirectorPrompt().join` on a string — that crash is `join is not a function`.

3. One-shot a whole platform from the **Prompts** tab: [argent.html#prompts](https://kcc20-sdk.vercel.app/argent.html#prompts)

```js
kcc20Argent.oneShot('director')  // chat UI + sendKas / compileVault
kcc20Argent.oneShot('scorpion')  // agent + buyKron + KCC20 rules
kcc20Argent.oneShot('vibe')      // TTT Agent Internet / vibe economics
```

4. On a **user click**, `kcc.compileVault` or `kcc.sendKas`. Do not compile scripts in your backend. Do not ask for keys.
5. To use the **repo** XMSS path yourself (offline): `python3 keygen/xmss_keygen.py` then `covenants/xmsslock/deploy_xmss_generic.mjs`. The PWA only funds the address and broadcasts a witness.

Deep-link (no RPC): `https://kcc-20-wallet.vercel.app/?tab=vault&argent=lock%2010%20kas%20for%207%20days`

---

## Repo map (compiler vs CLI)

| Argent type | Wallet function | GitHub folder |
|---|---|---|
| timelock / life | `buildTimelockCovenant` / `buildOwnerEnvelope` | analog of `covenants/time_capsule` |
| sentinel | `buildSentinelChain` (Schnorr analog) | shape of `covenants/sentinel` |
| recurring | `buildRecurringChain` | `x402-kaspa/sentinel-x402` |
| xmss | `p2shFromRedeemHex(public kit)` | `covenants/xmsslock` + `keygen/` |
| hashlock / escrow / multisig | same names in `wallet/js/tx.js` | in-app Schnorr; XMSS 2-of-2 is `covenants/multisig_2of2` |

Node deploy scripts use `@onekeyfe/kaspa-wasm` (Node only). The PWA uses rusty-kaspa `web/` WASM. Do not mix them in a browser dApp.

---

## Non-negotiable

- Never ask for seed, PIN, or 64-hex.
- Never tell the user a Time Capsule pays a third party.
- `send` ≠ vault. `sendToken` ≠ KRON buy. `compileVault` ≠ `signPskt` (you are not building the PSKT; Argent is).
- `signPskt` `signInputs.index` is still global `tx.inputs[]`, P2PK only, if you take the builder path yourself.
- `pushTx` returns `{ txId, node }`.

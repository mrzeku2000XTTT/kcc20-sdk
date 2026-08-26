# KCC20 Wallet SDK (SCORPION)

Plug-and-play **dApp connect** for [KCC20 Wallet](https://kcc-20-wallet.vercel.app). Same job as KasWare’s `window.kasware` — **no Chrome extension**.

| | |
|---|---|
| **Script** | `https://kcc-20-wallet.vercel.app/sdk.js?v=166` |
| **This repo** | client `sdk.js` + docs + demo (not the wallet app) |
| **Wallet app** | [kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app) · [KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet) |
| **Docs frontend** | Import this repo on Vercel → `kcc20-sdk.vercel.app` (static root, no build) |
| **Live demo** | [examples/dapp-demo.html](./examples/dapp-demo.html) |
| **sdkVersion** | `166` |

Keys never leave the wallet origin. Your app **builds** the unsigned PSKT. The user **Approves** in the KCC20 window.

---

## Install

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=166"></script>
```

Or from this repo / jsDelivr (still opens the live PWA):

```html
<script src="https://cdn.jsdelivr.net/gh/mrzeku2000XTTT/kcc20-sdk@main/sdk.js"></script>
```

Confirm:

```js
window.kcc20.sdkVersion === '166'
window.kcc20.origin === 'https://kcc-20-wallet.vercel.app'
```

Only call Connect from a **user click**. Never on page load.

---

## Quick start

```js
const kcc = window.kcc20;

// POPUP — user Approves, then the window CLOSES. That is required.
const accounts = await kcc.connect();
const address = accounts[0];                 // kaspa:q…

// SILENT — do not connect() again
const network = await kcc.getNetwork();      // kaspa_mainnet | kaspa_testnet_10
const pubKey  = await kcc.getPublicKey();
const utxos   = await kcc.getUtxoEntries(address);

// YOU build unsigned rusty-kaspa Safe JSON from pubKey + utxos + your route.

// POPUP — user Signs
const signed = await kcc.signPskt({
  txJsonString: unsignedSafeJson,
  options: { signInputs: userP2pkIndexes.map(i => ({ index: i, sighashType: 1 })) }
});

const { txId } = await kcc.pushTx(signed);   // optional
```

If `getPublicKey` / `getUtxoEntries` throw `Connect KCC20 Wallet first` after a successful Connect, you are on a **stale SDK**. Load `sdk.js?v=166` and hard-reload.

---

## Popup vs silent

| Opens the PWA | Silent (no window) |
|---|---|
| `connect` / `requestAccounts` | `getAccounts` |
| `signPskt` / `signPsbt` | `getNetwork` |
| `pushTx` | `getPublicKey` |
| `sendToken` / `payKcc20` | `getUtxoEntries` |
| `switchNetwork` | `getBalance` / `getHoldings` / `getTokenBalance` |

---

## API

| Method | Returns |
|---|---|
| `connect()` / `requestAccounts()` | `string[]` of `kaspa:q…` |
| `getAccounts()` | same, no extra prompt |
| `getNetwork()` | `kaspa_mainnet` \| `kaspa_testnet_10` |
| `getPublicKey()` | hex |
| `getUtxoEntries(address?)` | UTXOs (REST + KasWare-flat fields) |
| `getBalance(address?)` | `{ confirmed, unconfirmed, address }` sompi |
| `signPskt({ txJsonString, options })` | signed Safe JSON **string** |
| `pushTx(signedJson)` | `{ txId, node }` |
| `sendToken({ tick, amount, dest })` | KCC20 send (not a KRON curve buy) |
| `disconnect()` | forget this origin |

Events: `kcc.on('accountsChanged'|'networkChanged'|'disconnect', fn)`

**signInputs:** only the connected address’s P2PK indexes, `sighashType: 1`. Never list covenant / KRON curve / pool / token-cell inputs.

---

## KasWare vs KCC20

| | KasWare | KCC20 (SCORPION) |
|---|---|---|
| How it appears | extension injects `window.kasware` | you load `sdk.js` → `window.kcc20` |
| Connect | `requestAccounts()` | `connect()` / `requestAccounts()` |
| Sign | `signPskt` | same |
| Keys | extension | hosted PWA + PIN |

If a real KasWare extension exists, do **not** overwrite `window.kasware`. Offer both. SCORPION uses `window.kcc20` only.

KIP-12: listen for `kaspa:provider` (`rdns: app.kcc20.wallet`) **before** dispatching `kaspa:requestProvider`.

---

## What’s in this repo

```
sdk.js              — the client (opens the live PWA)
index.html          — docs site (GitHub Pages)
docs.html           — same docs
CONNECT.md          — markdown API
examples/dapp-demo.html
package.json        — @kcc20/sdk
```

The **wallet UI, keys, and signing engine** live in [KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet). This repo is only what a dApp needs to copy-paste.

---

## Deploy the docs on Vercel

This repo is a static site. In Vercel: **Add New → Project → import `mrzeku2000XTTT/kcc20-sdk`**. Framework preset: Other. Root: `.`  Output: leave empty. You get `https://kcc20-sdk.vercel.app`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mrzeku2000XTTT/kcc20-sdk)

Routes: `/` docs · `/nilla` Nilla Gorilla · `/demo` live Connect demo · `/sdk.js` the client.

## License

MIT

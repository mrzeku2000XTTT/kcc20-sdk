# AGENTS.md — KCC20 Wallet SDK

You are helping a human vibe-code a Kaspa dApp. Read `llms.txt` first, then `tokens.json`.

## Non-negotiable

1. Load `https://kcc-20-wallet.vercel.app/sdk.js?v=168` once, from a Connect **click**.
2. `window.kcc20.sdkVersion` must be `"168"` or higher.
3. Keys stay in the PWA at `https://kcc-20-wallet.vercel.app`. Never ask for seed, PIN, or hex keys.
4. After Connect the popup **closes**. Silent reads must work without a second Connect.
5. Buying a KCC20 / KRON token is `buyKron({ tick, amount })` where **amount is KAS**.
6. `sendToken` is not a buy. It sends a bag they already hold to a full `kaspa:q…`.
7. `pushTx` returns `{ txId, node }`. Use `result.txId`.
8. `signPskt` `signInputs.index` is a **global** `tx.inputs[]` index. P2PK only. Never curve / pool / P2SH.
9. Do not overwrite a real `window.kasware`.
10. Skip tickers that are empty or contain `?`. Live list: `https://api.kron.technology/api/registry/tokenlist?all=1` or `/tokens.json`.

## If the user wants a shop / game / membership that sells a token

- Fetch ticks from `https://kcc20-sdk.vercel.app/tokens.json` (or live tokenlist).
- UI: Connect, tick (default their token or KKDAG), KAS amount (default 10), bag, BUY.
- On BUY click: `await window.kcc20.buyKron({ tick, amount })`.
- Show `txId` + explorer. Handle `User rejected`.
- Optional: `quoteKron`; if it throws, skip.

## If they already launched on kron.technology

Their `symbol` is the `tick`. Copy the per-token prompt from `https://kcc20-sdk.vercel.app/tokens.html#TICK`.

## If they are another wallet

Implement the same surface so dApps do not fork: Connect on click, silent session, wallet-built `buyKron`, P2PK-only `signPskt`, `pushTx` object. List next to us via KIP-12 `kaspa:provider`.

## Links

- https://kcc20-sdk.vercel.app/llms.txt
- https://kcc20-sdk.vercel.app/llms-full.txt
- https://kcc20-sdk.vercel.app/tokens.html
- https://kcc20-sdk.vercel.app/docs.html
- https://kcc20-sdk.vercel.app/nilla.html#prompt  (Nilla one-shot: type intent, SDK, Argent, SCORPION)
- https://kcc20-sdk.vercel.app/argent.html
- https://kcc20-sdk.vercel.app/taptotip.html

## If they want a vault / Argent / “send KAS to my grandson”

Read `ARGENT.md` and `argent.html#prompts`. Load `argent.js` too. One-shot: `kcc20Argent.oneShot('director'|'scorpion'|'vibe')`.

System prompt: `kcc20Argent.promptText(kcc20Argent.llmDirectorPrompt())` — never `.join` a string.

- Local parse: `window.kcc20Argent.direct(text)` — no keys.
- “Send to grandson” is type `send` (plain transfer). Ask for amount + his `kaspa:q`. Time Capsule returns to the **owner**, not him.
- Dead-man / heir → `compileVault({ type:'sentinel', params:{ amountKas, lockMinutes, beneficiary } })`.
- Pay now → `sendKas({ dest, amount })`.
- LLM director prompt: `kcc20Argent.promptText(kcc20Argent.llmDirectorPrompt())`. The LLM directs; Argent in the PWA compiles.

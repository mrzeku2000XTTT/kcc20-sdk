# SilverScript v1-rc1 — what it is, what we do with it

Release: [kaspanet/silverscript v1-rc1](https://github.com/kaspanet/silverscript/releases/tag/v1-rc1) (30 Aug 2026). SemVer starts here. Unless blockers show up, **v1 for mainnet** is planned about a week after this RC.

## What it is

SilverScript is Kaspa’s **high-level covenant language**. You write readable `.sil` (CashScript-like: `require`, `entry`, loops, arrays, `tx.outputs[i]`, `#[covenant]` declarations). **`silverc` compiles it to native Kaspa Script.** There is no EVM and no extra VM. State lives in the UTXO (redeem = template prefix + runtime state + suffix).

That is different from **Argent** in this wallet:

| | Argent (KCC20 PWA) | SilverScript (kaspanet) |
|---|---|---|
| Input | English / intent JSON | `.sil` source |
| Compiler | Local JS P2SH builders (`tx.js`) | `silverc` / `silverscript-lang` (Rust) |
| Good at | Time Capsule, sentinel, escrow, hashlock, onramp — the products we already ship | Rich stateful covenants, KCC-01 dispatch, N:M covenant groups, official KCC20 examples |
| Keys | Never leave the PWA | Compiler does not hold keys either |

Do not tell users Argent compiles `.sil`. The official stack (Kaspa docs / Kaspalytics) puts **Argent the language** *above* SilverScript as a future actor layer. **Our product named Argent is the English vault agent.** We consume SilverScript **artifacts**, we do not replace `silverc`.

## What you can do with it

1. **Write a vault in `.sil`** — timeout + two pubkeys, recurring pay, counter, KCC20-shaped transfer (`#[covenant]` leader/delegate).
2. **Compile once** — `silverc contract.sil -o contract.json` (optional `--constructor-args args.json`).
3. **Fund from KCC20** — `compileVault({ type:'silverscript', params:{ amountKas, artifact } })`. We P2SH-hash the bytecode (blake2b-256 → `kaspa:p`) and lock KAS there.
4. **Spend an entry** — `kcc20Silver.encodeEntry(artifact, 'Contract', 'transfer', [sig])` builds the signature script: pushed args + 4-byte **KCC-01 dispatch tag**. Wallet still PIN/KasWare-signs only P2PK funding.
5. **Vibe platforms** — load `silverscript.js` + `argent.js`. LLM directs; `silverc` (or a CI job) compiles; SCORPION funds/spends.

Official KCC20 sample contracts (`kcc20.sil`, `kcc20-minter.sil`) are **examples**, not the live KRON ticks this wallet trades.

## SDK

```html
<script src="https://kcc20-sdk.vercel.app/silverscript.js"></script>
<script src="https://kcc20-sdk.vercel.app/argent.js"></script>
```

```js
const sil = window.kcc20Silver;
const artifact = sil.parse(jsonFromSilverc);          // schema_version 1
const vault = sil.compileVaultPayload({ artifact, amountKas: 10 });
await kcc.compileVault(vault);                        // type: 'silverscript'
const wit = sil.encodeEntry(artifact, 'TransferWithTimeout', 'transfer', [
  sil.val('sig', sig65bytes)
]);
// wit.hex is the P2SH signature script (args + dispatch_tag)
```

One-shot prompt: `kcc20Argent.oneShot('silverscript')`.

## Limits (honest)

- This SDK **does not run `silverc` in the browser**. Compile on a machine with the Rust toolchain, or a hosted builder you control.
- Nested struct/array entry args should be flattened the way `silverscript-abi` does; leaf ints/bytes/sigs/pubkeys work here.
- Upstream README still mentions testnet-10 caution until v1; rc1 is intended to match v1.
- Template-hash verification (blake3 of prefix/suffix lengths) lives in `silverscript-abi`; we trust `dispatch_tag` and `bytecode` from the JSON silverc wrote.

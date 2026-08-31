# SilverScript examples (v1-rc1)

These `.sil` files are **source**. This SDK does not compile them.

```bash
# from https://github.com/kaspanet/silverscript  tag v1-rc1
silverc TransferWithTimeout.sil --constructor-args args.json -o TransferWithTimeout.json
```

Then in a KCC20 dApp:

```js
const sil = window.kcc20Silver;
const artifact = sil.parse(json);
await kcc.compileVault(sil.compileVaultPayload({ artifact, amountKas: 10 }));
```

Spend later with `sil.encodeEntry(artifact, 'TransferWithTimeout', 'transfer', [sigBytes])` as the P2SH signature script (args + KCC-01 dispatch tag). The wallet PIN/KasWare signs only P2PK funding.

See `SILVERSCRIPT.md` and https://github.com/kaspanet/silverscript/releases/tag/v1-rc1

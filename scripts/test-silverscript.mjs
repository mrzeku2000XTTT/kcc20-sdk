/* Node checks for silverscript.js — Sil ABI v1-rc1 consumer, no silverc required. */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'silverscript.js'), 'utf8');
const ctx = { module: { exports: {} }, exports: {} };
ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);
const S = ctx.kcc20Silver;
if (!S) {
  console.error('silverscript.js did not attach kcc20Silver');
  process.exit(1);
}

function ok(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    process.exitCode = 1;
    return false;
  }
  console.log('ok', name);
  return true;
}

ok('schema is 1', S.schemaVersion === 1);
ok('points at v1-rc1', /v1-rc1/.test(S.release));
ok('facts say no VM', /no EVM|no VM/i.test(S.facts().what + S.facts().notArgent));
ok('facts say Argent does not compile .sil', /does not compile \.sil|not compile \.sil|Do not claim Argent compiles/i.test(S.facts().notArgent));

const artifact = {
  schema_version: 1,
  compiler_version: '1.0.0-rc.1',
  structs: {},
  contracts: {
    Foo: {
      source_path: 'Foo.sil',
      runtime_state: { source: 'State', fields: [] },
      entries: {
        step: {
          dispatch_tag: '2c49ed65',
          params: [
            { name: 'n', type: { kind: 'int' } },
            { name: 'blob', type: { kind: 'bytes' } },
            { name: 'flag', type: { kind: 'bool' } },
            { name: 'b', type: { kind: 'byte' } }
          ]
        }
      },
      compiled: {
        bytecode: [0xaa, 0xbb],
        template_hash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        state_span: { offset: 0, len: 0 }
      }
    }
  }
};

const parsed = S.parse(artifact);
ok('parse v1', parsed.schema_version === 1);
ok('redeem hex', S.redeemHex(parsed, 'Foo') === 'aabb');

const enc = S.encodeEntry(parsed, 'Foo', 'step', [
  S.val('int', 17),
  S.val('bytes', [1, 2, 3, 4]),
  S.val('bool', true),
  S.val('byte', 1)
]);
ok('KCC-01 sigscript matches silverscript-abi vector', enc.hex === '011104010203045151042c49ed65');

let threw = false;
try { S.parse({ schema_version: 2, contracts: {} }); } catch { threw = true; }
ok('rejects other schema', threw);

threw = false;
try { S.encodeEntry(parsed, 'Foo', 'step', [1]); } catch (e) { threw = /expects 4/.test(e.message); }
ok('wrong arg count', threw);

const payload = S.compileVaultPayload({ artifact, amountKas: 10 });
ok('compileVault type silverscript', payload.type === 'silverscript' && payload.params.amountKas === 10);
ok('payload has redeem', payload.params.redeemHex === 'aabb');

const sum = S.summary(artifact);
ok('summary lists step', sum[0].name === 'Foo' && sum[0].entries[0].name === 'step');

console.log(process.exitCode ? 'silverscript tests: FAIL' : 'silverscript tests: ok');

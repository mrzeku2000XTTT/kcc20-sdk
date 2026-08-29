/* Node fact-check for argent.js — same rules as wallet Argent. */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'argent.js'), 'utf8');
const ctx = { module: { exports: {} }, exports: {} };
ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);
const A = ctx.kcc20Argent;
if (!A) {
  console.error('argent.js did not attach kcc20Argent');
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

const grandson = A.direct('I want to send Kaspa to his grandson.');
ok('grandson is send, not a vault', grandson.intent && grandson.intent.type === 'send');
ok('grandson incomplete without dest', grandson.complete === false);
ok('grandson asks destination or amount', /amount|destination|kaspa|how much/i.test((grandson.ask || '') + ' ' + (grandson.intent.missing || []).join(' ')));
ok('grandson hint mentions send-now or ask-lock', (grandson.hints || []).some(h => h.suggest === 'send' || h.code === 'send-now' || h.code === 'ask-lock'));

const sendAddr = A.parseIntent('send 10 kas to kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6');
ok('send+address is send', sendAddr.type === 'send' && sendAddr.complete);
ok('send dest', sendAddr.params.destination === 'kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6');
ok('send plan is sendKas', A.compilePlan(sendAddr).method === 'sendKas');

const lock = A.parseIntent('lock 10 kas for 7 days');
ok('lock is timelock', lock.type === 'timelock' && lock.complete);
ok('lock minutes ~ 7d', Math.abs(lock.params.lockMinutes - 7 * 1440) < 2);
ok('timelock returns to owner', /owner/i.test(A.compilePlan(lock).returnsTo));
ok('timelock is compileVault', A.compilePlan(lock).method === 'compileVault');

const heir = A.direct('dead-man 50 kas for 30 days heir kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6');
ok('heir is sentinel', heir.intent && heir.intent.type === 'sentinel');
ok('heir complete', heir.complete);
ok('heir beneficiary set', heir.intent.params.beneficiary && heir.intent.params.beneficiary.startsWith('kaspa:q'));

const later = A.directorHints('lock 10 kas until he turns 18 for my grandson', { type: 'timelock', params: { amountKas: 10 }, complete: true, missing: [] });
ok('later-lock warns capsule is not heir', later.some(h => h.code === 'capsule-not-heir' || h.warn));

const rent = A.parseIntent('lock 1000 kas for rent until September 1 2026 9:00 UTC');
ok('rent is life', rent.type === 'life' && rent.params.lifeKind === 'rent');

ok('prompt mentions grandson and Time Capsule owner', /grandson/i.test(A.promptText(A.llmDirectorPrompt())) && /OWNER/i.test(A.promptText(A.llmDirectorPrompt())));
ok('schema has send+sentinel+xmss', A.intentSchema().properties.type.enum.indexOf('send') >= 0 && A.intentSchema().properties.type.enum.indexOf('xmss') >= 0);
ok('llmDirectorPrompt().join works', typeof A.llmDirectorPrompt().join === 'function');
ok('promptText unwraps join', A.promptText(A.llmDirectorPrompt().join('\n')).indexOf('grandson') >= 0);
ok('promptText on string', A.promptText('hello') === 'hello');
ok('oneShot director warns about join', /promptText/i.test(A.oneShot('director')) && /join/i.test(A.oneShot('director')));
ok('oneShot scorpion mentions buyKron', /buyKron/i.test(A.oneShot('scorpion')));
ok('oneShot nilla routes compileVault and buyKron', /compileVault/i.test(A.oneShot('nilla')) && /buyKron/i.test(A.oneShot('nilla')) && /promptText/i.test(A.oneShot('nilla')));

ok('alias deadman → sentinel', A.normalizeVaultType('deadman') === 'sentinel');
ok('alias dead man switch → sentinel', A.normalizeVaultType('dead man switch') === 'sentinel');
ok('alias Time Capsule → timelock', A.normalizeVaultType('Time Capsule') === 'timelock');

const dms = A.parseIntent('I need a deadman switch');
ok('deadman switch phrase is sentinel', dms.type === 'sentinel');

const dmsLock = A.parseIntent('deadman switch lock 10 kas for 30 days');
ok('deadman + lock is sentinel not timelock', dmsLock.type === 'sentinel');
ok('deadman + lock not life', dmsLock.type !== 'life' && dmsLock.type !== 'timelock');

const dmsDue = A.parseIntent('deadman 10 kas until September 1 2027 heir kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6');
ok('deadman + due date stays sentinel', dmsDue.type === 'sentinel');

const forced = A.parseIntent('deadman switch lock 10 kas for 7 days', { type: 'timelock', params: { amountKas: 10 } });
ok('message sentinel beats prev timelock', forced.type === 'sentinel');

const buyDest = 'kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6';
const q = A.quoteFromPrice({ usd: 20, usdPerKas: 0.05, dest: buyDest });
ok('quote kas = usd/price', q.kasAmount === 400);
ok('quote valid 5 min', A.quoteValid(q) && (q.expiresAt - q.createdAt) === 5 * 60 * 1000);
const onrampLock = A.onrampCompile(q);
ok('onramp compiles type onramp 5 min to buyer', onrampLock.type === 'onramp' && onrampLock.params.receiver === buyDest && onrampLock.params.lockMinutes === 5);
const faucet = A.onrampFaucet(q);
ok('onramp faucet sendKas dest', faucet.dest === buyDest && String(faucet.amount) === '400');
const dead = Object.assign({}, q, { expiresAt: Date.now() - 1 });
ok('expired quote rejected', A.quoteValid(dead) === false);
ok('oneShot onramp mentions Stripe and sendKas', /Stripe/i.test(A.oneShot('onramp')) && /sendKas/i.test(A.oneShot('onramp')) && /hashlock/i.test(A.oneShot('onramp')));
const paid = A.onrampPaidIntent(q);
ok('paid intent is send to buyer', paid.type === 'send' && paid.wallet.dest === buyDest && /send /i.test(paid.argentChat));
ok('onrampFlow has signing treasury step', A.onrampFlow()[0].do.indexOf('SIGNING') >= 0);
ok('base44 prompt is onramp escrow', /compileVault/i.test(A.oneShot('base44Onramp')) && /onramp/i.test(A.oneShot('base44Onramp')));
ok('card sale alias', A.normalizeVaultType('card sale') === 'onramp');
ok('parse card sale is onramp', A.parseIntent('card sale 10 kas for 5 minutes to kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6').type === 'onramp');
ok('cn ticker usdc is usdcerc20', A.changenowTicker('usdc').v1 === 'usdcerc20');
ok('cn widget to kas', /to=kas/.test(A.changenowWidgetUrl({ address: buyDest })) && /toAddress=/.test(A.changenowWidgetUrl({ address: buyDest })));
ok('oneShot changenow uses intent dest', /changenowIntent/.test(A.oneShot('changenow')));

if (process.exitCode) {
  console.error('argent tests failed');
  process.exit(1);
}
console.log('argent tests passed');

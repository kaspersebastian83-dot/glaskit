// GlasKit – Kopien noch gleich wie die Originale? (Audit Lauf 4, D4; läuft in der CI und nachts)
//   node tests/kopien.mjs [../projektzentrale] [../Probenplan] [../resultkit]
// 1. spektron-ordner.js steht byte-gleich in index.html (Vorlage: Projektzentrale).
// 2. Die Nachzeichnungs-Vorlage (tests/nachzeichnung-vorlage.json) ist noch das, was PlanKits heutiger Code erzeugt –
//    neu erzeugt in eine Temp-Datei und verglichen, ohne die zufälligen IDs und ohne die PlanKit-Version.
// 3. Bewertung (Audit Lauf 5, E4 #7/#8/#10): labNumber, labQualifier, vdsScale, KORROSION-CHLORID v2 (chloridEinheit, chloridScale,
//    stufeErreicht, vdsRegel) und rate gleich wie ResultKit src/bewertung.ts (= PlanKit src/results.ts); asbestBefund gleich wie
//    PlanKit src/results.ts und ResultKit src/uebersicht.ts. Gleiche Eingaben → gleiches Ergebnis (GlasKit ist JavaScript, die
//    Originale TypeScript – darum kein Textvergleich).
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { extname } from 'node:path';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({
  resolve(s, c, n) { if (s.startsWith('.') && c.parentURL) { const u = new URL(s, c.parentURL); if (!extname(u.pathname) && existsSync(fileURLToPath(u) + '.ts')) return n(u.href + '.ts', c); } return n(s, c); },
  load(u, c, n) { if (u.endsWith('.ts')) return { format: 'module', source: stripTypeScriptTypes(readFileSync(fileURLToPath(u), 'utf8'), { mode: 'transform' }), shortCircuit: true }; return n(u, c); }
});
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PZ = resolve(process.argv[2] || process.env.PROJEKTZENTRALE || join(root, '..', 'projektzentrale'));
const PK = resolve(process.argv[3] || process.env.PLANKIT || join(root, '..', 'Probenplan'));
assert.ok(existsSync(join(PZ, 'spektron-ordner.js')), 'Projektzentrale fehlt: ' + PZ);
assert.ok(existsSync(join(PK, 'src', 'trace.ts')), 'PlanKit (Probenplan) fehlt: ' + PK);
const RK = resolve(process.argv[4] || process.env.RESULTKIT || join(root, '..', 'resultkit'));
assert.ok(existsSync(join(RK, 'src', 'bewertung.ts')), 'ResultKit fehlt: ' + RK);

const html = readFileSync(join(root, 'index.html'), 'utf8'), so = readFileSync(join(PZ, 'spektron-ordner.js'), 'utf8');
assert.ok(html.includes(so), 'spektron-ordner.js in index.html nicht byte-gleich mit der Projektzentrale – Block ersetzen (README „Pflege“)');
console.log('ok spektron-ordner.js byte-gleich mit der Projektzentrale');

const tmp = join(mkdtempSync(join(tmpdir(), 'glaskit-')), 'vorlage.json');
execFileSync(process.execPath, [join(root, 'tests', 'nachzeichnung-vorlage.mjs'), PK, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
const ohneIds = v => JSON.parse(JSON.stringify(v, (k, x) => (k === 'id' || k === 'plankit' ? undefined : x)));
const alt = JSON.parse(readFileSync(join(root, 'tests', 'nachzeichnung-vorlage.json'), 'utf8')), neu = JSON.parse(readFileSync(tmp, 'utf8'));
assert.deepEqual(ohneIds(neu), ohneIds(alt), `Nachzeichnung: PlanKit ${neu.plankit.version} (${neu.plankit.commit}) erzeugt eine andere Vorlage als die eingecheckte (PlanKit ${alt.plankit.version}) – node tests/nachzeichnung-vorlage.mjs ${PK}, dann Prüfung e`);
console.log(`ok Nachzeichnungs-Vorlage gleich mit PlanKit ${neu.plankit.version} (${neu.plankit.commit}) – eingecheckt aus ${alt.plankit.version}`);

// 3. Bewertung gegen ResultKit/PlanKit (E4 #7/#8/#10)
{
  const a = html.indexOf('const UNRATED='), b = html.indexOf('const ASBEST_PARAM=');
  assert.ok(a > 0 && b > a, 'Bewertungsblock in index.html');
  const G = {}; vm.createContext(G);
  vm.runInContext(html.slice(a, b) + '\nthis.api={labNumber,labQualifier,vdsScale,chloridEinheit,chloridScale,stufeErreicht,vdsRegel,asbestBefund,setNutzung:v=>{nutzung=v;}};', G);
  const g = G.api, R = await import(pathToFileURL(join(RK, 'src', 'bewertung.ts')).href);
  const RU = await import(pathToFileURL(join(RK, 'src', 'uebersicht.ts')).href), PR = await import(pathToFileURL(join(PK, 'src', 'results.ts')).href);
  const j = x => JSON.parse(JSON.stringify(x ?? null));
  const zahlen = ['1300', '0', '3,2', '3.2', '0.123', '1.300,5', '1,300.5', '1.234.567', '1 300,5', '1\u00a0300', '1\u202f300,5', '1,2e3', '−2,5', '', ' ', '1.300', '1,234', '12.34,5', '1,2,3',
    '1.2 mg/kg', '> 5', 'NaN', 'Infinity', '0x10', '1e999', '007', '.5', '5.', null, undefined, '< 0,50', 'unter BG', 'unterBG', ' UNTER bg ', 'n.n.', '(N. N.)', 'n.b.', '(n. b.)', '<', '< kaputt',
    '< -1', '< 1.234', '< BG', 'n.n. Zusatz', '(n.b.', '(3,2)', 'n. n.', 'N.B.', 'nb'];
  for (const z of zahlen) {
    const x = g.labNumber(z), y = R.labNumber(z);
    assert.ok(Object.is(x, y) || (Number.isNaN(x) && Number.isNaN(y)), `labNumber(${JSON.stringify(z)}): GlasKit ${x}, ResultKit ${y}`);
    assert.equal(g.labQualifier(z), R.labQualifier(z), `labQualifier(${JSON.stringify(z)})`);
  }
  const params = ['Chlorid', 'Chlorid (wasserlöslich)', ' chlorid ', 'Chloride', 'Summe 16 EPA-PAK', 'Summe 16 EPA-PAK exkl. BG', 'Σ16 EPA-PAK', 'Σ 16 EPA–PAK', 'Summe 16 EPA PAK', 'Summe 15 EPA-PAK', 'Benzo[a]pyren', ''];
  const units = ['µg/cm²', 'µg/cm2', 'μg/cm²', 'mg/m²', 'MG/M²', 'µg/m²', 'mg/cm²', 'µg/100 cm²', 'mg/dm²', 'ng/m²', 'µg/Probe', 'mg/kg', ''];
  let f = 0;
  for (const [usage, nutzung] of [[undefined, ''], ['residential', 'Wohnen'], ['residential', 'Gesundheit & Labor'], ['industrial', 'Gewerbe/Industrie']]) {
    g.setNutzung(nutzung); R.setNutzung(nutzung);
    for (const p of params) for (const u of units) {
      assert.deepEqual(j(g.vdsScale(p, u, usage)), j(R.vdsScale(p, u, usage)), `vdsScale(${JSON.stringify(p)}, ${JSON.stringify(u)}, ${usage}, ${nutzung})`);
      assert.deepEqual(j(g.chloridScale(p, u)), j(R.chloridScale(p, u)), `chloridScale(${JSON.stringify(p)}, ${JSON.stringify(u)})`); f++;
    }
  }
  g.setNutzung(''); R.setNutzung('');
  for (const u of units) assert.equal(g.chloridEinheit(u), R.chloridEinheit(u), `chloridEinheit(${JSON.stringify(u)})`);
  for (const c of [{ from: 5 }, { from: 10, ueber: true }, { from: 0 }]) for (const v of [0, 4.99, 5, 9.99, 10, 10.0001, 50]) assert.equal(g.stufeErreicht(c, v), R.stufeErreicht(c, v));
  const vds = R.chloridScale('Chlorid', 'µg/cm²');
  for (const eigen of [{ name: 'gleich', cats: [{ name: 'a', from: 0 }, { name: 'b', from: 5 }, { name: 'c', from: 10 }] }, { name: 'als Text', cats: [{ name: 'a', from: '0' }, { name: 'b', from: '5' }, { name: 'c', from: '10' }] },
    { name: 'andere', cats: [{ name: 'a', from: 0 }, { name: 'b', from: 6 }, { name: 'c', from: 10 }] }, { name: 'kürzer', cats: [{ name: 'a', from: 0 }, { name: 'b', from: 5 }] }])
    assert.deepEqual(j(g.vdsRegel(eigen, vds)), j(R.vdsRegel(eigen, vds)), `vdsRegel ${eigen.name}`);
  // asbestBefund (#10): GlasKit, PlanKit, ResultKit
  const W = (p, r, u = '') => ({ p, r, u });
  const faelle = [[], [W('Asbest', 'nicht nachgewiesen')], [W('Asbest', 'Chrysotil')], [W('Asbestart', 'Chrysotil'), W('Asbestgehalt', '5 - 20', '%')], [W('Asbestgehalt', '< 0,1', '%')],
    [W('Asbestgehalt', '0,5', '%'), W('Asbestart', 'Amosit')], [W('Chrysotil', 'nachgewiesen'), W('Amosit', 'kein')], [W('Asbest', '-')], [W('Asbest', '—'), W('Asbest', 'positiv')], [W('Asbest', 'n.n.')],
    [W('Asbest', 'ja')], [W('Asbest', 'Ja ')], [W('Tremolit', 'enthalten'), W('Summe 16 EPA-PAK', '12', 'mg/kg')], [W('Asbestgehalt', 'unter BG', '%')], [W('Asbestgehalt', 'kein Asbest', '')], [W('Krokydolith', 'gefunden'), W('Asbestgehalt', '20', '%')],
    [W('Asbest', 'negativ')], [W('KMF', 'nachgewiesen')]];
  for (const w of faelle) {
    const x = j(g.asbestBefund(w));
    assert.deepEqual(x, j(PR.asbestBefund(w)), `asbestBefund wie PlanKit: ${JSON.stringify(w)}`);
    assert.deepEqual(x, j(RU.asbestBefund(w)), `asbestBefund wie ResultKit: ${JSON.stringify(w)}`);
  }
  console.log(`ok Bewertung gleich wie ResultKit/PlanKit (${zahlen.length} Zahlen, ${f} Skalen-Fälle, ${faelle.length} Asbestbefunde)`);
}

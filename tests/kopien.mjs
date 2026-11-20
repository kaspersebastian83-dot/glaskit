// GlasKit – Kopien noch gleich wie die Originale? (Audit Lauf 4, D4; läuft in der CI und nachts)
//   node tests/kopien.mjs [../projektzentrale] [../Probenplan]
// 1. spektron-ordner.js steht byte-gleich in index.html (Vorlage: Projektzentrale).
// 2. Die Nachzeichnungs-Vorlage (tests/nachzeichnung-vorlage.json) ist noch das, was PlanKits heutiger Code erzeugt –
//    neu erzeugt in eine Temp-Datei und verglichen, ohne die zufälligen IDs und ohne die PlanKit-Version.
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PZ = resolve(process.argv[2] || process.env.PROJEKTZENTRALE || join(root, '..', 'projektzentrale'));
const PK = resolve(process.argv[3] || process.env.PLANKIT || join(root, '..', 'Probenplan'));
assert.ok(existsSync(join(PZ, 'spektron-ordner.js')), 'Projektzentrale fehlt: ' + PZ);
assert.ok(existsSync(join(PK, 'src', 'trace.ts')), 'PlanKit (Probenplan) fehlt: ' + PK);

const html = readFileSync(join(root, 'index.html'), 'utf8'), so = readFileSync(join(PZ, 'spektron-ordner.js'), 'utf8');
assert.ok(html.includes(so), 'spektron-ordner.js in index.html nicht byte-gleich mit der Projektzentrale – Block ersetzen (README „Pflege“)');
console.log('ok spektron-ordner.js byte-gleich mit der Projektzentrale');

const tmp = join(mkdtempSync(join(tmpdir(), 'glaskit-')), 'vorlage.json');
execFileSync(process.execPath, [join(root, 'tests', 'nachzeichnung-vorlage.mjs'), PK, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
const ohneIds = v => JSON.parse(JSON.stringify(v, (k, x) => (k === 'id' || k === 'plankit' ? undefined : x)));
const alt = JSON.parse(readFileSync(join(root, 'tests', 'nachzeichnung-vorlage.json'), 'utf8')), neu = JSON.parse(readFileSync(tmp, 'utf8'));
assert.deepEqual(ohneIds(neu), ohneIds(alt), `Nachzeichnung: PlanKit ${neu.plankit.version} (${neu.plankit.commit}) erzeugt eine andere Vorlage als die eingecheckte (PlanKit ${alt.plankit.version}) – node tests/nachzeichnung-vorlage.mjs ${PK}, dann Prüfung e`);
console.log(`ok Nachzeichnungs-Vorlage gleich mit PlanKit ${neu.plankit.version} (${neu.plankit.commit}) – eingecheckt aus ${alt.plankit.version}`);

// Testvorlage für GlasKit 1.6.0 (Nachzeichnung): baut erfundene Nachzeichnungen mit PlanKits EIGENEM Code (src/trace.ts, src/preparation.ts)
// und schreibt sie nach tests/nachzeichnung-vorlage.json. GlasKits Prüfung (tests/glaskit-check.cjs, Teil e) liest nur diese Datei –
// PlanKit wird zum Prüfen nicht gebraucht. Neu erzeugen, wenn sich PlanKits Nachzeichnung ändert:
//   node tests/nachzeichnung-vorlage.mjs <Pfad zum PlanKit-Repo „Probenplan“>
// Enthält: einen Grundriss (Brandraum, L-förmiger Raum aus zwei VERBUNDENEN Rechtecken, zwei gleichnamige NICHT verbundene Räume, schräge Wand,
// Türen/Fenster mit PlanKits Standardbreite, Proben an Wänden) – gerade, um 90° gedreht (rotateProject), danach zugeschnitten (cropProject),
// auf einem fein ausgerichteten Plan (alignProject, dann nachgezeichnet); dazu PlanKits Urteil (validateTrace) über ungültige Abwandlungen und
// PlanKits Wandliste (traceSegments) als Vergleich. Keine Kundendaten.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {extname,join,resolve,dirname} from 'node:path';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {execSync} from 'node:child_process';
const pk=resolve(process.argv[2]||'');
if(!process.argv[2]||!existsSync(join(pk,'src','trace.ts'))){console.error('Bitte den Pfad zum PlanKit-Repo angeben: node tests/nachzeichnung-vorlage.mjs ../Probenplan');process.exit(2);}
registerHooks({   // wie PlanKits eigene Node-Tests: .ts ohne Endung auflösen, Typen entfernen
  resolve(s,c,next){if(s.startsWith('.')&&c.parentURL){const u=new URL(s,c.parentURL);if(!extname(u.pathname)&&existsSync(fileURLToPath(u)+'.ts'))return next(u.href+'.ts',c);}return next(s,c);},
  load(u,c,next){if(u.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'}),shortCircuit:true};return next(u,c);}});
const T=await import(pathToFileURL(join(pk,'src','trace.ts')).href);
const M=await import(pathToFileURL(join(pk,'src','model.ts')).href);
const P=await import(pathToFileURL(join(pk,'src','preparation.ts')).href);
const version=JSON.parse(readFileSync(join(pk,'package.json'),'utf8')).version;
let commit='';try{commit=execSync('git rev-parse --short HEAD',{cwd:pk}).toString().trim();}catch{}
const kopie=x=>JSON.parse(JSON.stringify(x)),TOL=10;

// ---------- Grundriss in Bildpunkten eines 1600 × 1000 großen Bildplans ----------
const W=1600,H=1000,plan0={name:'Testplan (erfunden)',width:W,height:H,data:'data:image/png;base64,',vector:false};
const t=T.emptyTrace();
const raum=(id,name,x,y,w,h)=>T.addTraceRoom(t,{id,name,x,y,w,h});
raum('k','Küche',100,100,600,400);T.setTraceFire(t,'k',true);
raum('wo','Wohnen',700,100,800,400);
raum('wo2','Wohnen Anbau',1100,500,400,400);T.joinTraceRoom(t,'wo2','wo');   // L-förmig: ausdrücklich verbunden → gemeinsame Kante ist keine Wand
raum('b1','Büro',100,500,400,400);raum('b2','Büro',500,500,600,400);            // gleichnamig, NICHT verbunden → Wand bei x = 500 bleibt
T.addTraceWall(t,T.traceWallFrom(t,plan0,{x:1350,y:100},{x:1500,y:250},TOL));     // schräge Wand
const oeff=(kind,p,an)=>{const g=T.traceSegNear(t,p,TOL);if(!g)throw Error('keine Wand bei '+JSON.stringify(p));const o=T.traceOpeningOn(plan0,g,kind,an||p,null);T.addTraceOpening(t,o);};
oeff('door',{x:700,y:300},{x:705,y:300});oeff('door',{x:500,y:700},{x:505,y:700});oeff('door',{x:900,y:500},{x:900,y:505});oeff('door',{x:300,y:900},{x:300,y:895});
oeff('window',{x:400,y:100});oeff('window',{x:1425,y:175});oeff('window',{x:1500,y:700});
T.setChecked(t,'2026-11-13','Test');
// Proben (Ansicht) dicht an Wänden – auf beiden Seiten der Wand bei x = 500, oben am Fenster, an der schrägen Wand, im Anbau dicht an der VERBUNDENEN Kante
const probe=(label,x,y,raum)=>({id:'m'+label,kind:'sample',label,note:'',x,y,lx:x,ly:y,surface:'wall',raum});
const proben=[probe('P1',480,620,'Büro'),probe('P2',520,760,'Büro'),probe('P3',1300,515,'Wohnen'),probe('P4',400,125,'Küche'),probe('P5',1400,170,'Wohnen'),
  probe('P6',300,160,'Küche')];   // P6: 60 Bildpunkte von der Wand – kalibriert (1 m = 100) an der Wand, ohne Maßstab (2,5 % = 40) nicht
const projekt=()=>{const p=M.createProject({...plan0,trace:T.cloneTrace(t)});p.markers=kopie(proben);return p;};
const variante=(name,p,erwartet)=>{const plan=p.plan;T.validateTrace(plan.trace,plan);   // wirft, wenn PlanKit die Nachzeichnung nicht annähme
  const ms=new Map(p.markers.map(m=>[m.label,m]));
  return {name,plan:{name:plan.name,width:plan.width,height:plan.height,vector:false,...(plan.preparation?{preparation:plan.preparation}:{}),trace:plan.trace},
    quelle:{width:(plan.preparation||{sourceWidth:W}).sourceWidth,height:(plan.preparation||{sourceHeight:H}).sourceHeight},matrix:P.planMatrix(plan),
    markers:p.markers,segmente:T.traceSegments(plan.trace).map(({x1,y1,x2,y2,room})=>({x1,y1,x2,y2,room})),
    // PlanKits nächste Wandstrecke je Probe (oder keine im Umkreis) – die Erwartung für GlasKits wandbündige Felder
    naechste:Object.fromEntries([...ms].map(([l,m])=>{const g=T.traceSegNear(plan.trace,m,erwartet*Math.max(plan.width,plan.height));return [l,g?{x1:g.x1,y1:g.y1,x2:g.x2,y2:g.y2}:null];}))};};
const ANSICHT=.025;   // GlasKits Darstellungstoleranz ohne Maßstab (NZ_ANSICHT)
const gerade=projekt();
const gedreht=projekt();P.rotateProject(gedreht,1);
const zugeschnitten=kopie(gedreht);P.cropProject(zugeschnitten,{x:60,y:80,width:900,height:1460});
// Fein ausgerichtet: erst ausrichten (mit Nachzeichnung gesperrt), dann nachzeichnen – die Nachzeichnung liegt in den ausgerichteten Planeinheiten
const ausgerichtet=M.createProject({...plan0});P.alignProject(ausgerichtet,3);
{const at=T.cloneTrace(t),dx=Math.round((ausgerichtet.plan.width-W)/2),dy=Math.round((ausgerichtet.plan.height-H)/2);
  for(const r of at.rooms){r.x+=dx;r.y+=dy;}for(const w of at.walls){w.x1+=dx;w.x2+=dx;w.y1+=dy;w.y2+=dy;}for(const o of at.openings){o.x+=dx;o.y+=dy;}
  ausgerichtet.plan.trace=at;ausgerichtet.markers=kopie(proben).map(m=>({...m,x:m.x+dx,y:m.y+dy,lx:m.lx+dx,ly:m.ly+dy}));}
const varianten=[variante('gerade',gerade,ANSICHT),variante('gedreht',gedreht,ANSICHT),variante('zugeschnitten',zugeschnitten,ANSICHT),variante('ausgerichtet',ausgerichtet,ANSICHT)];
// Kalibriert (100 Bildpunkte = 1 m): Erwartung mit 1 m statt 2,5 %
const kal=variante('gerade-kalibriert',gerade,100/W);kal.plan.calibration={units:100,meters:1};varianten.push(kal);

// ---------- Abwandlungen: PlanKits Urteil ----------
const urteil=(name,tr,pl={width:W,height:H})=>{let ok=true,fehler='';try{T.validateTrace(tr,pl);}catch(e){ok=false;fehler=e.message;}return {name,trace:tr,width:pl.width,height:pl.height,plankit:ok?'gültig':'abgelehnt',fehler};};
const ab=[];
{const x=T.cloneTrace(t);delete x.checked;ab.push(urteil('ungeprüft',x));}
{const x=T.cloneTrace(t);x.rooms.find(r=>r.id==='b2').joins='wo2';x.rooms.find(r=>r.id==='b2').name='Wohnen';ab.push(urteil('Kette',x));}
{const x=T.cloneTrace(t);const r=x.rooms.find(r=>r.id==='b1');r.joins='b1';ab.push(urteil('Selbstbezug',x));}
{const x=T.cloneTrace(t);x.rooms.find(r=>r.id==='wo').w=950;ab.push(urteil('außerhalb',x));}
{const x=T.cloneTrace(t);x.walls.push({id:'weit',x1:10,y1:10,x2:1650,y2:10});ab.push(urteil('Wand außerhalb',x));}
// Obergrenze: 200 Räume, 1 000 Wände, 400 Türen/Fenster sind erlaubt – 1 001 Wände nicht
const gross=T.emptyTrace(),GP={width:4000,height:2000};
for(let i=0;i<200;i++){const x=40+(i%20)*196,y=40+Math.floor(i/20)*192;T.addTraceRoom(gross,{id:'g'+i,name:'Raum '+(i+1),x,y,w:196,h:192});}
for(let i=0;i<1000;i++){const r=gross.rooms[i%200],k=Math.floor(i/200);gross.walls.push({id:'gw'+i,x1:r.x+20+k*30,y1:r.y+30,x2:r.x+20+k*30,y2:r.y+150});}
for(let i=0;i<400;i++){const r=gross.rooms[i%200],oben=i<200,g=T.traceSegNear(gross,oben?{x:r.x+98,y:r.y}:{x:r.x,y:r.y+96},2);T.addTraceOpening(gross,T.traceOpeningOn(GP,g,oben?'door':'window',oben?{x:r.x+98,y:r.y+3}:{x:r.x+3,y:r.y+96},null));}
T.setChecked(gross,'2026-11-13','Test');
ab.push(urteil('Obergrenze',gross,GP));
{const x=T.cloneTrace(gross),zuviel={id:'zuviel',x1:50,y1:50,x2:60,y2:60};x.walls.push(zuviel);ab.push({...urteil('1001 Wände',x,GP),trace:null,basis:'Obergrenze',dazuWand:zuviel});}   // nur einmal speichern

const aus={erzeugt:'tests/nachzeichnung-vorlage.mjs',plankit:{version,commit},hinweis:'Erfundene Daten. Neu erzeugen statt von Hand ändern.',ansicht:ANSICHT,varianten,abwandlungen:ab};
const ziel=join(dirname(fileURLToPath(import.meta.url)),'nachzeichnung-vorlage.json');
writeFileSync(ziel,JSON.stringify(aus));
console.log(`geschrieben: ${ziel} (PlanKit ${version} ${commit}) – ${varianten.length} Varianten, ${ab.length} Abwandlungen: `+ab.map(a=>a.name+'='+a.plankit).join(', '));

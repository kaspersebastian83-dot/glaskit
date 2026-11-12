// GlasKit – Prüfung im echten Browser mit erfundenen Daten (keine Kundendaten): node tests/glaskit-check.cjs [a|b|c|alle]
// Braucht Playwright (z. B. NODE_PATH auf ein node_modules mit „playwright“). Legt im privaten Dateisystem des Browsers (OPFS)
// einen Archivordner mit erfundenen Projekten an, merkt ihn wie die Projektzentrale in IndexedDB „mosaik-suite“ und öffnet
// GlasKit mit #projekt=… . Bildschirmfotos landen in tests/out/.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),out=path.join(__dirname,'out');fs.mkdirSync(out,{recursive:true});
const welche=process.argv[2]||'alle',soll=x=>welche==='alle'||welche===x;
const PROJ='26.0560 Teststr. Gladbeck Dr.Ka',LEER='26.0561 Ohneplan Dr.Ka';
(async()=>{
  const server=http.createServer((req,res)=>{const f=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'')||'index.html');
    if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});res.end(fs.readFileSync(f));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/index.html`;
  const browser=await chromium.launch(),ctx=await browser.newContext({viewport:{width:1400,height:860}}),fehler=[];
  // Die Chromes in dieser Prüfumgebung schließen die Seite, wenn ein OPFS-Ordner aus IndexedDB zurückgelesen wird. Darum liefert hier
  // nur das Lesen von „archiv“ den Testordner direkt – GlasKit öffnet dafür trotzdem selbst „mosaik-suite“/„kv“ (wird mitgeschrieben).
  await ctx.addInitScript(()=>{const get=IDBObjectStore.prototype.get;window.__idb=[];
    IDBObjectStore.prototype.get=function(k){window.__idb.push(`${this.transaction.db.name}/${this.name}/${k}`);if(k!=='archiv')return get.call(this,k);
      const q={result:undefined,error:null,onsuccess:null,onerror:null};
      navigator.storage.getDirectory().then(r=>r.getDirectoryHandle('Mosaik Archivordner')).then(h=>{q.result=h;q.onsuccess&&q.onsuccess();},()=>{q.result=undefined;q.onsuccess&&q.onsuccess();});return q;};});
  const page=await ctx.newPage();
  page.on('pageerror',e=>fehler.push(e.message));page.on('console',m=>{if(m.type()==='error')fehler.push('console: '+m.text());});
  const shot=async n=>{await page.waitForTimeout(400);await page.screenshot({path:path.join(out,n+'.png')});};
  await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length>0);
  assert.match(await page.locator('#version').textContent(),/^v\d+\.\d+\.\d+$/);
  // Archiv anlegen (nur ASCII-Dateinamen: die Test-Chromes hier können im OPFS keine Umlaute in Dateinamen)
  await page.evaluate(async([PROJ,LEER])=>{
    const r=await navigator.storage.getDirectory();for await(const [n] of r.entries())await r.removeEntry(n,{recursive:true});
    const archiv=await r.getDirectoryHandle('Mosaik Archivordner',{create:true}),schreibe=async(d,n,t)=>{const w=await (await d.getFileHandle(n,{create:true})).createWritable();await w.write(t);await w.close();};
    const pj=await archiv.getDirectoryHandle(PROJ,{create:true}),sp=await pj.getDirectoryHandle('_Spektron',{create:true}),pk=await sp.getDirectoryHandle('PlanKit',{create:true});
    const plan=beispiel();for(const g of [plan,...plan.sheets])for(const m of (g.markers||[]))if(m.lab){m.lab.labNr=m.lab.labNr.replace('BEISPIEL','TEST');m.lab.bericht='TEST-01';}
    await schreibe(pk,`Probenplan ${PROJ}.probenplan`,JSON.stringify(plan));
    await schreibe(pk,`Probenplan ${PROJ} (vorher 2026-11-01 10-00-00-000 abc).probenplan`,'{"kaputt":true}');
    await schreibe(sp,'_Projekt.json',JSON.stringify({nr:'26.0560',nutzung:'Wohnen'}));
    await archiv.getDirectoryHandle(LEER,{create:true});
  },[PROJ,LEER]);
  if(soll('a')){
    // 1) Recht schon da → Projekt öffnet direkt
    await page.goto(url+'#projekt='+encodeURIComponent(PROJ));
    await page.waitForFunction(n=>S.quelle.art==='ordner'&&S.quelle.name===n,PROJ);
    assert.equal(await page.locator('#pName').textContent(),PROJ);
    assert.ok(await page.locator('#start').evaluate(e=>e.classList.contains('weg')));
    assert.equal(await page.evaluate(()=>S.demo),false);
    assert.equal(await page.evaluate(()=>S.quelle.planPfad),'_Spektron/PlanKit');
    assert.ok((await page.evaluate(()=>window.__idb)).includes('mosaik-suite/kv/archiv'));
    assert.match(await page.locator('#pInfo').textContent(),/3 Geschosse · 20 Proben im Plan/);
    await page.waitForTimeout(3200);await shot('a1-projekt-offen');
    // 2) Browser will einen Klick → ein Knopf „Projekt … öffnen“, keine Fehlermeldung; erfragt wird nur „read“
    const p2=await ctx.newPage();p2.on('pageerror',e=>fehler.push(e.message));
    await p2.addInitScript(()=>{window.__modi=[];let ok=false;const q=FileSystemHandle.prototype.queryPermission,r=FileSystemHandle.prototype.requestPermission;
      FileSystemHandle.prototype.queryPermission=async function(o){window.__modi.push('q:'+(o&&o.mode));return ok?q.call(this,o):'prompt';};
      FileSystemHandle.prototype.requestPermission=async function(o){window.__modi.push('r:'+(o&&o.mode));ok=true;return r?r.call(this,o):'granted';};});
    await p2.goto(url+'#projekt='+encodeURIComponent(PROJ));
    await p2.locator('#sErlauben').waitFor();
    assert.equal(await p2.locator('#sErlauben').textContent(),`Projekt ${PROJ} öffnen`);
    assert.equal(await p2.locator('#meldung.auf').count(),0,'keine Fehlermeldung');
    await p2.waitForTimeout(300);await p2.screenshot({path:path.join(out,'a2-klick-noetig.png')});
    await p2.locator('#sErlauben').click();
    await p2.waitForFunction(n=>S.quelle.art==='ordner'&&S.quelle.name===n,PROJ);
    const modi=await p2.evaluate(()=>window.__modi);assert.ok(modi.length&&modi.every(m=>m.endsWith(':read')),'nur Leserecht: '+modi.join(','));
    await p2.close();
    // 3) Projekt ohne Plan → ein Satz und „PlanKit öffnen“
    await page.goto(url+'#projekt='+encodeURIComponent(LEER));
    await page.locator('#sText').filter({hasText:'noch keinen Plan'}).waitFor();
    const link=page.locator('#sKnoepfe a.btn');assert.equal(await link.textContent(),'PlanKit öffnen');
    assert.equal(new URL(await link.getAttribute('href'),url).hash,'#projekt='+encodeURIComponent(LEER));
    await shot('a3-ohne-plan');
    // 4) unbekanntes Projekt → klare Zeile, kein Absturz
    await page.goto(url+'#projekt='+encodeURIComponent('26.9999 Gibtsnicht'));
    await page.locator('#sText').filter({hasText:'keinen Ordner'}).waitFor();
    // 5) Es wurde nichts geschrieben: Dateien im Projekt unverändert
    const dateien=await page.evaluate(async P=>{const r=await navigator.storage.getDirectory(),a=await r.getDirectoryHandle('Mosaik Archivordner'),out=[];
      const lauf=async(d,pre)=>{for await(const [n,h] of d.entries()){out.push(pre+n);if(h.kind==='directory')await lauf(h,pre+n+'/');}};await lauf(a,'');return out.sort();},PROJ);
    assert.deepEqual(dateien,[LEER,PROJ,PROJ+'/_Spektron',PROJ+'/_Spektron/PlanKit',`${PROJ}/_Spektron/PlanKit/Probenplan ${PROJ} (vorher 2026-11-01 10-00-00-000 abc).probenplan`,`${PROJ}/_Spektron/PlanKit/Probenplan ${PROJ}.probenplan`,PROJ+'/_Spektron/_Projekt.json'].sort());
    console.log('A ok');
  }
  if(soll('b')){
    // Beispielgebäude: EG und 1. OG sind Skizzen → Glaswände, DG ist ein Bild → flach
    await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);await page.locator('#sBeispiel').click();
    const info=await page.evaluate(()=>S.geschosse.map(g=>({n:g.name,w:g.waende?g.waende.stuecke.length:0,b:g.waende?g.waende.brand.length:0,arten:g.skizze?[...new Set(g.skizze.stuecke.map(s=>s.art))].sort():[]})));
    assert.deepEqual(info.map(x=>x.n),['EG','1. OG','DG']);
    assert.ok(info[0].w>20&&info[1].w>20&&info[2].w===0,JSON.stringify(info));
    assert.deepEqual(info[0].arten,['fenster','tuer','wand']);assert.equal(info[0].b,1,'Küche = Brandraum');assert.equal(info[1].b,0);
    // gemeinsame Kanten nur einmal: Mittelwand x=600 im EG = eine Strecke (oben + unten) minus zwei Türen → 3 Wandstücke + 2 Türen
    const mitte=await page.evaluate(()=>S.geschosse[0].skizze.stuecke.filter(s=>s.x1===600&&s.x2===600).map(s=>s.art+':'+s.y1+'-'+s.y2));
    assert.deepEqual(mitte,['wand:40-150','tuer:150-240','wand:240-560','tuer:560-650','wand:650-760']);
    assert.ok(await page.locator('#waende').isVisible(),'Schalter „Wände“ sichtbar');
    assert.equal(await page.locator('#waende').getAttribute('aria-pressed'),'true');
    await page.waitForTimeout(4200);await shot('b1-beispiel-waende');
    // Geschwindigkeit: ein Bild mit Wänden zeichnen (Software-Canvas, wie über RDP)
    const ms=await page.evaluate(()=>{const t=performance.now();for(let i=0;i<20;i++)bild(performance.now());return (performance.now()-t)/20;});
    console.log('Bild mit Wänden: '+ms.toFixed(1)+' ms');
    // Probe hinter/vor einer Wand: auf eine Probe im EG zoomen
    await page.evaluate(()=>{S.dreh=false;const g=S.geschosse[0],m=g.marker.find(x=>x.label==='P1');waehle(m,g,true);});await page.waitForTimeout(1600);await shot('b2-probe-im-brandraum');
    await page.evaluate(()=>{karteZu();S.kam={yaw:-2.4,pitch:.38,zoom:1.5,tx:-1.5,ty:-1,tz:1.6};S.ziel=null;});await page.waitForTimeout(500);await shot('b3-flacher-blick');
    await page.locator('#waende').click();assert.equal(await page.locator('#waende').getAttribute('aria-pressed'),'false');await shot('b4-ohne-waende');
    await page.locator('#waende').click();
    // Plan ohne Skizze (nur Bild) → keine Wände, kein Schalter
    await page.evaluate(async()=>{const p=beispiel();for(const x of [p.plan,...p.sheets.map(s=>s.plan).filter(Boolean)])delete x.sketch;await projektLaden(p,'Ohne Skizze');});
    assert.equal(await page.evaluate(()=>S.geschosse.every(g=>!g.waende)),true);assert.equal(await page.locator('#waende').isVisible(),false);
    // Skizze passt nicht zur Plangröße → lieber flach
    assert.equal(await page.evaluate(()=>{const p=beispiel();p.plan.width=999;return skizzeLesen(p.plan);}),null);
    console.log('B ok');
  }
  assert.deepEqual(fehler,[]);
  await browser.close();server.close();console.log('OK',welche);
})().catch(e=>{console.error(e);process.exit(1);});

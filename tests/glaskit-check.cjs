// GlasKit – Prüfung im echten Browser mit erfundenen Daten (keine Kundendaten): node tests/glaskit-check.cjs [a|b|c|d|e|f|alle]
// Braucht Playwright (z. B. NODE_PATH auf ein node_modules mit „playwright“). Legt im privaten Dateisystem des Browsers (OPFS)
// einen Archivordner mit erfundenen Projekten an, merkt ihn wie die Projektzentrale in IndexedDB „mosaik-suite“ und öffnet
// GlasKit mit #projekt=… . Bildschirmfotos landen in tests/out/.
// e = Nachzeichnung (1.6.0, Vorlage tests/nachzeichnung-vorlage.json aus PlanKits eigenem Code), f = Skizzen-Pläne wie 1.5.0 (braucht 1.5.0 im Git).
// Mit PLANKIT=<Pfad zum PlanKit-Repo> prüft e zusätzlich die Nachzeichnung des Beispielgebäudes mit PlanKits validateTrace/traceSegments.
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
    // Beispielgebäude: EG ist eine Skizze, 1. OG ein Bildplan mit geprüfter Nachzeichnung (1.6.0) → Wände; DG ist ein Bild → flach
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
    // Plan ohne Skizze und ohne Nachzeichnung (nur Bild) → keine Wände, kein Schalter
    await page.evaluate(async()=>{const p=beispiel();for(const x of [p.plan,...p.sheets.map(s=>s.plan).filter(Boolean)]){delete x.sketch;delete x.trace;}await projektLaden(p,'Ohne Skizze');});
    assert.equal(await page.evaluate(()=>S.geschosse.every(g=>!g.waende)),true);assert.equal(await page.locator('#waende').isVisible(),false);
    // Skizze passt nicht zur Plangröße → lieber flach
    assert.equal(await page.evaluate(()=>{const p=beispiel();p.plan.width=999;return skizzeLesen(p.plan);}),null);
    console.log('B ok');
  }
  if(soll('c')){
    // Erfundene Fotos im Projekt: „Fotos/“ + FotoKit-Datei am neuen Ort „_Spektron/FotoKit“, LabelKit-Datei mit einem Bohrkern
    const t0=Date.now();
    await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);
    await page.evaluate(async PROJ=>{
      const r=await navigator.storage.getDirectory(),a=await r.getDirectoryHandle('Mosaik Archivordner'),pj=await a.getDirectoryHandle(PROJ),sp=await pj.getDirectoryHandle('_Spektron');
      const fo=await pj.getDirectoryHandle('Fotos',{create:true}),fk=await sp.getDirectoryHandle('FotoKit',{create:true}),lk=await sp.getDirectoryHandle('LabelKit',{create:true});
      const schreibe=async(d,n,t)=>{const w=await (await d.getFileHandle(n,{create:true})).createWritable();await w.write(t);await w.close();};
      const jpg=async(w,h,farbe,text)=>{const c=new OffscreenCanvas(w,h),g=c.getContext('2d');g.fillStyle=farbe;g.fillRect(0,0,w,h);g.fillStyle='#fff';g.font=`bold ${Math.round(h/7)}px sans-serif`;g.textAlign='center';g.fillText(text,w/2,h/2);
        g.beginPath();g.moveTo(w/2,h*.62);g.lineTo(w/2-h*.08,h*.8);g.lineTo(w/2+h*.08,h*.8);g.fill();g.fillText('OBEN',w/2,h*.16);return await c.convertToBlob({type:'image/jpeg',quality:.8});};
      await schreibe(fo,'IMG_0001.jpg',await jpg(1600,1000,'#8a3f10','P1 Decke'));
      await schreibe(fo,'IMG_0002.jpg',await jpg(1200,900,'#3f7cc0','P1+P3 gedreht'));
      await schreibe(fo,'IMG_0003.jpg',await jpg(800,600,'#555','aussortiert'));
      await schreibe(fo,'IMG_0004.HEIC',new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99,0,0,0,0]));
      await schreibe(fo,'IMG_0005.jpg',await jpg(8000,6000,'#2e7d32','48 MP'));
      await schreibe(fo,'IMG_0007.jpg',await jpg(1000,1000,'#6a1b9a','Bohrkern'));
      await schreibe(fk,'_Bildumbenenner.json',JSON.stringify({app:'Bildumbenenner',format:1,version:'2.3.1',projekt:{},benennung:{},reihenfolge:['IMG_0002.jpg','IMG_0001.jpg'],
        bilder:{'IMG_0001.jpg':{beschreibung:'Testfoto: Decke über dem Herd, deutlich verrußt',probe:'P1',abschnitt:'EG Küche'},
                'IMG_0002.jpg':{beschreibung:'Testfoto: Wand neben dem Fenster',probe:'p 1; P3',drehung:90,abschnitt:'küche'},
                'IMG_0003.jpg':{beschreibung:'aussortiert',probe:'P2',aussortiert:true,abschnitt:'Küche'},
                'IMG_0004.HEIC':{beschreibung:'iPhone-Foto',probe:'P3'},
                'IMG_0005.jpg':{beschreibung:'Großes Foto',probe:'P5',abschnitt:'Flur'},
                'IMG_0006.jpg':{beschreibung:'Datei gibt es nicht',probe:'P9'},
                'IMG_0007.jpg':{beschreibung:'Bohrkern-Foto',probe:'EG-WZ-B-7',abschnitt:'Kellerraum'},
                'IMG_0008.jpg':{beschreibung:'ohne Probe',abschnitt:'1. OG  Büro'}}}));
      await schreibe(lk,'26.0560_Daten.json',JSON.stringify({projekt:{nr:'26.0560'},sonstigeProben:[{matrix:'Bohrkern',bkId:'EG-WZ-B-7-T1',_nr:10}]}));
    },PROJ);
    console.log('Testfotos angelegt in '+(Date.now()-t0)+' ms');
    await page.goto(url+'#projekt='+encodeURIComponent(PROJ));
    await page.waitForFunction(()=>S.quelle.art==='ordner'&&S.fotos&&S.fotos.status==='ok');
    const karte=await page.evaluate(()=>Object.fromEntries([...S.fotos.map].map(([k,v])=>[k,v.map(f=>f.name)])));
    assert.deepEqual(karte,{P1:['IMG_0002.jpg','IMG_0001.jpg'],P3:['IMG_0002.jpg','IMG_0004.HEIC'],P5:['IMG_0005.jpg'],P9:['IMG_0006.jpg'],P10:['IMG_0007.jpg']},'aussortiert/ohne Probe fehlen, Reihenfolge wie FotoKit, Bohrkern → P10');
    const waehle=async l=>{await page.evaluate(l=>{S.dreh=false;const g=S.geschosse.find(g=>g.marker.some(m=>m.label===l)),m=g.marker.find(m=>m.label===l);waehle(m,g,true);},l);};
    // P1: zwei Fotos, das erste (IMG_0002) um 90° gedreht → hochkant
    await waehle('P1');await page.locator('#kFotos .gross img').waitFor();
    assert.match(await page.locator('#kFotos .titel').textContent(),/Fotos aus FotoKit \(2\)/);
    assert.equal(await page.locator('#kFotos .unter').textContent(),'Testfoto: Wand neben dem Fenster');
    const d=await page.locator('#kFotos .gross img').evaluate(i=>[i.naturalWidth,i.naturalHeight]);assert.ok(d[1]>d[0],'gedreht → hochkant '+d);
    assert.equal(await page.locator('#kFotos .streifen button').count(),2);
    await page.waitForTimeout(1500);await shot('c1-karte-mit-fotos');
    await page.locator('#kFotos .streifen button').nth(1).click();await page.locator('#kFotos .gross img').waitFor();
    assert.equal(await page.locator('#kFotos .unter').textContent(),'Testfoto: Decke über dem Herd, deutlich verrußt');
    await page.locator('#kFotos .gross').click();await page.locator('#licht.auf img').waitFor();
    assert.match(await page.locator('#lichtText').textContent(),/Decke über dem Herd[\s\S]*Probe P1 · IMG_0001\.jpg · 2 \/ 2/);
    await shot('c2-grossansicht');
    await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>/1 \/ 2/.test(document.getElementById('lichtText').textContent));
    await page.keyboard.press('Escape');assert.equal(await page.locator('#licht.auf').count(),0);assert.ok(await page.locator('#karte.auf').count(),'Karte bleibt');
    // P3: HEIC → ruhiger Hinweis statt kaputtem Bild
    await waehle('P3');await page.locator('#kFotos .streifen button').nth(1).click();
    await page.locator('#kFotos .gross .fotohinweis').filter({hasText:'HEIC'}).waitFor();assert.equal(await page.locator('#kFotos img[src=""]').count(),0);
    await shot('c3-heic-hinweis');
    // P5: 48 MP → verkleinert
    const t1=Date.now();await waehle('P5');await page.locator('#kFotos .gross img').waitFor({timeout:60000});
    const g5=await page.locator('#kFotos .gross img').evaluate(i=>[i.naturalWidth,i.naturalHeight]);assert.ok(Math.max(...g5)<=720,'verkleinert '+g5);
    console.log(`48-MP-Foto in der Karte nach ${Date.now()-t1} ms, ${g5.join('×')} px`);
    // P9: Datei fehlt · P10: Bohrkern · P2: aussortiert → keine Fotos · Kamera-Zeichen nur bei Proben mit Fotos
    await waehle('P9');await page.locator('#kFotos .fotohinweis').filter({hasText:'Datei fehlt'}).waitFor();
    await waehle('P10');await page.locator('#kFotos .gross img').waitFor();assert.match(await page.locator('#kFotos .datei').textContent(),/Probe-Nr\. in FotoKit: EG-WZ-B-7/);
    await waehle('P2');assert.equal(await page.locator('#kFotos .leise').textContent(),'Kein Foto mit dieser Probe-Nr. in FotoKit.');
    assert.deepEqual(await page.evaluate(()=>S.geschosse.flatMap(g=>g.marker).filter(m=>m.kind==='sample'&&fotosVon(m).length).map(m=>m.label).sort()),['P1','P10','P3','P5','P9']);
    // Rundgang: Foto kommt mit der Karte
    await page.evaluate(()=>{karteZu();tourStart();});await page.locator('#kFotos .gross img').waitFor();
    assert.equal(await page.locator('#kTitel').textContent(),'Probe P1');await page.waitForTimeout(1800);await shot('c4-rundgang-mit-foto');
    await page.evaluate(()=>tourEnde());
    // einzelne Plan-Datei: Hinweis in der Karte
    await page.evaluate(async()=>{await dateiLesen(new File([JSON.stringify(beispiel())],'Probenplan Test.probenplan'));});
    await waehle('P1');assert.match(await page.locator('#kFotos .leise').textContent(),/wenn das Projekt als Ordner geöffnet ist/);
    await shot('c5-nur-datei');
    // nichts geschrieben: FotoKit-Datei unverändert, keine neuen Dateien in „Fotos“
    const stand=await page.evaluate(async PROJ=>{const r=await navigator.storage.getDirectory(),pj=await (await r.getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(PROJ);const n=[];for await(const [x] of (await pj.getDirectoryHandle('Fotos')).entries())n.push(x);return n.sort();},PROJ);
    assert.deepEqual(stand,['IMG_0001.jpg','IMG_0002.jpg','IMG_0003.jpg','IMG_0004.HEIC','IMG_0005.jpg','IMG_0007.jpg']);
    // --- 1.5.0: Fotowände (Raum / Abschnitt = Raumname der Skizze) und Wischfelder ---
    await page.goto(url+'#projekt='+encodeURIComponent(PROJ));await page.reload();
    await page.waitForFunction(n=>S.quelle.art==='ordner'&&S.quelle.name===n&&S.fotos&&S.fotos.status==='ok',PROJ);
    const fw=await page.evaluate(()=>({fw:S.fotoWand,an:S.fotoAn,knopf:getComputedStyle(document.getElementById('fotoW')).display,
      wo:S.geschosse.map(g=>g.fotoW.map(p=>p.raum+':'+p.f.name).sort())}));
    assert.deepEqual(fw.fw,{fotos:4,ohne:1},'zugeordnet: Küche 2 (auch klein geschrieben), Flur 1, „1. OG  Büro“ 1; „Kellerraum“ ohne Raum; aussortiert zählt nicht');
    assert.deepEqual(fw.wo,[['Flur:IMG_0005.jpg','Küche:IMG_0001.jpg','Küche:IMG_0002.jpg'],['Büro:IMG_0008.jpg'],[]]);
    assert.equal(fw.an,false,'echtes Projekt: Fotowände erst nach Klick');assert.notEqual(fw.knopf,'none');
    await page.locator('#dreh').click();await page.locator('#fotoW').click();
    await page.waitForFunction(()=>S.geschosse[0].fotoW.every(p=>p.f._w&&p.f._w!=='lädt')&&S.geschosse[1].fotoW.every(p=>p.f._w&&p.f._w!=='lädt'),null,{timeout:60000});
    const geladen=await page.evaluate(()=>S.geschosse.flatMap(g=>g.fotoW.map(p=>p.f.name+'='+(p.f._w instanceof HTMLImageElement?'bild':p.f._w))).sort());
    assert.deepEqual(geladen,['IMG_0001.jpg=bild','IMG_0002.jpg=bild','IMG_0005.jpg=bild','IMG_0008.jpg=fehler'],'fehlende Datei bleibt ein leeres Feld');
    await page.waitForTimeout(6500);
    const feld=await page.evaluate(()=>({treffer:S.treffer.length,tafeln:S.fotoTreffer.length,brand:BRAENDE.length,felder:S.geschosse.flatMap(g=>g.marker).filter(m=>m.kind==='sample'&&feldGeo(m,S.geschosse.find(x=>x.marker.includes(m)),0)).length}));
    assert.equal(feld.treffer,20,'alle Proben anklickbar');assert.equal(feld.felder,20,'im Beispielplan haben alle Proben eine Oberflächenart → Wischfeld');assert.ok(feld.tafeln>0,'Fototafeln sichtbar');assert.equal(feld.brand,1);
    await shot('e1-fotowaende-felder');
    await page.locator('#glas').click();await shot('e2-fotowaende-glas');await page.locator('#modell').click();
    console.log('C ok');
  }
  if(soll('d')){
    // Darstellung: Modell (Standard) · Glas · Papier – je eine Prüfung, Bildschirmfotos aller drei, dazu eine gewählte Probe im Modell
    await page.goto(url);await page.evaluate(()=>{try{localStorage.removeItem('glaskit-stil');}catch{}});
    const laden=async()=>{await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);await page.locator('#sBeispiel').click();
      await page.evaluate(()=>{S.dreh=false;});await page.waitForTimeout(5200);};
    const zustand=()=>page.evaluate(()=>({stil:S.stil,glas:S.glas,klasse:document.body.classList.contains('modell'),
      gedrueckt:['modell','glas','papier'].filter(s=>document.getElementById(s).getAttribute('aria-pressed')==='true'),
      seite:getComputedStyle(document.getElementById('seite')).backgroundColor,fuss:getComputedStyle(document.getElementById('fuss')).backgroundColor,
      ecke:[...cx.getImageData(Math.round(6*dpr),Math.round(6*dpr),1,1).data].slice(0,3),H:H(),gemerkt:localStorage.getItem('glaskit-stil')}));
    const hell=c=>(c[0]+c[1]+c[2])/3,rgb=t=>t.match(/[\d.]+/g).slice(0,3).map(Number);
    // „Bild speichern“: Fußzeile im Stil des Bildes und lesbar (Abstand Schrift ↔ Hintergrund)
    const fusszeile=async()=>{const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#bild').click()]);const b64=fs.readFileSync(await dl.path()).toString('base64');
      return page.evaluate(async b64=>{const i=new Image();i.src='data:image/png;base64,'+b64;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);
        const f=13*dpr,y0=Math.round(i.height-f*1.6),hoehe=Math.round(f),d=g.getImageData(Math.round(f),y0,Math.round(f*30),hoehe).data;let min=255,max=0;
        for(let k=0;k<d.length;k+=4){const l=(d[k]+d[k+1]+d[k+2])/3;min=Math.min(min,l);max=Math.max(max,l);}
        const h=g.getImageData(i.width-4,i.height-4,1,1).data;return {grund:(h[0]+h[1]+h[2])/3,min,max};},b64);};
    // 1) Modell ist Standard (nichts gemerkt)
    await laden();let z=await zustand();
    assert.equal(z.stil,'modell');assert.equal(z.glas,false);assert.ok(z.klasse);assert.deepEqual(z.gedrueckt,['modell']);assert.equal(z.gemerkt,null,'ohne Klick nichts gemerkt');
    assert.ok(hell(rgb(z.seite))>240&&hell(rgb(z.fuss))>240,'Seitenfeld/Fußleiste hell: '+z.seite);assert.ok(hell(z.ecke)>225,'Bühne hell: '+z.ecke);
    assert.ok(Math.abs(z.H-3.1*1.35)<1e-9,'Geschossabstand 1,35 × Glas');
    const m1=await page.evaluate(()=>{const vor=SCHATTEN.gebaut;for(let i=0;i<30;i++)bild(performance.now());
      return {vor,nach:SCHATTEN.gebaut,proben:KOEPFE.map(k=>k.m.label).sort(),verdeckt:KOEPFE.filter(k=>k.verdeckt).length,waende:S.geschosse.map(g=>!!g.waende)};});
    assert.equal(m1.nach,m1.vor,'Schatten werden nicht in jedem Bild neu weichgezeichnet');assert.ok(m1.vor<=6,'je Geschoss höchstens zwei Schattenvorlagen');
    assert.equal(m1.proben.length,20,'jede Probe gezeichnet (sichtbar oder als Umriss)');assert.ok(m1.verdeckt>0&&m1.verdeckt<20,'verdeckte Proben als Umriss: '+m1.verdeckt);
    assert.deepEqual(m1.waende,[true,true,false],'DG (Bild ohne Skizze) bleibt flache weiße Platte');
    const ms=await page.evaluate(()=>{const f=()=>{bild(performance.now());cx.getImageData(0,0,1,1);};f();const t=performance.now();for(let i=0;i<20;i++)f();return (performance.now()-t)/20;});
    console.log('Bild im Modell (mit Rastern): '+ms.toFixed(1)+' ms');
    await shot('d1-modell');
    let fz=await fusszeile();assert.ok(fz.grund>230&&fz.grund-fz.min>120,'Fußzeile Modell hell, Schrift dunkel: '+JSON.stringify(fz));
    // 2) gewählte Probe im Modell: Geschosse darüber (Platte, Seiten, Wände) blassen aus, die Probe selbst ist zu sehen (kein Umriss, Pixel in ihrer Farbe)
    await page.evaluate(()=>{const g=S.geschosse[0],m=g.marker.find(x=>x.label==='P1');waehle(m,g,true);});await page.waitForTimeout(2200);
    const w=await page.evaluate(()=>{const k=KOEPFE.find(k=>k.m.label==='P1'),p=cx.getImageData(Math.round(k.x*dpr),Math.round(k.y*dpr),1,1).data,n=parseInt(k.m.b.farbe.slice(1),16);
      return {deck:S.geschosse.map(g=>+g.deck.toFixed(2)),verdeckt:!!k.verdeckt,pixel:[p[0],p[1],p[2]],soll:[n>>16,n>>8&255,n&255]};});
    assert.deepEqual(w.deck.map(d=>d<.2),[false,true,true],'Geschosse über der Probe ausgeblendet: '+w.deck);assert.equal(w.verdeckt,false,'P1 nicht verdeckt');
    assert.ok(w.pixel.every((v,i)=>Math.abs(v-w.soll[i])<40),`P1 in ihrer Farbe zu sehen: ${w.pixel} statt ${w.soll}`);
    await shot('d4-modell-probe');
    await page.evaluate(()=>{karteZu();fliege(ganz(),.01);});
    // 3) Glas: wie bisher, Wahl gemerkt
    await page.locator('#glas').click();await page.evaluate(()=>fliege(ganz(),.01));await page.waitForTimeout(600);z=await zustand();
    assert.equal(z.stil,'glas');assert.equal(z.glas,true);assert.equal(z.klasse,false);assert.deepEqual(z.gedrueckt,['glas']);assert.equal(z.gemerkt,'glas');
    assert.ok(hell(rgb(z.seite))<60&&hell(z.ecke)<60,'Glas bleibt dunkel');assert.ok(Math.abs(z.H-3.1)<1e-9);
    await shot('d2-glas');
    fz=await fusszeile();assert.ok(fz.grund<60&&fz.max-fz.grund>120,'Fußzeile Glas dunkel, Schrift hell: '+JSON.stringify(fz));
    await laden();assert.equal((await zustand()).stil,'glas','nach Neuladen weiter Glas');
    // 4) Papier
    await page.locator('#papier').click();await page.waitForTimeout(400);z=await zustand();
    assert.equal(z.stil,'papier');assert.equal(z.glas,false);assert.equal(z.klasse,false);assert.deepEqual(z.gedrueckt,['papier']);assert.equal(z.gemerkt,'papier');assert.ok(hell(z.ecke)<60);
    await shot('d3-papier');
    await page.locator('#modell').click();assert.equal((await zustand()).gemerkt,'modell');
    // 5) gesperrter Speicher: Seite läuft trotzdem (Modell), Umschalten geht, kein Fehler
    const p3=await ctx.newPage();p3.on('pageerror',e=>fehler.push(e.message));
    await p3.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('gesperrt','SecurityError');}});});
    await p3.goto(url);await p3.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);
    assert.equal(await p3.evaluate(()=>S.stil),'modell');await p3.locator('#sBeispiel').click();await p3.locator('#glas').click();assert.equal(await p3.evaluate(()=>S.stil),'glas');
    await p3.close();
    console.log('D ok');
  }
  if(soll('e')){
    // --- 1.6.0: Nachzeichnung (plan.trace) – Vorlage aus PlanKits eigenem Code (tests/nachzeichnung-vorlage.mjs, PlanKit-Version steht darin) ---
    const V=JSON.parse(fs.readFileSync(path.join(__dirname,'nachzeichnung-vorlage.json'),'utf8'));
    console.log(`Vorlage aus PlanKit ${V.plankit.version} (${V.plankit.commit})`);
    await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);
    // 1) Testprojekt, je Variante ein Geschoss (gerade · gedreht · gedreht+zugeschnitten · fein ausgerichtet · kalibriert). Der Bildplan wird hier gezeichnet:
    //    PlanKits Wandliste über die Umkehrung von PlanKits planMatrix ins ORIGINAL (also so schief/gedreht, wie ein echtes Original wäre), Türen/Fenster als Lücken.
    //    GlasKit zeichnet das Original wie immer über seine eigene Vorbereitung – liegen seine Wände danach auf den dunklen Linien, passt alles zusammen.
    const r1=await page.evaluate(async V=>{
      const inv=m=>{const d=m[0]*m[3]-m[1]*m[2];return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];},ap=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
      const bildplan=v=>{const c=document.createElement('canvas');c.width=v.quelle.width;c.height=v.quelle.height;const g=c.getContext('2d'),mi=inv(v.matrix);g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
        const strich=(a,b)=>{const p=ap(mi,a),q=ap(mi,b);g.beginPath();g.moveTo(p.x,p.y);g.lineTo(q.x,q.y);g.stroke();};
        g.strokeStyle='#111';g.lineWidth=8;g.lineCap='square';for(const s of v.segmente)strich({x:s.x1,y:s.y1},{x:s.x2,y:s.y2});
        g.strokeStyle='#fff';g.lineWidth=14;g.lineCap='butt';for(const o of v.plan.trace.openings){const r=o.a*Math.PI/180,dx=Math.cos(r)*o.w/2,dy=Math.sin(r)*o.w/2;strich({x:o.x-dx,y:o.y-dy},{x:o.x+dx,y:o.y+dy});}
        return c.toDataURL('image/png');};
      const sheets=V.varianten.map((v,i)=>({id:'s'+i,name:v.name,plan:{...v.plan,data:bildplan(v)},markers:v.markers}));
      await projektLaden({format:'probenplan',version:7,plan:sheets[0].plan,markers:sheets[0].markers,nextSample:9,nextFire:1,report:'',date:'2026-11-13',active:0,sheets:sheets.map((s,i)=>i?s:{id:s.id,name:s.name})},'Testprojekt Nachzeichnung');
      document.getElementById('start').classList.add('weg');
      const abst=(p,s)=>{const dx=s.x2-s.x1,dy=s.y2-s.y1,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-s.x1)*dx+(p.y-s.y1)*dy)/l2));return Math.hypot(p.x-s.x1-t*dx,p.y-s.y1-t*dy);};
      const punkte=(s,n)=>Array.from({length:n},(_,i)=>{const t=.02+.96*i/(n-1);return {x:s.x1+(s.x2-s.x1)*t,y:s.y1+(s.y2-s.y1)*t};});
      const gemeinsam=(A,B)=>{const e=.01;if(Math.abs(A.y+A.h-B.y)<e||Math.abs(B.y+B.h-A.y)<e){const y=Math.abs(A.y+A.h-B.y)<e?B.y:A.y;return {x1:Math.max(A.x,B.x),y1:y,x2:Math.min(A.x+A.w,B.x+B.w),y2:y};}
        const x=Math.abs(A.x+A.w-B.x)<e?B.x:A.x;return {x1:x,y1:Math.max(A.y,B.y),x2:x,y2:Math.min(A.y+A.h,B.y+B.h)};};
      return V.varianten.map((v,i)=>{const g=S.geschosse[i],st=g.skizze?g.skizze.stuecke:[],k=g.papier.width/g.plan.width,ctx=g.papier.getContext('2d');
        const hell=p=>{const d=ctx.getImageData(Math.round(p.x*k)-1,Math.round(p.y*k)-1,3,3).data;let m=255;for(let j=0;j<d.length;j+=4)m=Math.min(m,(d[j]+d[j+1]+d[j+2])/3);return m;};
        const mitte=s=>({x:(s.x1+s.x2)/2,y:(s.y1+s.y2)/2}),R=Object.fromEntries(v.plan.trace.rooms.map(r=>[r.id,r]));
        const kanteV=gemeinsam(R.wo,R.wo2),kanteB=gemeinsam(R.b1,R.b2),welt2plan=c=>({x:(c[0]/g.pw+.5)*g.plan.width,y:(c[1]/g.ph+.5)*g.plan.height});
        const felder=Object.fromEntries(g.marker.map(m=>{const G=feldGeo(m,g,0),soll=v.naechste[m.label];if(!G)return [m.label,'kein Feld'];
          if(!soll)return [m.label,G.wand?'an einer Wand, soll frei stehen':G.stiel?'ok':'frei ohne Stiel'];
          if(!G.wand)return [m.label,'frei, soll an der Wand stehen'];
          const c=welt2plan(G.c),d=abst(c,soll),dx=soll.x2-soll.x1,dy=soll.y2-soll.y1,seite=p=>Math.sign(dx*(p.y-soll.y1)-dy*(p.x-soll.x1));
          const quer=Math.abs(G.u[0]*dy-G.u[1]*dx)/Math.hypot(G.u[0],G.u[1])/Math.hypot(dx,dy);
          return [m.label,d<=.06*g.plan.width/g.pw&&seite(m)!==0&&seite(c)===seite(m)&&quer<1e-6?'ok':`falsch: Abstand ${d.toFixed(2)}, Seite ${seite(c)}/${seite(m)}, quer ${quer}`];}));
        return {name:v.name,hinweis:g.hinweis,art:g.skizze&&g.skizze.art,waende:!!g.waende,arten:[...new Set(st.map(s=>s.art))].sort(),
          fehltGK:v.segmente.flatMap(s=>punkte(s,24).filter(p=>!st.some(w=>abst(p,w)<=.05))).length,       // PlanKit-Wand ohne GlasKit-Wand
          fehltPK:st.flatMap(s=>punkte(s,8).filter(p=>!v.segmente.some(w=>abst(p,w)<=.05))).length,          // GlasKit-Wand, die PlanKit nicht hat
          dunkelMax:Math.max(...st.filter(s=>s.art==='wand').map(s=>hell(mitte(s)))),offenMin:Math.min(...st.filter(s=>s.art!=='wand').map(s=>hell(mitte(s)))),
          aufVerbunden:st.filter(s=>punkte(kanteV,10).some(p=>abst(p,s)<1)).length,aufBuero:punkte(kanteB,10).filter(p=>!st.some(s=>abst(p,s)<=.05)).length,felder,
          raeume:g.skizze.raeume.map(r=>r.name+'/'+r.teile.length+'/'+r.umriss.length).sort(),brand:g.waende.brand.map(b=>b.teile.length),brandStuecke:st.filter(s=>s.brand).length,mpu:g.mpu};});
    },V);
    for(const r of r1){const t=r.name+': ';
      assert.equal(r.hinweis,'',t+'kein Hinweis');assert.equal(r.art,'nachzeichnung',t);assert.ok(r.waende,t+'Wände');assert.deepEqual(r.arten,['fenster','tuer','wand'],t);
      assert.equal(r.fehltGK,0,t+'jede Wand aus PlanKits Wandliste steht');assert.equal(r.fehltPK,0,t+'keine Wand, die PlanKit nicht hat');
      assert.ok(r.dunkelMax<100,t+'jedes Wandstück liegt auf einer Wandlinie des Bildplans: '+r.dunkelMax);assert.ok(r.offenMin>200,t+'Türen/Fenster liegen auf den Lücken: '+r.offenMin);
      assert.equal(r.aufVerbunden,0,t+'verbundene Kante ist keine Wand');assert.equal(r.aufBuero,0,t+'gleichnamige, nicht verbundene Räume behalten ihre Wand');
      assert.deepEqual(r.raeume,['Büro/1/4','Büro/1/4','Küche/1/4','Wohnen/2/6'],t+'Räume nur über joins zusammengelegt');assert.deepEqual(r.brand,[1],t);assert.ok(r.brandStuecke>0,t);
      for(const [l,f] of Object.entries(r.felder))assert.equal(f,'ok',t+l);}
    assert.deepEqual(r1.map(r=>r.mpu),[null,null,null,null,.01],'nur die letzte Variante ist kalibriert');
    assert.equal(await page.locator('#waende').isVisible(),true);
    console.log('Nachzeichnung: 5 Varianten – Wände wie PlanKit, auf den Linien des Bildplans, Felder an der richtigen Wand und Seite');
    await page.evaluate(()=>{S.dreh=false;S.kam={yaw:-.62,pitch:.5,zoom:.62,tx:0,ty:0,tz:mitteZ()};S.ziel=null;});await page.waitForTimeout(4500);await shot('f1-testprojekt-nachzeichnung');
    // 2) Fotowände auf einer Nachzeichnung: verbundener Raum = ein Raum, Fotos rundum am Außenumriss; gleichnamige Räume → nicht raten
    const r2=await page.evaluate(()=>{
      const foto=t=>{const c=document.createElement('canvas');c.width=160;c.height=120;const x=c.getContext('2d');x.fillStyle='#567';x.fillRect(0,0,160,120);x.fillStyle='#fff';x.font='16px sans-serif';x.fillText(t,8,60);return c;};
      const liste=(n,raum)=>Array.from({length:n},(_,i)=>({name:`T_${raum}_${i+1}.jpg`,text:raum,abschnitt:raum,probe:'',drehung:0,canvas:foto(raum+' '+(i+1))}));
      S.fotos={status:'ok',map:new Map(),raum:new Map([['gerade wohnen',liste(6,'Wohnen')],['gerade büro',liste(2,'Büro')],['gerade küche',liste(3,'Küche')],['zugeschnitten wohnen',liste(4,'Wohnen')]]),dir:null,pfad:'',fehler:'',anzahl:0};
      fotoWaendeBauen();
      const abst=(p,s)=>{const dx=s.x2-s.x1,dy=s.y2-s.y1,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-s.x1)*dx+(p.y-s.y1)*dy)/l2));return Math.hypot(p.x-s.x1-t*dx,p.y-s.y1-t*dy);};
      const pruefe=i=>{const g=S.geschosse[i],r=g.skizze.raeume.find(x=>x.name==='Wohnen'),plan=(x,y)=>({x:(x/g.pw+.5)*g.plan.width,y:(y/g.ph+.5)*g.plan.height}),f=g.plan.width/g.pw;
        const R=Object.fromEntries(g.plan.trace.rooms.map(x=>[x.id,x])),A=R.wo,B=R.wo2;
        const innen=p=>r.teile.some(t=>p.x>=t.x&&p.x<=t.x+t.w&&p.y>=t.y&&p.y<=t.y+t.h)&&r.umriss.every(s=>abst(p,s)>.01*f);   // in der Vereinigung, nicht auf dem Umriss
        const tafeln=g.fotoW.filter(p=>p.raum==='Wohnen');
        return {n:tafeln.length,amUmriss:tafeln.every(p=>r.umriss.some(s=>abst(plan(p.x,p.y),s)<=.06*f)),innen:tafeln.every(p=>innen(plan(p.mx,p.my))&&innen(plan(p.x,p.y))),
          // die verbundene Kante gehört nicht zum Umriss
          umrissOhneKante:!r.umriss.some(s=>{const e=.01,mid={x:(s.x1+s.x2)/2,y:(s.y1+s.y2)/2};return (Math.abs(mid.y-B.y)<e&&mid.x>B.x&&mid.x<B.x+B.w&&Math.abs(A.y+A.h-B.y)<e)||(Math.abs(mid.x-B.x)<e&&mid.y>B.y&&mid.y<B.y+B.h&&Math.abs(A.x+A.w-B.x)<e);}),
          buero:g.fotoW.filter(p=>p.raum==='Büro').length,kueche:g.fotoW.filter(p=>p.raum==='Küche').length};};
      return {fw:S.fotoWand,gerade:pruefe(0),zugeschnitten:pruefe(2),knopf:getComputedStyle(document.getElementById('fotoW')).display};});
    assert.deepEqual(r2.fw,{fotos:13,ohne:2},'Wohnen 6 + 4, Küche 3; „Büro“ zweimal im Geschoss → nicht raten');
    for(const k of ['gerade','zugeschnitten']){const x=r2[k];assert.ok(x.amUmriss&&x.innen&&x.umrissOhneKante,k+': '+JSON.stringify(x));}
    assert.equal(r2.gerade.n,6);assert.equal(r2.zugeschnitten.n,4);assert.equal(r2.gerade.buero,0);assert.equal(r2.gerade.kueche,3);assert.notEqual(r2.knopf,'none');
    await page.evaluate(()=>{S.fotoAn=true;S.geschosse.forEach((g,i)=>{g.sichtbar=i===0;});S.kam={yaw:-.9,pitch:.62,zoom:1.25,tx:0,ty:0,tz:H()*.3};S.ziel=null;});await page.waitForTimeout(800);await shot('f2-fotowaende-verbundener-raum');
    // 3) Abwandlungen: Wände nur, wenn PlanKit die Nachzeichnung annähme UND sie geprüft ist
    const r3=await page.evaluate(V=>{const basis=Object.fromEntries(V.abwandlungen.filter(a=>a.trace).map(a=>[a.name,a]));
      const aus=V.abwandlungen.map(a=>{const tr=a.trace||{...basis[a.basis].trace,walls:[...basis[a.basis].trace.walls,a.dazuWand]},r=nachzeichnungLesen({width:a.width,height:a.height,trace:tr});
        return {name:a.name,plankit:a.plankit,glaskit:r.skizze?'Wände':r.hinweis};});
      const g=V.varianten[0].plan,beides=nachzeichnungLesen({...g,sketch:{width:g.width,height:g.height,rooms:[],walls:[],openings:[],texts:[]}});
      return {aus,beides:beides.hinweis,keine:nachzeichnungLesen({width:10,height:10})};},V);
    const soll={'ungeprüft':'Nachzeichnung noch nicht geprüft – in PlanKit bestätigen','Kette':'Nachzeichnung ist ungültig – bleibt flach','Selbstbezug':'Nachzeichnung ist ungültig – bleibt flach',
      'außerhalb':'Nachzeichnung liegt nicht ganz im Plan – bleibt flach','Wand außerhalb':'Nachzeichnung liegt nicht ganz im Plan – bleibt flach','Obergrenze':'Wände','1001 Wände':'Nachzeichnung ist ungültig – bleibt flach'};
    for(const a of r3.aus){assert.equal(a.glaskit,soll[a.name],a.name);assert.equal(a.glaskit==='Wände',a.plankit==='gültig'&&a.name!=='ungeprüft',a.name+': GlasKit und PlanKit einig');}
    assert.equal(r3.beides,'Skizze und Nachzeichnung zugleich – bleibt flach');assert.equal(r3.keine,null);
    // 4) Ungeprüft im Projekt: flache Platte, eine ruhige Zeile, kein Schalter „Wände“
    await page.evaluate(async V=>{const v=V.varianten[0],tr={...v.plan.trace};delete tr.checked;const c=document.createElement('canvas');c.width=16;c.height=10;
      await projektLaden({format:'probenplan',version:7,plan:{...v.plan,trace:tr,data:c.toDataURL()},markers:v.markers,nextSample:9,nextFire:1,report:'',date:''},'Ungeprüft');},V);
    assert.deepEqual(await page.evaluate(()=>S.geschosse.map(g=>[!!g.waende,g.hinweis])),[[false,'Nachzeichnung noch nicht geprüft – in PlanKit bestätigen']]);
    assert.deepEqual(await page.locator('#geschosse .nz-hinweis').allTextContents(),['Nachzeichnung noch nicht geprüft – in PlanKit bestätigen']);
    assert.equal(await page.locator('#waende').isVisible(),false);
    assert.equal(await page.evaluate(()=>S.geschosse[0].marker.filter(m=>feldGeo(m,S.geschosse[0],0).wand).length),0,'ungeprüft: kein Feld an einer Wand');
    await page.waitForTimeout(3000);await shot('f3-ungeprueft-flach');
    // 5) Obergrenze: 200 Räume, 1 000 Wände, 400 Türen/Fenster – Zeit für ein Bild (Software-Canvas wie über RDP)
    const zeit=await page.evaluate(async V=>{const a=V.abwandlungen.find(x=>x.name==='Obergrenze'),c=document.createElement('canvas');c.width=400;c.height=200;
      await projektLaden({format:'probenplan',version:7,plan:{name:'gross',width:a.width,height:a.height,data:c.toDataURL(),vector:false,trace:a.trace},markers:[],nextSample:1,nextFire:1,report:'',date:''},'Obergrenze');
      S.t0=-1e6;const g=S.geschosse[0],ms={};for(const stil of ['modell','glas']){stilSetzen(stil,false);bild(performance.now());const t=performance.now();for(let i=0;i<10;i++){bild(performance.now());cx.getImageData(0,0,1,1);}ms[stil]=(performance.now()-t)/10;}
      stilSetzen('modell',false);return {ms,stuecke:g.waende.stuecke.length,roh:g.skizze.stuecke.length};},V);
    console.log(`Obergrenze (1 000 Wände): ${zeit.roh} Wandstücke, ${zeit.stuecke} Teilstücke · Bild im Modell ${zeit.ms.modell.toFixed(1)} ms, Glas ${zeit.ms.glas.toFixed(1)} ms`);
    assert.ok(zeit.roh>=1000);
    // 6) Beispielgebäude: 1. OG = Bildplan (PNG) mit geprüfter Nachzeichnung; L-förmiger Flur aus zwei verbundenen Rechtecken
    await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);await page.locator('#sBeispiel').click();
    const r6=await page.evaluate(()=>{const g=S.geschosse[1],sk=g.skizze,flur=sk.raeume.find(r=>r.name==='Flur OG'),X=x=>60+x*1.15,Y=y=>40+y*1.15;
      const aufKante=sk.stuecke.filter(s=>Math.abs(s.x1-X(400))<.5&&Math.abs(s.x2-X(400))<.5&&Math.min(s.y1,s.y2)<Y(560)-1&&Math.max(s.y1,s.y2)>Y(400)+1).length;
      const plan=c=>({x:(c[0]/g.pw+.5)*g.plan.width,y:(c[1]/g.ph+.5)*g.plan.height}),G=l=>{const G=feldGeo(g.marker.find(m=>m.label===l),g,0);return G.wand?plan(G.c):null;};
      // Modell: der Bildplan liegt auch mit Wänden auf der Platte (drawImage mit dem Planbild des 1. OG)
      stilSetzen('modell',false);const bilder=[],d=cx.drawImage;cx.drawImage=function(b,...r){bilder.push(b);return d.call(this,b,...r);};try{S.t0=-1e6;bild(performance.now());}finally{cx.drawImage=d;}
      return {namen:S.geschosse.map(g=>g.name+':'+(g.skizze?g.skizze.art||'skizze':'-')),png:!g.plan.vector&&/^data:image\/png;base64,/.test(g.plan.data),geprueft:sk.geprueft,
        flur:flur.teile.length+'/'+flur.umriss.length,aufKante,p15:G('P15'),p16:G('P16'),fotosFlur:g.fotoW.filter(p=>p.raum==='Flur OG').length,planAufPlatte:bilder.includes(g.papier)&&g.waende.stuecke.length>0,
        kanten:{x400:X(400),y400:Y(400),x1160:X(1160)},versatz:.06*g.plan.width/g.pw};});   // Feld steht 0,04 Welteinheiten vor der Wand
    assert.deepEqual(r6.namen,['EG:skizze','1. OG:nachzeichnung','DG:-'],'Skizze, Nachzeichnung und reines Bild nebeneinander');
    assert.ok(r6.png);assert.deepEqual(r6.geprueft,{date:'2026-11-12',by:'Bsp'});assert.equal(r6.flur,'2/6');assert.equal(r6.aufKante,0,'zwischen den verbundenen Flurteilen keine Wand');
    assert.ok(r6.p15&&Math.abs(r6.p15.y-r6.kanten.y400)<r6.versatz&&r6.p15.y>r6.kanten.y400,'P15 an der oberen Flurwand (nicht an der verbundenen Kante), raumseitig: '+JSON.stringify(r6.p15));
    assert.ok(r6.p16&&Math.abs(r6.p16.x-r6.kanten.x1160)<r6.versatz&&r6.p16.x<r6.kanten.x1160,'P16 an der Außenwand des Büros, raumseitig: '+JSON.stringify(r6.p16));
    assert.equal(r6.fotosFlur,3);assert.ok(r6.planAufPlatte,'Modell: Planbild bleibt unter den Wänden auf der Platte');
    if(process.env.PLANKIT){   // zusätzlich: Nachzeichnung des Beispielgebäudes mit PlanKits eigenem Code prüfen
      const T=await import(require('node:url').pathToFileURL(path.join(process.env.PLANKIT,'src','trace.ts')).href);
      const og=await page.evaluate(()=>{const p=S.geschosse[1].plan;return {trace:p.trace,width:p.width,height:p.height,st:S.geschosse[1].skizze.stuecke};});
      T.validateTrace(og.trace,og);const segs=T.traceSegments(og.trace);
      const abst=(p,s)=>{const dx=s.x2-s.x1,dy=s.y2-s.y1,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-s.x1)*dx+(p.y-s.y1)*dy)/l2));return Math.hypot(p.x-s.x1-t*dx,p.y-s.y1-t*dy);};
      const pkt=(s,n)=>Array.from({length:n},(_,i)=>{const t=.02+.96*i/(n-1);return {x:s.x1+(s.x2-s.x1)*t,y:s.y1+(s.y2-s.y1)*t};});
      assert.equal(segs.flatMap(s=>pkt(s,24).filter(p=>!og.st.some(w=>abst(p,w)<=.05))).length,0,'Beispiel: jede PlanKit-Wand steht');
      assert.equal(og.st.flatMap(s=>pkt(s,8).filter(p=>!segs.some(w=>abst(p,w)<=.05))).length,0,'Beispiel: keine Wand, die PlanKit nicht hat');
      console.log('Beispielgebäude: Nachzeichnung von PlanKit ('+process.env.PLANKIT+') angenommen, Wände wie traceSegments');
    }
    // Bildschirmfotos: Beispielgebäude, dann nur das nachgezeichnete 1. OG in allen drei Darstellungen
    await page.evaluate(()=>{S.dreh=false;fliege(ganz(),.01);});await page.waitForTimeout(4500);await shot('f4-beispiel-modell');
    for(const stil of ['modell','glas','papier']){await page.locator('#'+stil).click();
      await page.evaluate(()=>{S.geschosse.forEach((g,i)=>{g.sichtbar=i===1;});S.kam={yaw:-.7,pitch:MODELL()?.62:.66,zoom:1.3,tx:0,ty:0,tz:H()*1.15};S.ziel=null;});
      await page.waitForTimeout(900);await shot('f5-1og-nachzeichnung-'+stil);}
    await page.locator('#modell').click();
    console.log('E ok');
  }
  if(soll('f')){
    // Skizzen-Pläne müssen genau wie in 1.5.0 aussehen: 1.5.0 aus Git neben 1.6.0 laden, dasselbe Projekt (Beispielgebäude von 1.5.0: EG und 1. OG
    // als Skizze, DG als Bild), gleiche Kamera, feste Zeit – Daten (Wände, Räume, Fotowände, Felder) und Pixel in allen drei Darstellungen vergleichen.
    let alt=null;try{alt=require('node:child_process').execSync('git show f04ec0a:index.html',{cwd:root,maxBuffer:1e8,stdio:['ignore','pipe','ignore']}).toString();}catch{/* nicht im Git */}
    if(!alt)console.log('F übersprungen: GlasKit 1.5.0 (f04ec0a) ist in diesem Git nicht vorhanden');
    else{
      fs.writeFileSync(path.join(out,'glaskit-1.5.0.html'),alt);
      const pa=await ctx.newPage();pa.on('pageerror',e=>fehler.push('1.5.0: '+e.message));
      await pa.goto(url.replace(/index\.html$/,'tests/out/glaskit-1.5.0.html'));await pa.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);
      assert.equal(await pa.locator('#version').textContent(),'v1.5.0');
      const projekt=await pa.evaluate(()=>JSON.stringify(beispiel()));
      await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.geschosse.length===3);
      for(const pg of [pa,page])await pg.evaluate(async j=>{await projektLaden(JSON.parse(j),'Vergleich mit 1.5.0',true);document.getElementById('start').classList.add('weg');S.dreh=false;},projekt);
      const daten=pg=>pg.evaluate(()=>{stilSetzen('modell',false);S.kam={yaw:-.75,pitch:.5,zoom:.9,tx:0,ty:0,tz:mitteZ()};S.ziel=null;
        return JSON.stringify(S.geschosse.map(g=>({skizze:g.skizze,waende:g.waende,fotoW:g.fotoW.map(p=>({...p,f:p.f.name,liste:p.liste.length})),felder:g.marker.map(m=>feldGeo(m,g,0))})));});
      const [da,db]=[await daten(pa),await daten(page)];
      assert.ok(JSON.parse(db)[0].waende.stuecke.length>20&&JSON.parse(db)[1].waende.stuecke.length>20);
      assert.equal(db,da,'Skizzen-Pläne: Wände, Räume, Brandraum, Fotowände und Felder genau wie 1.5.0');
      const bildVon=(pg,stil)=>pg.evaluate(stil=>{stilSetzen(stil,false);S.dreh=false;S.ziel=null;S.wahl=null;S.hover=null;S.fotoAn=true;S.waende=true;S.artAus.clear();
        S.kam={yaw:-.75,pitch:MODELL()?.5:.56,zoom:.9,tx:0,ty:0,tz:mitteZ()};const T=5e6;S.t0=T-1e6;for(let i=0;i<2;i++){S.teilchen=[];bild(T);}return cv.toDataURL('image/png');},stil);
      for(const stil of ['modell','glas','papier']){const a=await bildVon(pa,stil),b=await bildVon(page,stil);
        if(a!==b){fs.writeFileSync(path.join(out,`g-${stil}-1.5.0.png`),Buffer.from(a.split(',')[1],'base64'));fs.writeFileSync(path.join(out,`g-${stil}-1.6.0.png`),Buffer.from(b.split(',')[1],'base64'));}
        assert.ok(a===b,`${stil}: Bild mit Skizzen-Plänen pixelgleich mit 1.5.0 (sonst tests/out/g-${stil}-*.png)`);}
      await pa.close();
      console.log('F ok (Skizzen-Pläne pixelgleich mit 1.5.0 in Modell, Glas, Papier)');
    }
  }
  assert.deepEqual(fehler,[]);
  await browser.close();server.close();console.log('OK',welche);
})().catch(e=>{console.error(e);process.exit(1);});

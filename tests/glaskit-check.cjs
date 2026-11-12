// GlasKit – Prüfung im echten Browser mit erfundenen Daten (keine Kundendaten): node tests/glaskit-check.cjs [a|b|c|d|alle]
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
                'IMG_0002.jpg':{beschreibung:'Testfoto: Wand neben dem Fenster',probe:'p 1; P3',drehung:90},
                'IMG_0003.jpg':{beschreibung:'aussortiert',probe:'P2',aussortiert:true},
                'IMG_0004.HEIC':{beschreibung:'iPhone-Foto',probe:'P3'},
                'IMG_0005.jpg':{beschreibung:'Großes Foto',probe:'P5'},
                'IMG_0006.jpg':{beschreibung:'Datei gibt es nicht',probe:'P9'},
                'IMG_0007.jpg':{beschreibung:'Bohrkern-Foto',probe:'EG-WZ-B-7'},
                'IMG_0008.jpg':{beschreibung:'ohne Probe'}}}));
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
  assert.deepEqual(fehler,[]);
  await browser.close();server.close();console.log('OK',welche);
})().catch(e=>{console.error(e);process.exit(1);});

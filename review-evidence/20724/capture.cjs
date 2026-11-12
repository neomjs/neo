const fs = require('node:fs/promises');
const {execFileSync} = require('node:child_process');
const root='/Users/tobiasuhlig/.neo-ai/agents/neo-gpt-euclid/neomjs/neo';
const {chromium}=require(root+'/node_modules/playwright');
const sass=require(root+'/node_modules/sass');
const out='/private/tmp/neo-20724-source';
const base='http://127.0.0.1:9138/apps/portal/index.html';
const issues='.portal-examples-list:visible .neo-list-item:has([data-record-id="grid-issues"])';
const files=['resources/scss/src/apps/portal/examples/List.scss','resources/scss/theme-neo-dark/apps/portal/examples/List.scss','resources/scss/theme-neo-light/apps/portal/examples/List.scss','test/playwright/e2e/portal/ExamplesCatalogNL.spec.mjs'];
async function measure(page){return page.locator('.portal-examples-list:visible .neo-list-item').evaluateAll(nodes=>nodes.filter(n=>n.offsetWidth).map(n=>{const r=n.getBoundingClientRect(),c=n.querySelector('.neo-item-bottom-position'),cr=c.getBoundingClientRect(),im=n.querySelector('.preview-image'),ir=im.getBoundingClientRect();return {record:n.querySelector('.content').dataset.recordId,height:r.height,top:r.top,bottom:r.bottom,captionTop:cr.top,captionBottom:cr.bottom,captionHeight:cr.height,clearCover:(cr.top-r.top)/ir.height,belowImage:cr.top>=ir.bottom-1,docked:Math.abs(r.left-cr.left)<1&&Math.abs(r.right-cr.right)<1&&Math.abs(r.bottom-cr.bottom)<1,overflow:c.scrollWidth>c.clientWidth+1||c.scrollHeight>c.clientHeight+1,copy:c.textContent,coverImage:getComputedStyle(im).backgroundImage,coverSize:getComputedStyle(im).backgroundSize,coverPosition:getComputedStyle(im).backgroundPosition,foreground:getComputedStyle(c).color,opaque:[n,c,...c.querySelectorAll('*')].every(x=>getComputedStyle(x).opacity==='1'),noInlineSizing:!n.style.height&&!n.querySelector('.content').style.gridTemplateRows}}));}
async function decodeCover(card){await card.locator('.preview-image').evaluate(async n=>{const m=getComputedStyle(n).backgroundImage.match(/url\(["']?(.*?)["']?\)/);if(m){const i=new Image();i.src=m[1];await i.decode();}});}
(async()=>{
 const baselineSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const baseline=sass.compileString(execFileSync('git',['show','HEAD:'+files[0]],{cwd:root,encoding:'utf8'})).css;
 await fs.mkdir(out+'/before/source',{recursive:true});await fs.mkdir(out+'/after/source',{recursive:true});
 for(const file of files){await fs.writeFile(out+'/after/source/'+file.replaceAll('/','__'),await fs.readFile(root+'/'+file));try{await fs.writeFile(out+'/before/source/'+file.replaceAll('/','__'),execFileSync('git',['show','HEAD:'+file],{cwd:root,stdio:['ignore','pipe','pipe']}));}catch{}}
 const {activeLaunchArgs}=await import(root+'/test/playwright/e2e/utils/gpuIntent.mjs');
 const {decodePng}=await import(root+'/test/playwright/e2e/utils/pngPixels.mjs');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:activeLaunchArgs()});
 const measurements=[],errors=[];
 try{
 for(const phase of ['before','after'])for(const theme of ['dark','light']){
  const context=await browser.newContext({deviceScaleFactor:1});
  await context.addInitScript(theme=>localStorage.setItem('portalTheme','neo-theme-neo-'+theme),theme);
  if(phase==='before'){
   await context.route('**/css/src/apps/portal/examples/List.css',r=>r.fulfill({contentType:'text/css',body:baseline}));
   await context.route(/\/css\/theme-neo-(dark|light)\/apps\/portal\/examples\/List\.css(?:\?.*)?$/,r=>r.fulfill({contentType:'text/css',body:''}));
  }
  const page=await context.newPage();page.on('pageerror',e=>errors.push({phase,theme,error:String(e)}));
  for(const width of [1440,375,390]){
   await page.setViewportSize({width,height:1000});
   for(const section of ['featured','family']){
    await page.goto(base+`?capture=${phase}-${theme}-${width}-${section}`+(section==='family'?'#/examples/grid':'#/examples'));
    await page.locator(section==='family'?'.portal-examples-family-overview:visible .neo-list-item':'.portal-examples-list:visible:not(.portal-examples-family-overview) .neo-list-item').first().waitFor();
    await page.locator('.neo-viewport.neo-theme-neo-'+theme).waitFor();await page.evaluate(()=>document.fonts.ready);
    const list=page.locator(section==='family'?'.portal-examples-family-overview:visible':'.portal-examples-list:visible:not(.portal-examples-family-overview)');
    const card=section==='family'?list.locator('.neo-list-item:has([data-record-id="grid-issues"])'):list.locator('.neo-list-item:has([data-record-id="workstation"])');
    await card.scrollIntoViewIfNeeded();await decodeCover(card);
    await card.screenshot({path:`${out}/${phase}-${theme}-${width}-${section}-card.png`,animations:'disabled'});
    await page.screenshot({path:`${out}/${phase}-${theme}-${width}-${section}-viewport.png`,animations:'disabled'});
    const cards=await measure(page),target=cards.find(c=>c.record===(section==='family'?'grid-issues':'workstation'));
    const entry={phase,theme,width,section,cards,target};
    if(phase==='after'){
      if(cards.some(c=>!c.docked||c.overflow||!c.opaque||!c.noInlineSizing||(width>600?c.clearCover<.499:!c.belowImage)))throw new Error('Source geometry failure '+JSON.stringify({theme,width,section,cards}));
      const caption=card.locator('.neo-item-bottom-position'),png=decodePng(await caption.screenshot()),fg=target.foreground.match(/[\d.]+/g).slice(0,3).map(Number);
      const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      entry.actualContrast=[.12,.5,.88].map(f=>{const off=((png.height-8)*png.width+Math.floor(png.width*f))*png.channels,bg=lum([...png.pixels.subarray(off,off+3)]),text=lum(fg);return(Math.max(bg,text)+.05)/(Math.min(bg,text)+.05);});
      if(Math.min(...entry.actualContrast)<4.5)throw new Error('Contrast failure');
    }
    measurements.push(entry);
   }
  }
  await context.close();
 }
 const board=await browser.newPage({viewport:{width:1500,height:1000}});
 const embed=async file=>'data:image/png;base64,'+(await fs.readFile(file)).toString('base64');
 let html='<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#edf0f5;color:#17202e;font:16px system-ui}h1{margin:0 0 10px}p{line-height:1.4}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;align-items:start}h2{margin:26px 0 12px}h3{font-size:14px;margin:0 0 8px}img{width:100%;display:block}</style><h1>Portal #20724 · authored source comparison</h1><p>Before: HEAD SCSS compiled by Sass and served in place of the source List stylesheet; new theme leaves suppressed. After: normal authored development stylesheets, no injected candidate CSS or JavaScript sizing. Same canonical records, images, URLs and copy.</p>';
 for(const width of [1440,375,390]){
  html+=`<h2>${width}px · GitHub Issues Grid</h2><div class="row">`;
  for(const theme of ['dark','light'])for(const phase of ['before','after'])html+=`<section><h3>${theme} · ${phase}</h3><img src="${await embed(`${out}/${phase}-${theme}-${width}-family-card.png`)}"></section>`;
  html+='</div>';
 }
 html+='<h2>1440px · legacy Featured Workstation card</h2><div class="row">';
 for(const theme of ['dark','light'])for(const phase of ['before','after'])html+=`<section><h3>${theme} · ${phase}</h3><img src="${await embed(`${out}/${phase}-${theme}-1440-featured-card.png`)}"></section>`;
 html+='</div><p>Source E2E: 10/10 passed. Geometry covers Featured and all 21 family cards in dark/light at 1440/375/390; the family also passes 844px landscape. Rendered caption text contrast is at least 4.5:1 on sampled opaque body surfaces. This is local Chrome evidence, not deployed acceptance.</p>';
 await board.setContent(html);await board.locator('img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode())));await board.screenshot({path:out+'/comparison.png',fullPage:true});
 await fs.writeFile(out+'/receipt.json',JSON.stringify({baselineSha,measurements,errors,sourceFiles:files,board:out+'/comparison.png',baselineMethod:'Compile HEAD structural SCSS with installed Sass; replace only its browser CSS response and suppress new theme List leaves. After serves normal authored files.',tests:{command:'Node24.22.3 playwright ExamplesCatalogNL.spec.mjs -c playwright.config.e2e.mjs --workers=1; NEO_E2E_RUN_ID=20724-source; dedicated-worker adapter',passed:10,retries:0,seconds:22.2}},null,2));
 console.log(JSON.stringify({board:out+'/comparison.png',errors,count:measurements.length,minContrast:Math.min(...measurements.filter(m=>m.actualContrast).flatMap(m=>m.actualContrast))}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

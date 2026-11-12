// Run from the Engine checkout with Node 24. Starts/stops only its own HTTP server and Chrome.
const fs = require('node:fs/promises'), {createReadStream} = require('node:fs');
const http = require('node:http'), path = require('node:path'), {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto'), {execFileSync} = require('node:child_process');
const root = process.cwd(), out = __dirname;
const {chromium} = require(path.join(root, 'node_modules/playwright'));
const mime = {'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
const errors = [], abortedRequests = [], cases = [], invariants = new Map();
const receipt = {root, node:process.version, viewport:{width:1440,height:900}, framesPerCatalog:100, scrollMethod:'100 browser RAF callbacks assigning the actual catalog scroll owner from top to bottom; synthetic traversal, not native wheel input.', timingPolicy:'Observation only; no performance pass/fail threshold.', neuralLink:'Page-bound Engine test adapter; no Brain imports, Bridge or live-plane startup.', cases, errors, abortedRequests};
const distribution = values => {
    const sorted = [...values].sort((a,b)=>a-b), q = p=>sorted[Math.floor((sorted.length-1)*p)];
    return {count:values.length,min:q(0),median:q(.5),p90:q(.9),p95:q(.95),p99:q(.99),max:q(1),mean:values.reduce((a,b)=>a+b,0)/values.length};
};
const luminance = color => color.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const ensure = (value, message) => {if (!value) throw new Error(message);};

(async()=>{
    receipt.head = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    receipt.sourceDigests = Object.fromEntries(await Promise.all([
        'resources/scss/src/apps/portal/examples/List.scss',
        'resources/scss/theme-neo-dark/apps/portal/examples/List.scss',
        'resources/scss/theme-neo-light/apps/portal/examples/List.scss'
    ].map(async file=>[file,createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
    const load = file=>import(pathToFileURL(path.join(root,file)).href);
    const [{activeLaunchArgs},{decodePng},{runDedicatedWorkerNeuralLink}] = await Promise.all([
        load('test/playwright/e2e/utils/gpuIntent.mjs'), load('test/playwright/e2e/utils/pngPixels.mjs'), load('test/playwright/dedicatedWorkerNeuralLink.mjs')
    ]);
    const server = http.createServer(async(req,res)=>{
        try {
            let file = path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname));
            if (file!==root && !file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
            if ((await fs.stat(file)).isDirectory()) file=path.join(file,'index.html');
            res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
            const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
        } catch {res.writeHead(404).end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base = `http://127.0.0.1:${server.address().port}/apps/portal/index.html`;
    let browser;
    try {
        browser = await chromium.launch({channel:'chrome',headless:true,args:activeLaunchArgs()});
        for (const variant of ['blur','no-blur']) for (const theme of ['dark','light']) {
            const context = await browser.newContext({viewport:receipt.viewport,deviceScaleFactor:1});
            await context.addInitScript(theme=>localStorage.setItem('portalTheme',`neo-theme-neo-${theme}`),theme);
            const page=await context.newPage();let activeCase=null;
            page.on('pageerror',e=>errors.push({case:activeCase,type:'pageerror',message:String(e)}));
            page.on('console',m=>{if(m.type()==='error')errors.push({case:activeCase,type:'console',message:m.text()});});
            page.on('requestfailed',r=>{
                const event={case:activeCase,url:r.url(),error:r.failure()?.errorText};
                (event.error==='net::ERR_ABORTED'?abortedRequests:errors).push(event);
            });
            try {
                await runDedicatedWorkerNeuralLink({browser,context,page},async nl=>{
                    for (const section of ['featured','family']) {
                        activeCase=`${variant}-${theme}-${section}`;
                        await page.goto(base+`?acceptance=${activeCase}`+(section==='family'?'#/examples/grid':'#/examples'));
                        const list=page.locator(section==='family'?'.portal-examples-family-overview:visible':'.portal-examples-list:visible:not(.portal-examples-family-overview)');
                        await list.locator('.neo-list-item').first().waitFor();
                        await page.locator(`.neo-viewport.neo-theme-neo-${theme}`).waitFor();await page.evaluate(()=>document.fonts.ready);
                        const app=await nl.connectToApp('Portal');
                        const matches=await app.queryComponent({reference:`examples-${section==='family'?'grid':'featured'}-list`},['id','mounted','store','catalogMode']);
                        const listId=await list.getAttribute('id'), logical=(Array.isArray(matches)?matches:[matches]).find(m=>m.id===listId);
                        ensure(logical,'Neural Link must bind this page and mounted list');
                        const workerRecord=await app.getRecord(section==='family'?'grid-issues':'workstation',logical.properties.store.id);
                        if (variant==='no-blur') await page.addStyleTag({content:'.portal-examples-list .neo-item-bottom-position::before{backdrop-filter:none!important}'});
                        const scroll=await list.evaluate(async node=>{
                            let owner=node;
                            while(owner && !(owner.scrollHeight>owner.clientHeight+1 && /(auto|scroll)/.test(getComputedStyle(owner).overflowY)))owner=owner.parentElement;
                            owner ||= document.scrollingElement;
                            const maximum=owner.scrollHeight-owner.clientHeight,frames=[];
                            if(maximum<=0)throw new Error('The catalog has no scrollable extent');
                            owner.scrollTop=0;
                            await new Promise(resolve=>requestAnimationFrame(previous=>{
                                let frame=0;
                                const next=timestamp=>{
                                    owner.scrollTop=maximum*frame/99;
                                    frames.push({frame,intervalMs:timestamp-previous,scrollTop:owner.scrollTop});previous=timestamp;
                                    if(++frame===100)resolve();else requestAnimationFrame(next);
                                };
                                requestAnimationFrame(next);
                            }));
                            return {owner:{id:owner.id,cls:owner.className},maximum,final:owner.scrollTop,frames};
                        });
                        ensure(Math.abs(scroll.final-scroll.maximum)<2,'Scroll must traverse the full catalog');
                        // Only the rendered catalog's covers, fonts and stable geometry gate its measurements.
                        // Global network quiescence can be prevented by unrelated application activity.
                        const readyHandle=await page.waitForFunction(async id=>{
                            const list=document.getElementById(id);
                            if(!list)return false;
                            await document.fonts.ready;
                            const contents=[...list.querySelectorAll('.content')].filter(n=>n.offsetWidth);
                            const covers=contents.map(content=>({
                                placeholder:!!content.querySelector('.portal-example-placeholder'),
                                urls:[...getComputedStyle(content.querySelector('.preview-image')).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)].map(match=>match[1])
                            }));
                            if(covers.some(cover=>!cover.placeholder&&!cover.urls.length))return false;
                            const urls=[...new Set(covers.flatMap(cover=>cover.urls))];
                            await Promise.all(urls.map(async url=>{const image=new Image();image.src=url;await image.decode();}));
                            const snapshot=()=>JSON.stringify([...list.querySelectorAll('.neo-list-item')].filter(n=>n.offsetWidth).map(node=>{
                                const card=node.getBoundingClientRect(),caption=node.querySelector('.neo-item-bottom-position').getBoundingClientRect();
                                return [card.left,card.top,card.width,card.height,caption.top,caption.height];
                            }));
                            const first=snapshot();
                            await new Promise(resolve=>requestAnimationFrame(resolve));
                            const second=snapshot();
                            await new Promise(resolve=>requestAnimationFrame(resolve));
                            if(first!==second||second!==snapshot())return false;
                            return {fontStatus:document.fonts.status,decodedCoverCount:urls.length,coverURLs:urls,stableLayoutSamples:3};
                        },listId,{polling:'raf',timeout:30000});
                        const readiness=await readyHandle.jsonValue();await readyHandle.dispose();
                        const cards=await list.locator('.neo-list-item').evaluateAll(nodes=>nodes.filter(n=>n.offsetWidth).map(n=>{
                            const r=n.getBoundingClientRect(),caption=n.querySelector('.neo-item-bottom-position'),c=caption.getBoundingClientRect(),image=n.querySelector('.preview-image'),i=image.getBoundingClientRect(),lip=getComputedStyle(caption,'::before');
                            const texts=[...caption.querySelectorAll('*')];
                            return {record:n.querySelector('.content').dataset.recordId,top:r.top,bottom:r.bottom,height:r.height,captionHeight:c.height,clearCover:(c.top-r.top)/i.height,
                                docked:Math.abs(r.left-c.left)<1&&Math.abs(r.right-c.right)<1&&Math.abs(r.bottom-c.bottom)<1,
                                overflow:caption.scrollWidth>caption.clientWidth+1||caption.scrollHeight>caption.clientHeight+1,
                                opaque:[n,caption,...texts].every(t=>{for(let p=t;p;p=p.parentElement){if(getComputedStyle(p).opacity!=='1')return false;if(p===n)break;}return true;}),
                                textFits:texts.every(t=>{const q=t.getBoundingClientRect();return q.left>=c.left&&q.right<=c.right+1&&q.top>=c.top+parseFloat(lip.height)-1&&q.bottom<=c.bottom+1;}),
                                noInlineSizing:!n.style.height&&!n.querySelector('.content').style.gridTemplateRows,
                                lipHeight:lip.height,backdropFilter:lip.backdropFilter,copy:caption.textContent,coverImage:getComputedStyle(image).backgroundImage};
                        }));
                        ensure(cards.length===logical.properties.store.count,'Worker Store count must match the rendered catalog');
                        ensure(section!=='family'||cards.length===21,'Grid family must retain all 21 cards');
                        ensure(cards.every(c=>c.docked&&!c.overflow&&c.opaque&&c.textFits&&c.noInlineSizing&&c.clearCover>=.499),'Caption geometry, opacity or clear-cover invariant failed');
                        ensure(cards.every(c=>variant==='no-blur'?c.backdropFilter==='none':c.backdropFilter!=='none'),'Requested blur variant was not applied');
                        const rows=new Map();for(const c of cards){const top=Math.round(c.top);rows.has(top)||rows.set(top,[]);rows.get(top).push(c.bottom);}
                        ensure([...rows.values()].every(values=>Math.max(...values)-Math.min(...values)<1),'Row bottoms must align');
                        const signature=JSON.stringify(cards.map(({record,height,captionHeight,clearCover,copy})=>({record,height,captionHeight,clearCover,copy})));
                        const key=`${theme}-${section}`;if(variant==='blur')invariants.set(key,signature);else ensure(signature===invariants.get(key),'Removing blur must preserve caption geometry and copy');
                        const target=list.locator(`.neo-list-item:has([data-record-id="${section==='family'?'grid-issues':'workstation'}"])`);
                        await target.scrollIntoViewIfNeeded();
                        await target.locator('.preview-image').evaluate(async node=>{const match=getComputedStyle(node).backgroundImage.match(/url\(["']?(.*?)["']?\)/);if(!match)throw new Error('Canonical cover is absent');const image=new Image();image.src=match[1];await image.decode();});
                        const caption=target.locator('.neo-item-bottom-position'),png=decodePng(await caption.screenshot());
                        const colors=await caption.locator('a,.portal-example-feature,p,.neo-inner-details').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color.match(/[\d.]+/g).map(Number)));
                        const contrasts=[.12,.5,.88].flatMap(f=>{
                            const offset=((png.height-8)*png.width+Math.floor(png.width*f))*png.channels,bg=luminance([...png.pixels.subarray(offset,offset+3)]);
                            return colors.map(color=>{ensure((color[3]??1)===1,'Text color must be opaque');const fg=luminance(color);return(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);});
                        });
                        ensure(Math.min(...contrasts)>=4.5,'Rendered caption contrast must remain at least 4.5:1');
                        if(variant==='no-blur'&&theme==='dark'&&section==='family'){
                            receipt.noBlurFrame=path.join(out,'no-blur-frame.png');await page.screenshot({path:receipt.noBlurFrame});
                        }
                        const entry={variant,theme,section,logicalList:logical,workerRecord,readiness,scroll,intervalDistributionMs:distribution(scroll.frames.map(f=>f.intervalMs)),cards,contrastRatios:contrasts};
                        cases.push(entry);console.log(JSON.stringify({case:activeCase,cards:cards.length,intervalDistributionMs:entry.intervalDistributionMs,minContrast:Math.min(...contrasts)}));
                    }
                });
            } finally {await context.close();}
        }
        ensure(errors.length===0,'Browser errors were observed; inspect the receipt');
        receipt.passed=true;
    } catch(error) {receipt.passed=false;receipt.failure=String(error);process.exitCode=1;}
    finally {
        await browser?.close();
        await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
        receipt.cleanup={browserClosed:true,ownedServerStopped:true};
        receipt.intervalDistributionByVariantMs=Object.fromEntries(['blur','no-blur'].map(variant=>[variant,distribution(cases.filter(c=>c.variant===variant).flatMap(c=>c.scroll.frames.map(f=>f.intervalMs)))]));
        await fs.writeFile(path.join(out,'final-acceptance-receipt.json'),JSON.stringify(receipt,null,2));
        console.log(JSON.stringify({passed:receipt.passed,failure:receipt.failure,errors:errors.length,abortedRequests:abortedRequests.length,receipt:path.join(out,'final-acceptance-receipt.json'),noBlurFrame:receipt.noBlurFrame}));
    }
})().catch(error=>{console.error(error);process.exitCode=1;});

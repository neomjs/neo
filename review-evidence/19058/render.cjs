const fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=process.cwd(),out=__dirname,slug='ai-agent-memory-consolidation',recordId='blog/'+slug;
const {chromium}=require(path.join(root,'node_modules/playwright')),{expect}=require(path.join(root,'node_modules/@playwright/test'));
const sourcePath='learn/blog/'+slug+'.md',registrationPath='apps/portal/resources/data/blog.json';
const cases=[],errors=[],abortedRequests=[],receipt={root,sourcePath,registrationPath,recordId,cases,errors,abortedRequests,evidenceScope:'Local authored-source rendering only. Public links are extracted, not fact-checked or fetched.'};
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
const luminance=color=>{
    const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
};
(async()=>{
    const source=await fs.readFile(path.join(root,sourcePath),'utf8'),registration=await fs.readFile(path.join(root,registrationPath),'utf8');
    const data=JSON.parse(registration),rows=Array.isArray(data)?data:data.data,record=rows.find(row=>row.id===recordId);
    ensure(record?.path===sourcePath,'Canonical blog registration must point to the authored Markdown');
    receipt.sourceSha256=digest(source);receipt.registrationSha256=digest(registration);receipt.registration=record;
    receipt.head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();receipt.node=process.version;
    const title=source.split('\n').find(line=>line.startsWith('# ')).slice(2),expectedDiagrams=(source.match(/^```mermaid/gm)||[]).length;
    ensure(expectedDiagrams===1,'This bounded QA expects exactly one authored Mermaid fence');
    const load=file=>import(pathToFileURL(path.join(root,file)).href);
    const [{activeLaunchArgs},{runDedicatedWorkerNeuralLink}]=await Promise.all([load('test/playwright/e2e/utils/gpuIntent.mjs'),load('test/playwright/dedicatedWorkerNeuralLink.mjs')]);
    const server=http.createServer(async(req,res)=>{
        try{
            let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname));
            if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
            if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
            res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
            const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
        }catch{res.writeHead(404).end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    receipt.port=server.address().port;
    let browser;
    try{
        browser=await chromium.launch({channel:'chrome',headless:true,args:activeLaunchArgs()});
        for(const theme of ['dark','light'])for(const width of [1440,375]){
            const id=`${theme}-${width}`,context=await browser.newContext({viewport:{width,height:width===1440?900:844},deviceScaleFactor:1});
            await context.addInitScript(theme=>localStorage.setItem('portalTheme',`neo-theme-neo-${theme}`),theme);
            const page=await context.newPage();
            page.on('pageerror',error=>errors.push({case:id,type:'pageerror',message:String(error)}));
            page.on('console',message=>{if(message.type()==='error')errors.push({case:id,type:'console',message:message.text()});});
            page.on('requestfailed',request=>{const event={case:id,url:request.url(),error:request.failure()?.errorText};(event.error==='net::ERR_ABORTED'?abortedRequests:errors).push(event);});
            try{
                await runDedicatedWorkerNeuralLink({browser,context,page},async nl=>{
                    const url=`http://127.0.0.1:${receipt.port}/apps/portal/index.html#/news/blog/${slug}`;
                    await page.goto(url);await page.locator(`.neo-viewport.neo-theme-neo-${theme}`).waitFor();
                    const article=page.locator('article.neo-app-content-component');
                    await expect(article.locator('h1')).toHaveText(title);
                    await expect(article.locator('h2').last()).toHaveText('Try the smallest useful slice');
                    await expect(article.locator('.neo-mermaid svg:not([aria-roledescription="error"])')).toHaveCount(1,{timeout:30000});
                    await page.evaluate(()=>document.fonts.ready);
                    const app=await nl.connectToApp('Portal'),matches=await app.queryComponent({className:'Portal.view.news.blog.Component'},['id','record','mounted']);
                    const articleId=await article.getAttribute('id'),logical=(Array.isArray(matches)?matches:[matches]).find(match=>match.id===articleId);
                    ensure(logical,'Neural Link must bind the rendered blog component on this page');
                    ensure(logical.properties.record.id===recordId&&logical.properties.record.path===sourcePath,'The Worker must select the canonical new blog record');
                    ensure(new URL(page.url()).hash===`#/news/blog/${slug}`,'The public slug must remain the selected route');
                    const entry={theme,width,url,logical,geometry:await article.evaluate(node=>{
                        const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
                        const a=node.getBoundingClientRect(),svg=node.querySelector('.neo-mermaid svg'),r=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
                        const labels=[...svg.querySelectorAll('.nodeLabel, .node .label text')].map(label=>{const style=getComputedStyle(label),q=label.getBoundingClientRect(),text=label.querySelector('p,text,tspan')||label,textStyle=getComputedStyle(text),shape=label.closest('g.node')?.querySelector('rect,polygon,path');return{text:label.textContent.trim(),fontSize:style.fontSize,effectiveFontSize:parseFloat(style.fontSize)*(view.width?r.width/view.width:1),labelColor:style.color,textColor:textStyle.color,glyphColor:text instanceof SVGElement?textStyle.fill:textStyle.color,htmlParagraphs:label.querySelectorAll('p').length,shapeFill:shape?getComputedStyle(shape).fill:null,rect:rect(q)};});
                        return {article:rect(a),articleClientWidth:node.clientWidth,articleScrollWidth:node.scrollWidth,articleOverflowX:node.scrollWidth>node.clientWidth+1,
                            svgCount:node.querySelectorAll('.neo-mermaid svg').length,errorSvgCount:node.querySelectorAll('.neo-mermaid svg[aria-roledescription="error"]').length,
                            diagram:rect(r),diagramRole:svg.getAttribute('aria-roledescription'),viewBox:svg.getAttribute('viewBox'),
                            diagramContained:r.left>=a.left-1&&r.right<=a.right+1,
                            labels,labelClipped:labels.some(label=>label.rect.left<r.left-1||label.rect.right>r.right+1||label.rect.top<r.top-1||label.rect.bottom>r.bottom+1),
                            headings:[...node.querySelectorAll('h1,h2')].map(heading=>heading.textContent),textLength:node.innerText.length,
                            tables:[...node.querySelectorAll('table')].map(table=>({clientWidth:table.clientWidth,scrollWidth:table.scrollWidth,rect:rect(table.getBoundingClientRect())}))};
                    }),links:await article.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent.trim(),href:node.href,rawHref:node.getAttribute('href')}))),screenshots:{}};
                    cases.push(entry);
                    ensure(entry.geometry.svgCount===1&&entry.geometry.errorSvgCount===0,'Exactly one actual diagram, with no Mermaid error SVG, is required');
                    ensure(entry.geometry.diagramContained&&!entry.geometry.labelClipped,'The diagram and its labels must be contained');
                    ensure(!entry.geometry.articleOverflowX,'The article must not overflow horizontally');
                    ensure(entry.geometry.labels.length>0&&entry.geometry.labels.every(label=>label.text&&Number.isFinite(label.effectiveFontSize)),'Diagram labels must be present and measurable');
                    for(const label of entry.geometry.labels){const fg=luminance(label.glyphColor),bg=luminance(label.shapeFill);label.contrast=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);}
                    ensure(entry.geometry.labels.every(label=>label.htmlParagraphs===0&&label.contrast>=4.5),'SVG labels must avoid paragraph inheritance and remain readable on their node fill');
                    ensure(entry.geometry.labels.every(label=>label.effectiveFontSize>=parseFloat(label.fontSize)-.1),'The diagram must render without shrinking its labels');
                    await article.locator('h1').scrollIntoViewIfNeeded();entry.screenshots.top=path.join(out,`${id}-top.png`);await page.screenshot({path:entry.screenshots.top});
                    const diagram=article.locator('.neo-mermaid svg');
                    entry.screenshots.renderedSvg=path.join(out,`${id}-diagram.svg`);
                    await fs.writeFile(entry.screenshots.renderedSvg,await diagram.evaluate(node=>node.outerHTML));
                    await diagram.locator('.nodeLabel, .node .label text').first().evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'}));
                    entry.screenshots.diagramStart=path.join(out,`${id}-diagram-start.png`);await page.screenshot({path:entry.screenshots.diagramStart});
                    await diagram.locator('.nodeLabel, .node .label text').last().evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'}));
                    entry.screenshots.diagramEnd=path.join(out,`${id}-diagram-end.png`);await page.screenshot({path:entry.screenshots.diagramEnd});
                    await article.locator('p').last().scrollIntoViewIfNeeded();entry.screenshots.bottom=path.join(out,`${id}-bottom.png`);await page.screenshot({path:entry.screenshots.bottom});
                    console.log(JSON.stringify({case:id,recordId:logical.properties.record.id,geometry:entry.geometry}));
                });
            }finally{await context.close();}
        }
        ensure(errors.length===0,'Page, console or non-aborted request errors were observed');
        ensure(digest(await fs.readFile(path.join(root,sourcePath)))===receipt.sourceSha256&&digest(await fs.readFile(path.join(root,registrationPath)))===receipt.registrationSha256,'Authored inputs changed during this render');
        receipt.publicLinks=[...new Map(cases.flatMap(entry=>entry.links).filter(link=>/^https?:/.test(link.href)).map(link=>[link.href,link])).values()];
        for(const entry of cases){entry.publicLinkCount=entry.links.length;delete entry.links;}
        receipt.passed=true;
    }catch(error){receipt.passed=false;receipt.failure=String(error);process.exitCode=1;}
    finally{
        await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
        receipt.cleanup={browserClosed:true,ownedServerStopped:true};
        await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
        if(receipt.publicLinks)await fs.writeFile(path.join(out,'public-links.json'),JSON.stringify(receipt.publicLinks,null,2));
        console.log(JSON.stringify({passed:receipt.passed,failure:receipt.failure,cases:cases.length,errors:errors.length,abortedRequests:abortedRequests.length,receipt:path.join(out,'receipt.json')}));
    }
})().catch(error=>{console.error(error);process.exitCode=1;});

import assert                                         from 'node:assert/strict';
import fs                                             from 'node:fs/promises';
import path                                           from 'node:path';
import {createRequire}                                from 'node:module';
import {once}                                         from 'node:events';
import {chromium}                                     from 'playwright';
import {collectThemeStylesheetUrls, resolveBuiltTree} from '../../buildScripts/util/theme-equality.mjs';
import {createFileServer}                             from '../../buildScripts/util/fileServer.mjs';

const {PNG}     = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const output    = import.meta.dirname, root = path.resolve(output, '../..');
const modes     = ['neo-light', 'material-light', 'material-dark', 'neo-dark'];
const tree      = resolveBuiltTree(root), classes = modes.map(mode => 'neo-theme-' + mode);
const normalize = mode => mode.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
const summary   = {browser: '', checkout: {}, fixture: {}, nested: [], errors: [], badResponses: []};
const server    = createFileServer({root, spaRoot: false, freshness: {onListening(){}, onRequest(){}}});
const draw      = async page => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(resolve));
});
async function readStyle(locator) {
    return locator.first().evaluate(el => {
        const style = getComputedStyle(el), {width, height} = el.getBoundingClientRect();
        return Object.fromEntries([
            ...['backgroundColor', 'color', 'borderColor', 'borderStyle', 'borderRadius', 'paddingLeft',
                'fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'boxShadow', 'outline', 'colorScheme',
                'opacity'].map(property => [property, style[property]]),
            ['width', width], ['height', height]
        ]);
    });
}
async function nodeFor(cdp, selector) {
    const {root}   = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector});
    assert(nodeId, selector);
    return nodeId;
}
async function fontsFor(cdp, selector) {
    const {fonts} = await cdp.send('CSS.getPlatformFontsForNode', {nodeId: await nodeFor(cdp, selector)});
    return fonts;
}
function pngWitness(bytes) {
    const {width, height, data} = PNG.sync.read(bytes), counts = new Map();
    for (let i=0; i<data.length; i+=4) {
        const rgb = '#' + data.subarray(i,i+3).toString('hex');
        counts.set(rgb, (counts.get(rgb) || 0) + 1);
    }
    return {width, height, colors: Array.from(counts).sort((a,b) => b[1]-a[1]).slice(0,8)};
}
async function checkout(page, cdp, base) {
    await page.goto(base + '/examples/form/checkout/index.html', {waitUntil: 'domcontentloaded'});
    const view     = page.locator('.neo-examples-form-checkout'), button = page.locator('.checkout-actions .neo-button'),
          switcher = page.locator('.checkout-header .neo-themeswitcher');
    await view.locator('h1').waitFor();
    summary.initialCheckout = await view.getAttribute('class');
    for (const mode of [...modes, modes[0]]) {
        const theme = 'neo-theme-' + mode;
        await switcher.click();
        await page.getByRole('menuitemradio').first().waitFor();
        const options = await page.getByRole('menuitemradio').allTextContents();
        assert.deepEqual([...options].map(v=>v.trim()).sort(), modes.map(normalize).sort());
        await page.getByRole('menuitemradio', {name: normalize(mode), exact: true}).click();
        await page.waitForFunction(theme => document.querySelector('.neo-examples-form-checkout')?.classList.contains(theme), theme);
        await page.mouse.move(5,5);
        await draw(page);
        const snapshot = {
            options, title: await readStyle(view.locator('h1')), card: await readStyle(view.locator('.checkout-card')),
            view       : await readStyle(view), label: await readStyle(button.locator('.neo-button-text')),
            button     : await readStyle(button), field: await readStyle(view.locator('input')),
            titleFonts : await fontsFor(cdp,'.checkout-heading h1'),
            buttonFonts: await fontsFor(cdp,'.checkout-actions .neo-button-text'),
            appFonts   : await page.evaluate(()=>Array.from(document.fonts).map(face=>({family:face.family,status:face.status}))),
            body       : await readStyle(page.locator('body')),
            root       : await readStyle(page.locator('html')),
            sheetPaths : await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname)
                .filter(u=>u.includes('theme-material') || u.includes('/roboto/')))
        };
        if (summary.checkout[mode]) {
            assert.deepEqual(snapshot.button, summary.checkout[mode].button);
            assert.deepEqual(snapshot.buttonFonts, summary.checkout[mode].buttonFonts);
            summary.switchRestored = true; continue;
        }
        summary.checkout[mode] = snapshot;
        snapshot.painted = pngWitness(await page.screenshot({path:path.join(output, 'checkout-' + mode + '.png')}));
    }
}
async function fixture(page, cdp, base) {
    await page.goto(base + '/test/playwright/component/apps/theme-equality/index.html', {waitUntil:'domcontentloaded'});
    await page.locator('#theme-equality-viewport[data-ready=true]').waitFor({state:'attached'});
    await page.setViewportSize({width:1270,height:530});
    const urls = [...new Set(classes.flatMap(theme => collectThemeStylesheetUrls(tree, theme)))];
    await page.evaluate(urls => Promise.all(urls.map(url => new Promise((resolve,reject) => {
        const link = document.createElement('link');
        link.rel='stylesheet'; link.href=url.replace('/__equality_css/', '/dist/development/css/');
        link.onload=resolve; link.onerror=()=>reject(Error(link.href)); document.head.appendChild(link);
    }))), urls);
    // Create room around components on the equality bench. Its default 48-pixel cells
    // shrink a 150-pixel grid to a 40-pixel sliver and a 40-pixel button to 32.
    // Only the harness wrapper is changed. Never adjust product widget CSS for a photograph.
    await page.addStyleTag({content:`
        #theme-equality-viewport {display:grid;grid-template-columns:repeat(3, 390px);align-content:start;justify-content:center;overflow:auto}
        #theme-equality-viewport > .neo-eq-cell {display:none}
        #theme-equality-viewport > :is(#eq-cell-button-primary,#eq-cell-button-secondary,#eq-cell-button-small,
           #eq-cell-button-large,#eq-cell-split-button,#eq-cell-segmented-button,#eq-cell-textfield,
           #eq-cell-toolbar,#eq-cell-tab-container,#eq-cell-grid,#eq-cell-fieldset,#eq-cell-list) {
           display:block;width:390px;min-height:72px;overflow:visible
        }
        #theme-equality-viewport > :is(#eq-cell-grid,#eq-cell-fieldset,#eq-cell-list,#eq-cell-tab-container) {min-height:160px}
    `});
    const selector = '#eq-cell-button-primary .neo-button', button = page.locator(selector),
          label    = button.locator('.neo-button-text'), grid = page.locator('#eq-cell-grid');
    async function scope(outer, inner, where = 'cell') {
        await page.evaluate(({outer,inner,where})=>{
            for (const [node,mode] of [[document.body, outer], [document.querySelector('#theme-equality-viewport'),outer],
                [document.querySelector('#eq-cell-button-primary'),where==='cell'&&inner],
                [document.querySelector('#eq-cell-button-primary .neo-button'),where==='button'&&inner]]) {
                const before = [...node.classList].filter(c => c.startsWith('neo-theme-'));
                node.classList.remove(...before);
                if(mode) node.classList.add('neo-theme-' + mode);
            }
        },{outer,inner,where});
        await draw(page);
    }
    for (const mode of modes) {
        await scope(mode);
        await page.mouse.move(1,1);
        const s = summary.fixture[mode] = {
            button: await readStyle(button), label: await readStyle(label), fonts: await fontsFor(cdp,selector+' .neo-button-text'),
            dense : {
                gridHeader   : await readStyle(grid.locator('.neo-grid-header-button')),
                tabButton    : await readStyle(page.locator('#eq-cell-tab-container .neo-button')),
                toolbarButton: await readStyle(page.locator('#eq-cell-toolbar .neo-button')),
                smallButton  : await readStyle(page.locator('#eq-cell-button-small .neo-button')),
                fieldInput   : await readStyle(page.locator('#eq-cell-textfield input'))
            }, selected: await readStyle(page.locator('#eq-cell-segmented-button .pressed')), states: {}
        };
        const bytes = await button.screenshot({path:path.join(output,'primary-'+mode+'.png')});
        s.painted = pngWitness(bytes);
        await grid.locator('.neo-grid-container').first().screenshot({path:path.join(output,'grid-'+mode+'.png')});
        await page.screenshot({path:path.join(output,'equality-'+mode+'.png')});
        const nodeId = await nodeFor(cdp,selector);
        for (const [name,pseudo] of Object.entries({hover:['hover'],active:['hover','active'],focus:['focus','focus-visible']})) {
            await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:pseudo});
            await draw(page);
            s.states[name] = {surface:await readStyle(button), label:await readStyle(label)};
        }
        await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
        for(const [name,cls] of [['pressed','pressed'],['disabled','neo-disabled']]) {
            await button.evaluate((el,cls)=>el.classList.add(cls),cls);
            await draw(page);
            s.states[name]={surface:await readStyle(button), label:await readStyle(label)};
            await button.evaluate((el,cls)=>el.classList.remove(cls),cls);
        }
        // Record the native click-created ripple while its real keyframe animation is active.
        const ripple = page.waitForFunction(selector => {
            const el = document.querySelector(selector + ' .neo-button-ripple');
            if (!el || !el.getAnimations().length) return false;
            const css = getComputedStyle(el);
            return {color: css.backgroundColor, animation: css.animationName, duration: css.animationDuration};
        },selector, {timeout:2500});
        await button.click();
        s.ripple = await (await ripple).jsonValue();
        await button.locator('.neo-button-ripple').waitFor({state:'detached'});
        await button.evaluate(el=>el.blur());
        await page.mouse.move(1,1);
    }
    for(const [outer,inner] of [['neo-light','material-dark'],['material-dark','neo-light'],['neo-dark','material-light'],['material-light','neo-dark']]) {
        for (const where of ['cell','button']) {
            await scope(outer,inner,where);
            const style       = await readStyle(button), text=await readStyle(label),
                mismatch      = Object.keys(style).filter(k => k!=='outline' && style[k]!==summary.fixture[inner].button[k]),
                labelMismatch = Object.keys(text).filter(k => text[k]!==summary.fixture[inner].label[k]);
            summary.nested.push({outer,inner,where,mismatch,labelMismatch,style,text});
        }
    }
}
let browser;
try {
    server.listen(0, '127.0.0.1');
    await once(server,'listening');
    const base = 'http://127.0.0.1:'+server.address().port;
    browser = await chromium.launch({channel:'chrome', headless:true});
    summary.browser = browser.version();
    for (const [surface, run] of Object.entries({checkout,fixture})) {
        const ctx = await browser.newContext({viewport:{width:1320,height:820},reducedMotion:'reduce',deviceScaleFactor:1}),
            page  = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
        page.setDefaultTimeout(15000);
        page.on('pageerror', error=>summary.errors.push({surface,error:String(error)}));
        page.on('response', response=>{if(response.status()>=400) summary.badResponses.push({surface,url:response.url(),status:response.status()});});
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        try {await run(page,cdp,base);} finally {await ctx.close();}
    }
} finally {
    await fs.writeFile(path.join(output,'browser-receipt.json'),JSON.stringify(summary,null,2)+'\n');
    await browser?.close();
    if(server.listening) server.close();
}

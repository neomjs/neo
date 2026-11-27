import fs         from 'node:fs/promises';
import path       from 'node:path';
import crypto     from 'node:crypto';
import {chromium} from 'playwright';
const output  = import.meta.dirname, root = path.resolve(output, '../..');
const data    = JSON.parse(await fs.readFile(path.join(output,'browser-receipt.json'),'utf8'));
const modes   = ['neo-light', 'material-light', 'neo-dark', 'material-dark'];
const file    = name => path.join(output, name);
const png     = async name => 'data:image/png;base64,'+(await fs.readFile(file(name))).toString('base64');
const title   = mode => mode.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ');
const face    = obj => obj.map(f=>f.postScriptName.replace(/-/g,' ')).join(', ');
const browser = await chromium.launch({channel:'chrome'});
const ctx     = await browser.newContext({deviceScaleFactor:1});
const page    = await ctx.newPage();
const css     = `
* {box-sizing:border-box}
html,body {margin:0;color:#1d2229;background:#f6f7f8;font:16px Helvetica,Arial,sans-serif}
main {display:inline-block;background:#f6f7f8;padding:20px}
h1 {font:600 24px/1.2 Helvetica,Arial,sans-serif; margin:2px 0 18px}
.row {display:flex;gap:12px}
section {border:1px solid #cfd4d9;background:white;overflow:hidden}
header {padding:12px 16px;border-bottom:1px solid #cfd4d9;background:#fff;color:#1d2229}
h2 {font-size:19px;line-height:1.2;margin:0 0 5px}
p {font-size:14px;line-height:1.35;margin:0}
.capture {position:relative;overflow:hidden}
.capture img {position:absolute;max-width:none;display:block}
.checkout .capture {width:915px;height:638px}
.checkout .capture img {left:-202px;top:-91px;width:1320px;height:820px}
.equality .capture {width:1079.5px;height:426px}
.equality .capture img {left:0;top:0;width:1079.5px;height:450.5px}
.button .row {display:grid;grid-template-columns:repeat(2,355px)}
.button .capture {height:86px;display:grid;place-content:center}
.button .raw {position:relative;height:72px;overflow:hidden}
.button .capture img {position:absolute;left:-30px;top:0}
.button .metrics {padding:10px 16px}
`;
const common = (surface,heading,content) => '<style>'+css+'</style><main class="'+surface+'"><h1>'+heading+'</h1><div class="row">'+content+'</div></main>';
async function writeSheet(name,html) {
    await page.setViewportSize({width:2300,height:1000});
    await page.setContent(html,{waitUntil:'load'});
    await page.locator('main').screenshot({path:file(name)});
}
const receipt = {
    browser: data.browser, deviceScaleFactor:1, modes:{}, nested:[], comparisonSheets:[],
    checkoutViewport:'1320 × 820 CSS px', checkoutSource:'examples/form/checkout/index.html',
    fixtureSource:'test/playwright/component/apps/theme-equality/index.html',
    fixtureConditions:'Real app and themed controls. Only the benchmark wrappers were rearranged to expose all 12 selected cells at their natural size; product control styles were untouched. All four sets of mapped stylesheets were loaded together. Hover, active and focus were forced through Chrome DevTools. Pressed and disabled used the equality benchmark CSS-state classes. Ripple was measured during the real click-created animation.',
    switcherRoundTrip:data.switchRestored,
    modeOrder:['neo-light','material-light','material-dark','neo-dark','neo-light'],
    pageErrors:data.errors.length, nonSuccessHttpResponses:data.badResponses.length,
    sources:{}, limitations:[
        'The Chromium font backend on this host substituted Helvetica Bold for the Neo Source Sans 3 declaration. Material button text used the locally served Roboto Medium file.',
        'Material relies on the browser canvas for the page background. The unbound checkout card, field fill, field outline, and typography still make its form hard to scan. Material headings use the platform serif fallback.',
        'Material grid headers have no horizontal padding. Its tab and toolbar buttons measure 15px and 17px tall, and its grid progress bars are unpainted in the gallery.'
    ]
};
try {
    for(const mode of modes) {
        const c = data.checkout[mode], f=data.fixture[mode];
        receipt.modes[mode]={
            rootScheme:c.root.colorScheme, dominantCheckoutPixel:c.painted.colors[0][0],
            checkout:{button:c.button.height,input:c.field.height,buttonPadding:c.button.paddingLeft,buttonRadius:c.button.borderRadius,
                buttonFont:c.buttonFonts, headingFont:c.titleFonts, loadedLocalRoboto:c.sheetPaths.some(url=>url.endsWith('/roboto-latin.woff2'))},
            primary:{height:f.button.height,padding:f.button.paddingLeft,radius:f.button.borderRadius,declaredFont:f.label.fontFamily,usedFont:f.fonts,
                paint:f.painted.colors[0], text:f.label.color, ripple:f.ripple},
            dense:Object.fromEntries(Object.entries(f.dense).map(([k,v])=>[k,{height:v.height,padding:v.paddingLeft}])),
            selected:f.selected.backgroundColor,
            primaryStates:Object.fromEntries(Object.entries(f.states).map(([k,v])=>[k,{background:v.surface.backgroundColor,text:v.label.color,
                boxShadow:v.surface.boxShadow,outline:v.surface.outline,opacity:v.surface.opacity}]))
        };
    }
    receipt.nested=data.nested.map(n=>({outer:n.outer,inner:n.inner,scope:n.where,mismatches:[...n.mismatch,...n.labelMismatch]}));
    for (const surface of ['checkout','equality']) {
        for (const shade of ['light','dark']) {
            const pair = ['neo-'+shade,'material-'+shade], cards=await Promise.all(pair.map(async mode=>{
                const c = data.checkout[mode], f=data.fixture[mode], desc = surface==='checkout'
                    ? 'Button text · '+face(c.buttonFonts)+'　|　Heading · '+face(c.titleFonts)
                    : 'Primary button text · '+face(f.fonts);
                return '<section><header><h2>'+title(mode)+'</h2><p>'+desc+'</p></header><div class="capture"><img src="'+await png(surface+'-'+mode+'.png')+'"></div></section>';
            }));
            const name = surface+'-'+shade+'-comparison.png';
            await writeSheet(name,common(surface,surface==='checkout'?'Checkout':'Theme Equality',cards.join('')));
            receipt.comparisonSheets.push(name);
        }
    }
    const cards = await Promise.all(modes.map(async mode=>{
        const d = data.fixture[mode], background=data.checkout[mode].painted.colors[0][0];
        return '<section><header><h2>'+title(mode)+'</h2><p>'+face(d.fonts)+'</p></header><div class="capture" style="background:'+background+'"><div class="raw" style="width:'+Math.ceil(d.button.width+32)+'px"><img src="'+await png('equality-'+mode+'.png')+'"></div></div><div class="metrics"><p>'+d.painted.colors[0][0].toUpperCase()+'　·　'+d.button.height+'px high　·　'+d.button.paddingLeft+' inset</p></div></section>';
    }));
    await writeSheet('primary-comparison.png',common('button','Primary button',cards.join('')));
    receipt.comparisonSheets.push('primary-comparison.png');
    const sources = ['resources/css/theme-material/Global.css','resources/css/theme-material/button/Base.css',
        'resources/css/theme-material/form/field/Text.css','examples/form/checkout/neo-config.json',
        'examples/form/checkout/index.html','examples/form/checkout/resources/fonts/roboto/roboto-latin.woff2',
        'test/playwright/component/apps/theme-equality/index.html','resources/theme-map.json'];
    for(const p of sources) receipt.sources[p]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex');
    receipt.images={};
    for(const name of receipt.comparisonSheets) receipt.images[name]=crypto.createHash('sha256').update(await fs.readFile(file(name))).digest('hex');
    await fs.writeFile(file('review-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
} finally {await ctx.close();await browser.close();}

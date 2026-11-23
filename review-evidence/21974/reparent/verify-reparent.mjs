/**
 * Run from an Engine checkout with built dev themes and browser dependencies:
 * node verify-reparent.mjs --root . --out results.json --repeat 2 --channel chrome
 * Exit 1 means an old response settled a destination promise before destination dispatch.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options: {
    root: {type: 'string'}, out: {type: 'string'}, repeat: {type: 'string', default: '1'},
    channel: {type: 'string', default: 'chrome'}
}});
assert(values.root && values.out, 'Pass --root <engine checkout> and --out <results.json>');
const repeat = Number(values.repeat);
assert(Number.isInteger(repeat) && repeat > 0, '--repeat must be a positive integer');
const root = path.resolve(values.root);
const load = name => import(pathToFileURL(path.join(root, name)).href);
const {chromium, expect} = createRequire(path.join(root, 'package.json'))('playwright/test');
const {attachPageSharedAppWorker} = await load('test/playwright/sharedWorkerAppWorker.mjs');
const {createFileServer} = await load('buildScripts/util/fileServer.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = {};
for (const name of ['src/mixin/VdomLifecycle.mjs', 'src/component/Abstract.mjs',
    'src/container/Base.mjs', 'src/manager/VDomUpdate.mjs', 'test/playwright/sharedWorkerAppWorker.mjs']) {
    hashes[name] = sha256(await readFile(path.join(root, name)));
}

// All installation and timing gates below live in one throwaway browser context.
// The native App Worker, renderer, real window IDs, public reparent calls and DOM are used unchanged.
async function install({windowIds, order}) {
    const probe = globalThis.reparentProbe = {roots: [], promises: {}, windowIds, order, destinationGates: []};
    for (const [index, windowId] of windowIds.entries()) {
        const view = Neo.apps[windowId].mainView;
        const root = view.add({
            module: Neo.container.Base, id: 'probe-root-' + index,
            style: {position: 'fixed', top: '50px', left: '50px', zIndex: 999999, width: '350px',
                height: '65px', backgroundColor: 'white', color: 'black'},
            items: index ? [] : [{module: Neo.container.Base, id: 'probe-middle', items: [
                {module: Neo.component.Base, id: 'probe-leaf', text: 'initial'}
            ]}]
        }, true);
        view.updateDepth = -1;
        await view.promiseUpdate();
        await root.promiseUpdate();
        probe.roots.push(root);
    }
    probe.middle = Neo.getComponent('probe-middle');
    probe.leaf = Neo.getComponent('probe-leaf');
    probe.track = (name, promise) => {
        probe.promises[name] = 'pending';
        promise.then(() => probe.promises[name] = 'settled', () => probe.promises[name] = 'rejected');
    };
    probe.flySource = () => {
        probe.holdSource = true;
        probe.roots[0].updateDepth = -1;
        probe.track('sourceRoot', probe.roots[0].promiseUpdate());
    };
    const helper = Neo.vdom.Helper;
    const original = helper.updateBatch;
    helper.updateBatch = async function(batch) {
        const roots = Object.keys(batch.updates);
        if (!roots.some(id => id.startsWith('probe-'))) return original.call(this, batch);
        if (batch.windowId === windowIds[1] && probe.holdDestination) {
            await new Promise(resolve => probe.destinationGates.push(resolve));
        }
        const result = await original.call(this, batch);
        if (batch.windowId === windowIds[0] && roots.includes('probe-root-0') && probe.holdSource) {
            probe.holdSource = false;
            await new Promise(resolve => probe.releaseSource = resolve);
        }
        return result;
    };
    probe.middle.silentVdomUpdate = true;
    probe.middle.updateDepth = -1;
    probe.middle.update();
    probe.leaf.text = 'source text';
    probe.track('sourceLeaf', probe.leaf.promiseUpdate());
    if (order !== 'move-before-collection') probe.flySource();
}

function move() {
    const p = globalThis.reparentProbe;
    p.holdDestination = true;
    p.roots[0].remove(p.middle, false, true);
    p.roots[1].add(p.middle, true);
    p.roots[1].updateDepth = -1;
    p.track('destinationRoot', p.roots[1].promiseUpdate());
    p.middle.silentVdomUpdate = false;
    p.leaf.text = 'destination text';
    p.track('destinationLeaf', p.leaf.promiseUpdate());
    if (p.order === 'move-before-collection') p.flySource();
}

function allowDestination() {
    const p = globalThis.reparentProbe;
    p.holdDestination = false;
    for (const release of p.destinationGates) release();
}

function readModel() {
    const p = globalThis.reparentProbe;
    return {
        sameInstance: Neo.getComponent('probe-leaf') === p.leaf && p.leaf.parent === p.middle,
        window: ['source', 'destination'][p.windowIds.indexOf(p.leaf.windowId)],
        parentWindowMatches: p.middle.windowId === p.leaf.windowId,
        mounted: p.leaf.mounted, hasVnode: !!p.leaf.vnode,
        promises: {...p.promises}
    };
}

async function runCase(browser, url, order) {
    const context = await browser.newContext({viewport: {width: 1600, height: 1000}});
    let app, other;
    try {
        const source = await context.newPage();
        await source.goto(url);
        await source.locator('.planning-board').waitFor();
        const header = source.locator('.neo-tab-header-toolbar').filter({
            has: source.getByRole('tab', {name: 'Scheduler', exact: true})
        });
        await header.getByRole('tab', {name: 'Scheduler', exact: true}).click();
        const [destination] = await Promise.all([context.waitForEvent('page'),
            header.locator('.neo-toolbar-action:has(.fa-window-restore)').filter({visible: true}).click()]);
        await destination.locator('.planning-scheduler').waitFor();
        app = await attachPageSharedAppWorker({browser, page: source});
        other = await attachPageSharedAppWorker({browser, page: destination});
        assert.equal(app.targetId, other.targetId);
        const pages = [source, destination];
        const windowIds = await Promise.all(pages.map(page => page.evaluate(() => Neo.worker.Manager.windowId)));
        assert.notEqual(windowIds[0], windowIds[1]);
        const nodes = pages.map(page => page.locator('#probe-leaf'));
        const phases = {};
        async function snapshot(key) {
            const model = await app.evaluate(readModel);
            const [sourceDOM, destinationDOM] = await Promise.all(nodes.map(node => node.allTextContents()));
            assert(model.sameInstance && model.parentWindowMatches);
            phases[key] = {...model, sourceDOM, destinationDOM};
            return phases[key];
        }
        const wait = predicate => expect.poll(() => app.evaluate(predicate), {timeout: 6000}).toBe(true);
        await app.evaluate(install, {windowIds, order});
        if (order !== 'move-before-collection') await wait(() => !!reparentProbe.releaseSource);
        const initial = await snapshot('source');
        assert.equal(initial.window, 'source');
        assert(initial.mounted && initial.hasVnode && initial.sourceDOM.length === 1);
        await app.evaluate(move);
        await wait(() => !!reparentProbe.releaseSource && reparentProbe.destinationGates.length > 0);
        const moved = await snapshot('bothHeld');
        assert.equal(moved.window, 'destination');
        assert.equal(moved.mounted, false);
        assert.equal(moved.promises.destinationLeaf, 'pending');
        assert.deepEqual(moved.destinationDOM, []);

        if (order === 'destination-first') {
            await app.evaluate(allowDestination);
            await expect(nodes[1]).toHaveText('destination text');
            await wait(() => reparentProbe.promises.destinationLeaf === 'settled');
            const first = await snapshot('destinationFirst');
            assert.equal(first.promises.sourceRoot, 'pending');
            assert(first.mounted);
        }
        await app.evaluate(() => reparentProbe.releaseSource());
        await wait(() => reparentProbe.promises.sourceRoot === 'settled');
        const returned = await snapshot('sourceReplied');
        const earlySettlement = order !== 'destination-first' &&
            returned.destinationDOM.length === 0 && returned.promises.destinationLeaf === 'settled';
        if (order !== 'destination-first') {
            assert.deepEqual(returned.destinationDOM, []);
            assert.equal(returned.promises.destinationRoot, 'pending');
            await app.evaluate(allowDestination);
        }
        await wait(() => reparentProbe.promises.destinationRoot === 'settled');
        await expect(nodes[1]).toHaveText('destination text');
        await app.evaluate(() => {
            const p = reparentProbe;
            p.roots[0].updateDepth = -1;
            p.track('sourceCleanup', p.roots[0].promiseUpdate());
        });
        await wait(() => reparentProbe.promises.sourceCleanup === 'settled');
        await expect(nodes[0]).toHaveCount(0);
        const settled = await snapshot('final');
        assert(settled.window === 'destination' && settled.mounted && settled.hasVnode);
        assert(Object.values(settled.promises).every(value => value === 'settled'));
        const pixels = {sha256: sha256(await nodes[1].screenshot()), box: await nodes[1].boundingBox()};
        await app.evaluate(() => {
            reparentProbe.leaf.text = 'subsequent edit';
            reparentProbe.track('subsequentEdit', reparentProbe.leaf.promiseUpdate());
        });
        await wait(() => reparentProbe.promises.subsequentEdit === 'settled');
        await expect(nodes[1]).toHaveText('subsequent edit');
        await expect(nodes[0]).toHaveCount(0);
        return {order, earlySettlement, subsequentEditPaintedAndSettled: true, pixels, phases};
    } finally {
        await other?.close();
        await app?.close();
        await context.close();
    }
}

const server = createFileServer({root});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({channel: values.channel});
    const url = 'http://127.0.0.1:' + server.address().port + '/examples/dashboard/planning/index.html?theme=neo-theme-neo-dark';
    const report = {browser: browser.version(), sha256: hashes, runs: []};
    for (let repetition = 1; repetition <= repeat; repetition++) {
        for (const order of ['source-first', 'move-before-collection', 'destination-first']) {
            const row = await runCase(browser, url, order);
            report.runs.push({repetition, ...row});
            console.log(repetition, order, row.earlySettlement ? 'FAIL: destination promise settled before paint' : 'PASS');
        }
    }
    await writeFile(values.out, JSON.stringify(report, null, 2) + '\n');
    if (report.runs.some(run => run.earlySettlement)) process.exitCode = 1;
} finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}

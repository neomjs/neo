import {setup} from '../../setup.mjs';

const appName = 'OwedFlightFlagsTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VDomUpdate     from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';

/**
 * @summary Mounts root → intermediate → host, with a sibling of the intermediate, and returns them.
 * @param {String} prefix Unique id prefix
 * @returns {Promise<Object>}
 */
async function mountTree(prefix) {
    const root = Neo.create(Container, {
        appName,
        id   : `${prefix}-root`,
        items: [
            {module: Container, id: `${prefix}-intermediate`, items: [{module: Container, id: `${prefix}-host`, items: []}]},
            {module: Container, id: `${prefix}-sibling`, items: []}
        ]
    });

    await root.initVnode(true);
    root.mounted = true;
    await root.promiseUpdate();

    const [intermediate, sibling] = root.items,
          [host]                  = intermediate.items;

    return {host, intermediate, root, sibling}
}

/**
 * @summary Stages the intermediate silently and merges a host update into it
 * @param {Object} tree
 * @returns {{isSettled: Function, ticket: Promise}}
 */
function stageMergedHost({host, intermediate}) {
    let settled = false;

    intermediate.silentVdomUpdate = true;
    intermediate.updateDepth      = -1;
    intermediate.update();
    host.updateDepth = -1;
    host.vdom.cls = ['neo-container', 'owed-host-painted'];

    const ticket = host.promiseUpdate().then(() => {settled = true});

    expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true);

    return {isSettled: () => settled, ticket}
}

test.describe('An ancestor update leaves the flag of a descendant flight it does not run', () => {
    test('an unrelated root does not collect a staged owner', async () => {
        const a = await mountTree('unrelated-a'), b = await mountTree('unrelated-b');
        try {
            const {ticket, isSettled} = stageMergedHost(b);
            a.root.updateDepth = -1;
            await a.root.promiseUpdate();
            expect(isSettled()).toBe(false);
            expect(VDomUpdate.mergedCallbackMap.get(b.intermediate.id)?.children.has(b.host.id)).toBe(true);
            b.intermediate.silentVdomUpdate = false;
            await b.intermediate.promiseUpdate();
            await ticket;
            expect(b.host.vnode.className).toContain('owed-host-painted')
        } finally {a.root.destroy(); b.root.destroy()}
    });

    test('a staged owner in another window is not settled by this carrier', async () => {
        const tree = await mountTree('foreign'), {root,intermediate,host}=tree;
        try {
            const {isSettled} = stageMergedHost(tree);
            intermediate._windowId='other-window'; host._windowId='other-window';
            root.updateDepth=-1; await root.promiseUpdate();
            expect(isSettled()).toBe(false);
            expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true)
        } finally {root.destroy()}
    });

    test('one deep carrier adopts two independent staged owners', async () => {
        const root = Neo.create(Container,{appName,id:'twins-root',items:[
            {module:Container,id:'twins-a',items:[{module:Container,id:'twins-ha',items:[]}]},
            {module:Container,id:'twins-b',items:[{module:Container,id:'twins-hb',items:[]}]}
        ]});
        await root.initVnode(true);root.mounted=true;await root.promiseUpdate();
        try {
            const [a,b] = root.items;
            const first = stageMergedHost({intermediate:a,host:a.items[0]}),second=stageMergedHost({intermediate:b,host:b.items[0]});
            root.updateDepth=-1;await root.promiseUpdate();
            await Promise.all([first.ticket,second.ticket]);
            expect(first.isSettled()).toBe(true);expect(second.isSettled()).toBe(true);
            expect(a.items[0].vnode.className).toContain('owed-host-painted');
            expect(b.items[0].vnode.className).toContain('owed-host-painted')
        } finally {root.destroy()}
    });

    test('a host update requested after collection does not settle with the earlier payload', async () => {
        const tree = await mountTree('late'), {host,root}=tree, original=VdomHelper.updateBatch;
        let release, releaseLate, entered, enteredLate, batches=0;
        const reached     = new Promise(resolve => {entered=resolve}), gate = new Promise(resolve => {release=resolve}),
              reachedLate = new Promise(resolve => {enteredLate=resolve}), gateLate = new Promise(resolve => {releaseLate=resolve});
        try {
            const first = stageMergedHost(tree);
            VdomHelper.updateBatch = async data => {if (++batches===1) {entered(); await gate} else {enteredLate(); await gateLate} return original.call(VdomHelper,data)};
            root.updateDepth=-1;
            const carrier = root.promiseUpdate();
            await reached;
            host.vdom.cls=['neo-container','owed-host-later'];
            let   lateSettled = false;
            const late        = host.promiseUpdate().then(()=>{lateSettled=true});
            expect(lateSettled).toBe(false);
            release();
            await carrier;
            await first.ticket;
            await reachedLate;
            expect(lateSettled).toBe(false);
            releaseLate();
            await late;
            expect(host.vnode.className).toContain('owed-host-later')
        } finally {release?.(); releaseLate?.(); VdomHelper.updateBatch=original; root.destroy()}
    });
    test('a host promise merged into a staged intermediate survives a depth-1 update of the root', async () => {
        const tree                       = await mountTree('shallow'),
              {host, intermediate, root} = tree;

        try {
            const {isSettled, ticket} = stageMergedHost(tree);

            // The root renders itself only: its payload carries neither the intermediate nor the host
            root.updateDepth = 1;
            await root.promiseUpdate();

            expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true);
            expect(isSettled()).toBe(false);

            // The intermediate's own flight carries the host and settles its promise
            intermediate.silentVdomUpdate = false;
            intermediate.updateDepth      = -1;
            await intermediate.promiseUpdate();
            await Promise.race([ticket, new Promise((_, reject) => setTimeout(() => reject(new Error("owed host did not settle")), 1200))]);

            expect(isSettled()).toBe(true);
            expect(host.needsVdomUpdate).toBe(false)
        } finally {
            root.destroy()
        }
    });

    test('a host promise merged into a staged intermediate settles once a deep update of the root has rendered it', async () => {
        const tree                       = await mountTree('carried'),
              {host, intermediate, root} = tree;

        try {
            const {isSettled, ticket} = stageMergedHost(tree);

            // The root renders the whole tree, the host's change included, but collects no callback parked on the
            // intermediate's flight
            root.updateDepth = -1;
            await root.promiseUpdate();
            // The intermediate wakes on its flag, as Neo.layout.Base#set does after its silent window
            intermediate.silentVdomUpdate = false;
            intermediate.needsVdomUpdate && intermediate.update();
            await Promise.race([ticket, new Promise((_, reject) => setTimeout(() => reject(new Error("owed host did not settle")), 1200))]);

            expect(isSettled()).toBe(true)
            expect(host.vnode.className).toContain('owed-host-painted')
        } finally {
            root.destroy()
        }
    });

    test('a sparse depth-2 update of the root leaves the flag of a staged intermediate it sends as a reference', async () => {
        const tree                                = await mountTree('sparse'),
              {host, intermediate, root, sibling} = tree;

        try {
            const {isSettled, ticket} = stageMergedHost(tree);

            // A sibling merges into the root's staged update, so the root flies sparse: it expands the sibling and
            // sends the intermediate as a reference it does not render
            root.silentVdomUpdate = true;
            root.update();
            sibling.update();
            expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(sibling.id)).toBe(true);

            root.silentVdomUpdate = false;
            root.updateDepth      = 2;
            await root.promiseUpdate();
            intermediate.silentVdomUpdate = false;
            intermediate.needsVdomUpdate && intermediate.update();
            await Promise.race([ticket, new Promise((_, reject) => setTimeout(() => reject(new Error("owed host did not settle")), 1200))]);

            expect(isSettled()).toBe(true)
            expect(host.vnode.className).toContain('owed-host-painted')
        } finally {
            root.destroy()
        }
    });

    test('a deep update still clears the flag of every descendant it renders that owes no flight', async () => {
        const {host, intermediate, root} = await mountTree('deep');

        try {
            intermediate._needsVdomUpdate = true;
            host._needsVdomUpdate         = true;

            root.updateDepth = -1;
            await root.promiseUpdate();

            expect(intermediate.needsVdomUpdate).toBe(false);
            expect(host.needsVdomUpdate).toBe(false)
        } finally {
            root.destroy()
        }
    })
});


for (const carrier of ['logical', 'render']) {
    test(`only its rendered container carries a staged detached-owner branch: ${carrier}`, async () => {
        const logical = await mountTree('logical');
        const render  = await mountTree('render');

        try {
            render.intermediate.parentComponent = logical.root;
            expect(render.intermediate.parent).toBe(logical.root);
            expect(render.intermediate.parentId).toBe(render.root.id);
            expect(logical.root.items).not.toContain(render.intermediate);
            expect(render.root.items).toContain(render.intermediate);

            const {ticket, isSettled} = stageMergedHost(render);
            if (carrier === 'logical') {
                logical.root.updateDepth = -1;
                await logical.root.promiseUpdate();
                expect(isSettled(), 'a different render root has not painted the pending host').toBe(false);
                expect(VDomUpdate.mergedCallbackMap.get(render.intermediate.id)?.children.has(render.host.id)).toBe(true);
            }

            render.root.updateDepth = -1;
            await render.root.promiseUpdate();
            await Promise.race([
                ticket,
                new Promise((_, reject) => setTimeout(() => reject(new Error('real render root left its staged host pending')), 500))
            ]);
            expect(render.host.vnode.className).toContain('owed-host-painted');
        } finally {
            render.intermediate.parentComponent = null;
            render.root.destroy();
            logical.root.destroy();
        }
    });
}

test('a shallow root carries the nested merge owned inside its full-depth second payload', async () => {
    const root = Neo.create(Container, {
        appName,
        id   : 'group-root',
        items: [{module: Container, id: 'group-carrier', items: [
            {module: Container, id: 'group-intermediate', items: [{module: Container, id: 'group-host'}]}
        ]}]
    });
    await root.initVnode(true);
    root.mounted = true;
    await root.promiseUpdate();
    const [carrier] = root.items, [intermediate] = carrier.items, [host] = intermediate.items;
    try {
        const {ticket} = stageMergedHost({intermediate, host});
        root.silentVdomUpdate = true;
        root.update();
        carrier.updateDepth = -1;
        carrier.update();
        expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(carrier.id)).toBe(true);
        expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true);
        root.silentVdomUpdate = false;
        root.updateDepth = 1;
        await root.promiseUpdate();
        await Promise.race([
            ticket,
            new Promise((_, reject) => setTimeout(() => reject(new Error('nested full-depth carrier left its host pending')), 500))
        ]);
        expect(host.vnode.className).toContain('owed-host-painted');
    } finally {root.destroy()}
});


test('record bounded collection work on two different pending-owner distributions', async () => {
    const readings = [];
    for (const [width, unrelated] of [[5, 1000], [1000, 1], [1000, 0]]) {
        const label = `profile-${width}-${unrelated}`;
        const root  = Neo.create(Container, {appName, id: label,
            items: Array.from({length:width}, (_, i) => ({module:Container, id:`${label}-${i}`, items:[]}))
        });
        await root.initVnode(true);
        root.mounted = true;
        await root.promiseUpdate();
        const registry = VDomUpdate.mergedCallbackMap;
        const ids      = Array.from({length:unrelated}, (_, i) => `other-${label}-${i}`);
        // These pending owners are deliberately unrelated to this rendered tree.
        ids.forEach(id => VDomUpdate.registerMerged(id, id + '-child', 1, 1));
        const realGet = registry.get;
        let   lookups = 0;
        registry.get = function(...args) {lookups++; return realGet.apply(this,args)};
        const times = [];
        try {
            for (let i=0; i<12; i++) {
                root.updateDepth = -1;
                const start = performance.now();
                await root.promiseUpdate();
                times.push(performance.now()-start);
            }
        } finally {
            registry.get = realGet;
            ids.forEach(id=>registry.remove(id));
            root.destroy()
        }
        times.sort((a,b)=>a-b);
        readings.push({width,unrelated,lookups,medianMs:+times[6].toFixed(3)});
    }
    console.log('RENDER_CARRIER_PROFILE', JSON.stringify(readings));
});


test('measure collection in two real mounted trees sharing a window', async () => {
    test.setTimeout(30000);
    const readings = [];
    for (const [width, unseen] of [[5,1000], [1000,1],[1000,0]]) {
        const label = `real-${width}-${unseen}`;
        const root  = Neo.create(Container, {appName,id: label + '-root',
            items:Array.from({length:width},(_,i)=>({module:Container,id:label+'-child-'+i}))});
        const foreign = Neo.create(Container, {appName,id:label+'-other-root',
            items:Array.from({length:unseen},(_,i)=>({module:Container,id:label+'-foreign-'+i,
                items:[{module:Container,id:label+'-fleaf-'+i}]}))});
        for(const target of [root,foreign]) {
            await target.initVnode(true);
            target.mounted=true;
            await target.promiseUpdate()
        }
        const registry = VDomUpdate.mergedCallbackMap;
        const oldGet   = registry.get,lookup=Neo.getComponent;
        let   mapGets  = 0, foreignLookups=0, foreignComparisons=0;
        const siblings = foreign.items;
        for(const owner of siblings) VDomUpdate.registerMerged(owner.id,owner.items[0].id,1,1);
        registry.get=function(...args){mapGets++;return oldGet.apply(this,args)};
        Neo.getComponent=function(id){if(id?.startsWith?.(label+'-foreign-'))foreignLookups++;return lookup.call(this,id)};
        Object.defineProperty(siblings,'includes',{configurable:true,value:function(target){
            const pos = this.indexOf(target);
            foreignComparisons+=(pos===-1?this.length:pos+1);
            return pos!==-1
        }});
        const times = [];
        try {
            for(let i=0;i<12;i++){
                root.updateDepth=-1;
                const start = performance.now();
                await root.promiseUpdate();
                times.push(performance.now()-start)
            }
        }finally{
            delete siblings.includes;
            registry.get=oldGet; Neo.getComponent=lookup;
            for(const owner of siblings)registry.remove(owner.id);
            root.destroy();foreign.destroy()
        }
        times.sort((a,b)=>a-b);
        readings.push({width,unseen,mapGets,foreignLookups,foreignComparisons,medianMs:+times[6].toFixed(3)});
    }
    console.log('REAL_CARRIER_PROFILE',JSON.stringify(readings));
});

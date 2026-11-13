import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Empty DOM diffs still deliver component metadata through Manager, Main's queue and the real scroll addon.
 * @description The fixture changes native geometry as a font/layout change would, then sends only its correction.
 * The existing GridRowScrollPinning consumer restores the anchor before the Manager acknowledges either envelope.
 */
for (const forwarded of [false, true]) {
    test(`metadata-only ${forwarded ? 'VDom reply' : 'App update'} corrects the native anchor before replying`, async ({page}) => {
        await page.goto('/examples/container/base/index.html');
        await page.locator('#main-container .neo-button').first().waitFor({state: 'attached'});

        const result = await page.evaluate(async forwarded => {
            await Neo.Main.importAddon({name: 'GridRowScrollPinning'});
            const manager      = Neo.worker.Manager, updates = Neo.main.DeltaUpdates,
                  addon        = Neo.main.addon.GridRowScrollPinning,
                  wrapper      = document.createElement('div'), content = document.createElement('div'),
                  spacer       = document.createElement('div'), anchor = document.createElement('div'),
                  filler       = document.createElement('div'), events = [],
                  originalSend = manager.sendMessage, id = `metadata-only-${forwarded}`, viewId = `${id}-view`,
                  read         = () => ({top: wrapper.scrollTop, anchor: anchor.getBoundingClientRect().top - wrapper.getBoundingClientRect().top,
                      epoch: Number(wrapper.dataset.scrollEpoch || 0)}),
                  meta = {[viewId]: {scrollTop: 190, scrollCorrection: 40, scrollEpoch: 1}},
                  completed = Promise.withResolvers();
            wrapper.id = viewId;
            wrapper.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:100px;overflow:auto;overflow-anchor:none';
            content.id = `${id}-content`;
            spacer.style.height = '200px';
            anchor.textContent = 'Anchor';
            anchor.style.height = '20px';
            filler.style.height = '1000px';
            content.append(spacer, anchor, filler);
            wrapper.append(content);
            document.body.append(wrapper);
            addon.register({id, viewId, bodyIds: [content.id], verticalScrollbarId: viewId, pin: false});
            wrapper.scrollTop = 150;
            const before = read(), onUpdate = data => {
                if (data.replyId === id) events.push({kind: 'update', deltas: data.deltas.length, sameMeta: data.meta === meta})
            }, onUpdated = data => {
                if (data.replyId === id) events.push({kind: 'updated', ...read()})
            };
            updates.on('update', onUpdate, addon);
            updates.on('updated', onUpdated, addon);
            manager.sendMessage = function(destination, data, ...rest) {
                const result = originalSend.call(this, destination, data, ...rest);
                if (data.replyId === id) {
                    events.push({kind: 'reply', ...read()});
                    completed.resolve()
                }
                return result
            };

            try {
                spacer.style.height = '240px';
                const shifted = read(), payload = {deltas: [], meta};
                manager.onWorkerMessage({data: forwarded ? {
                    action: 'reply', destination: 'app', replyId: id, windowId: manager.windowId,
                    data  : {...payload, updateVdom: true}
                } : {action: 'updateVdom', destination: manager.windowId, origin: 'app', id, ...payload}});
                const immediate = events.map(event => event.kind);
                await completed.promise;
                return {before, shifted, after: read(), immediate, events}
            } finally {
                manager.sendMessage = originalSend;
                updates.un('update', onUpdate, addon);
                updates.un('updated', onUpdated, addon);
                addon.unregister({id});
                wrapper.remove()
            }
        }, forwarded);

        expect(result.shifted.anchor - result.before.anchor).toBe(40);
        expect(result.immediate).toEqual([]);
        expect(result.events.map(event => event.kind)).toEqual(['update', 'updated', 'reply']);
        expect(result.events[0]).toEqual({kind: 'update', deltas: 0, sameMeta: true});
        expect(result.after.top).toBe(190);
        expect(result.after.epoch).toBe(1);
        expect(result.after.anchor).toBe(result.before.anchor);
        expect(result.events[1].anchor).toBe(result.before.anchor);
        expect(result.events[2].anchor).toBe(result.before.anchor)
    })
}

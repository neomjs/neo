import {setup} from '../../setup.mjs';

const appName = 'MarkdownEmbeddedMountTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Markdown           from '../../../../src/component/Markdown.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

const baseApply = Neo.applyDeltas;

class DeferredMarkdown extends Markdown {
    static config = {className: 'Test.Unit.Component.MarkdownEmbeddedMount.DeferredMarkdown'}

    earlySet    = false
    mountDelays = []

    // Models the engine settling an update before the HTML it carries is sent, as it can at a remount
    set(values, silent) {
        const promise = super.set(values, silent);
        return this.earlySet ? Promise.resolve() : promise
    }

    processReadonlyCodeBlocks(code) {
        return Promise.resolve(code)
    }

    timeout(time, options) {
        if (time === 10) {
            return new Promise(resolve => this.mountDelays.push(resolve))
        }

        return super.timeout(time, options)
    }
}

Neo.setupClass(DeferredMarkdown);

/**
 * @summary A Markdown's embedded components mount into placeholders inside the Markdown's own HTML, so they may
 * insert only while that HTML is in the document, and a Markdown that leaves the document mounts them again when
 * it returns.
 */
test.describe('Neo.component.Markdown embedded mounts (#22338)', () => {
    const articleWith   = id => ['# Embedded', '', '```json neo-component', JSON.stringify({id, html: 'widget'}), '```'].join('\n'),
          childId       = 'markdown-embedded-widget',
          article       = articleWith(childId),
          secondChildId = 'markdown-embedded-widget-2',
          placeholderIn = payload => [...JSON.stringify(payload).matchAll(/(?:id=\\"|"id":")(neo-learn-content-component-\d+)/g)].map(match => match[1]),
          flush         = () => new Promise(resolve => setImmediate(resolve));

    let consoleError, dom, errors, heldHtml, holdHtml, inserts, markdown, onRejection;

    // Main's side of the contract, as DeltaUpdates keeps it: an insert whose parent is not in the document is skipped
    const applyAt = deltas => {
        let skippedInserts = 0;

        for (const delta of [deltas].flat()) {
            if (delta.action === 'insertNode') {
                inserts.push({id: delta.id, parentId: delta.parentId, skipped: !dom.has(delta.parentId)});

                if (!dom.has(delta.parentId)) {
                    skippedInserts++;
                    continue
                }

                dom.add(delta.id)
            }

            placeholderIn(delta).forEach(id => dom.add(id))
        }

        return skippedInserts ? {inserted: false, skippedInserts} : {}
    };

    const errorsNamingTheSkip = () => errors.filter(line => line.includes('Initial mount insertNode skipped'));

    // The child exists and no render of it is under way: a refused insert has settled, or none was sent
    const childSettled = (id = childId) => {
        const child = Neo.getComponent(id);
        return Boolean(child) && !child.isVnodeInitializing
    };

    const insertsOf = id => inserts.filter(insert => insert.id === id);

    /**
     * Mounts the Markdown, renders the article and parks the render at its mount delay, with the HTML in the document
     * @returns {Promise<String>} The child's placeholder id
     */
    async function renderToMountDelay() {
        markdown = Neo.create(DeferredMarkdown, {appName, windowId: 1});
        await markdown.initVnode(true);
        expect(markdown.mounted).toBe(true);

        markdown.value = article;
        await expect.poll(() => markdown.mountDelays.length).toBe(1);

        const [placeholder] = placeholderIn(markdown.html);
        expect(dom.has(placeholder), 'the render waits until its HTML is in the document').toBe(true);

        return placeholder
    }

    /**
     * Main removes the Markdown's DOM, then the engine marks the Markdown unmounted, as a route that hides its view does
     * @param {String} placeholder
     */
    function leaveTheDocument(placeholder) {
        dom.delete(placeholder);
        dom.delete(childId);
        markdown.mounted = false
    }

    /**
     * Main re-inserts the Markdown's DOM with an empty placeholder, then the engine marks the Markdown mounted
     * @param {String} placeholder
     */
    async function returnToTheDocument(placeholder) {
        dom.add(placeholder);
        markdown.mounted = true;
        await expect.poll(() => Neo.getComponent(childId)?.mounted).toBe(true)
    }

    test.beforeEach(() => {
        dom      = new Set(['document.body']);
        errors   = [];
        heldHtml = [];
        holdHtml = false;
        inserts  = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            // Main applies held HTML when the test releases it, against the document as it is then
            if (holdHtml && [deltas].flat().some(delta => delta.action !== 'insertNode' && placeholderIn(delta).length > 0)) {
                return new Promise(resolve => heldHtml.push(() => resolve(applyAt(deltas))))
            }

            return applyAt(deltas)
        };

        consoleError  = console.error;
        console.error = (...args) => errors.push(args.map(arg => String(arg?.message || arg)).join(' '));
        onRejection   = reason => errors.push(String(reason?.message || reason));
        process.on('unhandledRejection', onRejection)
    });

    test.afterEach(async () => {
        process.off('unhandledRejection', onRejection);
        heldHtml.forEach(release => release());
        markdown?.mountDelays.forEach(resume => resume());
        await flush();
        markdown?.destroy();
        [childId, secondChildId].forEach(id => Neo.getComponent(id)?.destroy());
        console.error   = consoleError;
        Neo.applyDeltas = baseApply
    });

    test('a child created after its Markdown left the document waits for the return instead of inserting into a missing placeholder', async () => {
        const placeholder = await renderToMountDelay();

        leaveTheDocument(placeholder);
        markdown.mountDelays[0]();

        await expect.poll(childSettled).toBe(true);
        await flush();

        expect(inserts.filter(({id}) => id === childId), 'no insert while the Markdown is out of the document').toEqual([]);
        expect(errorsNamingTheSkip()).toEqual([]);

        await returnToTheDocument(placeholder);

        expect(inserts.filter(({id}) => id === childId)).toEqual([{id: childId, parentId: placeholder, skipped: false}]);
        expect(errorsNamingTheSkip()).toEqual([])
    });

    test('a render whose HTML update settles before the HTML reaches the document inserts its children only after it lands', async () => {
        markdown = Neo.create(DeferredMarkdown, {appName, windowId: 1});
        await markdown.initVnode(true);

        markdown.earlySet = true;
        holdHtml          = true;
        markdown.value    = article;
        await expect.poll(() => markdown.mountDelays.length).toBe(1);

        const [placeholder] = placeholderIn(markdown.html);
        expect(dom.has(placeholder), 'Main has not received the HTML yet').toBe(false);

        markdown.mountDelays[0]();
        await expect.poll(childSettled).toBe(true);
        await flush();

        expect(inserts.filter(({id}) => id === childId), 'no insert before the HTML lands').toEqual([]);

        holdHtml = false;
        heldHtml.splice(0).forEach(release => release());

        await expect.poll(() => Neo.getComponent(childId)?.mounted).toBe(true);
        expect(inserts.filter(({id}) => id === childId)).toEqual([{id: childId, parentId: placeholder, skipped: false}]);
        expect(errorsNamingTheSkip()).toEqual([])
    });

    test('a render that replaces the content while a mount pass waits inserts its children only after its own HTML lands', async () => {
        markdown = Neo.create(DeferredMarkdown, {appName, windowId: 1});
        await markdown.initVnode(true);

        markdown.earlySet = true;
        holdHtml          = true;
        markdown.value    = article;
        await expect.poll(() => markdown.mountDelays.length).toBe(1);
        markdown.mountDelays[0]();
        await expect.poll(childSettled).toBe(true);

        markdown.value = articleWith(secondChildId);
        await expect.poll(() => markdown.mountDelays.length).toBe(2);

        const [placeholder] = placeholderIn(markdown.html);

        markdown.mountDelays[1]();
        await expect.poll(() => childSettled(secondChildId)).toBe(true);

        // Main applies the first render's HTML only
        heldHtml.shift()();
        await flush();
        await flush();

        expect(dom.has(placeholder), 'Main has not received the second HTML yet').toBe(false);
        expect(insertsOf(secondChildId), 'no insert before the second HTML lands').toEqual([]);
        expect(errorsNamingTheSkip()).toEqual([]);

        holdHtml = false;
        heldHtml.splice(0).forEach(release => release());

        await expect.poll(() => Neo.getComponent(secondChildId)?.mounted).toBe(true);
        expect(insertsOf(secondChildId)).toEqual([{id: secondChildId, parentId: placeholder, skipped: false}]);
        expect(insertsOf(childId), 'the replaced child never inserts').toEqual([]);
        expect(errorsNamingTheSkip()).toEqual([])
    })
});

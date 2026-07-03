import {setup} from '../../../setup.mjs';

const appName = 'MarkdownVirtualizationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper        from '../../../../../src/vdom/Helper.mjs';
import MarkdownComponent from '../../../../../src/component/markdown/Component.mjs';

/**
 * @summary Pins the settled-block windowing contract for marathon transcripts.
 *
 * The geometry is ESTIMATE-grade by design (operator calibration: over-mounting a page is fine;
 * the win is bounding DOM size in hundreds-of-pages sessions) — so assertions bound the mounted
 * window loosely (mounted ≪ total; window ± buffer pages) and never demand pixel-exact ranges.
 * Scroll input is simulated by invoking the component's scroll handler directly with synthetic
 * `{scrollTop, clientHeight}` payloads — the exact shape the Main-thread scroll event delivers.
 */

/** A marathon source: `count` paragraph blocks of one line each. */
const marathon = count => Array.from({length: count}, (item, index) => `Paragraph number ${index} with some words.`).join('\n\n') + '\n\n';

const blockChildren = component => component.vdom.cn.filter(node => !node.cls?.includes('neo-md-spacer'));
const spacers       = component => component.vdom.cn.filter(node => node.cls?.includes('neo-md-spacer'));

test.describe('Markdown settled-block windowing', () => {
    let component, runId = 0;

    test.beforeEach(async () => {
        await Promise.resolve();
        runId++;
        component = Neo.create(MarkdownComponent, {
            appName,
            id   : `markdown-virt-test-${runId}`,
            value: marathon(1000)
        });

        await component.initVnode();
        component.mounted = true
    });

    test.afterEach(() => {
        component.destroy();
        component = null
    });

    test('a 1000-block transcript mounts a bounded tail window, never the whole document', () => {
        const mounted = blockChildren(component);

        // Estimate-grade bound: viewport(fallback 800) + 1 buffer page at ~26px/paragraph
        // ≈ 62 blocks — assert the loose envelope, not the exact figure.
        expect(mounted.length).toBeGreaterThan(10);
        expect(mounted.length).toBeLessThan(200);
        expect(component.parser.blockCount).toBe(1000);

        // Initial render follows the tail: the LAST block is mounted, framed by a top spacer
        // carrying the evicted prefix's estimated height and an empty bottom spacer.
        const [top, bottom] = spacers(component);

        expect(spacers(component)).toHaveLength(2);
        expect(parseInt(top.style.height)).toBeGreaterThan(10000);
        expect(parseInt(bottom.style.height)).toBe(0);
        expect(mounted.at(-1).id).toBe(component.parser.blockMeta.at(-1).id)
    });

    test('scrolling to the top moves the window: head blocks mount, tail evicts, spacers swap roles', async () => {
        // Follow-mode exit needs a REAL upward jump: seed depth (a pin-echo-class event the
        // state machine ignores for windowing), then jump to the top.
        component.onTranscriptScroll({scrollTop: 20000, clientHeight: 800});
        component.onTranscriptScroll({scrollTop: 0, clientHeight: 800});
        await component.promiseUpdate();

        const
            mounted       = blockChildren(component),
            [top, bottom] = spacers(component),
            firstMetaId   = component.parser.blockMeta[0].id;

        expect(mounted[0].id).toBe(firstMetaId);
        expect(mounted.length).toBeLessThan(200);
        expect(parseInt(top.style.height)).toBe(0);
        expect(parseInt(bottom.style.height)).toBeGreaterThan(10000)
    });

    test('scrolling inside the mounted buffer is render-free; leaving it slides the window', async () => {
        component.onTranscriptScroll({scrollTop: 20000, clientHeight: 800});
        component.onTranscriptScroll({scrollTop: 0, clientHeight: 800});
        await component.promiseUpdate();

        const rangeBefore = [...component.mountedBlocks];

        // A few pixels of drift inside the buffer: the range must not move.
        component.onTranscriptScroll({scrollTop: 50, clientHeight: 800});
        expect(component.mountedBlocks).toEqual(rangeBefore);

        // A jump to the estimated middle must move it.
        component.onTranscriptScroll({scrollTop: 13000, clientHeight: 800});
        await component.promiseUpdate();

        expect(component.mountedBlocks).not.toEqual(rangeBefore);

        const [top, bottom] = spacers(component);

        expect(parseInt(top.style.height)).toBeGreaterThan(0);
        expect(parseInt(bottom.style.height)).toBeGreaterThan(0)
    });

    test('streaming appends keep following the tail while the user sits at the bottom', async () => {
        const tailIdBefore = component.parser.blockMeta.at(-1).id;

        component.setSilent({value: component.value + 'A freshly streamed paragraph.\n\n'});
        await component.promiseUpdate();

        const mounted = blockChildren(component);

        expect(component.parser.blockCount).toBe(1001);
        expect(mounted.at(-1).id).toBe(component.parser.blockMeta.at(-1).id);
        expect(mounted.at(-1).id).not.toBe(tailIdBefore);
        expect(mounted.length).toBeLessThan(200)
    });

    test('a user scrolled away from the bottom is NOT yanked to the tail by new appends', async () => {
        component.onTranscriptScroll({scrollTop: 20000, clientHeight: 800});
        component.onTranscriptScroll({scrollTop: 0, clientHeight: 800});
        await component.promiseUpdate();

        const headIdBefore = blockChildren(component)[0].id;

        component.setSilent({value: component.value + 'New content far below the reader.\n\n'});
        await component.promiseUpdate();

        // The head window survives; the new tail block stays evicted (bottom spacer grew).
        expect(blockChildren(component)[0].id).toBe(headIdBefore);
        expect(blockChildren(component).at(-1).id).not.toBe(component.parser.blockMeta.at(-1).id)
    });

    test('a value reset also resets the follow-state machine: the NEXT stream follows its tail', async () => {
        // Exit follow-mode like a real reader (depth seed, then an upward jump).
        component.onTranscriptScroll({scrollTop: 20000, clientHeight: 800});
        component.onTranscriptScroll({scrollTop: 0, clientHeight: 800});
        await component.promiseUpdate();

        expect(component.followMode).toBe(false);

        // The wipe — and then a brand-new transcript streams in.
        component.setSilent({value: null});
        await component.promiseUpdate();

        expect(component.followMode).toBe(true);
        expect(component.maxScrollSeen).toBe(0);

        component.setSilent({value: marathon(500)});
        await component.promiseUpdate();

        const mounted = blockChildren(component);

        // The fresh stream mounts its TAIL window — not the stale head window the previous
        // reader-mode state would have produced.
        expect(mounted.at(-1).id).toBe(component.parser.blockMeta.at(-1).id);
        expect(parseInt(spacers(component)[0].style.height)).toBeGreaterThan(5000)
    });

    test('virtualize: false renders every block with no spacers (the escape hatch)', async () => {
        component.virtualize = false;
        await component.promiseUpdate();

        expect(spacers(component)).toHaveLength(0);
        expect(blockChildren(component)).toHaveLength(1000)
    });

    test('estimates derive from parser units: a long fence dominates same-count paragraphs', () => {
        const
            meta  = component.parser.blockMeta,
            fence = {id: 'x', type: 'code', units: 100, open: false},
            para  = {id: 'y', type: 'paragraph', units: 1, open: false};

        expect(component.estimateHeight(fence)).toBeGreaterThan(component.estimateHeight(para) * 50);
        expect(meta.every(entry => entry.units >= 1)).toBe(true)
    });
});

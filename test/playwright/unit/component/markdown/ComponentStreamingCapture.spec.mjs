import {setup} from '../../../setup.mjs';

const appName = 'MarkdownStreamingCaptureTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../src/Neo.mjs';
import * as core             from '../../../../../src/core/_export.mjs';
import DomApiVnodeCreator    from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper            from '../../../../../src/vdom/Helper.mjs';
import {createDeltaCapture}  from '../../../util/DeltaCapture.mjs';
import MarkdownComponent     from '../../../../../src/component/markdown/Component.mjs';

/**
 * @summary The ticket's streaming ACs in their final executable form: DeltaCapture epoch windows.
 *
 * `Component.spec.mjs` pins the same invariants through per-call `promiseUpdate()` returns (the
 * legacy producer-return pattern); this suite asserts them the way the contract layer intends —
 * through the shared capture facade's epoch windows and kernel-vocabulary classification. Both
 * exist on purpose: the per-call spec survives without the capture utility, this one exercises
 * the utility as its first real framework consumer.
 *
 * Epoch grammar: every captured batch is additionally `validateBatch`-checked through
 * `findingsIn` — streaming the markdown component is itself a grammar-conformance corpus.
 */
test.describe('Neo.component.markdown.Component — capture-epoch streaming ACs', () => {
    let component, runId = 0;

    test.beforeEach(async () => {
        await Promise.resolve();
        runId++;
        component = Neo.create(MarkdownComponent, {
            appName,
            id        : `markdown-capture-test-${runId}`,
            value     : '# Title\n\nStreaming wor',
            // Parse-layer epoch contract: raw block children, no windowing geometry.
            virtualize: false
        });

        await component.initVnode();
        component.mounted = true
    });

    test.afterEach(() => {
        component.destroy();
        component = null
    });

    test('epoch-windowed chunks: tail growth is in-place, a new block is insert-only, every batch grammar-valid', async () => {
        const capture = createDeltaCapture({tap: 'helperReturn'});

        try {
            // Chunk 1: the open tail paragraph grows — in-place mutation only.
            capture.epoch('tail-growth');
            component.setSilent({value: '# Title\n\nStreaming words arriving'});
            await component.promiseUpdate();

            // Chunk 2: a blank line births a new block — insert-only tail batch.
            await capture.window('new-block', async () => {
                component.setSilent({value: '# Title\n\nStreaming words arriving\n\nA brand new paragraph'});
                await component.promiseUpdate()
            });

            // Chunk 3: a fence opens and streams — still no structural churn on settled blocks.
            capture.epoch('fence-stream');
            component.setSilent({value: '# Title\n\nStreaming words arriving\n\nA brand new paragraph\n\n```js\nconst a = 1;'});
            await component.promiseUpdate();

            const growthOps = capture.opsIn('tail-growth');

            // In-place only: updateVtext (text growth) and/or action-less updateNode.
            expect(Object.keys(growthOps).sort()).toEqual(
                Object.keys(growthOps).filter(op => ['updateNode', 'updateVtext'].includes(op)).sort()
            );
            expect((growthOps.insertNode ?? 0) + (growthOps.removeNode ?? 0) + (growthOps.moveNode ?? 0)).toBe(0);

            const blockOps = capture.opsIn('new-block');

            expect(blockOps.insertNode).toBeGreaterThan(0);
            expect((blockOps.removeNode ?? 0) + (blockOps.moveNode ?? 0)).toBe(0);

            const fenceOps = capture.opsIn('fence-stream');

            expect(fenceOps.insertNode).toBeGreaterThan(0);
            expect((fenceOps.removeNode ?? 0) + (fenceOps.moveNode ?? 0)).toBe(0);

            // Grammar conformance for free: every captured batch validates against the kernel.
            ['tail-growth', 'new-block', 'fence-stream'].forEach(epoch => {
                capture.findingsIn(epoch, {useDomApiRenderer: true}).forEach(result => {
                    expect(result.valid).toBe(true)
                })
            })
        } finally {
            capture.restore()
        }
    });

    test('the layer name on captured records is the vdom intent stream', async () => {
        const capture = createDeltaCapture({tap: 'helperReturn'});

        try {
            component.setSilent({value: '# Title\n\nStreaming words and more'});
            await component.promiseUpdate();

            const records = capture.recordsIn('default');

            expect(records.length).toBeGreaterThan(0);
            records.forEach(record => {
                expect(record.tap).toBe('helperReturn');
                expect(record.layer).toBe('vdom-pre-send')
            })
        } finally {
            capture.restore()
        }
    });
});

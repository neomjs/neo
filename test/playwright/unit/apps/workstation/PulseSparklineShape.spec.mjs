import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationPulseSparklineShapeTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Workspace      from '../../../../../apps/workstation/view/Workspace.mjs';

/**
 * @summary `pulseScaleSparkline` exists so a witness can prove the Canvas Worker paints new data.
 * The seed and the pulse draw their deltas from one family of nine cyclic patterns and the
 * sparkline normalises its values, so a pulse landing on the record's current pattern would
 * repaint the identical picture — the arm here pins that a pulse always changes the drawn shape.
 */

/**
 * The seed generator's trend for the record at `index` (`apps/workstation/store/Scale.mjs`).
 * @param {Number} index
 * @returns {Number[]}
 */
const seedTrend = index => {
    let signal = 24 + index % 48;

    return Array.from({length: 12}, (_, point) => {
        signal = Math.max(8, Math.min(92, signal + ((index * 3 + point * 5) % 9) - 4));
        return signal
    })
};

/**
 * A borrowed-prototype host: the method reads the pane cache, the feed store's sequence and the
 * component registry; nothing else of the workspace is needed to decide the trend.
 * @param {Object} record
 * @param {Number} sequence
 * @returns {Object}
 */
const createHost = (record, sequence) => ({
    getStateProvider: () => ({getStore: () => ({sequence})}),
    paneCache       : {scale: null},
    sparkline       : {id: 'pulse-sparkline', offscreenRegistered: true, record},
    timeout         : async () => {}
});

test.describe('Workstation.view.Workspace#pulseScaleSparkline — the pulse changes the drawn shape', () => {
    let originalGetComponent;

    test.beforeEach(() => {
        originalGetComponent = Neo.getComponent
    });

    test.afterEach(() => {
        Neo.getComponent = originalGetComponent
    });

    test('sameSparklineShape reads a trend as its deltas', () => {
        expect(Workspace.sameSparklineShape([10, 14, 12, 15], [30, 34, 32, 35]), 'an offset trend draws the same normalised line').toBe(true);
        expect(Workspace.sameSparklineShape([10, 14, 12, 15], [10, 14, 13, 15])).toBe(false);
        expect(Workspace.sameSparklineShape([10, 14, 12], [10, 14, 12, 15]), 'lengths must match').toBe(false);
        expect(Workspace.sameSparklineShape(null, [1, 2])).toBe(false)
    });

    test('a pulse whose sequence lands on the record\'s own pattern still changes the shape', async () => {
        // record 1 seeds with pattern offset 0 (index 0); a feed sequence of 9 selects the same
        // nine-cycle offset, the collision the dense control's Canvas receipt kept hitting
        const record = {id: 1, trend: seedTrend(0)},
              host   = createHost(record, 9),
              before = [...record.trend];

        Neo.getComponent = () => host.sparkline;

        const receipt = await Workspace.prototype.pulseScaleSparkline.call(host, host.sparkline.id);

        expect(receipt).toMatchObject({componentId: 'pulse-sparkline', recordId: 1});
        expect(receipt.values).toHaveLength(12);
        expect(Workspace.sameSparklineShape(before, receipt.values), 'the pulse must draw a different picture').toBe(false);
        expect(receipt.values.every(value => value >= 8 && value <= 92)).toBe(true)
    });

    test('a pulse whose sequence already differs keeps its first pattern', async () => {
        const record = {id: 1, trend: seedTrend(0)},
              host   = createHost(record, 10),
              before = [...record.trend];

        Neo.getComponent = () => host.sparkline;

        const receipt = await Workspace.prototype.pulseScaleSparkline.call(host, host.sparkline.id);

        let signal     = before.at(-1),
            expected   = Array.from({length: 12}, (_, point) => {
                signal = Math.max(8, Math.min(92, signal + ((10 + point * 5) % 9) - 4));
                return signal
            });

        expect(receipt.values, 'no advance when the shape already differs').toEqual(expected);
        expect(Workspace.sameSparklineShape(before, receipt.values)).toBe(false)
    })
});

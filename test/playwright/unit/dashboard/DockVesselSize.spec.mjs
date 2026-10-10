import {setup} from '../../setup.mjs';

setup();

import {expect, test} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Placement      from '../../../../src/dashboard/dock/window/Placement.mjs';

/**
 * @summary Pins the size a torn-out vessel opens at: the dragged pane's rendered size by
 * default, a host pin when given, the popup floor below, the screen less the window chrome above,
 * and the fallback when nothing was measured.
 */
test.describe('Dock vessel size', () => {
    const screen = {availHeight: 1080, availWidth: 1920};

    test('the source pane\'s rendered size wins over the drag proxy, rounded', () => {
        expect(Placement.resolveVesselSize({screen, sourceRect: {height: 412.4, width: 731.6, x: 10, y: 20}}))
            .toEqual({height: 412, width: 732})
    });

    test('a host pin beats the source', () => {
        expect(Placement.resolveVesselSize({pinned: {height: 600, width: 700}, screen, sourceRect: {height: 412, width: 732}}))
            .toEqual({height: 600, width: 700})
    });

    test('the popup floor holds below a small pane or a small pin', () => {
        expect(Placement.resolveVesselSize({screen, sourceRect: {height: 120, width: 180}})).toEqual({height: 240, width: 320});
        expect(Placement.resolveVesselSize({pinned: {height: 100, width: 100}, screen})).toEqual({height: 240, width: 320})
    });

    test('the screen less the window chrome caps a pane taller or wider than the usable area', () => {
        expect(Placement.resolveVesselSize({chrome: {height: 87, width: 0}, screen, sourceRect: {height: 1400, width: 2600}}))
            .toEqual({height: 993, width: 1920})
    });

    test('without a source, a pin or a screen the fallback applies, and an empty rect is no source', () => {
        expect(Placement.resolveVesselSize()).toEqual({height: 360, width: 480});
        expect(Placement.resolveVesselSize({sourceRect: {height: 0, width: 0}})).toEqual({height: 360, width: 480});
        expect(Placement.resolveVesselSize({sourceRect: null, screen: {availHeight: NaN, availWidth: undefined}})).toEqual({height: 360, width: 480})
    })
});

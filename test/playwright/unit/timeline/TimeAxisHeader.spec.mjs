import {setup} from '../../setup.mjs';

const appName = 'TimeAxisHeaderTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import TimeAxis       from '../../../../src/timeline/TimeAxis.mjs';
import TimeAxisHeader from '../../../../src/timeline/TimeAxisHeader.mjs';

test.describe('Neo.timeline.TimeAxisHeader', () => {
    test('registers ntype timeline-header and extends Neo.component.Base', () => {
        expect(Neo.ns('Neo.timeline.TimeAxisHeader')).toBe(TimeAxisHeader);
        expect(Component.prototype.isPrototypeOf(TimeAxisHeader.prototype)).toBe(true);

        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 0, 0, 0, 0),
            end        : new Date(2026, 10, 10, 0, 0, 0, 0),
            pxPerMinute: 1,
            tickUnit   : 'hour'
        });

        const header = Neo.ntype({
            ntype   : 'timeline-header',
            appName,
            timeAxis: axis
        });

        expect(header instanceof TimeAxisHeader).toBe(true);
        expect(header.width).toBe(1440);
        expect(header.flex).toBe('none');

        header.destroy();
        axis.destroy();
    });

    test('projects only viewport-visible major and minor ticks across a multi-day axis and updates on scrollLeft and zoom', () => {
        // 7 days = 168 hours = 10,080 minutes @ 1px/min => 10,080px total width
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 0, 0, 0, 0),
            end        : new Date(2026, 10, 16, 0, 0, 0, 0),
            pxPerMinute: 1,
            tickUnit   : 'hour',
            tickStep   : 1
        });

        const header = Neo.create(TimeAxisHeader, {
            appName,
            bufferPx     : 120, // 2 hours buffer
            scrollLeft   : 0,
            timeAxis     : axis,
            viewportWidth: 360  // 6 hours viewport => [0, 480px] = 8 hours visible
        });

        const [majorRow, minorRow] = header.vdom.cn;

        expect(header.width).toBe(10080);
        expect(header.vdom.style.width).toBe('10080px');
        // Only 8 minor hour ticks and 1 major day tick are mounted instead of all 168 hours
        expect(minorRow.cn.length).toBe(8);
        expect(majorRow.cn.length).toBe(1);
        expect(minorRow.cn[0].data.index).toBe('0');
        expect(minorRow.cn[0].style.left).toBe('0px');
        expect(minorRow.cn[0].style.width).toBe('60px');
        expect(minorRow.cn[7].data.index).toBe('7');

        // Scroll horizontally to day 2 (2880px = 48 hours in): window is [2880 - 120, 2880 + 360 + 120] = [2760, 3360] (hours 46..55 => 10 hours)
        header.scrollLeft = 2880;

        expect(minorRow.cn.length).toBe(10);
        expect(minorRow.cn[0].data.index).toBe('46');
        expect(minorRow.cn[0].style.left).toBe('2760px');
        expect(minorRow.cn[9].data.index).toBe('55');
        // Spanning midnight between Day 2 (hours 46..47) and Day 3 (hours 48..55) projects 2 major day ticks
        expect(majorRow.cn.length).toBe(2);

        // Zoom in: double pxPerMinute from 1 to 2 => totalSize doubles to 20,160px and each hour tick doubles to 120px
        axis.pxPerMinute = 2;

        expect(header.width).toBe(20160);
        expect(header.vdom.style.width).toBe('20160px');
        expect(minorRow.cn[0].style.width).toBe('120px');

        header.destroy();
        axis.destroy();
    });

    test('supports custom majorTickUnit, majorTickStep, majorFormatter, and minorFormatter', () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 12, 0, 0, 0),
            pxPerMinute: 2,
            tickUnit   : 'minute',
            tickStep   : 30
        });

        const header = Neo.create(TimeAxisHeader, {
            appName,
            bufferPx      : 0,
            majorFormatter: tick => `H-${tick.index}`,
            majorTickStep : 2,
            majorTickUnit : 'hour',
            minorFormatter: tick => `M-${tick.index}`,
            timeAxis      : axis,
            viewportWidth : 480
        });

        const [majorRow, minorRow] = header.vdom.cn;

        expect(majorRow.cn.length).toBe(2);
        expect(majorRow.cn[0].text).toBe('H-0');
        expect(majorRow.cn[1].text).toBe('H-1');

        expect(minorRow.cn.length).toBe(8);
        expect(minorRow.cn[0].text).toBe('M-0');
        expect(minorRow.cn[7].text).toBe('M-7');

        header.destroy();
        axis.destroy();
    });
});

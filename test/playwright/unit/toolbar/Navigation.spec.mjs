import {setup} from '../../setup.mjs';

const appName = 'ToolbarNavigationHistoryTest',
      windowA = 'toolbar-navigation-a',
      windowB = 'toolbar-navigation-b';

setup({
    appConfig: {name: appName, windowId: windowA},
    neoConfig: {allowVdomUpdatesInTests: false, routerMode: 'hash'}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Navigation     from '../../../../src/toolbar/Navigation.mjs';
import HashHistory    from '../../../../src/util/HashHistory.mjs';
import '../../../../src/manager/Instance.mjs';

test('projects the owning window’s normalized pathname and clears an unmatched destination', () => {
    const originalStacks  = HashHistory.stacks,
          originalConfigs = Neo.windowConfigs;

    HashHistory.stacks = {};
    Neo.windowConfigs  = {...originalConfigs, [windowA]: {routerMode: 'pathname', routerBasePath: '/desk'}};

    let navigation;

    try {
        HashHistory.push({hashString: '/desk/reports?tab=queue#details', windowId: windowA});

        navigation = Neo.create(Navigation, {
            appName,
            windowId: windowA,
            items   : [
                {route: 'reports/?tab=queue#details', text: 'Reports'},
                {route: '/account', text: 'Account'}
            ]
        });

        const [reports, account] = navigation.items,
              currentMarkers     = () => [reports, account].map(item => item.getVdomRoot()['aria-current']);

        expect(reports.getVdomRoot()).toMatchObject({href: '/desk/reports/?tab=queue#details', tag: 'a'});
        expect(currentMarkers(), 'the pre-existing route marks one destination at construction').toEqual(['page', undefined]);

        HashHistory.push({hashString: '/account', windowId: windowB});

        expect(currentMarkers(), 'a different window cannot change this bar').toEqual(['page', undefined]);

        HashHistory.push({hashString: '/unknown', windowId: windowA});

        expect(currentMarkers(), 'an unmatched local route clears the marker').toEqual([undefined, undefined]);

        HashHistory.push({hashString: '/account', windowId: windowA});

        expect(currentMarkers(), 'a matching local route moves the marker').toEqual([undefined, 'page'])
    } finally {
        navigation?.destroy();
        HashHistory.stacks = originalStacks;
        originalConfigs === undefined ? delete Neo.windowConfigs : Neo.windowConfigs = originalConfigs
    }
});

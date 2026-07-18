import {setup}                  from '../../../../setup.mjs';
import {expect, test}           from '@playwright/test';
import Neo                      from '../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../src/core/_export.mjs';
import {wireFleetCatchUpSource} from '../../../../../../ai/services/fleet/wireFleetCatchUpSource.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'WireFleetCatchUpSourceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

test.describe('wireFleetCatchUpSource', () => {
    test('leaves the bridge unwired when any authority seam is absent', () => {
        const bridge = {};

        expect(wireFleetCatchUpSource({bridge})).toBeNull();
        expect(bridge.historySource).toBeUndefined()
    });

    test('installs exactly one process-lifetime source with the injected seams', () => {
        const bridge       = {},
              seen         = [],
              source       = {readHistory() {}},
              createSource = options => {
                  seen.push(options);
                  return source
              },
              exploreMemoryHistory      = () => {},
              explorePullRequestHistory = () => {},
              resolveViewerIdentity     = () => '@neo-gpt-emmy',
              now                       = () => new Date();

        expect(wireFleetCatchUpSource({
            bridge,
            createSource,
            exploreMemoryHistory,
            explorePullRequestHistory,
            resolveViewerIdentity,
            now
        })).toBe(source);
        expect(bridge.historySource).toBe(source);
        expect(seen).toEqual([{
            exploreMemoryHistory,
            explorePullRequestHistory,
            resolveViewerIdentity,
            now
        }])
    });
});

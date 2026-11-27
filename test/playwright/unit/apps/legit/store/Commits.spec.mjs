import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'LegitCommitHistoryTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Commits        from '../../../../../../apps/legit/store/Commits.mjs';

test('the history grid receives the Git committer time and sorts newest first', () => {
    const store = Neo.create(Commits);

    try {
        store.data = [
            {oid: 'a', author: {timestamp: 300}, committer: {timestamp: 100}},
            {oid: 'b', author: {timestamp:  50}, committer: {timestamp: 200}}
        ];

        expect(store.items.map(({oid, timestamp}) => [oid, timestamp])).toEqual([['b', 200], ['a', 100]])
    } finally {
        store.destroy()
    }
});

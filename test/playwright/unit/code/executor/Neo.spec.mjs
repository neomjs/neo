/**
 * @file test/playwright/unit/code/executor/Neo.spec.mjs
 * @summary Pins `Neo.code.executor.Neo#execute` staleness handling, settlement timing, and relative `../` import
 * resolution across unbundled `development` and `dist/esm` environments.
 *
 * Each run resolves its imports before it renders. A run that `current` no longer names by then must not touch the
 * container, or two quick edits stack two results. The browser witness is
 * `component/code/LivePreview.spec.mjs` ("rapid native edits of a Neo.mjs source").
 */

import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'CodeExecutorTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import Component        from '../../../../../src/component/Base.mjs';
import FunctionalBase   from '../../../../../src/functional/component/Base.mjs';
import Executor         from '../../../../../src/code/executor/Neo.mjs';
import '../../../../../src/manager/Instance.mjs';

// An import that resolves a few ticks later, as a run's own imports do
const source = name => `import path from 'node:path';
class Probe extends Neo.component.Base {
    static config = {className: 'Test.executor.${name}'}
}
Probe = Neo.setupClass(Probe);`;

test.describe('Neo.code.executor.Neo#execute', () => {
    let calls, container, executor, savedEnvironment;

    test.beforeEach(() => {
        calls            = [];
        savedEnvironment = Neo.config.environment;
        executor         = Neo.create(Executor);
        container        = {
            add      : ({html, module}) => calls.push(`add ${module?.prototype.className ?? html}`),
            removeAll: () => calls.push('removeAll')
        }
    });

    test.afterEach(() => {
        Neo.config.environment = savedEnvironment;
        executor.destroy()
    });

    test('a run superseded before its imports resolve leaves the container to the newer run', async () => {
        let latest = 0;

        const run = name => {
            const id = ++latest;
            return executor.execute({code: source(name), container, current: () => latest === id})
        };

        await Promise.all([run('First'), run('Second')]);

        expect(calls).toEqual(['removeAll', 'add Test.executor.Second'])
    });

    test('execute() settles once its run has rendered', async () => {
        await executor.execute({code: source('Only'), container, current: () => true});

        expect(calls).toEqual(['removeAll', 'add Test.executor.Only'])
    });

    test('resolves relative ../ engine imports in dist/esm just like development', async () => {
        const relativeSource = envLabel => `import {defineComponent} from '../functional/_export.mjs';
export default defineComponent({
    config: {
        className: 'Test.Unit.Code.Executor.${envLabel}'
    },
    createVdom() {
        return {text: '${envLabel}'}
    }
});`;

        Neo.config.environment = 'development';
        await executor.execute({code: relativeSource('Development'), container, current: () => true});

        Neo.config.environment = 'dist/esm';
        await executor.execute({code: relativeSource('DistEsm'), container, current: () => true});

        expect(calls).toEqual([
            'removeAll',
            'add Test.Unit.Code.Executor.Development',
            'removeAll',
            'add Test.Unit.Code.Executor.DistEsm'
        ])
    })
});

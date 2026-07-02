import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'LifecycleStateResolverTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    getLifecycleStateIdentityKey,
    readLifecycleState,
    resolveLifecycleStateFile
} from '../../../../../../ai/scripts/lifecycle/lifecycleState.mjs';
import {
    buildLifecycleState,
    writeLifecycleStateFile
} from '../../../../../../ai/services/graph/lifecycleStateWriter.mjs';

test.describe('ai/scripts/lifecycle/lifecycleState', () => {
    test('resolves neutral .neo-ai-data paths and per-agent keyed files (#14473)', () => {
        const homeDir = path.join(os.tmpdir(), 'neo-lifecycle-home');
        const env     = {};

        expect(getLifecycleStateIdentityKey('@neo-gpt')).toBe('neo-gpt');
        expect(resolveLifecycleStateFile({agentIdentity: '@neo-gpt', env, homeDir}))
            .toBe(path.join(homeDir, '.neo-ai-data', 'lifecycle-state', 'neo-gpt.json'));
        expect(resolveLifecycleStateFile({agentIdentity: '@neo-opus-vega', env, homeDir}))
            .toBe(path.join(homeDir, '.neo-ai-data', 'lifecycle-state', 'neo-opus-vega.json'));
        expect(resolveLifecycleStateFile({agentIdentity: '@neo-gpt', env, homeDir}))
            .not.toBe(resolveLifecycleStateFile({agentIdentity: '@neo-opus-vega', env, homeDir}));
    });

    test('NEO_AI_DAEMON_DIR overrides the neutral root for both reader and writer (#14473)', () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-lifecycle-root-'));
        const env     = {NEO_AI_DAEMON_DIR: rootDir};

        try {
            const written = writeLifecycleStateFile({
                agentIdentity: '@neo-gpt',
                env,
                state        : {
                    agentIdentity: '@neo-gpt',
                    generatedAt  : '2026-07-02T14:30:00.000Z',
                    openPRs      : [{number: 14473, state: 'OPEN'}]
                }
            });

            expect(written).toBe(path.join(rootDir, 'lifecycle-state', 'neo-gpt.json'));
            expect(readLifecycleState({agentIdentity: '@neo-gpt', env})).toMatchObject({
                agentIdentity: '@neo-gpt',
                openPRs      : [{number: 14473, state: 'OPEN'}]
            });
        } finally {
            fs.rmSync(rootDir, {recursive: true, force: true});
        }
    });

    test('explicit env identity wins over process env fallback (#14473)', () => {
        const previousIdentity = process.env.NEO_AGENT_IDENTITY;
        const homeDir          = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-lifecycle-env-'));

        process.env.NEO_AGENT_IDENTITY = '@process-agent';

        try {
            expect(resolveLifecycleStateFile({
                env: {NEO_AGENT_IDENTITY: '@env-agent'},
                homeDir
            })).toBe(path.join(homeDir, '.neo-ai-data', 'lifecycle-state', 'env-agent.json'));
        } finally {
            if (previousIdentity === undefined) {
                delete process.env.NEO_AGENT_IDENTITY;
            } else {
                process.env.NEO_AGENT_IDENTITY = previousIdentity;
            }
            fs.rmSync(homeDir, {recursive: true, force: true});
        }
    });

    test('canonical per-agent file wins over legacy unkeyed hook file (#14473)', () => {
        const rootDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-lifecycle-legacy-'));
        const legacyPath = path.join(rootDir, 'lifecycle-state.json');
        const env        = {NEO_AI_DAEMON_DIR: rootDir};

        try {
            fs.writeFileSync(legacyPath, JSON.stringify({generatedAt: 'legacy', openPRs: [{number: 1}]}), 'utf8');
            writeLifecycleStateFile({
                agentIdentity: '@neo-gpt',
                env,
                state        : {
                    agentIdentity: '@neo-gpt',
                    generatedAt  : 'canonical',
                    openPRs      : [{number: 14473}]
                }
            });

            expect(readLifecycleState({agentIdentity: '@neo-gpt', env, legacyFilePath: legacyPath})).toMatchObject({
                agentIdentity: '@neo-gpt',
                generatedAt  : 'canonical',
                openPRs      : [{number: 14473}]
            });
        } finally {
            fs.rmSync(rootDir, {recursive: true, force: true});
        }
    });

    test('per-agent writes cannot clobber peer boards (#14473)', () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-lifecycle-peers-'));
        const env     = {NEO_AI_DAEMON_DIR: rootDir};

        try {
            writeLifecycleStateFile({
                agentIdentity: '@neo-gpt',
                env,
                state        : {agentIdentity: '@neo-gpt', generatedAt: 'gpt'}
            });
            writeLifecycleStateFile({
                agentIdentity: '@neo-opus-vega',
                env,
                state        : {agentIdentity: '@neo-opus-vega', generatedAt: 'vega'}
            });

            expect(readLifecycleState({agentIdentity: '@neo-gpt', env}).generatedAt).toBe('gpt');
            expect(readLifecycleState({agentIdentity: '@neo-opus-vega', env}).generatedAt).toBe('vega');
        } finally {
            fs.rmSync(rootDir, {recursive: true, force: true});
        }
    });

    test('builds bounded hook board data from verified sources (#14473)', async () => {
        const state = await buildLifecycleState({
            agentIdentity : '@neo-gpt',
            generatedAt   : '2026-07-02T15:00:00.000Z',
            mailboxService: {
                countMessages: async ({box, status}) => box === 'inbox' && status === 'unread'
                    ? {count: 3}
                    : {count: 0}
            },
            prs: [{
                author   : {login: 'neo-gpt'},
                createdAt: '2026-07-02T14:00:00.000Z',
                number   : 14470,
                reviews  : [{state: 'APPROVED'}]
            }, {
                author   : {login: 'neo-gpt'},
                createdAt: '2026-07-02T15:00:00.000Z',
                number   : 14473,
                reviews  : [{state: 'CHANGES_REQUESTED'}]
            }, {
                author   : {login: 'neo-opus-ada'},
                createdAt: '2026-07-02T15:05:00.000Z',
                number   : 14478,
                reviews  : []
            }],
            requestContextService: {
                getAgentIdentityNodeId: () => '@neo-gpt'
            },
            routedTopNodes: [{
                node : {id: 'issue-14473', properties: {title: 'Lifecycle state'}},
                score: 42
            }]
        });

        expect(state).toMatchObject({
            agentIdentity      : '@neo-gpt',
            generatedAt        : '2026-07-02T15:00:00.000Z',
            goldenPathDirection: [{id: 'issue-14473', score: 42, title: 'Lifecycle state'}],
            openPRs            : [
                {number: 14473, state: 'CHANGES_REQUESTED'},
                {number: 14470, state: 'APPROVED'}
            ],
            unreadCount: 3
        });
    });
});

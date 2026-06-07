import {setup} from '../../../../../../setup.mjs';

const appName = 'PolicyServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import path           from 'path';
import PolicyService, {
    PolicyRefusedError
} from '../../../../../../../../ai/mcp/server/shared/services/PolicyService.mjs';

test.describe('Neo.ai.mcp.server.shared.services.PolicyService (#10294)', () => {
    test('refuses exact repo-root protected writes with stable metadata', () => {
        const protectedPath = path.join(process.cwd(), 'AGENTS_TENETS.md');

        expect(() => PolicyService.assertProtectedRepoRootWrite({
            toolName              : 'write_file',
            args                  : {absolutePath: protectedPath},
            protectedRelativePath : 'AGENTS_TENETS.md',
            policyId              : 'test.policy',
            reason                : 'tenets protected',
            tenet                 : '#10293'
        })).toThrow(PolicyRefusedError);

        try {
            PolicyService.assertProtectedRepoRootWrite({
                toolName             : 'write_file',
                args                 : {absolutePath: protectedPath},
                protectedRelativePath: 'AGENTS_TENETS.md',
                policyId             : 'test.policy',
                reason               : 'tenets protected',
                tenet                : '#10293'
            });
        } catch (error) {
            expect(error).toMatchObject({
                code    : 'POLICY_REFUSED',
                reason  : 'tenets protected',
                policyId: 'test.policy',
                action  : 'write_file',
                tenet   : '#10293'
            });
            expect(error.details.targetPath).toBe(protectedPath);
        }
    });

    test('refuses case-variant protected writes with stable diagnostics', () => {
        const protectedPath = path.join(process.cwd(), 'AGENTS_TENETS.md');
        const targetPath    = path.join(process.cwd(), 'agents_tenets.md');

        try {
            PolicyService.assertProtectedRepoRootWrite({
                toolName             : 'write_file',
                args                 : {absolutePath: targetPath},
                protectedRelativePath: 'AGENTS_TENETS.md',
                policyId             : 'test.policy',
                reason               : 'tenets protected',
                tenet                : '#10293'
            });
        } catch (error) {
            expect(error).toMatchObject({
                code    : 'POLICY_REFUSED',
                reason  : 'tenets protected',
                policyId: 'test.policy',
                action  : 'write_file',
                tenet   : '#10293'
            });
            expect(error.details.protectedPath).toBe(protectedPath);
            expect(error.details.targetPath).toBe(targetPath);
            return;
        }

        throw new Error('Expected case-variant protected path to be refused');
    });

    test('allows non-write tools, missing path args, and neighboring paths', () => {
        const common = {
            protectedRelativePath: 'AGENTS_TENETS.md',
            policyId             : 'test.policy',
            reason               : 'tenets protected'
        };

        expect(() => PolicyService.assertProtectedRepoRootWrite({
            ...common,
            toolName: 'read_file',
            args    : {absolutePath: path.join(process.cwd(), 'AGENTS_TENETS.md')}
        })).not.toThrow();

        expect(() => PolicyService.assertProtectedRepoRootWrite({
            ...common,
            toolName: 'write_file',
            args    : {}
        })).not.toThrow();

        expect(() => PolicyService.assertProtectedRepoRootWrite({
            ...common,
            toolName: 'write_file',
            args    : {absolutePath: path.join(process.cwd(), 'tmp', 'AGENTS_TENETS.md')}
        })).not.toThrow();
    });
});

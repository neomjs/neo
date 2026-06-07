import {setup} from '../../../../setup.mjs';

const appName = 'FileSystemPolicyTest';

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

import {test, expect}                                  from '@playwright/test';
import {CallToolRequestSchema}                         from '@modelcontextprotocol/sdk/types.js';
import Neo                                             from '../../../../../../src/Neo.mjs';
import * as core                                       from '../../../../../../src/core/_export.mjs';
import path                                            from 'path';
import FileSystemServer                                from '../../../../../../ai/mcp/server/file-system/Server.mjs';

function makeMockMcpServer() {
    const handlers = new Map();
    return {
        server: {
            setRequestHandler(schema, handler) {
                handlers.set(schema, handler);
            }
        },
        getCallToolHandler() { return handlers.get(CallToolRequestSchema); },
        handlerCount()       { return handlers.size; }
    };
}

let _testClassCounter = 0;
function makeTestFileSystemServerClass(callTool) {
    const id = ++_testClassCounter;
    class TestFileSystemServer extends FileSystemServer {
        static config = {
            className: `Neo.test.mcp.server.FileSystemPolicyServer${id}`
        }

        async initAsync() { /* isolated unit test: skip transport boot */ }

        getToolService() {
            return {
                listTools: () => ({tools: [], nextCursor: undefined}),
                callTool
            };
        }
    }
    return Neo.setupClass(TestFileSystemServer);
}

test.describe('Neo.ai.mcp.server.file-system.Server policy guard (#10294)', () => {
    test('refuses write_file for repo-root AGENTS_TENETS.md before tool dispatch', async () => {
        const calls = [];
        const Cls   = makeTestFileSystemServerClass(async (name, args) => {
            calls.push({name, args});
            return 'should-not-run';
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();

        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {
                name     : 'write_file',
                arguments: {
                    absolutePath: path.join(process.cwd(), 'AGENTS_TENETS.md'),
                    content     : 'blocked'
                }
            }
        });

        expect(calls).toEqual([]);
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
            error   : 'Policy Refused',
            code    : 'POLICY_REFUSED',
            policyId: 'file-system.agents-tenets.write-protect',
            action  : 'write_file',
            tenet   : '#10293'
        });
    });

    test('refuses write_file for case-variant repo-root AGENTS_TENETS.md before tool dispatch', async () => {
        const calls = [];
        const Cls   = makeTestFileSystemServerClass(async (name, args) => {
            calls.push({name, args});
            return 'should-not-run';
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();

        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {
                name     : 'write_file',
                arguments: {
                    absolutePath: path.join(process.cwd(), 'agents_tenets.md'),
                    content     : 'blocked'
                }
            }
        });

        expect(calls).toEqual([]);
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
            error   : 'Policy Refused',
            code    : 'POLICY_REFUSED',
            policyId: 'file-system.agents-tenets.write-protect',
            action  : 'write_file',
            tenet   : '#10293'
        });
    });

    test('allows write_file for non-protected paths', async () => {
        const calls = [];
        const Cls   = makeTestFileSystemServerClass(async (name, args) => {
            calls.push({name, args});
            return {status: 'called'};
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();

        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {
                name     : 'write_file',
                arguments: {
                    absolutePath: path.join(process.cwd(), 'tmp', 'AGENTS_TENETS.copy.md'),
                    content     : 'allowed'
                }
            }
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].name).toBe('write_file');
        expect(result.isError).toBe(false);
        expect(result.structuredContent).toEqual({status: 'called'});
    });

    test('allows other file-system tools to reach dispatch', async () => {
        const calls = [];
        const Cls   = makeTestFileSystemServerClass(async (name, args) => {
            calls.push({name, args});
            return {status: 'read'};
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();

        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {
                name     : 'read_file',
                arguments: {
                    absolutePath: path.join(process.cwd(), 'AGENTS_TENETS.md')
                }
            }
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].name).toBe('read_file');
        expect(result.isError).toBe(false);
    });
});

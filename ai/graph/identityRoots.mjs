/**
 * @summary Central definition of AgentIdentity and BroadcastSentinel root nodes for the Memory Core Graph.
 *
 * This shared list provides the definitive addressable identity surface for the A2A Mailbox
 * substrate (#10139).
 *
 * It is used for both:
 * 1. Boot-time self-seeding in `GraphService.initAsync` (#10232)
 * 2. Explicit manual recovery via `ai/scripts/seedAgentIdentities.mjs`
 */

export const IDENTITIES = [
    {
        id: '@neo-opus-4-7',
        type: 'AgentIdentity',
        name: 'Claude Opus 4.7',
        description: 'Anthropic Claude Opus version 4.7 Agent Identity',
        properties: {
            githubLogin: '@neo-opus-4-7',
            displayName: 'Claude Opus 4.7',
            modelFamily: 'claude',
            accountType: 'agent',
            subscriptionTemplate: {
                trigger: 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata: {
                    appName: 'Claude'
                }
            },
            createdAt: new Date().toISOString()
        }
    },
    {
        id: '@neo-gemini-3-1-pro',
        type: 'AgentIdentity',
        name: 'Gemini 3.1 Pro',
        description: 'Google Gemini 3.1 Pro Agent Identity',
        properties: {
            githubLogin: '@neo-gemini-3-1-pro',
            displayName: 'Gemini 3.1 Pro',
            modelFamily: 'gemini',
            accountType: 'agent',
            subscriptionTemplate: {
                trigger: 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata: {
                    appName: 'Gemini'
                }
            },
            createdAt: new Date().toISOString()
        }
    },
    {
        id: '@tobiu',
        type: 'AgentIdentity',
        name: 'Tobias Uhlig',
        description: 'Human Owner',
        properties: {
            githubLogin: '@tobiu',
            displayName: 'Tobias Uhlig',
            modelFamily: null,
            accountType: 'human',
            createdAt: new Date().toISOString()
        }
    },
    {
        id: 'AGENT:*',
        type: 'BroadcastSentinel',
        name: 'Broadcast',
        description: 'Mailbox broadcast sentinel. `SENT_TO` edges targeting this node fan out to all authenticated recipients per MailboxService.listMessages visibility rules. Must exist as a real graph node so GraphService.linkNodes FK-style guard does not cull broadcast edges — see #10174.',
        properties: {
            githubLogin: null,
            displayName: 'Broadcast',
            modelFamily: null,
            accountType: 'sentinel',
            createdAt: new Date().toISOString()
        }
    }
];

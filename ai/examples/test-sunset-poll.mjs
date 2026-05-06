import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import {
    Memory_SessionService,
    Memory_GraphService,
} from '../services.mjs';

import MailboxService from '../mcp/server/memory-core/services/MailboxService.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

async function run() {
    console.log('🧪 Testing Piece B Sunset Handover Poller (L2 Coverage)');

    try {
        await Memory_SessionService.ready();
        const mailboxService = MailboxService;
        if (typeof mailboxService.ready === 'function') {
            await mailboxService.ready();
        }

        let summarizeCalled = false;
        
        // Mock summarizeSessions to detect if the poller works
        Memory_SessionService.summarizeSessions = async () => {
            summarizeCalled = true;
            console.log('✅ summarizeSessions was triggered by the poller!');
        };

        const testMessageId = 'MESSAGE:test-sunset-' + Date.now();
        const agentId = '@neo-test-agent';

        console.log(`📥 Injecting Sunset Self-DM via GraphService (Message ID: ${testMessageId})`);
        
        const nodeData = {
            id: testMessageId,
            type: 'MESSAGE',
            properties: {
                messageId: testMessageId,
                from: agentId,
                to: agentId,
                subject: 'Sunset Protocol Handover',
                sentAt: new Date().toISOString(),
                priority: 'normal',
                status: 'delivered',
                taggedConcepts: ['sunset-protocol-handover'],
                wakeSuppressed: true,
                readAt: null
            }
        };

        const insertStmt = Memory_GraphService.db.storage.db.prepare(`
            INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)
        `);
        insertStmt.run(testMessageId, null, JSON.stringify(nodeData));

        console.log('🔍 Checking SQLite directly...');
        const stmt = Memory_GraphService.db.storage.db.prepare(`
            SELECT id, data FROM Nodes 
            WHERE json_extract(data, '$.type') = 'MESSAGE' AND id = ?
        `);
        const row = stmt.get(testMessageId);
        console.log('Direct SQLite Row:', row ? row.data : 'NOT FOUND');

        console.log('🔍 Running pollForSunsetHandovers()...');
        await Memory_SessionService.pollForSunsetHandovers();

        if (summarizeCalled) {
            console.log('🎉 SUCCESS: Poller correctly detected the sunset self-DM and triggered summarization.');
            process.exit(0);
        } else {
            console.error('❌ FAILED: Poller did NOT trigger summarization.');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ Test execution failed:', e);
        process.exit(1);
    }
}

run();

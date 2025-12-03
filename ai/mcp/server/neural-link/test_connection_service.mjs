import Neo from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs';
import ConnectionService from './services/ConnectionService.mjs';

console.log('ConnectionService imported');
console.log('Is instance?', ConnectionService instanceof Neo.core.Base);

try {
    await ConnectionService.initAsync();
    console.log('ConnectionService initialized');

    try {
        await ConnectionService.getComponentTree({});
    } catch (e) {
        console.log('Expected error (no session):', e.message);
    }
} catch (e) {
    console.error('Initialization failed', e);
}

process.exit(0);

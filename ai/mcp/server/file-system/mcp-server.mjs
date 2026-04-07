import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Server          from './Server.mjs';

try {
    await Neo.create(Server).ready();
} catch (error) {
    console.error('Fatal error during file-system server initialization:', error);
    process.exit(1);
}

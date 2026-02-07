import dotenv    from 'dotenv';
import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';
import Manager   from './Manager.mjs';

dotenv.config({quiet: true});

async function start() {
    const manager = Neo.create(Manager);
    await manager.main();
}

start().catch(console.error);

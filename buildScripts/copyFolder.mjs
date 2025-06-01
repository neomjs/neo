import { Command } from 'commander/esm.mjs';
import fs          from 'fs-extra';

const program = new Command('copyFolder')
    .version('1.0.0')
    .option('-s, --source <value>', 'path to the source folder')
    .option('-t, --target <value>', 'path to the target folder')
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();

if (!programOpts.source) {
    throw new Error('Missing -s param');
}

if (!programOpts.target) {
    throw new Error('Missing -t param');
}

fs.mkdirpSync(programOpts.target, {recursive: true});
fs.copySync(programOpts.source, programOpts.target);

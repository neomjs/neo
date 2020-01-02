'use strict';

const commander = require('commander'),
      fs        = require('fs-extra');

const program = new commander.Command('copyFolder')
    .version('1.0.0')
    .option('-s, --source <name>', 'path to the source folder')
    .option('-t, --target <name>', 'path to the target folder')
    .allowUnknownOption()
    .parse(process.argv);

if (!program.source) {
    throw new Error('Missing -s param');
}

if (!program.target) {
    throw new Error('Missing -t param');
}

fs.mkdirpSync(program.target);
fs.copySync(program.source, program.target);
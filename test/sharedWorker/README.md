Based on https://github.com/mdn/simple-shared-worker

The goal is to optionally replace the Neo Workers with shared workers,
which will allow us to create multi window apps & directly communicate between workers
(without passing data through main).

To inspect shared workers, use:
chrome://inspect/#workers

Although the Chromium team promised in January, that it will soon be possible to create shared workers from
JS modules, this still breaks

=> inspect worker.mjs

=> localhost/neoteric/test/sharedWorker/worker.mjs:1 Uncaught SyntaxError: Unexpected identifier

=> the import statement

https://bugs.chromium.org/p/chromium/issues/detail?id=680046
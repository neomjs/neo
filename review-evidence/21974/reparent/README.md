# A late source reply after two-window reparenting

The probe runs the Engine planning example in Chrome and uses its Scheduler pop-out to obtain two real documents sharing the same App Worker. It creates a small container and leaf under the source, then reparents the same live container into the destination. It defers one real source acknowledgement after rendering, and holds the destination batch before dispatch. All source modules load from the Engine checkout used for the run.

Run these commands from an Engine checkout with its ordinary npm dependencies and Google Chrome installed. The first two commands prepare its development assets. Set `probe` to the downloaded script's path.

```sh
npm run build-themes -- -n -e dev -t all
npm run bundle-browser-deps
probe=./verify-reparent.mjs
node "$probe" --root . --out reparent-results.json --repeat 2 --channel chrome
```

The historical failing revision is `29dc2d5aea6cba9886b12cd533a0e85e70393596`. The output records each promise, the leaf's current window and mount state, and both documents' text at each phase. A final screenshot digest and a fresh destination edit check the post-race render. `source-first` exits the overall probe with status 1 if the destination promise resolves while its DOM is still absent. The other two cases move the component before the source has collected its update, or let the destination paint before the old response arrives.

The two positive controls and eventual paint passed on the recorded revision. The source-first case exposed the early settlement in both runs. First mount without reparenting and the cause of the intermittent Workstation Reset are separate questions.

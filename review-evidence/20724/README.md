# Portal example-card review evidence

Review-only browser renders for issue 20724. This branch is retained evidence and is not a product merge candidate.

The original three candidate treatments use Portal source 14166d1a20, the same grid-issues cover/copy, 1440x900 and 375x1000, light and dark. Clio read these on the issue. The refined 22px lip/aligned-row/placeholder comparison and the intrinsic CSS proof use source e6cf9da715e6 with the same canonical cover/copy. No cover assets or caption text were changed.

The refined CSS proof covers all 21 family cards in both themes at 1440/375/390, preserves at least half the desktop cover, and uses no per-card inline sizing. The phone caption stays below its cover. These are exploratory browser candidates, not production screenshots or final contrast/performance acceptance.

## Authored source acceptance

Product commit: 1aa4bcd742ce510de17f73c98d0cbc3eaceaa6fb. Baseline structural styles: 41e5632698be771e8255859f7cb7cac6086894e7. The before/after board uses the same records, images and copy, at 1440/375/390 in both themes, plus legacy Featured cards. These are authored development styles, not injected candidate CSS.

The owning E2E passed 10/10 with no retries and the unchanged Portal examples unit suite passed 22/22 under Node24.22.3. The source capture receipt covers 288 card observations per arm: source had zero caption overflow/undocked captions/reduced-opacity groups and minimum desktop clear cover 0.5; the baseline had 288 undocked captions. Cover dimensions, positioning, asset URLs and canonical copy were unchanged.

The root-executed final acceptance probe covers blur/no-blur, dark/light and both catalogs, 27 Featured and 21 family cards. Readiness uses actual cover decoding, loaded fonts and three stable layout samples. Minimum sampled ordinary-text contrast was 11.4138:1, with no browser errors; navigation-aborted requests are recorded separately. Geometry and copy agree with blur disabled.

Each of eight catalog traversals sets the actual scroll owner's position across 100 requestAnimationFrame callbacks. All raw intervals and their distributions are retained; this is a synthetic local Chrome observation, not native-wheel, cross-device or deployed performance acceptance. No invented performance threshold was applied. The initial global network-idle readiness timed out; it was replaced by the precise readiness checks above, without a source change.

Run the retained scripts from an Engine checkout with its dependencies and generated development themes; their original machine paths in the earlier capture recipe identify this local run only. The final probe is cwd-relative. The complete JSON receipts retain the inputs, source digests and cleanup result. All owned servers and browsers were closed. No generated styles or PNGs belong in the product merge branch.

## Motion and contrast review repair

Product repair commit: 52349302ba367545e385394db20d091b01381d53. The original source board above remains the before/after evidence for the unchanged card composition. This addition records the outline timing and stronger contrast oracle.

The shared motion vocabulary resolves outline-color to 0.12s with cubic-bezier(0.22,1,0.36,1), and 0s under prefers-reduced-motion, in both themes and both catalogs. A transparent 1px outline is present at rest. The phone breakpoint deliberately reprojects immediately; hover/focus feedback replaces the former placeholder gradient shift and suppressed outline.

Development themes and the owning E2E passed (10/10, zero retries, one worker, Node24.22.3). The eight-case blur/no-blur probe now samples below the lip and near the caption bottom. Weakest measured text contrast is 10.953749:1. Geometry/copy invariants remain true. No browser errors; 16 navigation-aborted worker requests match the prior run. Browsers and both owned ports were closed.

The receipts record the pre-commit parent and tested stylesheet digests; those digests match the committed styles. Final spec JSDoc/alignment was polished by the author/commit hook after the local run; the PR's hosted CI executes the committed spec. The original source-capture recipe was not rerun against a different baseline.

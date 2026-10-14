# Animated component-list sorting evidence

`animated-sort-before-name-asc.json` and `animated-sort-before-name-desc.json`
retain the pre-fix observation at Engine `95e058fed96238c9afe5c06f363321458810be23`.
Each file binds the production source hashes, Chromium version, viewport and
sampling mode. The capture used the record-keyed list in the sibling
`apps/animated-sort` fixture; the later fixture also exercises an index-pooled
list. Node 25.9.0 launched the original capture; validation of the repair used
the supported Node 24.19.0 runtime.

`before`, `afterIntent` and `after` are App Worker observations: Store order,
wrapper transform targets and card construction identities. `frames` records
`getBoundingClientRect()` positions sampled through both transition intervals.
Its `columns` array defines each value; coordinate suffixes refer to the
corresponding entry in `nodeIds`. A mask bit set at index N means that node N
remained connected or was still the same DOM object. All five bits set is 31.
Coordinates and milliseconds are rounded to 0.001; identity masks are exact.
`rawSha256` identifies the original full capture, not this compact JSON.
The sampling clock starts before the click. Rectangles describe the browser's
interpolated positions; inline transforms describe requested targets. Endpoint
screenshots are separate from the motion samples.

The ascending trace shows a wrong target followed by a second painted leg.
The descending trace has collinear motion: its wrong initial target and delayed
correction are visible in `afterIntent` versus `after`, so a straight-path check
alone cannot detect that case. The regression checks both the requested targets
and the painted path across settlement.

From the repository root, with a supported Node runtime and dependencies:

```sh
npm run test-components -- test/playwright/component/list/AnimateSort.spec.mjs
```

The explicit component configuration serves this checkout. The spec attaches
new ASC, DESC and interrupted-sort JSON captures and before/after screenshots
to the Playwright result. Those captures bind the tested production hashes.
This is isolated Engine browser evidence; installed Fleet revalidation belongs
to the existing Institution acceptance work.

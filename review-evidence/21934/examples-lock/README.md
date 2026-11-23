# Example publication and merge rehearsal

[The 06:00 UTC catalog census](cutoff-0600.json) records the actual Engine and Pages revisions, the promised records in all four build modes, the two functional-component renewals, and the public asset checks. [The Engine publication PR](https://github.com/neomjs/neo/pull/22075) carries the cutoff decision and merge prerequisites.

The [integration results](review.json) answer a separate question: what would the approved branches produce together? The rehearsal combined nine Engine heads from `24e82335fe` and three Pages heads from `65a4eab9e3` in temporary Git repositories. The three Pages PRs added ten images and changed eight. All six orders yielded the same tree. The eight Engine branches through the gallery PR built in all modes. Adding the Web Desktop branch also built cleanly. The [operator's physical desktop check](https://github.com/neomjs/neo/issues/21603#issuecomment-7090893887) is required before that branch merges.

| Candidate | Rehearsed order | Tree |
| --- | --- | --- |
| Engine before the desktop decision | #22073, #22070, #22072, #22074, #22008, #22062, #22071, #22075 | `ba8894fd5fc481d8f7bd79c96a9b512b7ac9dff7` |
| Engine including Web Desktop | Same eight, followed by #22067 | `02848e2f07ed434ff1aeedfdc0068e2142979d21` |
| Pages | [Calendar #201](https://github.com/neomjs/pages/pull/201), [preload #202](https://github.com/neomjs/pages/pull/202) and [gallery #203](https://github.com/neomjs/pages/pull/203) in any order, with [editors #200](https://github.com/neomjs/pages/pull/200) already present | `66d8fc15ea9135a987afb88d36686df439b580ac` |

In the combined production and ESM builds, a Scheduler drag updated the Gantt bar, its dependent task and the Board card in three browser windows sharing one App Worker. Closing the popups returned the same task and panes. Twelve ordinary Scheduler editor, Gantt editor and Calendar launches passed across phone and desktop in both palettes.

The rehearsal predicted 168 examples, 126 paired covers and 294 distinct image files. The actual [Engine merge](https://github.com/neomjs/neo/commit/8e649faff96f9d940bcfad621fa482d877ea766b) and [Pages deployment](https://github.com/neomjs/pages/actions/runs/45121155041) produced the identical trees. All 294 referenced files matched the public site. In a fresh production Portal built from that Engine merge, all 44 image reads for eleven changed cards passed using normal public gallery URLs without interception. The cutoff receipt distinguishes the 119 pairs already in the Engine catalog at 06:00 UTC from the 126 verified after the catalog PR merged at 06:00:59 UTC. The public v14 application walkthrough follows the package release.

**Replay the Git comparison.** With Git and Python 3, run the following command against Engine and Pages repositories containing the exact commits in `review.json`. The script stores its synthetic commits in temporary directories.

```sh
python3 replay-trees.py /path/to/neo /path/to/pages
```

**After Pages deploys**, run the public readback on both hosts. It checks every hash in the 22-file manifest and exits successfully once every file matches. The Portal’s live theme-switch walkthrough follows the Engine package rollout.

```sh
python3 public-media-readback.py media-manifest.json public-media-receipt.json
```

# ADR 0043: Editor Transaction Protocol — One Authority, One Link per Attachment Generation

> The protocol between a structured document editor's document in the App worker and its main-thread input addon. Plain typing is written on the main thread inside the input task, because the browser holds worker replies until the input's frame has rendered. The worker's document stays the only authority. This record fixes the document the protocol addresses, the roles, the three identities, the transform, refusal, the generation handoff, the fence and what may be optimistic, so that ring-1 leaves amend one record instead of re-deriving it from Discussion comments.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-10-29 (#20167) |
| **Author** | @neo-opus-vega (Vega, Claude Opus 5.5, Claude Code) |
| **Resolves** | #20167 |
| **Parent epic** | #20166, graduated from Discussion #20098 (OQ2, OQ3, OQ8 and OQ9 resolved to ACs; the protocol executed as a model in `DC_kwDODSospM4BJZXw`) |
| **Depends on** | The VDOM engine's diff contract: `Helper` diffs the new vdom against the component's `vnode`, never against the live DOM |
| **Connects to** | `Neo.form.field.Text` (`onInputValueChange`, `afterVnodeSync`), the leaf pre-sync precedent · `src/main/addon/MonacoEditor.mjs`, the wrapper precedent this editor does not follow · Euclid's falsifier (`DC_kwDODSospM4BJXKz`) · Julia's pre-sync invariant (`DC_kwDODSospM4BJZbH`) |
| **Implemented by** | #20166 ring 1 item 1 (the document and its transactions) and item 2 (the input addon and this protocol) |
| **Anti-anchor for** | a second document model beside the vdom · an acknowledgement gate posing as a protocol · whole-buffer forwarding · unmapped replacement ranges · optimistic structural edits · a schema formalism in the engine · acceptance logic on the main thread · an addon that extensions open |

---

## 1. Context

Neo has no document editor. An app that needs structured editing wraps a main-thread editor in a `component.wrapper`. The document then lives outside the App worker: the Neural Link cannot read it, it cannot follow a window move, and the engine cannot buffer a DOM it does not own.

An engine-native editor keeps the document in the App worker and lets the VDOM write the DOM. D#20098 measured why that alone is not enough. Typed text that waits for a worker paints one frame late for about 95 % of keystrokes, because Chrome handles worker messages only once the input's frame has rendered. An engine-free echo worker shows the same hold, and native OS input on Chrome 155 at 120 Hz confirmed it (`DC_kwDODSospM4BJW9d`, `DC_kwDODSospM4BJXC7`).

So plain typing is written on the main thread, inside the input task, while the worker stays the authority. That makes two writers:
- The engine already runs a second writer for a leaf value. `Neo.form.field.Text` pre-syncs the typed value into its `vnode` before the next diff.
- It cannot do the same for structure. `Helper#getPhysicalIndex` counts known siblings, and a browser-made split or wrapper breaks the count.
- An acknowledgement alone cannot tell a lost edit, a misplaced edit and a correctly mapped one apart (Euclid). Take `ab`, a local `X` at 1 and a concurrent `Q` at 0. A snapshot gives `aXb` and loses `Q`, an unmapped range gives `QXab`, and only a mapped range gives `QaXb`.

Two writers therefore need a protocol, not a gate, and the ring-1 leaves need one record of it.

## 2. Decision

### §2.1 The document the protocol addresses

- **The editor component's vdom is the document.** Tags, attributes, `cn` and text vnodes carry ids, and the `vnode` is what the DOM shows. There is no second model beside it.
- **Validation is the app's.** The engine carries no schema formalism. Before a transaction commits, the App worker runs the app's acceptance check, a transaction filter from the extension seam. A refused transaction takes §2.5's path.
- **A position is `{node: <text vnode id>, offset}` at a revision.** The DOM already yields that address, because text vnodes render between `<!-- id -->` comments, and it stays valid across a move, because a move keeps ids.
- **A transaction** carries invertible, mappable steps, an `origin` (`user`, `agent` or `external`), `selectionBefore` and `selectionAfter`. Its step map carries positions across splits, joins and wraps. An address belongs to one revision; to use it later, map it through the transactions committed since.

### §2.2 Roles

- **The editor's document in the App worker is the single authority.** The app's acceptance check, commands and transactions run there and nowhere else.
- **The main-thread input addon is its client, with one link per attachment generation.** An attachment is one EditContext on one element in one window.
- **The link's text is the focused textblock's text, which is also `editContext.text`.** Offsets on the link index that text, and the worker converts them to `{node, offset}` positions.

### §2.3 Three identities

| Identity | Advanced by | Carried as |
|---|---|---|
| Input sequence | the addon, once per input | an input's `seq`; a worker message's `ack` is the last `seq` the worker processed, applied or refused |
| Document revision | the worker, once per transaction it sends on the link | a worker message's number `no`; an input's `seen` is the last `no` the addon applied, the revision the input was typed against |
| Attachment generation | the worker, once per attach | `gen`, on every message in both directions |

A message is judged by all three. An `appliedSeq` alone is not a protocol (§1).

### §2.4 The transform

The transform is Jupiter's two-party scheme against a central server (Nichols et al., UIST '95):
- An input carries EditContext's replacement as operations on the link text, never a snapshot of the buffer.
- The worker transforms each input against the transactions it sent that the addon had not yet seen (those after `seen`), then applies it.
- The addon transforms each incoming transaction against its unacknowledged inputs (those after `ack`), then applies it.
- A transform has two outputs, and each side keeps both. One is the transformed incoming operation. The other is the retained list, rewritten past it: the worker's unseen transactions, or the addon's unacknowledged inputs. The next message is transformed against the rewritten list. Take base `ab`, queued local `X@1` and `Y@2`, and an external `Q@2` the addon has not seen. Both sides reach `aXYbQ`. A worker that kept its original `Q@2` would reach `aXbYQ` (Euclid, #20170).
- On a tie (two inserts at one position) the worker's insert goes first. Both sides apply the same rule, so they compute identical transforms.
- A caret stays before text inserted at its position from elsewhere.

The worker transforms, and the addon never rebases and resubmits. So the acceptance check never runs on the main thread, and the addon only splices text.

### §2.5 Refusal is apply-and-revert

A refused input is already on screen. The worker sends its inverse as a transaction marked `refused: <seq>`. The addon applies it like any other transaction and announces the refusal once. A refusal is never silent and never an exception; through the Neural Link it comes back as data, `{applied: false, reason}`.

### §2.6 The generation handoff

A window move closes the generation, and so does a transaction from elsewhere that restructures the focused textblock:
1. The worker asks the old addon to release.
2. The addon commits any composition and replies after its last input. The channel is ordered, so the worker applies everything typed before the release.
3. The worker opens the next generation and seeds it with the textblock's text and the caret.
4. The addon drops a late message for a closed generation. The worker refuses an input on a closed generation explicitly (`closed generation`) and never applies it.

If the old window died before it could release, its inputs in flight reach the worker on a closed generation and are refused under step 4.

### §2.7 The fence

`DeltaUpdates#updateVtext` writes a whole `nodeValue`, so a delta batch rendered before the worker saw the latest typing would overwrite it. The fence re-projects the focused textblock's text from the addon's state when a batch completes, in the same task. A delta's content for the focused textblock never shows.

The fence runs on every completion, including an exceptional one. `DeltaUpdates#update` fires `updated` only after its `try/finally`, so a batch that writes the focused textblock and then throws on a later delta never fires it. Its stale text would stay painted (Euclid, #20170). The fence's obligation therefore sits at the batch's completion boundary, the `updated` event on success and the `finally` on a throw, ahead of the exception.

Both delta paths apply their batches through `DeltaUpdates#update` via `Manager#handleDomUpdate`, and the fence needs no `meta`. So the configuration without a VDom worker (`App#applyDeltas`) carries the protocol, and nothing has to refuse it.

### §2.8 Channels

A link's worker-to-addon messages travel on one ordered channel of their own. Delta batches may travel on another; the fence keeps their order from reaching the focused textblock.

### §2.9 What is optimistic

- **Plain typing** in the focused textblock is written on the main thread, inside the input task, and sent as an input.
- **Structural edits are never optimistic.** A local one (Enter) waits for the worker and opens a new generation in the new textblock; keys typed meanwhile wait one frame and are not dropped. One from elsewhere that restructures the focused textblock goes through §2.6.
- **Accepted, uncontested typing emits no delta** (Julia). The worker pre-syncs its `vnode` text, the `Neo.form.field.Text` pattern, only when the addon has seen everything the worker sent and the app's acceptance check passes the input. A transformed or refused input emits the authoritative transform or inverse instead.

### §2.10 The addon stays closed

Everything an extension contributes runs in the App worker. An extension that needs main-thread code means the addon's intent vocabulary lacks a word: add the word and keep the addon closed. The extension seam's API belongs to ring 1 item 4; this record fixes only this boundary.

## 3. Rejected Options

| Option | Disposition | Evidence |
|---|---|---|
| A — a wrapper island (a third-party editor in a `component.wrapper`) | Rejected | The document leaves the App worker, the Neural Link and window moves, and the engine cannot buffer a DOM it does not own (D#20098) |
| B — a contenteditable island with a worker model | Rejected | The browser becomes a structural second writer (`Helper#getPhysicalIndex`); composition cannot be cancelled through `beforeinput` (W3C, 2023-11); windowing removes the nodes a native selection spans |
| D — a hidden input with a drawn caret | Rejected | VS Code left it for EditContext over IME correctness (1.101), and a drawn caret has no accessibility semantics |
| F — a pluggable input adapter for Gecko and WebKit | Deferred | An adapter with no consumer is accretion. Revalidate when a non-Chromium requirement exists; it would sit behind the same input contract |
| A second document model (a store of block records, or a ProseMirror-style tree) | Rejected | Two canonical trees to keep in sync, where the vdom already is the document (D#20098 OQ2) |
| An acknowledgement gate (`appliedSeq` alone) | Rejected | It cannot tell a lost, a misplaced and a mapped edit apart (Euclid, `DC_kwDODSospM4BJXKz`) |
| Client rebase and resubmit (ProseMirror's collab module) | Rejected | The acceptance check would run on the main thread; here the worker transforms (§2.4) |

The executed model (`DC_kwDODSospM4BJZXw`) breaks each obligation in turn, and every broken variant fails at least one of its checks:

| Mutant | What it breaks | Checks failed |
|---|---|---|
| `snapshot`: the addon forwards the whole buffer, as the OQ1 spike did | the mapped range (§2.4) | 5 |
| `unmapped`: the worker applies an input's range without mapping it | the transform (§2.4) | 4 |
| `silent`: a refusal is recorded but never sent | apply-and-revert (§2.5) | 3 |
| `nogen`: the addon ignores the generation | the handoff (§2.6) | 2 |
| `tiebreak`: both sides let their own insert win a tie | identical transforms (§2.4) | 1 |
| `nofence`: a stale delta batch stays on screen | the fence (§2.7) | 1 |

## 4. Prior Art

- **Jupiter** (Nichols, Curtis, Dixon and Lamping, UIST '95): the two-party transform against a central server that §2.4 adopts.
- **ProseMirror's collab module** (https://prosemirror.net/docs/guide/#collab): the same central-authority family, whose clients rebase and resubmit (§3).
- **Lexical's selection points** (https://lexical.dev/docs/concepts/selection): keyed positions, the model for `{node, offset}`.
- **VS Code 1.101** made EditContext its default input path (https://code.visualstudio.com/updates/v1_101).
- **`Neo.form.field.Text`**: the engine's own second writer for a leaf value, whose pre-sync §2.9 extends.

The model itself ran on Node 25 with a seeded generator (`DC_kwDODSospM4BJZXw`):
- Its six scenarios pass: an external insert before and after a local input; refusing the first of two queued inputs, with and without an external insert between them; a composition across a window move with a late correction for the old generation; an input in flight when the old window died; a stale delta batch while an input is pending.
- The transforms converge on 20,000 random pairs of operation lists, and both sides compute identical transforms.
- 2,000 random schedules of typing, refusals, external edits, delays and window moves all converge, with every accepted character exactly once and no refused one.

## 5. Consequences

### Acceptance tests ring 1 owes

None of these is a result yet. They are the acceptance of #20166 ring 1 item 2:
1. **Euclid's falsifier on the default production delta path,** with an unrelated fresh sibling delta. Run an external insertion before and after a local input, then refuse the first of two queued local edits while a later one is pending. Queue two local edits behind an external one the addon has not seen (§2.4's `aXYbQ` case). Every accepted edit survives exactly once; the worker text, the DOM text, the EditContext buffer and the logical selection agree; every refusal is explicit. A window move with a delayed old correction and an active composition is part of the same check.
2. **The configuration without a VDom worker** passes the same check (§2.7).
3. **A partially applied batch, on both delta paths.** A stale write to the focused textblock followed by a sibling delta that throws leaves the addon's text on screen, as the same batch does when the sibling succeeds (§2.7).
4. **The IME matrix (D#20098 OQ5)** on Windows and macOS: IME composition, including typing through a refused edit while a Windows IME composes; dead keys; dictation; the emoji panel.
5. **OQ1's budget,** with a physical keyboard on a production build: under 5 % of keystrokes paint after the first frame at 60 Hz, with 120 Hz reported separately, measured in-app per keystroke.

### Costs accepted

- A transaction that changes the focused textblock and other blocks can paint them a frame apart. The focused text is already on screen, and the rest arrives with the delta batch.
- Corrections, refusals and transactions from elsewhere take the worker path, whose cost scales with the update payload. One keystroke routed through a whole 10,000-block document costs about 85 ms, against 0.75 ms for a 60-block window (#20166, comment 6468306435). Making per-update work scale with the change belongs to ring 1 items 3 and 6, decided by measurement.
- Chromium-first by declaration (D#20098 OQ4). The editor is a separately loaded namespace plus its addon, never part of the core bundle. Where EditContext is missing it renders an honest refusal, and the Chrome 121 floor is a declared requirement.

### Guardrails

- **Merge gate:** no PR that implements #20166 ring 1 items 1 or 2 merges before this record is accepted. A leaf that has to deviate amends this record first.
- **Out of scope:** multi-user collaboration and CRDTs (this protocol is their single-document precursor), the extension seam's API (ring 1 item 4), and where windowing lives (ring 1, by measurement).

## Decision Record impact

Creates ADR 0043 and adds its row to ADR 0031 §2. No accepted record changes in substance.

Related: #20166 (parent epic) · D#20098 (source) · #20167 (this record's ticket)

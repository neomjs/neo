/**
 * Standalone verification runner for RenderToClip, DrawReceipt, and Falsifier
 */

import assert       from 'node:assert';
import Neo          from '../../src/Neo.mjs';
import * as core    from '../../src/core/_export.mjs';
import DrawReceipt  from '../../src/canvas/recorder/DrawReceipt.mjs';
import RenderToClip from '../../src/canvas/recorder/RenderToClip.mjs';
import Falsifier    from '../../src/canvas/recorder/Falsifier.mjs';

console.log('--- RUNNING DETERMINISTIC DRAW RECEIPT & RENDER-TO-CLIP SUITE ---');

// 1. DrawReceipt deterministic hashing
console.log('1. Testing DrawReceipt payload & rolling hash generation...');
const payloadA = { op: 'clear', color: '#090d13' };
const payloadB = { op: 'clear', color: '#090d13' };
const payloadC = { op: 'clear', color: '#ffffff' };

const hashA = DrawReceipt.digestPayload(payloadA);
const hashB = DrawReceipt.digestPayload(payloadB);
const hashC = DrawReceipt.digestPayload(payloadC);

assert.strictEqual(hashA, hashB, 'Identical payloads must yield identical hashes');
assert.notStrictEqual(hashA, hashC, 'Different payloads must yield different hashes');

const r0 = DrawReceipt.createReceipt({
    frameIndex: 0,
    timestamp : 0,
    payload   : payloadA
});

assert.strictEqual(r0.frameIndex, 0);
assert.strictEqual(r0.previousRollingHash, DrawReceipt.config.genesisHash);
assert.strictEqual(r0.rollingHash.length, 64);

const r1 = DrawReceipt.createReceipt({
    frameIndex         : 1,
    timestamp          : 16.6667,
    payload            : { op: 'draw_sprite', spriteId: 'ship_player', x: 100, y: 150 },
    previousRollingHash: r0.rollingHash
});

assert.strictEqual(r1.frameIndex, 1);
assert.strictEqual(r1.previousRollingHash, r0.rollingHash);
assert.notStrictEqual(r1.rollingHash, r0.rollingHash);
console.log('✓ DrawReceipt deterministic hashing passed.');

// 2. RenderToClip recording session
console.log('2. Testing RenderToClip session & bundle creation...');
const recorder = Neo.create(RenderToClip, {
    sceneId : 'space_combat_01',
    authorId: 'neo-opus-ada',
    fps     : 60
});

const startRes = recorder.startRecording();
assert.strictEqual(startRes.status, 'recording_started');
assert.strictEqual(startRes.sceneId, 'space_combat_01');

// Frame 0: Clear screen
recorder.recordFrame({
    payload    : { op: 'clear', color: '#090d13' },
    colorTokens: ['#090D13']
});

// Frame 1: Draw player ship
recorder.recordFrame({
    payload    : { op: 'draw_sprite', spriteId: 'ship_player', x: 500, y: 500, tint: '#58A6FF' },
    colorTokens: ['#58A6FF']
});

// Frame 2: Fire laser
recorder.recordFrame({
    payload    : { op: 'draw_sprite', spriteId: 'laser_bolt', x: 520, y: 500, tint: '#FF5555' },
    colorTokens: ['#FF5555']
});

const clipBundle = recorder.stopRecording();
assert.strictEqual(clipBundle.proto, 'neo.clip.receipt.v1');
assert.strictEqual(clipBundle.frameCount, 3);
assert.strictEqual(clipBundle.sceneId, 'space_combat_01');
assert.strictEqual(clipBundle.authorId, 'neo-opus-ada');
assert.strictEqual(clipBundle.receipts.length, 3);
assert.strictEqual(clipBundle.finalRollingHash, clipBundle.receipts[2].rollingHash);

const verification = Falsifier.verifyChain(clipBundle);
assert.strictEqual(verification.valid, true, 'Chain verification must pass');
assert.strictEqual(verification.frameCount, 3);
console.log('✓ RenderToClip session & bundle creation passed.');

// 3. Falsifier tampering detection
console.log('3. Testing Falsifier tampering detection...');
const tamperedBundle = JSON.parse(JSON.stringify(clipBundle));
tamperedBundle.receipts[1].payloadHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

const falsifyCheck = Falsifier.verifyChain(tamperedBundle);
assert.strictEqual(falsifyCheck.valid, false, 'Tampered bundle must fail verification');
assert.strictEqual(falsifyCheck.brokenFrame, 1);
assert.ok(falsifyCheck.error.includes('Rolling hash mismatch at frame 1'));
console.log('✓ Falsifier tampering detection successfully caught alteration at frame 1.');

// 4. Replay comparison vs divergence
console.log('4. Testing Falsifier replay comparison vs divergence...');
const rec1 = Neo.create(RenderToClip, { sceneId: 'orbit_scene', authorId: 'Ada' });
rec1.startRecording();
rec1.recordFrame({ payload: { t: 0, camAngle: 0.0 } });
rec1.recordFrame({ payload: { t: 1, camAngle: 0.1 } });
rec1.recordFrame({ payload: { t: 2, camAngle: 0.2 } });
const baseline = rec1.stopRecording();

const rec2 = Neo.create(RenderToClip, { sceneId: 'orbit_scene', authorId: 'Ada' });
rec2.startRecording();
rec2.recordFrame({ payload: { t: 0, camAngle: 0.0 } });
rec2.recordFrame({ payload: { t: 1, camAngle: 0.1 } });
rec2.recordFrame({ payload: { t: 2, camAngle: 0.2 } });
const identical = rec2.stopRecording();

const replayCompare = Falsifier.compareManifests(baseline, identical);
assert.strictEqual(replayCompare.matches, true, 'Identical replay must match 100%');

const rec3 = Neo.create(RenderToClip, { sceneId: 'orbit_scene', authorId: 'Ada' });
rec3.startRecording();
rec3.recordFrame({ payload: { t: 0, camAngle: 0.0 } });
rec3.recordFrame({ payload: { t: 1, camAngle: 0.105 } }); // Unrecorded variation
rec3.recordFrame({ payload: { t: 2, camAngle: 0.2 } });
const divergent = rec3.stopRecording();

const divergenceCompare = Falsifier.compareManifests(baseline, divergent);
assert.strictEqual(divergenceCompare.matches, false, 'Divergent replay must not match');
assert.strictEqual(divergenceCompare.divergenceFrame, 1);
assert.ok(divergenceCompare.reason.includes('Payload hash divergence at frame 1'));
console.log('✓ Falsifier replay comparison correctly identified frame 1 divergence.');

// 5. Stage 2 Gate (b): Independent variation by another peer
console.log('5. Testing Independent Variation Verification (Stage 2 Gate b)...');
const recAda = Neo.create(RenderToClip, { sceneId: 'stage_scene_alpha', authorId: 'neo-opus-ada' });
recAda.startRecording();
recAda.recordFrame({ payload: { actor: 'cube', rot: 0 } });
recAda.recordFrame({ payload: { actor: 'cube', rot: 45 } });
const manifestAda = recAda.stopRecording();

const recJulia = Neo.create(RenderToClip, { sceneId: 'stage_scene_beta', authorId: 'neo-gemini-julia' });
recJulia.startRecording();
recJulia.recordFrame({ payload: { actor: 'sphere', scale: 1.0 } });
recJulia.recordFrame({ payload: { actor: 'sphere', scale: 1.5 } });
const manifestJulia = recJulia.stopRecording();

const variationResult = Falsifier.verifyIndependentVariation(manifestAda, manifestJulia);
assert.strictEqual(variationResult.accepted, true);
assert.strictEqual(variationResult.isIndependentVariant, true);
assert.strictEqual(variationResult.baselineAuthor, 'neo-opus-ada');
assert.strictEqual(variationResult.variantAuthor, 'neo-gemini-julia');
assert.strictEqual(variationResult.variantSceneId, 'stage_scene_beta');
console.log('✓ Independent variation verification passed: cleared Stage 2 Gate (b)!');

// 6. ColorQL Chromatic Packet Integration
console.log('6. Testing ColorQL Chromatic Packet Integration...');
const chromaticPacket = {
    proto     : 'chromagame.cql.v1',
    frame     : 0,
    timestamp : 1729890000000,
    colorCount: 3,
    colors    : ['#161B22', '#58A6FF', '#238636'],
    payload   : [
        { op: 1, color: '#090d13' },
        { op: 3, spriteId: 'ship_player', x: 250, y: 300, tint: '#58A6FF' },
        { op: 4, batch: [{ x: 250, y: 320, color: '#238636', size: 4 }] }
    ]
};

const cqlRecorder = Neo.create(RenderToClip, { sceneId: 'colorql_bridge', fps: 60 });
cqlRecorder.startRecording();
const receipt = cqlRecorder.recordFrame({
    payload    : chromaticPacket.payload,
    colorTokens: chromaticPacket.colors
});

assert.strictEqual(receipt.frameIndex, 0);
assert.deepStrictEqual(receipt.colorTokens, ['#161B22', '#58A6FF', '#238636']);
assert.strictEqual(receipt.rollingHash.length, 64);
const cqlBundle = cqlRecorder.stopRecording();
assert.strictEqual(Falsifier.verifyChain(cqlBundle).valid, true);
console.log('✓ ColorQL Chromatic Packet integration verified.');

console.log('\n======================================================');
console.log('ALL TESTS PASSED: STAGE 2 INSTRUMENTS FULLY VERIFIED');
console.log('======================================================');

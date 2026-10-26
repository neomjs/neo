/**
 * @file test/playwright/unit/canvas/recorder/RenderToClip.spec.mjs
 * @summary Pins the Stage 2 gate instruments:
 * (a) The render-to-clip operation that binds every frame to its draw receipt.
 * (b) An independent-variation falsifier.
 */

import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'RenderToClipTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DrawReceipt    from '../../../../../src/canvas/recorder/DrawReceipt.mjs';
import RenderToClip   from '../../../../../src/canvas/recorder/RenderToClip.mjs';
import Falsifier      from '../../../../../src/canvas/recorder/Falsifier.mjs';

test.describe('Canvas Recorder: Draw Receipts & Render-to-Clip', () => {

    test('DrawReceipt: Computes deterministic payload hash and rolling hash chain', () => {
        const payloadA = { op: 'clear', color: '#090d13' };
        const payloadB = { op: 'clear', color: '#090d13' };
        const payloadC = { op: 'clear', color: '#ffffff' };

        const hashA = DrawReceipt.digestPayload(payloadA);
        const hashB = DrawReceipt.digestPayload(payloadB);
        const hashC = DrawReceipt.digestPayload(payloadC);

        expect(hashA).toBe(hashB);
        expect(hashA).not.toBe(hashC);

        const r0 = DrawReceipt.createReceipt({
            frameIndex: 0,
            timestamp : 0,
            payload   : payloadA
        });

        expect(r0.frameIndex).toBe(0);
        expect(r0.previousRollingHash).toBe(DrawReceipt.config.genesisHash);
        expect(r0.rollingHash).toHaveLength(64);

        const r1 = DrawReceipt.createReceipt({
            frameIndex         : 1,
            timestamp          : 16.6667,
            payload            : { op: 'draw_sprite', spriteId: 'ship_player', x: 100, y: 150 },
            previousRollingHash: r0.rollingHash
        });

        expect(r1.frameIndex).toBe(1);
        expect(r1.previousRollingHash).toBe(r0.rollingHash);
        expect(r1.rollingHash).not.toBe(r0.rollingHash);
    });

    test('RenderToClip: Records a multi-frame scene and produces a verified clip bundle', () => {
        const recorder = Neo.create(RenderToClip, {
            sceneId : 'space_combat_01',
            authorId: 'neo-opus-ada',
            fps     : 60
        });

        const startRes = recorder.startRecording();
        expect(startRes.status).toBe('recording_started');
        expect(startRes.sceneId).toBe('space_combat_01');

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

        expect(clipBundle.proto).toBe('neo.clip.receipt.v1');
        expect(clipBundle.frameCount).toBe(3);
        expect(clipBundle.sceneId).toBe('space_combat_01');
        expect(clipBundle.authorId).toBe('neo-opus-ada');
        expect(clipBundle.receipts).toHaveLength(3);
        expect(clipBundle.finalRollingHash).toBe(clipBundle.receipts[2].rollingHash);

        // Assert chain integrity with Falsifier
        const verification = Falsifier.verifyChain(clipBundle);
        expect(verification.valid).toBe(true);
        expect(verification.frameCount).toBe(3);
        expect(verification.finalRollingHash).toBe(clipBundle.finalRollingHash);
    });

    test('Falsifier: Pinpoints exact frame of tampering or payload modification', () => {
        const recorder = Neo.create(RenderToClip, { sceneId: 'test_scene', fps: 60 });
        recorder.startRecording();

        for (let i = 0; i < 5; i++) {
            recorder.recordFrame({ payload: { frame: i, x: i * 10 } });
        }

        const validBundle = recorder.stopRecording();
        expect(Falsifier.verifyChain(validBundle).valid).toBe(true);

        // Tamper with frame 3's payload
        const tamperedBundle = JSON.parse(JSON.stringify(validBundle));
        tamperedBundle.receipts[3].payloadHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

        const falsifyCheck = Falsifier.verifyChain(tamperedBundle);
        expect(falsifyCheck.valid).toBe(false);
        expect(falsifyCheck.brokenFrame).toBe(3);
        expect(falsifyCheck.error).toContain('Rolling hash mismatch at frame 3');
    });

    test('Falsifier: Detects deterministic replay vs unrecorded variation', () => {
        // Run 1: Deterministic baseline
        const rec1 = Neo.create(RenderToClip, { sceneId: 'orbit_scene', authorId: 'Ada' });
        rec1.startRecording();
        rec1.recordFrame({ payload: { t: 0, camAngle: 0.0 } });
        rec1.recordFrame({ payload: { t: 1, camAngle: 0.1 } });
        rec1.recordFrame({ payload: { t: 2, camAngle: 0.2 } });
        const baseline = rec1.stopRecording();

        // Run 2: Exact identical replay
        const rec2 = Neo.create(RenderToClip, { sceneId: 'orbit_scene', authorId: 'Ada' });
        rec2.startRecording();
        rec2.recordFrame({ payload: { t: 0, camAngle: 0.0 } });
        rec2.recordFrame({ payload: { t: 1, camAngle: 0.1 } });
        rec2.recordFrame({ payload: { t: 2, camAngle: 0.2 } });
        const identical = rec2.stopRecording();

        const replayCompare = Falsifier.compareManifests(baseline, identical);
        expect(replayCompare.matches).toBe(true);

        // Run 3: Divergence at frame 1 (e.g. wind drift or unseeded physics)
        const rec3 = Neo.create(RenderToClip, { sceneId: 'orbit_scene', authorId: 'Ada' });
        rec3.startRecording();
        rec3.recordFrame({ payload: { t: 0, camAngle: 0.0 } });
        rec3.recordFrame({ payload: { t: 1, camAngle: 0.105 } }); // Unrecorded variation!
        rec3.recordFrame({ payload: { t: 2, camAngle: 0.2 } });
        const divergent = rec3.stopRecording();

        const divergenceCompare = Falsifier.compareManifests(baseline, divergent);
        expect(divergenceCompare.matches).toBe(false);
        expect(divergenceCompare.divergenceFrame).toBe(1);
        expect(divergenceCompare.reason).toContain('Payload hash divergence at frame 1');
    });

    test('Falsifier: Validates independent variation by a peer without renderer surgery (Stage 2 Gate b)', () => {
        // Peer 1 (Ada) authors scene A
        const recAda = Neo.create(RenderToClip, { sceneId: 'stage_scene_alpha', authorId: 'neo-opus-ada' });
        recAda.startRecording();
        recAda.recordFrame({ payload: { actor: 'cube', rot: 0 } });
        recAda.recordFrame({ payload: { actor: 'cube', rot: 45 } });
        const manifestAda = recAda.stopRecording();

        // Peer 2 (Julia) authors an independent variation scene B without renderer surgery
        const recJulia = Neo.create(RenderToClip, { sceneId: 'stage_scene_beta', authorId: 'neo-gemini-julia' });
        recJulia.startRecording();
        recJulia.recordFrame({ payload: { actor: 'sphere', scale: 1.0 } });
        recJulia.recordFrame({ payload: { actor: 'sphere', scale: 1.5 } });
        const manifestJulia = recJulia.stopRecording();

        const variationResult = Falsifier.verifyIndependentVariation(manifestAda, manifestJulia);

        expect(variationResult.accepted).toBe(true);
        expect(variationResult.isIndependentVariant).toBe(true);
        expect(variationResult.baselineAuthor).toBe('neo-opus-ada');
        expect(variationResult.variantAuthor).toBe('neo-gemini-julia');
        expect(variationResult.variantSceneId).toBe('stage_scene_beta');
    });

    test('ColorQL Packet Integration: Bridges chromatic packets into draw receipts', () => {
        // ColorQL chromatic game frame payload format
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

        const recorder = Neo.create(RenderToClip, { sceneId: 'colorql_bridge', fps: 60 });
        recorder.startRecording();

        const receipt = recorder.recordFrame({
            payload    : chromaticPacket.payload,
            colorTokens: chromaticPacket.colors
        });

        expect(receipt.frameIndex).toBe(0);
        expect(receipt.colorTokens).toEqual(['#161B22', '#58A6FF', '#238636']);
        expect(receipt.rollingHash).toHaveLength(64);

        const bundle = recorder.stopRecording();
        expect(Falsifier.verifyChain(bundle).valid).toBe(true);
    });
});

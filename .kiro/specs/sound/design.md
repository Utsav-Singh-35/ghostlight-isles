# Design Document: Sound

## Overview
Everything lives in `src/audio/`, a presentation layer like `src/render/`: it reads simulation events and never changes simulation state.

| File | Does |
|---|---|
| `audio/cues.ts` | Pure: maps battle events to cues, with loudness by distance, pan by side and the per-frame limit |
| `audio/synth.ts` | Builds the sounds from oscillators, noise and filters; holds the ambience and the effect buses |
| `audio/sound.ts` | What the game calls: unlocks audio on the first gesture, the on/off setting, frame updates, battle cues and interface cues |

The game (`game/app.ts`) passes the events it already drains each frame for the renderer to `Sound.battle()`, and calls `Sound.frame()` with the ship's speed, the Blood Moon's strength and whether the Locker is open.

## Signal chain
Effects and ambience feed a low-pass "muffle" filter (opened fully, or closed to about 420 Hz in the Locker), then a master gain, a compressor and the speakers. Ghostly sounds and bells also feed a reverb made from a generated impulse response. Noise comes from two generated buffers: white noise for effects, and brown noise with matched ends (so the loop never clicks) for the sea.

## Cue planning
- Loudness is `max(MIN_GAIN, 1 / (1 + (d / 60 m)²))` for an event `d` metres from the listener.
- Pan is the event's offset along the camera's right vector divided by 40 m, clamped to ±1 and scaled to `MAX_PAN` (0.8).
- Several events of the same kind in one frame become one cue: the loudest one's pan, louder by 10% per extra event, up to `MAX_GAIN`.
- Cues are ranked critical, then notable (hits, the Bat Swarm), then the rest, and by loudness within a rank; the first `CUE_LIMIT` (7) play. There are 5 critical cues, so they always fit.
- A voice cap in the synth (48 sources) protects slow machines.

## Correctness Properties

**Property 1: Cues are well formed.** *For any* battle events and listener, every cue has a finite gain in [`MIN_GAIN`, `MAX_GAIN`] and a pan in [−`MAX_PAN`, `MAX_PAN`], no cue name appears twice, and there are at most `CUE_LIMIT` cues.
**Validates: Requirements 1.1, 1.4**

**Property 2: Nearer is never quieter.** *For any* two distances, the nearer one is at least as loud, and no distance is silent.
**Validates: Requirement 1.2**

**Property 3: Sounds come from their side.** *For any* listener and event, the pan has the sign of the event's offset along the listener's right, and the mirror image of the event pans the other way by the same amount.
**Validates: Requirement 1.3**

**Property 4: News is never dropped.** *For any* battle events, every critical cue among them is in the plan.
**Validates: Requirement 1.5**

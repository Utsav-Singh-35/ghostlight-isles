---
inclusion: fileMatch
fileMatchPattern: ["src/render/**/*.ts", "public/models/**"]
---
# Rendering and art direction

## Look
- Low-poly with flat shading, in the style of Kenney's 3D kits, for islands, forts and ships.
- The sea is the exception: it is lit smoothly from the waves' own slopes, with light-only ripples, a reflected sky, a moon road, foam on high crests and surf that follows each island's coastline (`src/render/ocean.ts`). Low draws half the ripples and plainer foam.
- Haunted forts are built from their seed (`src/render/fortMeshes.ts`): a style (palisade, ruin, curtain wall or star fort), a stone and a keep by level (ghost spire, broken lighthouse, skull tower). Their towers and treasure show from the open sea, so a captain can size a fort up before attacking.
- Night by default. The moon gives cold blue light, and lanterns give warm pools of light.
- Ghosts are see-through, glow spectral green and trail wisps. Living ships and towers are solid and lit warm.

| Use | Color |
|---|---|
| Sky top | `#050A14` |
| Horizon and fog | `#0E2230` |
| Deep water | `#082532` |
| Wave crests | `#1C5560` |
| Moonlight | `#CFE3FF` |
| Lantern (living) | `#FFB347` |
| Spectral (ghosts) | `#5CFFB0` |
| Blood Moon | `#C8102E` |

All colors live in `src/render/palette.ts`.

## Rules
- The renderer reads simulation state and never writes it. Bobbing, rolling and leaning are visual only.
- Wave math lives in `src/render/waves.ts`. The ocean shader and the CPU (for floating ships) both use it, so ships sit on the waves you see. Exactly four waves move the surface; the eight ripples only bend light and never move anything.
- Budget: at most 150 draw calls, 4 point lights and 1024 px textures. Use `InstancedMesh` or merged geometry for repeated props. Glow comes from emissive materials, additive glow sprites and (later) bloom, not from extra lights.
- Models are GLB only, at most 300 KB each, stored in `public/models/<pack>/` and listed in `Documents/credits.md`. Record each model's forward axis so it can be turned to face +Z.
- Respect the Low graphics setting: pixel ratio 1, no antialiasing, no post-processing.

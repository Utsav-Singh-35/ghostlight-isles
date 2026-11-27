# Social Blitz post: drafts

The post must start with #KiroweenHackathon26 and say, in your own words, what your favorite thing in Kiro is and how it changed your workflow. Rewrite these in your own voice before posting. Attach an image or a short clip: `Documents/screenshots/14-siege.png` (the ghost fleet under the Blood Moon) works well, and a 10-second screen recording of a ghost sinking is better. Put the post's URL in the Devpost form.

## X / Bluesky (under 280 characters)

#KiroweenHackathon26 My favorite thing in Kiro: specs that turn into tests. Every rule in my haunted pirate game is a numbered property, and a hook reruns them on every change. It caught a wave bug at t = 5e-324 s I'd never have tested by hand. 🏴‍☠️👻 [game URL]

## LinkedIn or a longer post

#KiroweenHackathon26

For Kiroween 2026 I built Ghostlight Isles, a 3D pirate base-building game that runs in the browser: capture haunted islands, raid other players' islands while they're offline, and hold your lighthouse when the ghost fleet sails under the Blood Moon.

My favorite thing in Kiro was spec-driven development with property-based tests. Before any code, each game system got a spec whose rules are numbered sentences, like "a sunk ship can't capture, raid or fight a siege". Each sentence became a test that runs over hundreds of random inputs. A hook reruns them whenever the game rules change, and another blocks any commit that breaks them.

How it changed my workflow: I stopped asking "does this feature work?" and started asking "which rule says so?" When something failed, the fix was either the code or one sentence in a spec. That's how the tests found a floating-point bug in the wave math that only shows up at t = 5e-324 seconds, and forts whose keeps no ship could reach.

Play it: [game URL]
Code, specs and hooks: https://github.com/Utsav-Singh-35/ghostlight-isles

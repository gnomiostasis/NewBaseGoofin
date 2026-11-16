# NewBaseGoofin

A cozy top-down survival base-builder for the browser. You start at a small wilderness
camp, head out to gather materials, build up your base, level up four character stats,
and later automate the basic materials so your trips can go after the rare ones.

All art is original 16x16 pixel art, painted in code from one warm, earthy palette.
The farther you walk from camp, the darker and colder the wilds get.

## Play it locally

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev      # then open the link it prints
```

Controls:

| Key | Does |
| --- | --- |
| WASD / arrows | Walk |
| Shift | Run (uses energy) |
| E or Space | Gather what's in front of you; hold to keep chopping or mining. At camp: store materials in the crate, rest on the bedroll |
| F | Eat (mushrooms first, then berries) |
| C | Hand-crafting (then 1 or 2 to craft) |
| M | Show or hide the map |

Your first job: pick up sticks and stones and pull some grass near camp, then craft a stone axe.

## Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs the tests |
| `npm run typecheck` | Checks the TypeScript |
| `npm run build` | Builds a static site into `dist/` that can be uploaded to itch.io or any web host |
| `npm run preview` | Serves the built `dist/` folder |

## How the code is laid out

| Path | Purpose |
| --- | --- |
| `src/config.ts` | Every tuning number: map size, zone sizes, tree density, walk speed, darkness |
| `src/world/generate.ts` | Builds the map from a seed: zones, ponds, trees, rocks, trails and the starting camp. No Phaser here, so it's easy to test |
| `src/world/shade.ts` | How dark and cool the world gets with distance from camp |
| `src/art/` | The palette and the code that paints every tile and sprite |
| `src/game/` | Items, the pack and stash, gathering rules, survival bars and sound effects. No Phaser rendering, so it's testable |
| `src/scenes/` | Phaser scenes: boot (makes textures), world (map, player, camera), HUD |
| `tests/` | Vitest tests for world generation and the survival rules |

## Roadmap

1. **Walk the wilds** (done): a large map with a camp and three zones, a player you can walk around, a following camera.
2. **Gather and carry** (done): harvest trees, rocks and bushes; an inventory with a carry limit; health, hunger and stamina.
3. **Build the base**: grid placement, walls, floors, chests, a bed and a workbench.
4. **Danger and leveling**: creatures in the outer zones, melee combat, XP and four stats.
5. **First automation**: a lumber mill that fills a chest with wood over time.
6. **Save, balance, share**: save and load, a title screen, tuning, a public link.

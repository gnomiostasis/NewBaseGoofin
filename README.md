# NewBaseGoofin

A cozy top-down survival base-builder for the browser. You start at a small wilderness
camp, head out to gather materials, build up your base, level up four character stats,
and later automate the basic materials so your trips can go after the rare ones.

All art is original 16x16 pixel art, painted in code from one warm, earthy palette.
The farther you walk from camp, the darker and colder the wilds get.

## Play it online

Once GitHub Pages is switched on (Settings > Pages > Source: **GitHub Actions**), every push to
`main` publishes the game at **https://gnomiostasis.github.io/NewBaseGoofin/**.

The game saves itself in your browser every 20 seconds, whenever you sleep, and when you close the
tab. Pick **Continue** on the title screen to carry on. Lumber mills keep sawing while the game is
closed, for up to 4 hours.

## Put it on itch.io

1. Run `npm run build`, or download the `newbasegoofin-web` artifact from the latest
   "Deploy to GitHub Pages" run on GitHub.
2. Zip the *contents* of `dist/` so `index.html` sits at the top of the zip.
3. On itch.io, create a new project, set **Kind of project** to **HTML**, upload the zip and tick
   **This file will be played in the browser**. A 1280 x 720 viewport with the fullscreen button
   works well.

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
| E | Gather what's in front of you; hold to keep chopping or mining. At camp: store materials in the crate, rest on the bedroll |
| Space or J | Swing at a creature in front of you (uses energy; an axe hits harder) |
| F | Eat (mushrooms first, then berries) |
| C | Hand-crafting (then 1 or 2 to craft) |
| B | Build mode: 1-7 picks floor, wall, door, chest, bed, workbench or lumber mill; left click builds, right click removes (half the cost back) |
| L | Stats: 1-4 spends a point on Strength, Endurance, Agility or Gathering |
| Esc | Close any panel or build mode |
| M | Show or hide the map |

Trees you chop grow back after about 8 minutes, and picked berry bushes after 2 and a half.

Your first job: pick up sticks and stones and pull some grass near camp, then craft a stone axe.

Building takes materials from your pack, plus from storage when you're near camp or a chest
(chests and the camp stash share one storage). Sleep in a bed and you'll wake there if you
collapse. A workbench crafts copper tools (twice as fast) and a woven basket (+20 pack space).

Bramblehogs root around the Old Woods and Duskprowlers hunt in pairs in the Deepwild. Neither
will follow you into the meadow. If you collapse, your materials stay behind in a dropped pack
where you fell; walk back and press E to pick it up. Everything you do earns XP, and each level
(up to 10) gives a point to spend on a stat, so a zone that beat you once gets easier.

A lumber mill (wood, stone and a little copper ore) saws wood from the standing trees within
3 tiles and drops it into a chest within 3 tiles, even while you're far away. More trees means
faster sawing, up to 6. It stops when storage holds 150 wood. Press E at a mill to see how it's doing.

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
| `src/game/` | Items, the pack and stash, gathering, survival, building, creatures, stats, the lumber mill and sound effects. No Phaser rendering, so it's testable |
| `src/scenes/` | Phaser scenes: boot (makes textures), title, world (map, player, camera, saving), creatures, HUD |
| `tests/` | Vitest tests for world generation and the survival rules |

## Roadmap

1. **Walk the wilds** (done): a large map with a camp and three zones, a player you can walk around, a following camera.
2. **Gather and carry** (done): harvest trees, rocks and bushes; an inventory with a carry limit; health, hunger and stamina.
3. **Build the base** (done): grid placement, walls, floors, chests, a bed and a workbench.
4. **Danger and leveling** (done): creatures in the outer zones, melee combat, XP and four stats.
5. **First automation** (done): a lumber mill that fills a chest with wood over time.
6. **Save, balance, share** (done): save and load, a title screen, tuning, a public link.

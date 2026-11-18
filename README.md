# NewBaseGoofin

A cozy top-down survival base-builder for the browser. You start at a small wilderness
camp, head out to gather materials, build up your base, level up four character stats,
and later automate the basic materials so your trips can go after the rare ones.

All art is original 16x16 pixel art, painted in code from one warm, earthy palette.
The farther you walk from camp, the darker and colder the wilds get.

## Play it online

Once GitHub Pages is switched on (Settings > Pages > Source: **GitHub Actions**), every push to
`main` publishes the game at **https://gnomiostasis.github.io/NewBaseGoofin/**.

The game saves itself in your browser every 20 seconds, whenever you set a bed, and when you close the
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
| Left click | Use what you click on next to you, or what's in front of you: gather it (hold to keep chopping or mining), store materials in a chest or the camp crate, pick a bed to wake at, open the workbench |
| Right click | Attack toward the mouse; hold to keep attacking (uses energy). Fighters swing an axe, archers shoot arrows, mages hurl firebolts |
| Space or J | Swing at whatever is in front of you |
| F | Eat to heal (mushrooms first, then berries). After a meal, food can't heal you again for 15 seconds; the Food bar shows the countdown |
| C | Hand-crafting (then 1 or 2 to craft) |
| B | Build mode: 1-7 picks floor, wall, door, chest, bed, workbench or lumber mill; left click builds, right click removes (half the cost back) |
| L | Stats: click + and - to plan points for Strength, Endurance, Agility or Gathering (it shows what each change does), then Confirm or press Enter |
| H | Show or hide the controls panel (also on the title screen) |
| Esc | Close any panel or build mode |
| M | Show or hide the map |

Trees you chop grow back after about 8 minutes, and picked berry bushes after 2 and a half.

When a run begins you choose a class, and it stays with you for that run:

- **Fighter**: hard-hitting axe swings with a wider reach, +30 max health, and takes 25% less damage.
- **Archer**: shoots arrows that fly about 9 tiles, walks 12% faster, and arrows hit harder as you level.
- **Mage**: hurls firebolts that burst and hit everything nearby, gets energy back 35% faster, and
  carries a brighter light at night.

Your first job: pick up sticks and stones and pull some grass near camp, then craft a stone axe.

Building takes materials from your pack, plus from storage when you're near camp or a chest
(chests and the camp stash share one storage). Click a bed and you'll wake there if you
collapse. There's no hunger: food heals you, and the campfire slowly heals you too. A workbench crafts copper tools (twice as fast) and a woven basket (+20 pack space).

Bramblehogs root around the Old Woods and Duskprowlers hunt in pairs in the Deepwild. Neither
will follow you into the meadow. If you collapse, your materials stay behind in a dropped pack
where you fell; walk back and click it to pick it up. Everything you do earns XP, and each level
(up to 10) gives a point to spend on a stat, so a zone that beat you once gets easier.

A lumber mill (wood, stone and a little copper ore) saws wood from the standing trees within
3 tiles, even while you're far away; a quarry does the same with rocks and stone. More trees
(up to 6) or rocks (up to 4) means faster work. What they make drops into their hopper (20), and
each one has a little handcart that hauls loads of 10 back home along open ground, to the camp or
the nearest chest. Wall one in completely and its cart can't get out, so leave a gap or a door.
Click a mill or quarry to empty its hopper into your pack. They stop when storage holds 150 wood
or 200 stone.

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
2. **Gather and carry** (done): harvest trees, rocks and bushes; an inventory with a carry limit; health, hunger and stamina (hunger and sleeping were later removed; food now heals).
3. **Build the base** (done): grid placement, walls, floors, chests, a bed and a workbench.
4. **Danger and leveling** (done): creatures in the outer zones, melee combat, XP and four stats.
5. **First automation** (done): a lumber mill that saws wood over time (its cart hauls it home).
6. **Save, balance, share** (done): save and load, a title screen, tuning, a public link.

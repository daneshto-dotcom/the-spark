/**
 * SPARK — fog-of-war rendering smoke (S57 P1).
 *
 * Single-page, DETERMINISTIC. Drives the __SPARK__ DEV global into 1v1 PLAYING,
 * places an own base + an enemy far-corner base, calls fogRenderer.sync()
 * synchronously (so the assertion never depends on rAF timing), then extracts
 * the composed fog-mask RenderTexture and asserts the visibility contract at the
 * PIXEL level:
 *   - own vision sources (live cursor / spawner / own primitive) are CUT OUT
 *     (mask transparent) -> the world is revealed there
 *   - the enemy base is OPAQUE FOG_COLOR -> concealed until the cursor scouts it
 *   - on WIN the overlay fades to alpha 0 and hides -> reveal-all (§ III.7)
 *
 * This is the automated form of the S57 preview verification. It guards the
 * 'erase'-into-RenderTexture path that tsc + unit tests cannot reach (the
 * Council's whole concern was that rendering breaks SILENTLY). No 2-peer /
 * WebRTC: the fog is a pure client-side render mask, so one page exercises it
 * fully. extract.pixels works headless via swiftshader (see playwright.config).
 */
import { test, expect, type Page } from '@playwright/test';

// FOG_COLOR = 0x000000 in src/render/fogRenderer.ts (S63: pure black, no tint)
const FOG = { r: 0, g: 0, b: 0 };

async function waitForSparkFog(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s = (window as { __SPARK__?: { fogRenderer?: unknown; world?: unknown } }).__SPARK__;
      return !!s && !!s.fogRenderer && !!s.world;
    },
    { timeout: 20_000 },
  );
}

test.describe('S57 Fog of War — client-side render mask', () => {
  test('conceals the enemy base, reveals own vision, lifts on win', async ({ page }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);

    const result = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      const COL_ME = 0xff3b6b;
      const COL_ENEMY = 0x3bd7ff;
      const mk = (placedBy: number, color: number, x: number, y: number): void => {
        const id = w.nextPrimitiveId++;
        w.primitives.set(id, {
          id, type: 3, placerColor: color, placedBy, createdTick: w.tick,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: color, lastOwnershipChange: 0, radius: 9,
        });
      };
      w.gameMode = '1v1';
      w.gameState = 'PLAYING';
      w.localPlayerId = 0;
      mk(0, COL_ME, 560, 380); mk(0, COL_ME, 620, 380); mk(0, COL_ME, 590, 440);
      mk(1, COL_ENEMY, 1600, 860); mk(1, COL_ENEMY, 1660, 860);
      s.controls.cursor.x = 590; s.controls.cursor.y = 410;

      // Compose the mask synchronously — no rAF dependency.
      fog.sync(w, s.controls.cursor, 1 / 60);
      const out = app.renderer.extract.pixels(fog.maskTexture);
      const px = out.pixels, W = out.width, H = out.height;
      const rX = W / 1920, rY = H / 1080;
      const at = (x: number, y: number): number[] => {
        const sx = Math.round(x * rX), sy = Math.round(y * rY);
        const i = (sy * W + sx) * 4;
        return [px[i], px[i + 1], px[i + 2], px[i + 3]];
      };
      const playing = {
        alpha: fog.currentAlpha,
        cursor: at(590, 410), spawner: at(960, 540), myPrim: at(560, 380),
        enemy: at(1600, 860), far: at(1400, 200),
      };

      // WIN -> fade overlay out over ~1s (90 frames covers the 1s fade + margin).
      w.gameState = 'WIN';
      for (let f = 0; f < 90; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const win = { alpha: fog.currentAlpha, visible: fog.container.visible };

      return { playing, win };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    // PLAYING: full fog, own vision cut out, enemy concealed as FOG_COLOR.
    expect(result.playing.alpha).toBe(1);
    expect(result.playing.cursor[3]).toBeLessThan(10); // transparent (revealed)
    expect(result.playing.spawner[3]).toBeLessThan(10);
    expect(result.playing.myPrim[3]).toBeLessThan(10);
    expect(result.playing.enemy[3]).toBeGreaterThan(245); // opaque (concealed)
    expect(result.playing.enemy[0]).toBe(FOG.r);
    expect(result.playing.enemy[1]).toBe(FOG.g);
    expect(result.playing.enemy[2]).toBe(FOG.b);
    expect(result.playing.far[3]).toBeGreaterThan(245);

    // WIN: fog fully lifted and hidden -> reveal-all.
    expect(result.win.alpha).toBe(0);
    expect(result.win.visible).toBe(false);
  });

  test('S77 P2 — a global-reach entity (potato) renders THROUGH the fog; the board behind stays concealed', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);

    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      w.gameMode = '1v1';
      w.gameState = 'PLAYING';
      w.localPlayerId = 0;
      // Own base by the cursor (revealed); the potato sits in a FAR fogged corner.
      const mk = (placedBy: number, color: number, x: number, y: number): void => {
        const id = w.nextPrimitiveId++;
        w.primitives.set(id, {
          id, type: 3, placerColor: color, placedBy, createdTick: w.tick,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: color, lastOwnershipChange: 0, radius: 9,
        });
      };
      mk(0, 0xff3b6b, 560, 380); mk(0, 0xff3b6b, 620, 380);
      s.controls.cursor.x = 590; s.controls.cursor.y = 410;
      // Owner-agnostic AoE => fog-exempt. Placed where NO vision source reaches (so it can only
      // be visible by virtue of rendering ABOVE the fog, not because the area is revealed).
      w.potatoes.set(1, { id: 1, pos: { x: 1400, y: 300 }, state: 'FREE', detonateAtTick: w.tick + 600 });

      // Z-ORDER PROOF: aboveFogLayer is above the fog container, and all 4 global-reach
      // renderers (creature/hunter/potato/rainbow) parented into it.
      const stage = app.stage;
      const aboveIdx = stage.getChildIndex(s.aboveFogLayer);
      const fogIdx = stage.getChildIndex(fog.container);
      // S137 P0a — the ROLL CALL, not a bare count. The old contract asserted only
      // `children.length === 13`, so when it went to 14 the failure said "expected 13, received 14"
      // and nothing else — attributing the 14th child cost an entire session. Reporting the ordered
      // constructor names makes the diff point straight at the index that moved, and it also catches
      // what a count structurally cannot: one renderer leaking a second child while another adds
      // none still sums to 14.
      const aboveFogChildNames = (s.aboveFogLayer.children as any[]).map(
        (c: any): string => (c?.constructor?.name ?? 'unknown') as string,
      );
      // S169 (owner) — the concealable half, roll-called the same way. Buildings, defenders and
      // units moved here so the fog actually hides them during BUILD.
      const fogHiddenIdx = stage.getChildIndex(s.fogHiddenLayer);
      const fogHiddenChildNames = (s.fogHiddenLayer.children as any[]).map(
        (c: any): string => (c?.constructor?.name ?? 'unknown') as string,
      );
      // ⭐ S170 P1 (owner) — THE GROUND, and the index that makes the bug class impossible.
      // The S166/S169 defect never lived INSIDE a layer, it lived BETWEEN them: the backdrop was
      // painted after the shapes. So the assertion that matters is positional — ground is stage
      // index 0 — and a roll call of the other two layers structurally cannot see it.
      const groundIdx = stage.getChildIndex(s.groundLayer);
      const groundChildNames = (s.groundLayer.children as any[]).map(
        (c: any): string => (c?.constructor?.name ?? 'unknown') as string,
      );

      // Draw the potato (into aboveFogLayer) + compose the fog — both synchronous (no rAF).
      s.potatoRenderer.sync(w);
      fog.sync(w, s.controls.cursor, 1 / 60);

      const stagePx = app.renderer.extract.pixels(app.stage);
      const maskPx = app.renderer.extract.pixels(fog.maskTexture);
      const read = (out: any, x: number, y: number): number[] => {
        const rX = out.width / 1920, rY = out.height / 1080;
        const i = (Math.round(y * rY) * out.width + Math.round(x * rX)) * 4;
        return [out.pixels[i], out.pixels[i + 1], out.pixels[i + 2], out.pixels[i + 3]];
      };
      // S153 P4 — layers carry a `label` so the display list is self-describing; see
      // SparkRenderer's constructor for why anonymous _Container entries were a problem.
      const labelIdx = (name: string): number =>
        (stage as any).children.findIndex((c: any) => c.label === name);
      return {
        sparkIdx: labelIdx('avatarRendererLocal'),
        footerIdx: labelIdx('footerBand'),
        aboveIdx, fogIdx, aboveFogChildNames,
        fogHiddenIdx, fogHiddenChildNames,
        groundIdx, groundChildNames,
        potatoOnStage: read(stagePx, 1400, 300),    // potato center — brown body if it shows through
        boardNearPotato: read(stagePx, 1560, 300),  // 160px away, no entity — fogged board
        maskAtPotato: read(maskPx, 1400, 300),       // potato is NOT a vision source — mask stays opaque
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    // Z-order: the global-reach layer sits above the fog, with every global-reach renderer routed
    // into it.
    //
    // ⭐ S137 P0a — THIS IS THE LAYER CONTRACT, and it is now a ROLL CALL rather than a count.
    //
    // It used to be `expect(children.length).toBe(13)`. That number went stale in S135 when V6-1.1
    // added `GathererRenderer(app, aboveFogLayer)` (main.ts:506) without bumping it, and the
    // resulting failure read "Expected: 13 / Received: 14" — a number, with no way to tell WHICH
    // renderer the 14th child belonged to. Attributing it took an entire session. So the assertion
    // now names every child in ADD ORDER: a failure diff points straight at the index that moved,
    // and the comment on that line names its owner. It also catches what a bare count structurally
    // cannot — one renderer leaking a second child while another adds none still sums to the same total.
    //
    // Entries are Pixi display objects, NOT renderer instances (a renderer does
    // `parent.addChild(this.graphics)`), so these are Pixi v8's own class names — hence the
    // leading underscore. Order is main.ts's construction order; keep them in sync.
    expect(r.aboveIdx).toBeGreaterThan(r.fogIdx);

    /*
     * ⭐ S153 P4/A1 (owner R81) — THE PLAYER CRUISER OUTRANKS THE HUD.
     *
     * Owner: *"my spark is one layer down (behind them ...) it doesnt FEEL nice. spark should be
     * one layer above those options as it is the cruiser"*. ⛔ P4 RAISED THE WRONG LAYER — "spark"
     * is overloaded in this codebase (avatar vs building block) and P4 lifted SparkRenderer, the
     * building blocks. A1 lifts the LOCAL avatar layer instead and reverts the free-spark lift.
     * This NARROWS S149 P6 ("nothing on the
     * board should ever draw over" the footer) with a single deliberate exception: the thing the
     * player is steering.
     *
     * ⚠ ASSERTED ON THE DISPLAY-LIST INDEX, NOT ON PIXELS, and the reason is worth keeping. The
     * chip plate is drawn at alpha 0.82, so a spark UNDERNEATH it still bleeds through — an A/B
     * screenshot of the same pixel scored 23 vs 22 redness with the fix on and off, i.e. it could
     * not tell the bug from the fix at all. The index A/B reads 2-vs-44 against a footer at ~43.
     * When a visual property has a numeric ground truth, assert the number.
     */
    expect(r.sparkIdx, 'the LOCAL avatar layer must be on the stage and labelled').toBeGreaterThanOrEqual(0);
    expect(r.footerIdx, 'footerBand must be on the stage and labelled').toBeGreaterThanOrEqual(0);
    expect(r.sparkIdx).toBeGreaterThan(r.footerIdx);
    expect(r.aboveFogChildNames).toEqual([
    /*
     * ⭐⭐ S169 (owner) - TWELVE ENTRIES LEFT THIS LIST AND MOVED UNDER THE FOG.
     *
     * Owner: "you can see their buildings being built ... It should all be hidden during build
     * state ... you shouldn't see, like, the boss of Pharaoh ... You should only see, like, their
     * castle."
     *
     * The tower/turret/Helga/stink entries above used to carry a 'cross-player landmark' argument -
     * that a raid target's position is already public, so hiding the building conceals nothing. He
     * has ruled against it: scouting has to cost something. They now live on `fogHiddenLayer`,
     * rolled call in its own assertion below.
     *
     * ⚠ WHAT STAYS HERE, and each for a reason he agreed with: the zone backdrop and walls
     * (geography, not activity), the CASTLE (his explicit exception), and every global hazard -
     * potato, rainbow, seagull, poop, hunter, stink cloud - because a thing that DAMAGES you through
     * the fog must be visible or it is an ambush rather than a hazard.
     */
      '_Graphics',  //  13 — hunterRenderer               (main.ts:502, S72 P2)
      '_Graphics',  //  14 — gathererRenderer.graphics   (main.ts:506, V6-1.1/S135) — the gatherers,
                    //       their race silhouettes, and the RACE-SHAPED PROCEDURAL KEEP that draws
                    //       only when a castle atlas fails to load (S161 P1).
      '_Container', //  15 — gathererRenderer.spriteLayer  (S161 P1) ⭐ NEW — the six race castles.
                    //       ⚠ A SECOND CHILD FROM ONE RENDERER, the goblin/stink-tower pattern
                    //       exactly: a Sprite cannot live inside a Graphics, so the keep art needs
                    //       its own Container, ABOVE the procedural rig so a fallback keep can
                    //       never overdraw a real castle.
      '_Graphics',  //  16 — gathererRenderer.overlay      (S161 P1) ⭐ NEW — and a THIRD, which is
                    //       load-bearing rather than tidy. A castle sprite stands CASTLE_SPRITE_PX
                    //       (96 px) above its own foot, far higher than the HP bar at `top - 7` and
                    //       far higher than the bank glyphs in the keep's doorway. Both were drawn
                    //       into the Graphics at index 13, so once the sprite layer went in above
                    //       them, a damaged castle would have hidden the bar reporting its own
                    //       health and every castle would have hidden its own inventory. They move
                    //       here, above the art. The castle SHOT VFX rides the same layer.
      '_Graphics',  //  17 — potatoRenderer               (main.ts:509, S72 P3)
      '_Graphics',  //  18 — rainbowRenderer              (main.ts:512, S75 P3)
      '_Graphics',  //  19 — rainbowFlyoverRenderer.overlay (main.ts:516, S84 P2)
      '_Container', //  20 — rainbowFlyoverRenderer.char
      '_Graphics',  //  21 — seagullRenderer              (main.ts:519, S77 P3)
      '_Graphics',  //  22 — poopRenderer                 (main.ts:520, S77 P3)
      '_Graphics',  //  23 — stinkCloudRenderer.haze      (S158 P6) ⭐ NEW — a LANDED stink bag.
                    //       ⚠ ABOVE THE FOG, and that is the whole reason it is declared here: a
                    //       cloud DEALS DAMAGE, and its damage does not care whether the ground is
                    //       fogged. Hiding the marker would let a player lose units to a patch of
                    //       board they were never shown — an ambush rather than a hazard. Same
                    //       argument the potato and the poop above ride on.
                    //       The haze draws the TRUE damage radius, so the edge is readable; it is
                    //       also the load-failure fallback for the atlas, exactly as the goblins'
                    //       procedural puppet is for theirs.
      '_Container', //  24 — stinkCloudRenderer.spriteLayer (S158 P6) ⭐ NEW — the S157 bag atlas,
                    //       which shipped a session ago with ZERO references anywhere in src/.
                    //       Above its own haze, for the same reason the goblin sprites sit above
                    //       their puppet: the fallback must never overdraw the real art.
    ]);

    /*
     * ⭐ S169 - THE OTHER SIDE OF THE FOG, ROLL-CALLED THE SAME WAY.
     *
     * A count would not do: one renderer leaking a second child while another adds none sums the
     * same. Order is main.ts construction order - keep them in sync.
     */
    expect(r.fogHiddenIdx, 'the concealable layer must be on the stage').toBeGreaterThanOrEqual(0);
    expect(r.fogHiddenIdx, 'and BELOW the fog, which is the whole fix').toBeLessThan(r.fogIdx);
    expect(r.fogHiddenChildNames).toEqual([
      /*
       * ⭐⭐ S170 P1 (owner) — **THIS LAYER IS NOW THE OWNER'S HIDE-LIST, LITERALLY.**
       *
       * *"Fog is just what hides. You have the buildings, the enemy sparks, the connectors that are
       * being built, the unbuilt buildings, the freeform buildings, the spawn."* Two children LEFT
       * (the backdrop and the border walls — ground, on `groundLayer`) and FIVE JOINED: the free
       * sparks, the bonds, the primitives, the keystone telegraph and the drag preview. Three of
       * those five were never concealable at all before — they sat on `app.stage` and were hidden
       * only as a side effect of the old black sheet's position, which is exactly why concealment
       * could not become a mask until they moved.
       *
       * ⚠ EVERY INDEX BELOW IS THE REAL ARRAY POSITION. A previous revision numbered `8` twice, so
       * every label from the turret onward was off by one — in an assertion whose entire purpose is
       * that the diff points at the index that moved. `tower-art.spec.ts` reads 6 and 11 from here.
       */
      '_Container', //  0 — sparkRenderer.container          — the FREE SPARKS.
      '_Graphics',  //  1 — structureRenderer.bondGraphics   — the CONNECTORS.
      '_Container', //  2 — structureRenderer.primitiveLayer — the SHAPES / unbuilt structures.
      '_Graphics',  //  3 — keystoneTelegraphRenderer        (S121 P1 B3)
      '_Graphics',  //  4 — dragPreviewRenderer              (S98 P3) — the placement preview.
      '_Graphics',  //  5 — spawnerZoneRenderer              (S100 P1) — the spawner "it's alive" aura,
                    //      i.e. the owner's *"spawn that they're generating"*. Its own docblock still
                    //      argues for `aboveFogLayer` as a cross-player landmark; that was overruled
                    //      in S169 (*"scouting has to cost something"*) — the comment is stale, not
                    //      the code.
      '_Container', //  6 — towerRenderer.layer              (S167) — the race tower BUILDINGS.
                    //      ⭐ `tower-art.spec.ts` reads THIS index.
      '_Container', //  7 — creatureRenderer.container       (S25 P0 → S77 P2)
      '_Graphics',  //  8 — creatureRenderer.cloudGfx        (S103 P1 lightning cloud)
      '_Graphics',  //  9 — chewerRenderer                   (S100 P1)
      '_Graphics',  // 10 — goblinRenderer.graphics          (S139 P2) — the procedural fallback puppet
      '_Container', // 11 — goblinRenderer.spriteLayer       (S151 P3) — the veo atlas sprites.
                    //      ⭐ `tower-art.spec.ts` reads THIS index too.
                    //      ⚠ A SECOND CHILD FROM ONE RENDERER — the case a bare count cannot catch
                    //      and this roll call can: the goblins keep the procedural puppet as the
                    //      load-failure fallback, so the renderer owns BOTH, and the atlas layer must
                    //      sit ABOVE the puppet or a fallback frame could overdraw a real sprite.
      '_Graphics',  // 12 — goblinRenderer.arrowLayer        (S153 P2) — the archer's arrow.
                    //      ⚠ A THIRD CHILD FROM THE SAME RENDERER. R84's arrow is DERIVED from synced
                    //      FSM state rather than pushed as an effect (a new effect KIND costs a
                    //      protocol bump, and the 10 Hz snapshot drops ~5/6 of one-shot pushes), so it
                    //      needs its own Graphics — above the sprite layer, or the arrow would vanish
                    //      behind the goblin firing it.
      '_Graphics',  // 13 — turretRenderer                   (S103 P3)
      '_Container', // 14 — princessRenderer.container       (S103 P4) — HELGA. Owner, explicitly:
                    //      *"Also, Helga and stuff, like, all of those need to be hidden."*
      '_Graphics',  // 15 — stinkTowerRenderer.graphics      (S141 P1) — aura ring + lob arc stay
                    //      procedural because they are STATE READOUTS, not character art.
      '_Container', // 16 — stinkTowerRenderer.spriteLayer   (S151 P3) — the veo tower atlas.
    ]);

    /*
     * ⭐⭐ S170 P1 (owner) — **THE GROUND CONTRACT, AND IT IS THE ONE THAT PREVENTS THE BUG CLASS.**
     *
     * The owner reported the same defect twice, a session apart, and both shipped fixes moved it
     * rather than removing it:
     *   · S166: *"you have put the layer of dark background OVER the primitives (shapes), cant see
     *     them being generated."*
     *   · S169 moved the backdrop DOWN to the concealable layer — which stopped it covering the
     *     towers, blacked it out with them (*"You made everything in fog. That's stupid."*), and
     *     STILL painted over every free spark, bond, primitive and drag preview, because those four
     *     renderers `addChild` to `app.stage` in their own constructors, long before the concealable
     *     layer is staged.
     *
     * So a roll call of the two fog layers could never have caught this: the defect was never inside
     * a layer, it was BETWEEN them, and it was decided by construction order. The durable assertion
     * is POSITIONAL — the board's ground is stage index 0 — because a thing beneath everything
     * cannot be painted over by anything.
     */
    expect(r.groundIdx, 'the ground layer must be on the stage').toBeGreaterThanOrEqual(0);
    /*
     * ⚠ NOT `toBe(0)`, AND THE REASON IS A REAL DISCOVERY THIS ASSERTION MADE ON ITS FIRST RUN.
     *
     * The first cut asserted stage index 0 and failed with `Received: 1`. The occupant is
     * `RainbowFlyoverRenderer`, which does `app.stage.addChildAt(this.backdrop, 0)` with the comment
     * *"True background: index 0 sits behind the spawner ring + the whole board."* That is a
     * CINEMATIC UNDERLAY for the flyover event and it legitimately belongs beneath the board — its
     * own character and overlay ride `aboveFogLayer`, so only this one full-screen Graphics is down
     * here. It also pre-dates the ground layer, so nothing regressed: the race backdrop already drew
     * over it when it lived inside `fogHiddenLayer`.
     *
     * So the honest invariant is not "index 0" but **"below every BOARD element"**, with exactly one
     * permitted occupant beneath it. `<= 1` keeps the teeth: insert anything board-like under the
     * ground and this fails, which is the regression that matters.
     */
    expect(r.groundIdx, '⛔ only the flyover cinematic underlay may sit beneath the ground')
      .toBeLessThanOrEqual(1);
    expect(r.groundIdx, 'and therefore below the concealable layer it used to sit inside')
      .toBeLessThan(r.fogHiddenIdx);
    expect(r.groundIdx, 'and below the fog').toBeLessThan(r.fogIdx);
    expect(r.groundIdx, 'and below the global-reach layer').toBeLessThan(r.aboveIdx);
    expect(r.groundIdx, 'and below the local avatar, which is a board object and not ground')
      .toBeLessThan(r.sparkIdx);
    expect(r.groundChildNames, 'GROUND MEANS GROUND: the per-race backdrop, then the border walls')
      .toEqual([
        '_Container', // 0 — zoneBackgroundRenderer.layer (S165 / R137) — the per-race zone art. It
                      //     forces addChildAt(..., 0), so within the ground it is under the walls.
        '_Graphics',  // 1 — wallRenderer (S149 P3) — the zone border walls. Owner R162: *"The border
                      //     walls should be visible to everyone. They're like a backdrop, basically."*
                      //     ⛔ They were the UNNOTICED half of the S169 regression: `wallsAreUp()` is
                      //     BUILD-only and `fogActive` is BUILD-only, the identical window, so under
                      //     the fog they were invisible for 100% of their lifetime.
      ]);
    // The potato punches THROUGH the fog — its brown body (BODY_COLOR 0xb5651d, r≈181) shows on the
    // composited stage as a strong red channel, clearly not the fog's pure black.
    expect(r.potatoOnStage[0]).toBeGreaterThan(90);                 // red channel present → visible
    expect(r.potatoOnStage[0]).toBeGreaterThan(r.potatoOnStage[2]); // r > b → brown, not grey/fog
    // ...yet the board NEXT TO it stays concealed (no terrain leak), and the fog mask at the potato
    // is still OPAQUE — the entity reveals only itself, never the surrounding board.
    expect(r.boardNearPotato[0]).toBeLessThan(20);  // fogged → near-black
    expect(r.maskAtPotato[3]).toBeGreaterThan(245); // mask opaque at the potato → zero board reveal
  });

  test('remembers a scouted enemy structure as a ghost, conceals an unscouted one, drops it when razed', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);

    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      const COL_ENEMY = 0x3bd7ff; // cyan → strong green+blue channels when ghosted
      const mkEnemy = (x: number, y: number): number => {
        const id = w.nextPrimitiveId++;
        w.primitives.set(id, {
          id, type: 3, placerColor: COL_ENEMY, placedBy: 1, createdTick: w.tick,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: COL_ENEMY, lastOwnershipChange: 0, radius: 9,
        });
        return id;
      };
      w.gameMode = '1v1';
      w.gameState = 'PLAYING';
      w.localPlayerId = 0;
      const A = mkEnemy(1400, 700); // mid-board, will be scouted then left
      mkEnemy(300, 200);            // control: never scouted

      // 1) SCOUT A — cursor on it (A enters live vision → recorded into memory).
      //    Before PLAYING every sync hit the early-return and zeroed the throttle
      //    counter, so this first sync recomposes (records A); 3x is belt-and-braces.
      s.controls.cursor.x = 1400; s.controls.cursor.y = 700;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const afterScout = fog.rememberedCount;

      // 2) LEAVE — cursor to spawner; A falls back into fog (>2x personal radius away).
      //    6 syncs guarantees a throttled recompose at the settled cursor.
      s.controls.cursor.x = 960; s.controls.cursor.y = 540;
      for (let f = 0; f < 6; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const afterLeave = fog.rememberedCount;

      // Pixel proof on the fully-composited stage: A is fogged-but-remembered (a dim
      // enemy-tinted silhouette painted OVER the opaque fog) → lifted G+B channels; B
      // was never seen → plain near-black fog. The live fog mask stays OPAQUE at A, so
      // the real board beneath the ghost is NOT revealed (no M1-style leak).
      const stage = app.renderer.extract.pixels(app.stage);
      const mask = app.renderer.extract.pixels(fog.maskTexture);
      const read = (out: any, x: number, y: number): number[] => {
        const rX = out.width / 1920, rY = out.height / 1080;
        const i = (Math.round(y * rY) * out.width + Math.round(x * rX)) * 4;
        return [out.pixels[i], out.pixels[i + 1], out.pixels[i + 2], out.pixels[i + 3]];
      };
      const ghostA = read(stage, 1400, 700);
      const plainB = read(stage, 300, 200);
      const maskA = read(mask, 1400, 700);

      // 3) RAZE A while looking right at it → confirmed destroyed → forgotten.
      w.primitives.delete(A);
      s.controls.cursor.x = 1400; s.controls.cursor.y = 700;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const afterRaze = fog.rememberedCount;

      // 4) MATCH RESTART — a new match must NOT inherit ghosts. Re-place + scout a
      //    structure, then bounce TITLE→PLAYING with the cursor parked far away: the
      //    PLAYING edge wipes the memory and the parked cursor doesn't re-remember it.
      mkEnemy(1400, 700);
      s.controls.cursor.x = 1400; s.controls.cursor.y = 700;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const beforeRestart = fog.rememberedCount;
      s.controls.cursor.x = 960; s.controls.cursor.y = 540; // park far from the new structure
      w.gameState = 'TITLE';
      fog.sync(w, s.controls.cursor, 1 / 60); // fog inactive → clears the PLAYING latch
      w.gameState = 'PLAYING';
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60); // PLAYING edge → resetMemory()
      const afterRestart = fog.rememberedCount;

      return { afterScout, afterLeave, afterRaze, beforeRestart, afterRestart, ghostA, plainB, maskA };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    // State machine, exercised through the REAL renderer (sync → updateGhostMemory →
    // syncGhostSprites), not just the pure unit core.
    expect(r.afterScout).toBe(1); // A recorded the moment it was scouted
    expect(r.afterLeave).toBe(1); // ghost persists once A is back under fog
    expect(r.afterRaze).toBe(0);  // re-scouting the razed spot confirms it gone → dropped
    expect(r.beforeRestart).toBe(1); // a re-placed structure is remembered within the match
    expect(r.afterRestart).toBe(0);  // the PLAYING edge wiped it — no cross-match ghost carry

    // Pixel: the remembered ghost paints at A; the unseen structure stays concealed.
    expect(r.ghostA[1]).toBeGreaterThan(50); // enemy-cyan ghost lifts the green channel
    expect(r.ghostA[2]).toBeGreaterThan(50); // ...and the blue channel
    expect(r.plainB[1]).toBeLessThan(20);    // B never seen → plain fog, no ghost
    // No leak: the board under the ghost is still fully fogged (mask opaque at A).
    expect(r.maskA[3]).toBeGreaterThan(245);
  });

  test('renders NO fog in solo mode', async ({ page }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);
    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const w = s.world;
      w.gameMode = 'solo';
      w.gameState = 'PLAYING';
      s.fogRenderer.sync(w, s.controls.cursor, 1 / 60);
      return { alpha: s.fogRenderer.currentAlpha, visible: s.fogRenderer.container.visible };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(r.alpha).toBe(0);
    expect(r.visible).toBe(false);
  });

  test('P3(a) — freezes the mask during the win-lift so the reveal dissolves uniformly', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);
    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      w.gameMode = '1v1'; w.gameState = 'PLAYING'; w.localPlayerId = 0;
      // Compose a fog mask with a personal-vision hole at (500,500) (outside the spawner).
      s.controls.cursor.x = 500; s.controls.cursor.y = 500;
      fog.sync(w, s.controls.cursor, 1 / 60);
      const maskAlphaAt = (x: number, y: number): number => {
        const out = app.renderer.extract.pixels(fog.maskTexture);
        const rX = out.width / 1920, rY = out.height / 1080;
        return out.pixels[(Math.round(y * rY) * out.width + Math.round(x * rX)) * 4 + 3];
      };
      const holeBeforeWin = maskAlphaAt(500, 500); // ~0 (transparent vision hole)
      // Enter WIN (lift begins) and move the cursor far away. If the mask were still
      // recomposing, the hole would relocate and (500,500) would fill in (opaque). The
      // P3(a) freeze keeps the last PLAYING composition, so (500,500) stays a hole.
      w.gameState = 'WIN';
      s.controls.cursor.x = 1500; s.controls.cursor.y = 900;
      for (let f = 0; f < 4; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      return { holeBeforeWin, holeDuringLift: maskAlphaAt(500, 500), midLiftAlpha: fog.currentAlpha };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(r.midLiftAlpha).toBeGreaterThan(0); // still mid-lift...
    expect(r.midLiftAlpha).toBeLessThan(1);    // ...fog is fading, not yet fully gone
    expect(r.holeBeforeWin).toBeLessThan(10);  // the vision hole at (500,500)
    expect(r.holeDuringLift).toBeLessThan(10); // STILL a hole — mask frozen, not recomposed
  });

  test('P3(c) — reset() forgets exploration + ghost memory and hides the fog', async ({ page }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);
    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const fog = s.fogRenderer;
      const w = s.world;
      const id = w.nextPrimitiveId++;
      w.primitives.set(id, {
        id, type: 3, placerColor: 0x3bd7ff, placedBy: 1, createdTick: w.tick,
        pos: { x: 800, y: 500 }, prevPos: { x: 800, y: 500 }, bonds: new Set(),
        ownerColor: 0x3bd7ff, lastOwnershipChange: 0, radius: 9,
      });
      w.gameMode = '1v1'; w.gameState = 'PLAYING'; w.localPlayerId = 0;
      s.controls.cursor.x = 800; s.controls.cursor.y = 500;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const beforeReset = { remembered: fog.rememberedCount, visible: fog.container.visible };
      fog.reset();
      const afterReset = {
        remembered: fog.rememberedCount,
        visible: fog.container.visible,
        alpha: fog.currentAlpha,
      };
      return { beforeReset, afterReset };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(r.beforeReset.remembered).toBe(1); // enemy structure scouted + remembered
    expect(r.beforeReset.visible).toBe(true);  // fog active
    expect(r.afterReset.remembered).toBe(0);   // memory forgotten
    expect(r.afterReset.visible).toBe(false);  // fog hidden
    expect(r.afterReset.alpha).toBe(0);        // alpha zeroed
  });
});

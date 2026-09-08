# Voltkin rework — the owner's three states (S168)

> Owner: *"Also here i reworked voltkin. here are HIS three states. we gotta make voltkin look sick,
> he is too basic now and he doesnt even have video generated for his movements (only idle but no
> walking or dying). anyways save that too we will do voltkin when we get to it too. we will also
> need to generate the broken TV he came out off (thats his building) i will generate it"*

## He is right about the gap, and it is worse than "no walking"

Measured, not assumed — this is everything Voltkin currently has on disk:

```
public/godly/voltkin/anim/voltkin-idle.png
public/godly/voltkin/anim/voltkin-zap.png
public/godly/voltkin/audio/lightning-crackle.ogg
public/godly/voltkin/audio/voltkin-voice.ogg
public/godly/voltkin/cinematic/voltkin-intro.mp4
```

**Two stills and a cinematic.** No walk, no die, and no sprite ATLAS at all — he predates the
veo-clip pipeline that every race unit, tier-3 unit and tier-9 boss now uses. That is why he "looks
basic" next to the newer roster: they are 12-frame animated sheets in four states and he is a
single static PNG that gets scaled.

⭐ So the rework is not a repaint, it is **bringing him onto the same pipeline as everything else** —
which is also the cheapest version of it, because that pipeline is already built and proven six
times over.

## ⛔ I could not save the image you pasted

It arrives in the conversation, not on the filesystem. Drop the triptych in as:

```
assets-source/godly-voltkin/sprites/voltkin-rework-s168-3states.png
```

…and the three cut states as (matching the tier-N convention so the pipeline can read them):

```
assets-source/godly-voltkin/sprites/voltkin-healthy.png
assets-source/godly-voltkin/sprites/voltkin-hurt.png
assets-source/godly-voltkin/sprites/voltkin-dying.png
```

## ⚠ ONE FLAG, AND IT IS A LEGAL ONE RATHER THAN A TASTE ONE

The rework reads as **strongly Pikachu-derived** — yellow body, black-tipped ears, red cheek circles,
the lightning-bolt tail. This project has already paid for this once: S95 shipped a Totoro look-alike
and it had to be reworked, and the standing rule from that is *original style is fine, recognisable
copies are a legal risk*.

I am flagging it **before** you spend generation credits on four clip states plus a building, because
that is the point where a rework gets expensive. It is your call and I will build whatever you land
on — but the cheap version of "make him look sick" that keeps him clearly original is to keep the
silhouette, the lightning and the palette while moving the face and the cheeks away from the
reference (different ear shape, no round cheek discs, a snout rather than the flat muzzle).

## The building — his broken TV

> *"we will also need to generate the broken TV he came out off (thats his building) i will generate it"*

Three states, mirroring every other building in the game:

```
assets-source/godly-voltkin/sprites/voltkin-tv-intact.png
assets-source/godly-voltkin/sprites/voltkin-tv-damaged.png
assets-source/godly-voltkin/sprites/voltkin-tv-destroyed.png
```

⭐ This is a good one to get right because it explains him: *"the old TV screen"* is already the
reference for his audio (his slap reads as a dry CLAP, not noise, on that same brief).

## Generation notes — the two the pipeline actually enforces

1. **Plain solid WHITE background, edge to edge.** The matte keys on near-white connected to the
   frame border; a grey floor or a drop shadow survives it and ships as a visible box. The image you
   sent is clean on this.
2. **No letterbox / pillarbox / inset frame.** veo did this to the Kraken twice in S168 and cost a
   re-roll plus a `sampleStart` workaround.

## What the work is, once the art lands

Same walk as the tier-3 and tier-9 rounds, which are the worked precedent:
seed still → four veo clips (idle / walk / attack / die) → `build-atlas-set.mjs` → `check:atlas` →
an entry in the tower/creature renderer. Voltkin already HAS a `CreatureType`, config and stats, so
unlike the tier-4–7 work this needs **no protocol bump and no four-sites walk** — it is purely an art
and renderer change.

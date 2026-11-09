# Lens / 门镜 — H3 remix of the reference's first 13 seconds

## 1. Reading the reference

Source: `Screen Recording 2026-11-07 at 6.02.51 AM - compressed.mp4` (3840×2160, 60 fps, 24.7 s, no audio track).
The recorded player shows an ad that ends on the title card **“Dreamina Seedance 2.0”**, so the material is a capability demo, not a product film. Its argument: one object (a pair of sunglasses) contains every world worth going to.

First 13 seconds, as they play on the recording clock:

| Time | Picture | Job it does |
| --- | --- | --- |
| 0.0–3.0 | Black acetate wayfarers with silver oval pins on a pale limestone ledge; hard horizontal venetian-blind shadows across stone and wall; the right lens mirrors sunlit greenery | Establishes product and the promise of the lens |
| 3.0–4.4 | Slow push-in becomes a dive; the lens rim passes the frame edge; green bokeh, speed blur | Turns the lens into a doorway in one continuous move |
| 4.4–6.2 | Inside the jungle: palm fronds whip past, sun flares | Pays off the portal |
| 6.2–7.6 | Foliage parts onto the Midtown skyline, Empire State centered; then a hard cut to a clean skyline wide | Reveal, then breath |
| 7.6–8.6 | Fast flyover skimming skyscrapers, heavy blur | Speed |
| 8.6–10.3 | Alpine meadow: orange/white/violet flowers streaking, spruce, snow peak | Scale |
| 10.3–11.3 | Starfield, Milky Way, a shooting star | Wonder |
| 11.3–13.0 | Macro of the lens holding that night sky; slow pull-back reveals the sunglasses again, daylight blinds shadows unchanged | Closure: the world was in the glass all along |

The cut rhythm is fast (roughly 1–2 s per world) and every world is entered by motion, not by a graphic transition. The sound is unknown — the player is muted.

## 2. Brief

Recreate the first 13 seconds as a new 13.2 s, 16:9 film generated with the app's MiniMax H3 service: same object, same portal logic, same world order and cut rhythm, new footage. No text, no logo. Sound: H3-native ambience, no music, no voices.

## 3. Treatment

Keep the product identical by seeding the two product shots with the reference's own frames (reference images), and let the four world shots be generated from the reference's world frames so the light and palette stay close. Then cut the six clips hard, on motion, at the reference's rhythm: 2.6 s of product, 2.4 s through the glass into green, 1.8 s of jungle-to-city reveal, 1.4 s of skyline speed, 2.2 s of alpine scale, 1.0 s of comet, 1.8 s of the lens payoff.

The one deliberate departure: the reference reveals the city from inside the jungle as a single take; H3 gets a dedicated reveal shot plus a skyline flyover, so the city reads as a place rather than a glimpse.

## 4. Shots (all `h3-video`, 1080p, 16:9, generated audio, no prompt optimization)

| ID | Seconds | Reference image | Content |
| --- | --- | --- | --- |
| S1 | 5 | `sunglasses_day.jpg` | Product on ledge, push-in, dive through the lens into jungle |
| S2 | 4 | `city.jpg` | Jungle rush, foliage parts on the skyline |
| S3 | 4 | `city.jpg` | Midtown FPV flyover |
| S4 | 4 | `mountain.jpg` | Alpine meadow push toward the snow peak |
| S5 | 4 | `comet.jpg` | Starfield and shooting star |
| S6 | 4 | `sunglasses_night.jpg` | Macro lens holding the night sky, pull back to product |

Reference stills are 16:9 crops of the recording with the player chrome removed (`work/renux-ref/refs/`).

## 5. Result

`final/lens-portal-13s.mp4` — 1920×1080, 24 fps, 13.04 s, H.264 + AAC, ~22.9 MB.
Cut: S1 0.00–4.30 · S2 2.60–4.00 · S3 1.15–2.65 · S4 0.90–2.90 · S5 1.40–2.50 · S6 1.20–3.90.
Grade: per-shot `eq` + a small `colorbalance` correction on the two product shots so the stone stays neutral and the acetate reads black; global loudness −18 LUFS, 0.55 s audio fade at the tail.

Generation ran through the app's own H3 service (`server/minimax-h3.ts` client → `https://hi.hi.run/api/open/v1`, `h3-video`, 1080p, 16:9, reference images uploaded as `reference_image`). Six tasks, 150 credits charged in total (30 + 24 × 5), wallet 977 at the start.

| Shot | Task ID | Credits |
| --- | --- | --- |
| S1 | d4e1015a-4765-4150-a439-9d8e5f2c6e0e | 30 |
| S2 | cc2b1ea4-f389-4653-a277-6c1cd4873ccd | 24 |
| S3 | 113f4d16-1a20-4b2d-a5b9-c15fd2325116 | 24 |
| S4 | 467f8065-c105-4516-9836-d270f3376cd9 | 24 |
| S5 | 73548bae-06b7-4cfc-82ca-44816d98aecf | 24 |
| S6 | 5917e7c3-1f4a-43eb-a0fd-1eedd97708bb | 24 |

The finished file is also in the app's 素材库 (media library id `9e0ff19bc4acb483ba82c280f80818afb2767d6618e5261f9764b9cef4a717b2`).

## 6. What the H3 pass changed, and what to fix next

- H3 reads the sunglasses correctly and the push-in turns into the glass on its own in the last half second of S1 — the cut into S2 at 4.30 s is therefore a match cut, not a dissolve.
- The jungle reveal needed the tail of S2 (the city appears through palms around 3.4 s); using the head of the clip loses the reveal and leaves 1.8 s of dark foliage.
- H3's native audio gave birds → whoosh → synth pad without speech, so no music bed was added.
- The reference's product framing is tighter and its light is higher-key than S1's; a closer match would regenerate S1 with a tighter reference crop, or add 15% punch-in at the head of the cut.

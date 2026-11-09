#!/usr/bin/env python3
"""Cut the H3 shots into the 13-second lens-portal film.

Each clip is trimmed, graded and normalized to 1920x1080/24p, then hard-cut
together with its own ambience. Edit the PLAN table and re-run.
"""
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
CLIPS = ROOT / "work/renux-produce/clips"
OUT = ROOT / "work/renux-produce/final"
OUT.mkdir(parents=True, exist_ok=True)

FPS = 24

# (file, in, out, grade)  grade is applied before the cut
PLAN_A = [
    ("S1", 0.00, 4.45, "eq=brightness=0.02:contrast=1.03:saturation=0.94"),
    ("S2", 1.70, 3.50, "eq=brightness=0.02:contrast=1.04:saturation=1.02"),
    ("S3", 1.15, 2.65, "eq=contrast=1.05:saturation=1.02"),
    ("S4", 0.90, 2.90, "eq=contrast=1.05:saturation=1.05"),
    ("S5", 1.40, 2.50, "eq=brightness=0.02:contrast=1.06:saturation=0.98"),
    ("S6", 1.20, 3.90, "eq=brightness=0.02:contrast=1.03:saturation=0.94"),
]

PLAN_B = [
    ("S1", 0.00, 4.30, "eq=brightness=0.08:contrast=1.05:saturation=0.95,colorbalance=rs=-0.03:bs=0.04:rm=-0.02:bm=0.02"),
    ("S2", 2.15, 3.95, "eq=brightness=0.05:contrast=1.05:saturation=1.03"),
    ("S3", 1.15, 2.65, "eq=contrast=1.06:saturation=1.02"),
    ("S4", 0.90, 2.90, "eq=contrast=1.06:saturation=1.06"),
    ("S5", 1.40, 2.50, "eq=brightness=0.02:contrast=1.06:saturation=0.98"),
    ("S6", 1.20, 3.90, "eq=brightness=0.08:contrast=1.05:saturation=0.95,colorbalance=rs=-0.03:bs=0.04:rm=-0.02:bm=0.02"),
]
PLAN_C = [
    ("S1", 0.00, 4.30, "eq=brightness=0.08:contrast=1.05:saturation=0.95,colorbalance=rs=-0.03:bs=0.04:rm=-0.02:bm=0.02"),
    ("S2", 2.60, 4.00, "eq=brightness=0.07:contrast=1.04:saturation=1.03"),
    ("S3", 1.15, 2.65, "eq=contrast=1.06:saturation=1.02"),
    ("S4", 0.90, 2.90, "eq=contrast=1.06:saturation=1.06"),
    ("S5", 1.40, 2.50, "eq=brightness=0.02:contrast=1.06:saturation=0.98"),
    ("S6", 1.20, 3.90, "eq=brightness=0.08:contrast=1.05:saturation=0.95,colorbalance=rs=-0.03:bs=0.04:rm=-0.02:bm=0.02"),
]
PLAN = {"A": PLAN_A, "B": PLAN_B, "C": PLAN_C}[os.environ.get("VARIANT", "C")]

total = sum(end - start for _, start, end, _ in PLAN)
FADE_OUT_AT = max(0.0, total - 0.35)

inputs: list[str] = []
filters: list[str] = []
concat_pads: list[str] = []
for index, (name, start, end, grade) in enumerate(PLAN):
    inputs += ["-i", str(CLIPS / f"{name}.mp4")]
    duration = end - start
    filters.append(
        f"[{index}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,"
        f"scale=1920:1080:flags=lanczos,fps={FPS},setsar=1,{grade},format=yuv420p[v{index}]"
    )
    filters.append(
        f"[{index}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,aresample=48000,"
        f"afade=t=in:st=0:d=0.04,afade=t=out:st={max(0.0, duration - 0.06):.3f}:d=0.06[a{index}]"
    )
    concat_pads.append(f"[v{index}][a{index}]")

filters.append("".join(concat_pads) + f"concat=n={len(PLAN)}:v=1:a=1[cv][ca]")
filters.append(f"[cv]fade=t=in:st=0:d=0.12,fade=t=out:st={FADE_OUT_AT:.3f}:d=0.35[vout]")
filters.append(f"[ca]loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=out:st={max(0.0, total - 0.55):.3f}:d=0.55[aout]")

destination = OUT / os.environ.get("OUT_NAME", "lens-portal-13s.mp4")
command = [
    "ffmpeg", "-hide_banner", "-v", "warning", "-y", *inputs,
    "-filter_complex", ";".join(filters),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high",
    "-pix_fmt", "yuv420p", "-r", str(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", "-shortest",
    "-metadata", "title=Lens Portal — 13s H3 remix",
    "-metadata", "comment=Recreated from the first 13 seconds of the Dreamina Seedance 2.0 demo; generated with MiniMax H3.",
    str(destination),
]
print(f"total {total:.2f}s -> {destination}")
subprocess.run(command, check=True)
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-show_entries",
     "stream=codec_name,width,height,r_frame_rate", "-of", "json", str(destination)],
    capture_output=True, text=True, check=True,
)
print(probe.stdout)

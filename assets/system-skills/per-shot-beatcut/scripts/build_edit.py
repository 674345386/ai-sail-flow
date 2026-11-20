#!/usr/bin/env python3
"""Trim N single-shot clips to a timeline and lay one continuous audio track.

Usage:
  python3 build_edit.py --timeline timeline.json \
      --clips c1.mp4 c2.mp4 ... --audio bgm.wav --out final.mp4
"""
import argparse
import json
import subprocess


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--clips", nargs="+", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--head", type=float, default=0.25, help="seconds skipped at clip head")
    ap.add_argument("--fade", type=float, default=0.6, help="audio fade-out at the end")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    tl = json.load(open(a.timeline))
    durs = tl["durations"]
    if len(durs) != len(a.clips):
        raise SystemExit("timeline has %d shots but %d clips given" % (len(durs), len(a.clips)))
    end = round(sum(durs), 3)

    args = ["ffmpeg", "-y", "-v", "warning"]
    for c in a.clips:
        args += ["-i", c]
    args += ["-i", a.audio]
    last = len(a.clips)

    fc = []
    for i, d in enumerate(durs):
        fc.append("[%d:v]trim=%.3f:%.3f,setpts=PTS-STARTPTS,fps=%d,scale=%d:%d[v%d]"
                  % (i, a.head, a.head + d, a.fps, a.width, a.height, i))
    fc.append("".join("[v%d]" % i for i in range(last)) + "concat=n=%d:v=1:a=0[vout]" % last)
    fc.append("[%d:a]atrim=0:%.3f,asetpts=PTS-STARTPTS,afade=t=out:st=%.3f:d=%.2f[aout]"
              % (last, end, max(0.0, end - a.fade - 0.1), a.fade))

    args += ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]", "-shortest",
             "-c:v", "libx264", "-crf", str(a.crf), "-preset", "medium", "-pix_fmt", "yuv420p",
             "-r", str(a.fps), "-c:a", "aac", "-b:a", "192k", a.out]

    if a.dry_run:
        print(" ".join(args))
        return
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr[-1500:])
    print("wrote %s (target %.3fs)" % (a.out, end))


if __name__ == "__main__":
    main()

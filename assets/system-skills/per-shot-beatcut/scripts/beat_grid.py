#!/usr/bin/env python3
"""Pick N cut boundaries that land on real audio accents.

Pure standard library (no numpy). Works on a PCM WAV file.

Usage:
  python3 beat_grid.py --audio bgm.wav --shots 9 --min 2.0 --max 3.0 \
      --out timeline.json
"""
import argparse
import array
import json
import math
import wave


def read_mono(path):
    w = wave.open(path, "rb")
    sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
    raw = array.array("h")
    raw.frombytes(w.readframes(n))
    if ch > 1:
        raw = array.array("h", raw[0::ch])
    return sr, raw


def onset_strength(sr, buf, hop_s=0.01):
    hop = max(1, int(sr * hop_s))
    frames = len(buf) // hop
    env = []
    for i in range(frames):
        seg = buf[i * hop:(i + 1) * hop]
        env.append(sum(float(x) * x for x in seg) / len(seg))
    ons = [0.0] * frames
    for i in range(1, frames):
        ons[i] = max(0.0, math.log(env[i] + 1.0) - math.log(env[i - 1] + 1.0))
    return ons, hop_s


def accent_peaks(ons, hop_s, quantile=0.96, min_gap=0.15):
    n = len(ons)
    thr = sorted(ons)[min(n - 1, int(n * quantile))]
    raw = []
    for i in range(2, n - 2):
        if ons[i] >= thr and ons[i] == max(ons[i - 2:i + 3]):
            raw.append((round(i * hop_s, 3), round(ons[i], 3)))
    merged = []
    for t, s in raw:
        if merged and t - merged[-1][0] < min_gap:
            if s > merged[-1][1]:
                merged[-1] = (t, s)
        else:
            merged.append((t, s))
    return merged


def solve(accents, shots, lo, hi, total):
    pts = [(0.0, 0.0)] + [p for p in accents if lo < p[0] < total - lo] + [(total, 0.0)]
    n = len(pts)
    neg = float("-inf")
    dp = [[neg] * n for _ in range(shots + 1)]
    bk = [[None] * n for _ in range(shots + 1)]
    dp[0][0] = 0.0
    for k in range(1, shots + 1):
        for j in range(1, n):
            best, arg = neg, None
            for i in range(j):
                d = pts[j][0] - pts[i][0]
                if lo - 1e-9 <= d <= hi + 1e-9 and dp[k - 1][i] > neg:
                    sc = dp[k - 1][i] + pts[j][1]
                    if sc > best:
                        best, arg = sc, i
            dp[k][j], bk[k][j] = best, arg
    if dp[shots][n - 1] == neg:
        return None
    path, j = [], n - 1
    for k in range(shots, 0, -1):
        path.append(j)
        j = bk[k][j]
    path.append(0)
    path.reverse()
    return [pts[p][0] for p in path], dp[shots][n - 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--shots", type=int, required=True)
    ap.add_argument("--min", dest="lo", type=float, default=2.0)
    ap.add_argument("--max", dest="hi", type=float, default=3.0)
    ap.add_argument("--end", type=float, default=None, help="cut end in seconds (default: audio length)")
    ap.add_argument("--quantile", type=float, default=0.96)
    ap.add_argument("--out", default="timeline.json")
    a = ap.parse_args()

    sr, buf = read_mono(a.audio)
    total = a.end if a.end else len(buf) / sr
    ons, hop = onset_strength(sr, buf)
    accents = accent_peaks(ons, hop, a.quantile)

    lo, result = a.lo, None
    while result is None and lo >= 1.5:
        result = solve(accents, a.shots, lo, a.hi, total)
        if result is None:
            lo = round(lo - 0.1, 2)

    if result is None:
        raise SystemExit(
            "infeasible: %d shots of %.2f-%.2fs cannot fit %.2fs of audio"
            % (a.shots, a.hi * 0 + a.lo, a.hi, total)
        )

    bounds, score = result
    durations = [round(bounds[i + 1] - bounds[i], 3) for i in range(a.shots)]
    out = {
        "audio_seconds": round(total, 3),
        "shots": a.shots,
        "min_used": lo,
        "max": a.hi,
        "boundaries": [round(b, 3) for b in bounds],
        "durations": durations,
        "score": round(score, 2),
        "accents": accents,
    }
    with open(a.out, "w") as f:
        json.dump(out, f, indent=2)
    print("boundaries:", ["%.2f" % b for b in bounds])
    print("durations:", ["%.2f" % d for d in durations], "total %.3f" % sum(durations))
    if lo != a.lo:
        print("note: relaxed min from %.2f to %.2f to fit the audio" % (a.lo, lo))


if __name__ == "__main__":
    main()

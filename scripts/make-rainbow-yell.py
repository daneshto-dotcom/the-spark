#!/usr/bin/env python3
"""
SPARK — S85 P1: rainbow flyover yell mastering (source WAV -> deployed OGG).

The S84 chain that produced public/audio/rainbow-yell.ogg was run as ad-hoc
shell commands and shipped a SILENT file (volumedetect mean -52.8 dB; the
entire 2.67s under -45 dB) — the live bug "rainbow doesn't make sound".
The source TTS WAV was always healthy (mean -16.1 dB, peak 0 dB). This script
commits the pipeline AND refuses to emit a broken file: it measures the output
with volumedetect and FAILS LOUDLY if the mean/peak fall outside the window
that lightning-crackle.ogg (the proven-audible SFX reference, mean -13.2 dB)
defines.

Chain (preserves the S84 creative intent):
  asetrate x1.30   pitch-up + speed-up = the dumb cartoon voice
  aresample 48000  honest resample after the rate trick (opus-native rate)
  vibrato 6Hz/0.4  comic warble
  alimiter -1 dB   true-peak safety (NO loudnorm: one-pass loudnorm on a
                   <3s clip is what nuked the S84 output)

Usage: python scripts/make-rainbow-yell.py
Cost: $0 (re-masters the existing committed source WAV).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets-source" / "rainbow-flyover" / "rainbow-yell-source.wav"
OUT = ROOT / "public" / "audio" / "rainbow-yell.ogg"

SOURCE_RATE = 24000  # Chirp3-HD TTS native rate (ffprobe-verified)
PITCH = 1.30

# Audibility gates, anchored to lightning-crackle.ogg (mean -13.2 / max 0.0).
# A healthy voice clip with leading/trailing silence lands mean ~ -14..-25 dB.
MEAN_DB_FLOOR = -30.0
PEAK_DB_FLOOR = -6.0

FILTER = (
    f"asetrate={SOURCE_RATE}*{PITCH},"
    f"aresample=48000,"
    f"vibrato=f=6:d=0.4,"
    f"alimiter=limit=0.891"  # -1 dBFS ceiling
)


def volumedetect(path: Path) -> tuple[float, float]:
    """Return (mean_dB, max_dB) for an audio file via ffmpeg volumedetect."""
    proc = subprocess.run(
        ["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    log = proc.stderr
    mean = re.search(r"mean_volume:\s*(-?[\d.]+) dB", log)
    peak = re.search(r"max_volume:\s*(-?[\d.]+) dB", log)
    if mean is None or peak is None:
        raise RuntimeError(f"volumedetect failed on {path}:\n{log[-800:]}")
    return float(mean.group(1)), float(peak.group(1))


def main() -> int:
    if not SOURCE.exists():
        print(f"FATAL: source WAV missing: {SOURCE}", file=sys.stderr)
        return 1

    src_mean, src_peak = volumedetect(SOURCE)
    print(f"source : mean {src_mean:+.1f} dB, peak {src_peak:+.1f} dB")
    if src_mean < MEAN_DB_FLOOR:
        print("FATAL: the SOURCE itself is silent — regenerate the TTS first.", file=sys.stderr)
        return 1

    cmd = [
        "ffmpeg", "-y", "-i", str(SOURCE),
        "-af", FILTER,
        "-c:a", "libopus", "-b:a", "64k", "-application", "audio",
        str(OUT),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"FATAL: ffmpeg encode failed:\n{proc.stderr[-800:]}", file=sys.stderr)
        return 1

    out_mean, out_peak = volumedetect(OUT)
    print(f"output : mean {out_mean:+.1f} dB, peak {out_peak:+.1f} dB -> {OUT.relative_to(ROOT)}")

    # The gate that was missing in S84: a silent render CANNOT ship.
    if out_mean < MEAN_DB_FLOOR or out_peak < PEAK_DB_FLOOR:
        OUT.unlink(missing_ok=True)
        print(
            f"FATAL: output failed the audibility gate "
            f"(mean {out_mean:.1f} < {MEAN_DB_FLOOR} or peak {out_peak:.1f} < {PEAK_DB_FLOOR}). "
            f"Output deleted — fix the filter chain.",
            file=sys.stderr,
        )
        return 1

    print("PASS: audibility gate met.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

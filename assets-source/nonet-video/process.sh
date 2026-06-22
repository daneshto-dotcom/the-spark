#!/usr/bin/env bash
# S96 — NONET video pipeline, stage 3: raw veo mp4 -> seamless-loop opaque VP9 webm.
#
# Seamless loop trick: xfade the clip against a second copy of itself at offset=(D-CF), then keep the
# middle segment [CF, D] (length D-CF). Its first frame == its last frame (both == clip@CF), so it
# loops with zero seam. Audio stripped (-an). Output is OPAQUE VP9 — transparency/feather is applied
# at render time by a Pixi alpha mask (this ffmpeg/libvpx build can't encode an alpha plane).
#
# Usage: ./process.sh <name> <char|bg>
set -euo pipefail
name="$1"; mode="$2"
in="raw/${name}.mp4"
out="../../public/art/nonet/${name}.webm"

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in" | cut -d. -f1)
if [ "$mode" = "char" ]; then
  CF=1.2; W=540; H=960; VIG="vignette=PI/5"; CRF=33
else
  CF=1.5; W=1280; H=720; VIG="vignette=PI/4.2"; CRF=34
fi
# bc-free float math via awk
OFF=$(awk "BEGIN{printf \"%.3f\", $D - $CF}")
END=$(awk "BEGIN{printf \"%.3f\", $D}")

ffmpeg -v error -i "$in" -i "$in" -filter_complex \
"[0:v][1:v]xfade=transition=fade:duration=${CF}:offset=${OFF},trim=start=${CF}:end=${END},setpts=PTS-STARTPTS,scale=${W}:${H},${VIG}[v]" \
-map "[v]" -an -c:v libvpx-vp9 -pix_fmt yuv420p -crf ${CRF} -b:v 0 -row-mt 1 -deadline good -cpu-used 2 "$out" -y

SZ=$(du -k "$out" | cut -f1)
LOOP=$(awk "BEGIN{printf \"%.1f\", $D - $CF}")
echo "OK ${name}: ${W}x${H} loop=${LOOP}s ${SZ}KB -> ${out}"

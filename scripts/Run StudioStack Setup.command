#!/bin/bash
# Double-click this file in Finder. It does the StudioStack moves for you.
# No questions. Close the window when it says DONE.

set -euo pipefail
cd "$HOME"

AI="/Volumes/AI Models"
ARES="/Volumes/Lexar-ARES"
WORK="/Volumes/Samsung-2TB"
FAST="/Volumes/Samsung-1TB"
CAPACITY="/Volumes/Lexar-4TB"
ZSHRC="$HOME/.zshrc"

echo ""
echo "========================================"
echo "  StudioStack setup — running for you"
echo "========================================"
echo ""

# Make sure drives are plugged in
for d in "$AI" "$ARES" "$WORK" "$FAST" "$CAPACITY"; do
  if [[ ! -d "$d" ]]; then
    echo "MISSING: $d"
    echo "Plug in StudioStack / Express drives, then double-click this file again."
    echo ""
    read -r -p "Press Return to close…"
    exit 1
  fi
done

echo "1/4  Stopping Ollama if it is running…"
pkill -x ollama 2>/dev/null || true
sleep 1

echo "2/4  Moving AI files onto StudioStack (AI Models)…"
mkdir -p "$AI/Ollama" "$AI/HuggingFace"

if [[ -d "$ARES/Ollama" ]]; then
  rsync -a --progress "$ARES/Ollama/" "$AI/Ollama/"
fi
if [[ -d "$ARES/HuggingFace" ]]; then
  rsync -a --progress "$ARES/HuggingFace/" "$AI/HuggingFace/"
fi

SRC_C=$(find "$ARES/Ollama" -type f 2>/dev/null | wc -l | tr -d ' ')
DST_C=$(find "$AI/Ollama" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "    Ollama files copied: $DST_C (source had $SRC_C)"

if [[ -d "$ARES/Ollama" && "$DST_C" -ge "$SRC_C" && "$DST_C" -gt 0 ]]; then
  rm -rf "$ARES/Ollama" "$ARES/HuggingFace"
  echo "    Cleared old copies on Lexar-ARES."
fi

echo "3/4  Pointing your Mac at the new AI folders…"
touch "$ZSHRC"
grep -v -E '^export (EXO_HOME|OLLAMA_MODELS|HF_HOME|HUGGINGFACE_HUB_CACHE)=' "$ZSHRC" > "$ZSHRC.tmp" || true
mv "$ZSHRC.tmp" "$ZSHRC"
cat >> "$ZSHRC" <<'EOF'

# OWC StudioStack AI volume
export EXO_HOME="/Volumes/AI Models/exo-models"
export OLLAMA_MODELS="/Volumes/AI Models/Ollama"
export HF_HOME="/Volumes/AI Models/HuggingFace"
export HUGGINGFACE_HUB_CACHE="/Volumes/AI Models/HuggingFace"
EOF

echo "4/4  Creating folders + tidying installers…"
mkdir -p "$CAPACITY/Media" "$CAPACITY/Archives" "$CAPACITY/TimeMachine" "$CAPACITY/Incoming"
mkdir -p "$WORK/Archives/Installers" "$WORK/scratch" "$FAST/Scratch"

shopt -s nullglob
moved=0
for f in "$WORK"/*.dmg "$WORK"/*.pkg "$WORK"/*.exe; do
  [[ -e "$f" ]] || continue
  mv -n "$f" "$WORK/Archives/Installers/" && echo "    moved $(basename "$f")" && moved=$((moved+1))
done
echo "    Moved $moved installer file(s)."

echo ""
echo "========================================"
echo "  DONE — you do not need to do anything else"
echo "========================================"
echo ""
echo "AI now lives on:  /Volumes/AI Models"
du -sh "$AI/exo-models" "$AI/Ollama" "$AI/HuggingFace" 2>/dev/null || true
echo ""
echo "Open a NEW Terminal window if you use Ollama/exo from the command line."
echo "Time Machine: skip for now — say if you want that set up later."
echo ""
read -r -p "Press Return to close…"

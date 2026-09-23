#!/bin/bash
# OWC StudioStack + Express 4M2 volume optimizer
# Run in Terminal (outside Cursor sandbox):
#   bash "/Volumes/Samsung-2TB/Projects/Projects/jarvis-companion/scripts/optimize-studiostack.sh"
# Preview only:
#   bash ".../optimize-studiostack.sh" --dry-run
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

AI="/Volumes/AI Models"
ARES="/Volumes/Lexar-ARES"
WORK="/Volumes/Samsung-2TB"
FAST_EMPTY="/Volumes/Samsung-1TB"
CAPACITY="/Volumes/Lexar-4TB"
TM_VOL="/Volumes/Lexar-3"

run() {
  if (( DRY_RUN )); then
    printf '  [dry-run]'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

echo "=============================================="
echo " OWC StudioStack / Express 4M2 optimizer"
if (( DRY_RUN )); then
  echo " DRY RUN — no files, volumes, or Time Machine destinations will change"
fi
echo "=============================================="
echo
echo "Detected layout:"
echo "  StudioStack NVMe (Fanxiang S880, PCIe x4) → $AI + Time Machine share"
echo "  Express 4M2: Samsung 1TB/2TB, Lexar ARES, Lexar 4TB"
echo
df -h "$AI" "$ARES" "$WORK" "$FAST_EMPTY" "$CAPACITY" 2>/dev/null || true
echo

confirm() {
  if (( DRY_RUN )); then
    echo "$1 [dry-run: yes]"
    return 0
  fi
  read -r -p "$1 [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]]
}

# --- Phase 1: Consolidate AI onto StudioStack NVMe ---
if confirm "Phase 1: Move Ollama + HuggingFace onto StudioStack NVMe ($AI)?"; then
  if pgrep -xq ollama 2>/dev/null; then
    echo "Stopping ollama..."
    run pkill -x ollama || true
    (( DRY_RUN )) || sleep 1
  fi
  run mkdir -p "$AI/Ollama" "$AI/HuggingFace"
  if [[ -d "$ARES/Ollama" ]]; then
    echo "→ rsync Ollama..."
    run rsync -a --info=progress2 "$ARES/Ollama/" "$AI/Ollama/"
  fi
  if [[ -d "$ARES/HuggingFace" ]]; then
    echo "→ rsync HuggingFace..."
    run rsync -a --info=progress2 "$ARES/HuggingFace/" "$AI/HuggingFace/"
  fi
  echo "Verify:"
  du -sh "$AI/exo-models" "$AI/Ollama" "$AI/HuggingFace" 2>/dev/null || true
  if confirm "Delete originals on Lexar-ARES after successful copy?"; then
    run rm -rf "$ARES/Ollama" "$ARES/HuggingFace"
    echo "Cleared Lexar-ARES AI folders."
  fi
fi

# --- Phase 2: Env paths ---
if confirm "Phase 2: Update ~/.zshrc for EXO_HOME + OLLAMA_MODELS + HF_HOME?"; then
  ZSHRC="$HOME/.zshrc"
  if (( DRY_RUN )); then
    echo "  [dry-run] rewrite EXO/OLLAMA/HF exports in $ZSHRC"
  else
    touch "$ZSHRC"
    # Remove old EXO/OLLAMA/HF lines we manage
    grep -v -E '^export (EXO_HOME|OLLAMA_MODELS|HF_HOME|HUGGINGFACE_HUB_CACHE)=' "$ZSHRC" > "$ZSHRC.tmp" || true
    mv "$ZSHRC.tmp" "$ZSHRC"
    cat >> "$ZSHRC" <<'EOF'

# OWC StudioStack AI volume (Fanxiang NVMe — fastest external)
export EXO_HOME="/Volumes/AI Models/exo-models"
export OLLAMA_MODELS="/Volumes/AI Models/Ollama"
export HF_HOME="/Volumes/AI Models/HuggingFace"
export HUGGINGFACE_HUB_CACHE="/Volumes/AI Models/HuggingFace"
EOF
    echo "Updated $ZSHRC — open a new terminal tab to pick up env."
  fi
fi

# --- Phase 3: Capacity folders on Lexar-4TB + tidy work drive ---
if confirm "Phase 3: Create role folders on Lexar-4TB and tidy Samsung-2TB installers?"; then
  run mkdir -p "$CAPACITY"/{Media,Archives,TimeMachine,Incoming}
  run mkdir -p "$WORK/Archives/Installers" "$WORK/scratch" "$FAST_EMPTY/Scratch"
  # Move loose DMGs/PKGs on Samsung-2TB root into Archives/Installers
  shopt -s nullglob
  moved=0
  for f in "$WORK"/*.dmg "$WORK"/*.pkg "$WORK"/*.exe; do
    [[ -e "$f" ]] || continue
    if (( DRY_RUN )); then
      echo "  [dry-run] mv -n $f $WORK/Archives/Installers/"
      moved=$((moved+1))
    else
      mv -n "$f" "$WORK/Archives/Installers/" && echo "  moved $(basename "$f")" && moved=$((moved+1))
    fi
  done
  echo "Moved $moved installer(s). Capacity folders ready on Lexar-4TB."
fi

# --- Phase 4: Rename volumes for clarity ---
if confirm "Phase 4: Rename volumes to role names? (diskutil)"; then
  run diskutil rename "$AI" "StudioStack-AI" || true
  run diskutil rename "$WORK" "Work-2TB" || true
  run diskutil rename "$FAST_EMPTY" "Scratch-1TB" || true
  run diskutil rename "$ARES" "Cache-ARES" || true
  run diskutil rename "$CAPACITY" "Media-4TB" || true
  echo "Note: update ~/.zshrc paths if you renamed AI volume."
  echo "Current mounts:"
  ls /Volumes
fi

# --- Phase 5: Time Machine off shared Fanxiang container ---
echo
echo "Phase 5 (optional, destructive to old TM history on Lexar-3):"
echo "  Lexar-3 currently holds Time Machine data on the SAME 1TB Fanxiang"
echo "  as AI Models — they share free space (~476GB). Best practice:"
echo "    1) Point Time Machine at Media-4TB (Lexar EQ790 4TB)"
echo "    2) After a good new backup, delete the Lexar-3 APFS volume so"
echo "       StudioStack-AI gets the full ~1TB."
echo "  tmutil currently reports: no destinations configured"
echo "  (Lexar-3 still has leftover TM local backups / inheritance files)."
if confirm "Set Time Machine destination to Lexar-4TB/TimeMachine and start backup?"; then
  run mkdir -p "$CAPACITY/TimeMachine"
  run sudo tmutil setdestination -a "$CAPACITY"
  run sudo tmutil startbackup --auto
  echo "Time Machine destination set. Monitor via: tmutil status"
fi

if confirm "AFTER a successful new TM backup — delete Lexar-3 volume to free Fanxiang for AI only?"; then
  echo "This erases old TM history on Lexar-3."
  if confirm "Type confirmation: really erase Lexar-3 now?"; then
    # Find device node for Lexar-3
    DEV=$(df "$TM_VOL" 2>/dev/null | awk 'NR==2{print $1}')
    if [[ -z "${DEV:-}" ]]; then
      echo "Lexar-3 is not mounted — skip delete."
    else
      echo "Unmounting and deleting APFS volume $DEV ..."
      run diskutil unmount force "$TM_VOL" || true
      run diskutil apfs deleteVolume "$DEV"
      echo "Done. AI Models container should now reclaim space — verify in Disk Utility."
    fi
  fi
fi

echo
echo "=============================================="
echo " Done. Recommended steady-state roles:"
echo "  StudioStack NVMe (x4):  AI models / hot inference"
echo "  Samsung 9100 PRO 2TB:  Projects + home-offload"
echo "  Samsung 9100 PRO 1TB:  Scratch / captures"
echo "  Lexar ARES 1TB:        Caches / temp"
echo "  Lexar EQ790 4TB:       Media + Time Machine"
echo "  StudioStack SATA bay:  Add a HDD later for cold archive/TM"
echo "=============================================="

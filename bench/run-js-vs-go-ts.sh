#!/usr/bin/env bash
# ── JS TypeScript (tsc) vs Go TypeScript (tsgo) Benchmark Runner ──────────────
# Compileert archetype-ecs met beide compilers en vergelijkt de runtime.
#
# Gebruik:  bash bench/run-js-vs-go-ts.sh
# Vereist:  npm install @typescript/native-preview
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")/.."

BENCH="bench/component-churn-bench.js"
NODE_FLAGS="--expose-gc"

# Kleuren
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}=== archetype-ecs: tsc vs tsgo ===${NC}"
echo ""

# ── Check of tsgo beschikbaar is ─────────────────────────────────────────────

if ! npx tsgo --version &>/dev/null; then
  echo -e "${RED}tsgo niet gevonden. Installeer met:${NC}"
  echo "  npm install -D @typescript/native-preview"
  exit 1
fi

TSC_VERSION=$(npx tsc --version 2>/dev/null || echo "unknown")
TSGO_VERSION=$(npx tsgo --version 2>/dev/null || echo "unknown")
echo -e "  tsc:  ${CYAN}${TSC_VERSION}${NC}"
echo -e "  tsgo: ${CYAN}${TSGO_VERSION}${NC}"
echo ""

# ── Backup bestaande dist ───────────────────────────────────────────────────

DIST_BACKUP=""
if [ -d dist ]; then
  DIST_BACKUP=$(mktemp -d)
  cp -r dist/* "$DIST_BACKUP/" 2>/dev/null || true
fi

cleanup() {
  # Herstel originele dist
  if [ -n "$DIST_BACKUP" ] && [ -d "$DIST_BACKUP" ]; then
    rm -rf dist
    mkdir -p dist
    cp -r "$DIST_BACKUP"/* dist/ 2>/dev/null || true
    rm -rf "$DIST_BACKUP"
  fi
}
trap cleanup EXIT

# ── 1. Compileer en benchmark met tsc (JS TypeScript) ───────────────────────

echo -e "${BOLD}--- [1/2] tsc (JS TypeScript) ---${NC}"
rm -rf dist

TSC_START=$(date +%s%N)
npx tsc
TSC_END=$(date +%s%N)
TSC_COMPILE=$(( (TSC_END - TSC_START) / 1000000 ))
echo -e "  Compile time: ${GREEN}${TSC_COMPILE}ms${NC}"
echo ""

TSC_OUTPUT=$(TS_COMPILER="tsc (JS)" node $NODE_FLAGS "$BENCH")
echo "$TSC_OUTPUT"

TSC_ITER=$(echo "$TSC_OUTPUT" | grep '__ITER__=' | cut -d= -f2)
TSC_CHURN=$(echo "$TSC_OUTPUT" | grep '__CHURN__=' | cut -d= -f2)

echo ""

# ── 2. Compileer en benchmark met tsgo (Go TypeScript) ──────────────────────

echo -e "${BOLD}--- [2/2] tsgo (Go TypeScript) ---${NC}"
rm -rf dist

TSGO_START=$(date +%s%N)
npx tsgo
TSGO_END=$(date +%s%N)
TSGO_COMPILE=$(( (TSGO_END - TSGO_START) / 1000000 ))
echo -e "  Compile time: ${GREEN}${TSGO_COMPILE}ms${NC}"
echo ""

TSGO_OUTPUT=$(TS_COMPILER="tsgo (Go)" node $NODE_FLAGS "$BENCH")
echo "$TSGO_OUTPUT"

TSGO_ITER=$(echo "$TSGO_OUTPUT" | grep '__ITER__=' | cut -d= -f2)
TSGO_CHURN=$(echo "$TSGO_OUTPUT" | grep '__CHURN__=' | cut -d= -f2)

echo ""

# ── Samenvatting ─────────────────────────────────────────────────────────────

echo -e "${BOLD}=== Samenvatting ===${NC}"
echo ""

# Compile time vergelijking
if [ "$TSGO_COMPILE" -gt 0 ]; then
  COMPILE_RATIO=$(echo "scale=1; $TSC_COMPILE / $TSGO_COMPILE" | bc 2>/dev/null || echo "?")
else
  COMPILE_RATIO="?"
fi

echo "  Compile time:"
echo "    tsc  (JS): ${TSC_COMPILE}ms"
echo "    tsgo (Go): ${TSGO_COMPILE}ms"
echo -e "    ${GREEN}tsgo is ${COMPILE_RATIO}x sneller${NC}"
echo ""

# Runtime vergelijking
echo "  Runtime — iteratie baseline (ms/frame):"
echo "    tsc  (JS): ${TSC_ITER}"
echo "    tsgo (Go): ${TSGO_ITER}"
if [ -n "$TSC_ITER" ] && [ -n "$TSGO_ITER" ]; then
  ITER_RATIO=$(echo "scale=2; $TSC_ITER / $TSGO_ITER" | bc 2>/dev/null || echo "?")
  if (( $(echo "$ITER_RATIO > 1.05" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "    ${GREEN}tsgo is ${ITER_RATIO}x sneller${NC}"
  elif (( $(echo "$ITER_RATIO < 0.95" | bc -l 2>/dev/null || echo 0) )); then
    INV=$(echo "scale=2; 1 / $ITER_RATIO" | bc 2>/dev/null || echo "?")
    echo -e "    ${RED}tsc is ${INV}x sneller${NC}"
  else
    echo "    ~gelijk"
  fi
fi
echo ""

echo "  Runtime — component churn (ms/frame):"
echo "    tsc  (JS): ${TSC_CHURN}"
echo "    tsgo (Go): ${TSGO_CHURN}"
if [ -n "$TSC_CHURN" ] && [ -n "$TSGO_CHURN" ]; then
  CHURN_RATIO=$(echo "scale=2; $TSC_CHURN / $TSGO_CHURN" | bc 2>/dev/null || echo "?")
  if (( $(echo "$CHURN_RATIO > 1.05" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "    ${GREEN}tsgo is ${CHURN_RATIO}x sneller${NC}"
  elif (( $(echo "$CHURN_RATIO < 0.95" | bc -l 2>/dev/null || echo 0) )); then
    INV=$(echo "scale=2; 1 / $CHURN_RATIO" | bc 2>/dev/null || echo "?")
    echo -e "    ${RED}tsc is ${INV}x sneller${NC}"
  else
    echo "    ~gelijk"
  fi
fi
echo ""

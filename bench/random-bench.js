// Random benchmark: random() vs add(a, random()) vs forEach + Math.random()
// node bench/random-bench.js

import { createEntityManager, component, add, random } from '../dist/index.js';

const COUNT = 1_000_000;
const FRAMES = 200;
const WARMUP = 10;
const RUNS = 5;

const Position = component('RPos', { x: 'f32', y: 'f32' });

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pad = (s, n) => String(s).padStart(n);
const padEnd = (s, n) => String(s).padEnd(n);
const line = (n) => '-'.repeat(n);

function setup(wasm) {
  const em = createEntityManager({ wasm });
  for (let i = 0; i < COUNT; i++)
    em.createEntityWith(Position, { x: Math.random() * 800, y: Math.random() * 600 });
  return em;
}

// 1. forEach + Math.random() fill — baseline
function benchForEachRandom() {
  const em = setup(false);
  for (let f = 0; f < WARMUP; f++)
    em.forEach([Position], (arch) => {
      const px = arch.field(Position.x);
      for (let i = 0; i < arch.count; i++) px[i] = Math.random() * 800;
    });
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++)
    em.forEach([Position], (arch) => {
      const px = arch.field(Position.x);
      for (let i = 0; i < arch.count; i++) px[i] = Math.random() * 800;
    });
  return (performance.now() - t0) / FRAMES;
}

// 2. forEach + Math.random() shift — baseline for add+random
function benchForEachAddRandom() {
  const em = setup(false);
  for (let f = 0; f < WARMUP; f++)
    em.forEach([Position], (arch) => {
      const px = arch.field(Position.x);
      for (let i = 0; i < arch.count; i++) px[i] += (Math.random() - 0.5) * 2;
    });
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++)
    em.forEach([Position], (arch) => {
      const px = arch.field(Position.x);
      for (let i = 0; i < arch.count; i++) px[i] += (Math.random() - 0.5) * 2;
    });
  return (performance.now() - t0) / FRAMES;
}

// 3. apply random() — WASM LCG fill
function benchApplyRandom() {
  const em = setup(true);
  for (let f = 0; f < WARMUP; f++) em.apply(Position.x, random(0, 800));
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) em.apply(Position.x, random(0, 800));
  return (performance.now() - t0) / FRAMES;
}

// 4. apply add(a, random()) — WASM LCG shift
function benchApplyAddRandom() {
  const em = setup(true);
  for (let f = 0; f < WARMUP; f++) em.apply(Position.x, add(Position.x, random(-1, 1)));
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) em.apply(Position.x, add(Position.x, random(-1, 1)));
  return (performance.now() - t0) / FRAMES;
}

function printTable(results) {
  const nameWidth = 34;
  const valWidth = 10;
  const totalWidth = nameWidth + valWidth + 22;
  const baseline = results[0].value;
  console.log('');
  console.log('  ' + line(totalWidth));
  console.log('  ' + padEnd('Test', nameWidth) + pad('ms/frame', valWidth) + '     vs forEach baseline');
  console.log('  ' + line(totalWidth));
  for (const { name, value } of results) {
    const ratio = value / baseline;
    const cmp = name === results[0].name ? 'baseline'
               : ratio < 0.95 ? (1/ratio).toFixed(2) + 'x faster'
               : ratio > 1.05 ? ratio.toFixed(2) + 'x slower'
               : '~same';
    console.log('  ' + padEnd(name, nameWidth) + pad(value.toFixed(3), valWidth) + '     ' + cmp);
  }
  console.log('  ' + line(totalWidth));
  console.log('');
}

async function main() {
  console.log('\n=== Random Benchmark: ' + (COUNT/1e6).toFixed(0) + 'M entities, ' + FRAMES + ' frames ===\n');
  const results = [];
  const benches = [
    ['forEach + Math.random() (fill)',     benchForEachRandom],
    ['forEach + Math.random() (shift)',    benchForEachAddRandom],
    ['apply random()   WASM LCG',         benchApplyRandom],
    ['apply add(a, random())   WASM LCG', benchApplyAddRandom],
  ];
  for (const [name, fn] of benches) {
    console.log('  [' + (results.length + 1) + '/' + benches.length + '] ' + name);
    const times = [];
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write('        run ' + (r+1) + '/' + RUNS + '...');
      const ms = fn();
      times.push(ms);
      console.log(' ' + ms.toFixed(3) + ' ms');
    }
    results.push({ name, value: median(times) });
  }
  printTable(results);
}

main();

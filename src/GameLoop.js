import { profiler } from './Profiler.js';

export function createGameLoop(systems, renderSteps, { tickRate = 20, maxFrameTime = 250 } = {}) {
  let running = false;
  let lastTime = 0;
  let accumulator = 0;
  let tickCount = 0;
  let frameCount = 0;
  let fpsTime = 0;
  let fps = 0;
  let tps = 0;
  let fpsLimit = 0;
  let lastRenderTime = 0;
  let tickDuration = 1000 / tickRate;
  let rafId = 0;

  function loop(currentTime) {
    if (!running) return;

    const frameTime = Math.min(currentTime - lastTime, maxFrameTime);
    lastTime = currentTime;
    accumulator += frameTime;

    // Fixed timestep simulation
    while (accumulator >= tickDuration) {
      if (profiler.enabled) {
        const tickStart = performance.now();
        for (const system of systems) {
          if (system.update) {
            const t0 = performance.now();
            system.update(tickDuration);
            profiler.end(system.name || 'unnamed', t0);
          }
        }
        profiler.end('Tick Total', tickStart);
      } else {
        for (const system of systems) {
          if (system.update) system.update(tickDuration);
        }
      }
      accumulator -= tickDuration;
      tickCount++;
    }

    const alpha = accumulator / tickDuration;

    // Render (respecting fps cap)
    const minRenderInterval = fpsLimit > 0 ? 1000 / fpsLimit : 0;
    if (minRenderInterval === 0 || currentTime - lastRenderTime >= minRenderInterval) {
      if (profiler.enabled) {
        const renderStart = performance.now();
        for (const step of renderSteps) {
          const t0 = performance.now();
          step.fn(alpha, frameTime);
          profiler.end(step.name, t0);
        }
        profiler.end('Render Total', renderStart);
      } else {
        for (const step of renderSteps) {
          step.fn(alpha, frameTime);
        }
      }
      lastRenderTime = currentTime;
      frameCount++;
    }

    fpsTime += frameTime;
    if (fpsTime >= 1000) {
      fps = frameCount;
      tps = tickCount;
      frameCount = 0;
      tickCount = 0;
      fpsTime -= 1000;
    }

    rafId = requestAnimationFrame(loop);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      lastRenderTime = 0;
      rafId = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },

    setFpsLimit(limit) {
      fpsLimit = limit;
    },

    setTickRate(rate) {
      tickDuration = 1000 / rate;
      accumulator = 0;
    },

    setProfilingEnabled(enabled) {
      profiler.setEnabled(enabled);
    },

    getProfileData() { return profiler.getData(); },
    getFps() { return fps; },
    getTps() { return tps; }
  };
}

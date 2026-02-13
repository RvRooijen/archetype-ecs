const EMA_ALPHA = 0.1;
const data = new Map();
let enabled = false;

export const profiler = {
  get enabled() { return enabled; },

  setEnabled(value) {
    enabled = value;
    if (!value) data.clear();
  },

  begin() {
    return enabled ? performance.now() : 0;
  },

  end(name, t0) {
    if (!enabled) return;
    const ms = performance.now() - t0;
    const entry = data.get(name);
    if (entry) {
      entry.avg += (ms - entry.avg) * EMA_ALPHA;
    } else {
      data.set(name, { avg: ms });
    }
  },

  record(name, ms) {
    if (!enabled) return;
    const entry = data.get(name);
    if (entry) {
      entry.avg += (ms - entry.avg) * EMA_ALPHA;
    } else {
      data.set(name, { avg: ms });
    }
  },

  getData() { return data; }
};

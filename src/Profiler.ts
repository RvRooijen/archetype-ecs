export interface ProfilerEntry {
  avg: number;
}

export interface Profiler {
  readonly enabled: boolean;
  setEnabled(value: boolean): void;
  begin(): number;
  end(name: string, t0: number): void;
  record(name: string, ms: number): void;
  getData(): Map<string, ProfilerEntry>;
}

const EMA_ALPHA = 0.1;
const data = new Map<string, ProfilerEntry>();
let enabled = false;

export const profiler: Profiler = {
  get enabled() { return enabled; },

  setEnabled(value: boolean) {
    enabled = value;
    if (!value) data.clear();
  },

  begin() {
    return enabled ? performance.now() : 0;
  },

  end(name: string, t0: number) {
    if (!enabled) return;
    const ms = performance.now() - t0;
    const entry = data.get(name);
    if (entry) {
      entry.avg += (ms - entry.avg) * EMA_ALPHA;
    } else {
      data.set(name, { avg: ms });
    }
  },

  record(name: string, ms: number) {
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

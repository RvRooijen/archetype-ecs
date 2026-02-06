export function createEventBus() {
  const listeners = new Map();

  return {
    on(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(callback);
    },

    off(event, callback) {
      const cbs = listeners.get(event);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx !== -1) cbs.splice(idx, 1);
      }
    },

    emit(event, data) {
      const cbs = listeners.get(event);
      if (cbs) {
        for (const cb of cbs) {
          cb(data);
        }
      }
    }
  };
}

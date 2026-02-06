export function createContainer() {
  const factories = new Map();
  const instances = new Map();

  return {
    register(key, factory) {
      factories.set(key, factory);
    },

    resolve(key) {
      if (instances.has(key)) {
        return instances.get(key);
      }
      const factory = factories.get(key);
      if (!factory) {
        throw new Error(`No factory registered for key: ${key}`);
      }
      const instance = factory(this);
      instances.set(key, instance);
      return instance;
    }
  };
}

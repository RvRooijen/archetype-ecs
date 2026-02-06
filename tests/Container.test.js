import { describe, test, expect } from '@jest/globals';
import { createContainer } from '../src/Container.js';

describe('Container', () => {
  test('register and resolve returns factory result', () => {
    const container = createContainer();
    container.register('greeting', () => 'hello');
    expect(container.resolve('greeting')).toBe('hello');
  });

  test('singleton caching — resolves same instance', () => {
    const container = createContainer();
    let callCount = 0;
    container.register('service', () => {
      callCount++;
      return { id: callCount };
    });
    const a = container.resolve('service');
    const b = container.resolve('service');
    expect(a).toBe(b);
    expect(callCount).toBe(1);
  });

  test('factory receives container for dependency injection', () => {
    const container = createContainer();
    container.register('config', () => ({ port: 3000 }));
    container.register('server', (c) => {
      const config = c.resolve('config');
      return { port: config.port };
    });
    expect(container.resolve('server')).toEqual({ port: 3000 });
  });

  test('throws for unregistered key', () => {
    const container = createContainer();
    expect(() => container.resolve('missing')).toThrow('No factory registered for key: missing');
  });
});

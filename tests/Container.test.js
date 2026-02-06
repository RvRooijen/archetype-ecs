import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/Container.js';

describe('Container', () => {
  it('register and resolve returns factory result', () => {
    const container = createContainer();
    container.register('greeting', () => 'hello');
    assert.equal(container.resolve('greeting'), 'hello');
  });

  it('singleton caching — resolves same instance', () => {
    const container = createContainer();
    let callCount = 0;
    container.register('service', () => {
      callCount++;
      return { id: callCount };
    });
    const a = container.resolve('service');
    const b = container.resolve('service');
    assert.equal(a, b);
    assert.equal(callCount, 1);
  });

  it('factory receives container for dependency injection', () => {
    const container = createContainer();
    container.register('config', () => ({ port: 3000 }));
    container.register('server', (c) => {
      const config = c.resolve('config');
      return { port: config.port };
    });
    assert.deepEqual(container.resolve('server'), { port: 3000 });
  });

  it('throws for unregistered key', () => {
    const container = createContainer();
    assert.throws(() => container.resolve('missing'), {
      message: 'No factory registered for key: missing'
    });
  });
});

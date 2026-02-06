import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/EventBus.js';

describe('EventBus', () => {
  it('on/emit calls listener with data', () => {
    const bus = createEventBus();
    const received = [];
    bus.on('test', (data) => received.push(data));
    bus.emit('test', { value: 42 });
    assert.deepEqual(received, [{ value: 42 }]);
  });

  it('multiple listeners on same event', () => {
    const bus = createEventBus();
    const results = [];
    bus.on('test', () => results.push('a'));
    bus.on('test', () => results.push('b'));
    bus.emit('test');
    assert.deepEqual(results, ['a', 'b']);
  });

  it('off removes listener', () => {
    const bus = createEventBus();
    const results = [];
    const cb = () => results.push('called');
    bus.on('test', cb);
    bus.off('test', cb);
    bus.emit('test');
    assert.deepEqual(results, []);
  });

  it('emit on non-existent event is a no-op', () => {
    const bus = createEventBus();
    assert.doesNotThrow(() => bus.emit('nonexistent', {}));
  });

  it('off on non-existent event is a no-op', () => {
    const bus = createEventBus();
    assert.doesNotThrow(() => bus.off('nonexistent', () => {}));
  });
});

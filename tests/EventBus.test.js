import { describe, test, expect } from '@jest/globals';
import { createEventBus } from '../src/EventBus.js';

describe('EventBus', () => {
  test('on/emit calls listener with data', () => {
    const bus = createEventBus();
    const received = [];
    bus.on('test', (data) => received.push(data));
    bus.emit('test', { value: 42 });
    expect(received).toEqual([{ value: 42 }]);
  });

  test('multiple listeners on same event', () => {
    const bus = createEventBus();
    const results = [];
    bus.on('test', () => results.push('a'));
    bus.on('test', () => results.push('b'));
    bus.emit('test');
    expect(results).toEqual(['a', 'b']);
  });

  test('off removes listener', () => {
    const bus = createEventBus();
    const results = [];
    const cb = () => results.push('called');
    bus.on('test', cb);
    bus.off('test', cb);
    bus.emit('test');
    expect(results).toEqual([]);
  });

  test('emit on non-existent event is a no-op', () => {
    const bus = createEventBus();
    expect(() => bus.emit('nonexistent', {})).not.toThrow();
  });

  test('off on non-existent event is a no-op', () => {
    const bus = createEventBus();
    expect(() => bus.off('nonexistent', () => {})).not.toThrow();
  });
});

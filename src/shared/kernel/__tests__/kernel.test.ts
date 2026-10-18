import { describe, it, expect, beforeEach } from 'vitest';
import { CircularRingBuffer } from '../ring-buffer';
import { sanitizeHeaders, assertLoopbackHost, generateCspNonce } from '../security';
import { KernelEventBus } from '../event-bus';

describe('CircularRingBuffer', () => {
  it('should initialize with given capacity and maintain FIFO order', () => {
    const buffer = new CircularRingBuffer<number>(3);
    expect(buffer.capacity).toBe(3);
    expect(buffer.size).toBe(0);

    buffer.push(1);
    buffer.push(2);
    expect(buffer.getAll()).toEqual([1, 2]);
    expect(buffer.size).toBe(2);

    buffer.push(3);
    expect(buffer.getAll()).toEqual([1, 2, 3]);
    expect(buffer.size).toBe(3);

    buffer.push(4);
    expect(buffer.getAll()).toEqual([2, 3, 4]);
    expect(buffer.size).toBe(3);

    buffer.push(5);
    expect(buffer.getAll()).toEqual([3, 4, 5]);
  });

  it('should throw if capacity <= 0', () => {
    expect(() => new CircularRingBuffer(0)).toThrow();
  });

  it('should clear buffer contents', () => {
    const buffer = new CircularRingBuffer<string>(5);
    buffer.push('a');
    buffer.push('b');
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.getAll()).toEqual([]);
  });
});

describe('Security Utilities', () => {
  it('should redact sensitive headers and preserve non-sensitive ones', () => {
    const rawHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer secret-token-12345',
      'Cookie': 'sessionid=xyz; tracker=abc',
      'X-Api-Key': 'super-secret-key',
      'Accept': '*/*',
    };

    const sanitized = sanitizeHeaders(rawHeaders);
    expect(sanitized['content-type']).toBe('application/json');
    expect(sanitized['authorization']).toBe('[REDACTED]');
    expect(sanitized['cookie']).toBe('[REDACTED]');
    expect(sanitized['x-api-key']).toBe('[REDACTED]');
    expect(sanitized['accept']).toBe('*/*');
  });

  it('should strictly assert loopback host 127.0.0.1', () => {
    expect(() => assertLoopbackHost('127.0.0.1')).not.toThrow();
    expect(() => assertLoopbackHost('0.0.0.0')).toThrow();
    expect(() => assertLoopbackHost('localhost')).toThrow();
    expect(() => assertLoopbackHost('192.168.1.10')).toThrow();
  });

  it('should generate valid CSP nonce strings', () => {
    const nonce1 = generateCspNonce();
    const nonce2 = generateCspNonce();
    expect(nonce1).toBeTypeOf('string');
    expect(nonce1.length).toBeGreaterThan(10);
    expect(nonce1).not.toBe(nonce2);
  });
});

describe('KernelEventBus', () => {
  let bus: KernelEventBus;

  beforeEach(() => {
    bus = new KernelEventBus();
  });

  it('should register and trigger listeners correctly', () => {
    let captured = false;
    const unsubscribe = bus.on('proxy:stateChanged', (payload) => {
      if (payload.running && payload.port === 45990) {
        captured = true;
      }
    });

    bus.emit('proxy:stateChanged', { running: true, port: 45990 });
    expect(captured).toBe(true);

    captured = false;
    unsubscribe();
    bus.emit('proxy:stateChanged', { running: true, port: 45990 });
    expect(captured).toBe(false);
  });
});

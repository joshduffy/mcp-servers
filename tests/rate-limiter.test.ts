import { describe, it, expect, beforeEach, vi } from 'vitest';

// Re-implement the rate limiter for testing (same logic as in API servers)
class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequestsPerMinute: number) {
    this.windowMs = 60 * 1000; // 1 minute window
    this.maxRequests = maxRequestsPerMinute;
  }

  async checkLimit(): Promise<void> {
    const now = Date.now();
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestInWindow);
      throw new Error(
        `Rate limit exceeded (${this.maxRequests}/min). ` +
        `Try again in ${Math.ceil(waitTime / 1000)} seconds.`
      );
    }

    this.timestamps.push(now);
  }

  getRemaining(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  // For testing: clear all timestamps
  reset(): void {
    this.timestamps = [];
  }
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(5); // 5 requests per minute for testing
    vi.useFakeTimers();
  });

  it('should allow requests under the limit', async () => {
    await expect(limiter.checkLimit()).resolves.toBeUndefined();
    await expect(limiter.checkLimit()).resolves.toBeUndefined();
    await expect(limiter.checkLimit()).resolves.toBeUndefined();
    expect(limiter.getRemaining()).toBe(2);
  });

  it('should block requests at the limit', async () => {
    // Make 5 requests (the limit)
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit();
    }

    // 6th request should fail
    await expect(limiter.checkLimit()).rejects.toThrow('Rate limit exceeded');
    expect(limiter.getRemaining()).toBe(0);
  });

  it('should include wait time in error message', async () => {
    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit();
    }

    // Should mention seconds to wait
    await expect(limiter.checkLimit()).rejects.toThrow(/Try again in \d+ seconds/);
  });

  it('should allow requests again after window expires', async () => {
    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit();
    }

    // Should be blocked
    await expect(limiter.checkLimit()).rejects.toThrow('Rate limit exceeded');

    // Advance time past the window
    vi.advanceTimersByTime(61 * 1000);

    // Should be allowed again
    await expect(limiter.checkLimit()).resolves.toBeUndefined();
    expect(limiter.getRemaining()).toBe(4);
  });

  it('should use sliding window correctly', async () => {
    // Make 3 requests
    await limiter.checkLimit();
    await limiter.checkLimit();
    await limiter.checkLimit();
    expect(limiter.getRemaining()).toBe(2);

    // Advance time 30 seconds
    vi.advanceTimersByTime(30 * 1000);

    // Make 2 more requests (should be allowed, total = 5)
    await limiter.checkLimit();
    await limiter.checkLimit();
    expect(limiter.getRemaining()).toBe(0);

    // 6th request should fail
    await expect(limiter.checkLimit()).rejects.toThrow('Rate limit exceeded');

    // Advance time 31 more seconds (first 3 requests should expire)
    vi.advanceTimersByTime(31 * 1000);

    // Now only 2 requests in window, so 3 more should be allowed
    expect(limiter.getRemaining()).toBe(3);
    await expect(limiter.checkLimit()).resolves.toBeUndefined();
  });

  it('should handle high request rates correctly', async () => {
    const fastLimiter = new RateLimiter(100);

    // Make 100 requests rapidly
    for (let i = 0; i < 100; i++) {
      await fastLimiter.checkLimit();
    }

    // 101st should fail
    await expect(fastLimiter.checkLimit()).rejects.toThrow('Rate limit exceeded');
  });

  it('should calculate remaining correctly', async () => {
    expect(limiter.getRemaining()).toBe(5);

    await limiter.checkLimit();
    expect(limiter.getRemaining()).toBe(4);

    await limiter.checkLimit();
    expect(limiter.getRemaining()).toBe(3);

    // Advance past window
    vi.advanceTimersByTime(61 * 1000);
    expect(limiter.getRemaining()).toBe(5);
  });

  it('should work with different configurations', async () => {
    const strictLimiter = new RateLimiter(1);

    await strictLimiter.checkLimit();
    await expect(strictLimiter.checkLimit()).rejects.toThrow('Rate limit exceeded');

    const lenientLimiter = new RateLimiter(1000);
    for (let i = 0; i < 100; i++) {
      await lenientLimiter.checkLimit();
    }
    // Should still have plenty of capacity
    await expect(lenientLimiter.checkLimit()).resolves.toBeUndefined();
  });
});

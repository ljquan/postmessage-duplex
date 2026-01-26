/**
 * Efficient sliding window rate limiter using a circular buffer.
 * Provides O(1) time complexity for rate limit checks.
 *
 * This implementation avoids array filter operations on every check,
 * instead using a circular buffer with head/tail pointers.
 *
 * @class SlidingWindowRateLimiter
 * @example
 * const limiter = new SlidingWindowRateLimiter(100, 1000) // 100 msgs/sec
 *
 * if (limiter.tryAcquire()) {
 *   // Allowed to proceed
 *   sendMessage()
 * } else {
 *   // Rate limited
 *   console.log('Too many requests')
 * }
 */
export class SlidingWindowRateLimiter {
  /** Circular buffer of timestamps */
  private timestamps: number[]

  /** Head pointer (oldest timestamp) */
  private head = 0

  /** Tail pointer (next write position) */
  private tail = 0

  /** Current count of timestamps in the window */
  private count = 0

  /** Whether the limiter is enabled */
  private enabled: boolean

  /**
   * Creates a new rate limiter.
   * @param limit - Maximum number of operations per window (0 to disable)
   * @param windowMs - Window duration in milliseconds
   */
  constructor(
    private readonly limit: number,
    private readonly windowMs = 1000
  ) {
    this.enabled = limit > 0
    // Pre-allocate the buffer to avoid runtime allocations
    this.timestamps = this.enabled ? new Array(limit).fill(0) : []
  }

  /**
   * Attempts to acquire a slot within the rate limit.
   * @returns true if the operation is allowed, false if rate limited
   */
  tryAcquire(): boolean {
    if (!this.enabled) return true

    const now = Date.now()
    const windowStart = now - this.windowMs

    // Remove expired timestamps from the head
    while (this.count > 0 && this.timestamps[this.head] <= windowStart) {
      this.head = (this.head + 1) % this.limit
      this.count--
    }

    // Check if we're at the limit
    if (this.count >= this.limit) {
      return false
    }

    // Record this timestamp
    this.timestamps[this.tail] = now
    this.tail = (this.tail + 1) % this.limit
    this.count++

    return true
  }

  /**
   * Gets the current number of operations in the window.
   * @returns The count of operations in the current window
   */
  getCurrentCount(): number {
    if (!this.enabled) return 0

    const now = Date.now()
    const windowStart = now - this.windowMs

    // Count valid timestamps (don't modify state)
    let validCount = 0
    let idx = this.head
    for (let i = 0; i < this.count; i++) {
      if (this.timestamps[idx] > windowStart) {
        validCount++
      }
      idx = (idx + 1) % this.limit
    }

    return validCount
  }

  /**
   * Gets the remaining capacity in the current window.
   * @returns Number of operations that can still be performed
   */
  getRemainingCapacity(): number {
    if (!this.enabled) return Infinity
    return Math.max(0, this.limit - this.getCurrentCount())
  }

  /**
   * Gets the time until the next slot becomes available.
   * @returns Milliseconds until a slot opens, or 0 if immediately available
   */
  getTimeUntilAvailable(): number {
    if (!this.enabled || this.count < this.limit) return 0

    const now = Date.now()
    const windowStart = now - this.windowMs

    // Find the oldest timestamp that's still in the window
    let idx = this.head
    while (idx !== this.tail) {
      if (this.timestamps[idx] > windowStart) {
        return this.timestamps[idx] - windowStart
      }
      idx = (idx + 1) % this.limit
    }

    return 0
  }

  /**
   * Checks if the limiter is currently rate limiting.
   * @returns true if at the rate limit
   */
  isLimited(): boolean {
    if (!this.enabled) return false
    return this.getCurrentCount() >= this.limit
  }

  /**
   * Resets the rate limiter state.
   */
  reset(): void {
    this.head = 0
    this.tail = 0
    this.count = 0
    if (this.enabled) {
      this.timestamps.fill(0)
    }
  }

  /**
   * Gets the configured limit.
   * @returns The maximum operations per window
   */
  getLimit(): number {
    return this.limit
  }

  /**
   * Gets the window duration.
   * @returns The window duration in milliseconds
   */
  getWindowMs(): number {
    return this.windowMs
  }

  /**
   * Checks if the limiter is enabled.
   * @returns true if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }
}

export default SlidingWindowRateLimiter

/**
 * Efficient timeout management using a single timer and priority queue.
 * Reduces memory usage and improves performance for high-volume messaging.
 *
 * Instead of creating a separate setTimeout for each request,
 * this manager uses a single timer that fires for the nearest deadline,
 * reducing memory pressure and improving garbage collection.
 *
 * @class TimeoutManager
 * @example
 * const manager = new TimeoutManager()
 *
 * // Add a timeout
 * manager.add('request-1', 5000, () => {
 *   console.log('Request timed out')
 * })
 *
 * // Cancel before timeout
 * manager.remove('request-1')
 *
 * // Cleanup
 * manager.destroy()
 */
export class TimeoutManager {
  /** Map of pending timeouts: id -> { deadline, callback } */
  private timeouts = new Map<string, { deadline: number; callback: () => void }>()

  /** The single timer reference */
  private timer: ReturnType<typeof setTimeout> | null = null

  /** Next scheduled deadline timestamp */
  private nextDeadline = Infinity

  /** Whether the manager has been destroyed */
  private destroyed = false

  /**
   * Adds a new timeout.
   * @param id - Unique identifier for the timeout
   * @param timeoutMs - Timeout duration in milliseconds
   * @param callback - Function to call when timeout expires
   */
  add(id: string, timeoutMs: number, callback: () => void): void {
    if (this.destroyed) return

    const deadline = Date.now() + timeoutMs
    this.timeouts.set(id, { deadline, callback })

    // If this deadline is sooner than the current scheduled one, reschedule
    if (deadline < this.nextDeadline) {
      this.reschedule(deadline)
    }
  }

  /**
   * Removes a pending timeout (e.g., when response is received).
   * @param id - The timeout identifier to remove
   * @returns true if the timeout was found and removed
   */
  remove(id: string): boolean {
    return this.timeouts.delete(id)
  }

  /**
   * Checks if a timeout exists.
   * @param id - The timeout identifier to check
   * @returns true if the timeout exists
   */
  has(id: string): boolean {
    return this.timeouts.has(id)
  }

  /**
   * Gets the number of pending timeouts.
   * @returns The count of pending timeouts
   */
  get size(): number {
    return this.timeouts.size
  }

  /**
   * Reschedules the timer to fire at the given deadline.
   * @param deadline - The timestamp to fire at
   * @private
   */
  private reschedule(deadline: number): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    this.nextDeadline = deadline
    const delay = Math.max(0, deadline - Date.now())

    this.timer = setTimeout(() => this.processTimeouts(), delay)
  }

  /**
   * Processes all expired timeouts and schedules the next one.
   * @private
   */
  private processTimeouts(): void {
    if (this.destroyed) return

    const now = Date.now()
    const expired: Array<() => void> = []

    // Collect all expired timeouts
    for (const [id, { deadline, callback }] of this.timeouts) {
      if (deadline <= now) {
        expired.push(callback)
        this.timeouts.delete(id)
      }
    }

    // Execute callbacks after iteration to avoid mutation issues
    for (const callback of expired) {
      try {
        callback()
      } catch (e) {
        // Silently ignore callback errors to prevent breaking other timeouts
        console.error('[TimeoutManager] Callback error:', e)
      }
    }

    // Schedule the next timeout if any remain
    this.scheduleNext()
  }

  /**
   * Finds the earliest deadline and schedules the timer.
   * @private
   */
  private scheduleNext(): void {
    if (this.timeouts.size === 0) {
      this.nextDeadline = Infinity
      this.timer = null
      return
    }

    // Find the earliest deadline
    let earliestDeadline = Infinity
    for (const { deadline } of this.timeouts.values()) {
      if (deadline < earliestDeadline) {
        earliestDeadline = deadline
      }
    }

    if (earliestDeadline < Infinity) {
      this.reschedule(earliestDeadline)
    }
  }

  /**
   * Destroys the manager and clears all pending timeouts.
   * No callbacks will be executed after calling destroy.
   */
  destroy(): void {
    this.destroyed = true

    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.timeouts.clear()
    this.nextDeadline = Infinity
  }

  /**
   * Clears all pending timeouts without executing callbacks.
   */
  clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.timeouts.clear()
    this.nextDeadline = Infinity
  }
}

export default TimeoutManager

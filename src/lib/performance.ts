/**
 * Performance Instrumentation Utilities
 * 
 * Provides lightweight performance monitoring for development.
 * All logging is gated to development mode only.
 */

const isDev = import.meta.env.DEV;

interface PerformanceMetrics {
  routeLoadTime: Map<string, number>;
  queryTime: Map<string, number[]>;
  networkCalls: Map<string, number>;
}

const metrics: PerformanceMetrics = {
  routeLoadTime: new Map(),
  queryTime: new Map(),
  networkCalls: new Map(),
};

/**
 * Mark the start of a performance measurement
 */
export function perfStart(label: string): number {
  if (!isDev) return 0;
  const startTime = performance.now();
  return startTime;
}

/**
 * Mark the end of a performance measurement and log the duration
 */
export function perfEnd(label: string, startTime: number): number {
  if (!isDev) return 0;
  const duration = performance.now() - startTime;
  console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
  return duration;
}

/**
 * Track route load time
 */
export function trackRouteLoad(route: string, loadTime: number): void {
  if (!isDev) return;
  metrics.routeLoadTime.set(route, loadTime);
  console.log(`[PERF] Route loaded: ${route} in ${loadTime.toFixed(2)}ms`);
}

/**
 * Track query execution time
 */
export function trackQuery(queryName: string, duration: number): void {
  if (!isDev) return;
  const times = metrics.queryTime.get(queryName) || [];
  times.push(duration);
  metrics.queryTime.set(queryName, times);
}

/**
 * Increment network call counter for a screen
 */
export function trackNetworkCall(screenName: string): void {
  if (!isDev) return;
  const count = metrics.networkCalls.get(screenName) || 0;
  metrics.networkCalls.set(screenName, count + 1);
}

/**
 * Get performance summary
 */
export function getPerformanceSummary(): void {
  if (!isDev) return;
  
  console.group('[PERF] Performance Summary');
  
  console.log('Route Load Times:');
  metrics.routeLoadTime.forEach((time, route) => {
    console.log(`  ${route}: ${time.toFixed(2)}ms`);
  });
  
  console.log('Query Times (avg):');
  metrics.queryTime.forEach((times, query) => {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  ${query}: ${avg.toFixed(2)}ms (${times.length} calls)`);
  });
  
  console.log('Network Calls per Screen:');
  metrics.networkCalls.forEach((count, screen) => {
    console.log(`  ${screen}: ${count} calls`);
  });
  
  console.groupEnd();
}

/**
 * Reset metrics
 */
export function resetMetrics(): void {
  metrics.routeLoadTime.clear();
  metrics.queryTime.clear();
  metrics.networkCalls.clear();
}

/**
 * Create a performance-tracked query function wrapper
 */
export function withQueryTracking<T>(
  queryName: string,
  queryFn: () => Promise<T>
): () => Promise<T> {
  return async () => {
    const start = perfStart(queryName);
    try {
      const result = await queryFn();
      const duration = performance.now() - start;
      trackQuery(queryName, duration);
      return result;
    } catch (error) {
      perfEnd(`${queryName} (error)`, start);
      throw error;
    }
  };
}

// Export for global access in dev tools
if (isDev && typeof window !== 'undefined') {
  (window as any).__perfMetrics = {
    getPerformanceSummary,
    resetMetrics,
    metrics,
  };
}

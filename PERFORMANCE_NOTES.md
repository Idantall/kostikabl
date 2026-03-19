# Performance Optimization Notes

## Summary of Changes

This document outlines the performance optimizations applied to the Kostika app.

## A) Bundle Size & Code Splitting

### Route-level Code Splitting
- **File**: `src/App.tsx`
- All page components are now lazy-loaded using `React.lazy()` and `Suspense`
- This reduces initial bundle size by loading each route's code only when navigated to

### Lazy-loaded Pages:
- `Login`, `Logout`, `Projects`, `ProjectDetail`, `ProjectItemsSummary`
- `Import`, `Labels`, `PublicScan`, `ProjectScanMode`
- `NotFound`, `UploadFont`

### Heavy Module Lazy Loading
- Excel parsing (`xlsx`) is only loaded when Import page is accessed
- QR scanner (`@zxing/browser`) is only loaded on ProjectScanMode
- PDF/Label generation only loads on Labels page

## B) Rendering Performance

### Query Client Configuration
- **File**: `src/App.tsx`
- Configured TanStack Query with optimized defaults:
  - `staleTime: 5 minutes` - Data considered fresh for 5 minutes
  - `gcTime: 10 minutes` - Unused data kept in cache for 10 minutes
  - `retry: 1` - Only retry failed requests once
  - `refetchOnWindowFocus: false` - Prevents unnecessary refetches

### Centralized Data Fetching Hooks
- **File**: `src/hooks/useProjectData.ts`
- Created reusable hooks with built-in caching:
  - `useProject()` - Fetch single project
  - `useProjectFloors()` - Fetch floors with totals
  - `useProjectApartments()` - Fetch apartments with totals
  - `useProjectItems()` - Paginated items with filters
  - `useRecentScanEvents()` - Recent activity
  - `useLoadIssues()` - Load issues by item IDs
  - `useProjectDashboard()` - Aggregated dashboard data

### Query Key Factory Pattern
- Consistent cache key management via `projectKeys` object
- Enables efficient cache invalidation

## C) Data Fetching Optimization

### Request Deduplication
- TanStack Query automatically deduplicates concurrent requests
- Same query key = single network request

### Selective Column Fetching
- Queries now select only needed columns instead of `select('*')`
- Reduces payload size and database load

### Pagination Support
- `useProjectItems()` supports pagination with configurable page size
- Prevents loading thousands of items at once

### Prefetching
- `usePrefetchProject()` hook for preloading project data on hover

## D) UX Loading States

### Skeleton Components
- **File**: `src/components/ui/loading-skeleton.tsx`
- Consistent skeleton loading states:
  - `PageLoadingSkeleton` - Full page loading
  - `ProjectCardSkeleton` - Project card placeholder
  - `ProjectsGridSkeleton` - Grid of project cards
  - `DashboardSkeleton` - Dashboard cards placeholder
  - `TableSkeleton` - Table rows placeholder
  - `LabelFormSkeleton` - Label form placeholder

## E) Performance Instrumentation

### Development Monitoring
- **File**: `src/lib/performance.ts`
- Lightweight performance utilities (dev mode only):
  - `perfStart()` / `perfEnd()` - Measure code execution time
  - `trackRouteLoad()` - Track route loading times
  - `trackQuery()` - Track query execution times
  - `trackNetworkCall()` - Count network calls per screen
  - `getPerformanceSummary()` - Print all metrics

### Access in DevTools
```javascript
// In browser console (dev mode only)
window.__perfMetrics.getPerformanceSummary()
```

## How to Verify Improvements

### Bundle Size
1. Run `npm run build`
2. Check the output for chunk sizes
3. Compare before/after initial bundle size

### Network Requests
1. Open DevTools Network tab
2. Navigate through the app
3. Verify fewer duplicate requests
4. Check request payloads are smaller (selective columns)

### Loading Performance
1. Enable slow 3G in DevTools
2. Navigate between routes
3. Verify skeleton loaders appear
4. Check time to first paint

### Cache Behavior
1. Navigate to a project
2. Navigate away and back
3. Data should load instantly from cache
4. Verify no network request on return (within staleTime)

## Files Changed

- `src/App.tsx` - Lazy loading + QueryClient config
- `src/lib/performance.ts` - Performance instrumentation (new)
- `src/components/ui/loading-skeleton.tsx` - Skeleton components (new)
- `src/hooks/useProjectData.ts` - Centralized data hooks (new)

## Future Improvements

1. Add `react-window` virtualization for large item tables
2. Implement optimistic updates for scan confirmations
3. Add service worker for offline support
4. Consider using Supabase RPC for complex aggregations

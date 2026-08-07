import { useState } from "react";

// Several list screens (Cases, People, DSAR requests, Onboarding,
// Offboarding, Search) rendered their entire dataset with no limit — fine
// with a handful of rows, but a page thousands of pixels tall once an org
// has been running for a while. All client-side data (nothing here is
// server-paginated), so "load more" just reveals more of what's already
// fetched rather than issuing a new request.
export function useLoadMore(items, pageSize = 20) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  // A new search/filter should show its own first page, not stay scrolled
  // deep into whatever the previous filter had revealed. Adjusted here
  // during render (React's documented pattern for resetting state when an
  // input changes) rather than in a useEffect, which would reset one
  // render late and cost an extra commit.
  const [prevLength, setPrevLength] = useState(items.length);
  if (items.length !== prevLength) {
    setPrevLength(items.length);
    setVisibleCount(pageSize);
  }
  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    loadMore: () => setVisibleCount(c => c + pageSize),
    total: items.length,
  };
}

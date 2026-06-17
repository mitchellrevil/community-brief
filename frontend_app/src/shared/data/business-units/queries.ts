import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { fetchBusinessUnits, fetchBusinessUnitsPaginated } from "@/shared/data/business-units/api";

export function getBusinessUnitsQuery() {
  return queryOptions({
    queryKey: ["business-units"],
    queryFn: () => fetchBusinessUnits(),
    staleTime: 5 * 60 * 1000,
  });
}

export function getBusinessUnitsInfiniteQuery(pageSize: number = 25) {
  return infiniteQueryOptions({
    queryKey: ["business-units", "infinite", pageSize],
    queryFn: ({ pageParam = 0 }) => fetchBusinessUnitsPaginated(pageSize, pageParam),
    getNextPageParam: (lastPage) => {
      console.debug("BU Query: getNextPageParam", {
        lastPage,
        has_more: lastPage.has_more,
        offset: lastPage.offset,
        returned: lastPage.business_units.length,
        total: lastPage.total,
        limit: lastPage.limit,
      });

      const hasMore =
        lastPage.has_more !== undefined
          ? lastPage.has_more
          : (lastPage.offset || 0) + lastPage.business_units.length < (lastPage.total || 0);

      if (hasMore) {
        const nextOffset = (lastPage.offset || 0) + lastPage.business_units.length;
        console.debug("BU Query: returning nextOffset", nextOffset);
        return nextOffset;
      }

      console.debug("BU Query: no more pages");
      return undefined;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}


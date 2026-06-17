import { useInfiniteQuery } from "@tanstack/react-query";
import { usersKeys } from "./keys";
import { searchUsers } from "@/features/users/data/api";

export function useUserSearch(searchQuery: string, enabled: boolean = true) {
  return useInfiniteQuery({
    queryKey: usersKeys.search(searchQuery),
    queryFn: ({ pageParam = 0 }) => searchUsers(searchQuery, 20, pageParam),
    getNextPageParam: (lastPage: any) => {
      if (lastPage && lastPage.has_more) {
        return lastPage.offset + lastPage.limit;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled,
  });
}

export default useUserSearch;



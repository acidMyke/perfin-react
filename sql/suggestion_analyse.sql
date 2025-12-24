EXPLAIN QUERY PLAN select "text" 
from "search" 
where (
  "search"."user_id" = 'f9i2H47sFk3oBaWTHodBT' 
  and "search"."type" = 'itemName' 
  and "search"."chunk" in ('kop', 'opi', 'C', 'kos', 'oso', 'son', 'ong')
) 
group by "search"."text" 
order by 
  MAX(CASE WHEN "search"."context" = 'KOPITIAM' THEN 0 ELSE 1 END), 
  max("search"."usage_count") desc, 
  count("search"."chunk") desc

/* Output:
┌────┬────────┬─────────┬───────────────────────────────────────────────────────────────────────────────┐
│ id │ parent │ notused │ detail                                                                        │
├────┼────────┼─────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 8  │ 0      │ 62      │ SEARCH search USING INDEX idx_search_chunk (user_id=? AND type=? AND chunk=?) │
├────┼────────┼─────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 46 │ 0      │ 0       │ USE TEMP B-TREE FOR GROUP BY                                                  │
├────┼────────┼─────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 99 │ 0      │ 0       │ USE TEMP B-TREE FOR ORDER BY                                                  │
└────┴────────┴─────────┴───────────────────────────────────────────────────────────────────────────────┘
*/
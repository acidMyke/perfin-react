explain query plan select "text"
from "search" 
where ("search"."user_id" = 'f9i2H47sFk3oBaWTHodBT' 
  and "search"."type" = 'itemName' 
  and "search"."chunk" in ('a', 'ap', 'app', 'ppl', 'ple', 'les', 'esa', 'sau', 'auc', 'uce', 'b')) 
group by "search"."text" 
order by max(CASE WHEN "search"."context" = 'KOPITIAM' THEN 0 WHEN ("search"."context" is null) THEN 1 ELSE 2 END), 
         max(CASE WHEN "search"."text" like 'APPLESAUCE B%' THEN 1 ELSE 0 END), 
         max("search"."usage_count") desc, 
         count("search"."chunk") desc
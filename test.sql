explain query plan select distinct "shop_name", "shop_mall", "additional_service_charge_percent", "is_gst_excluded", "category_id", "account_id" 
from "expenses" INDEXED BY idx_expenses_user_box_id_coord
where ("expenses"."user_id" = 'f9i2H47sFk3oBaWTHodBT' 
  and "expenses"."box_id" in (45140638, 45140637, 45206174, 45206173)) 
order by ("expenses"."latitude" - 1.37707) * ("expenses"."latitude" - 1.37707)
       + ("expenses"."longitude" - 103.74014300000002) * ("expenses"."longitude" - 103.74014300000002), 
"expenses"."billed_at" desc 
limit 5
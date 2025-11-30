ALTER TABLE `expenses` RENAME COLUMN "excluded_service_charge" TO "additional_service_charge_percent";--> statement-breakpoint
ALTER TABLE `expenses` RENAME COLUMN "excluded_gst" TO "is_gst_excluded";
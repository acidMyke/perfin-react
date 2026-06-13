import * as z from 'zod/v4-mini';

export const NotificationDataOptionsSchema = z.object({
  targetUrl: z.optional(z.string()),
});

export const NotificationActionSchema = z.object({
  action: z.string(),
  title: z.string(),
  icon: z.optional(z.string()),
});

export const NotificationOptionsSchema = z.object({
  body: z.optional(z.string()),
  image: z.optional(z.string()),
  tag: z.optional(z.string()),
  data: z.optional(NotificationDataOptionsSchema),
  vibrate: z.optional(z.union([z.array(z.number()), z.number()])),
  timestamp: z.optional(z.number()),
  requireInteraction: z.optional(z.boolean()),
  renotify: z.optional(z.boolean()),
  silent: z.optional(z.boolean()),
  actions: z.optional(z.array(NotificationActionSchema)),
});

export const NotificationEventDataSchema = z.extend(NotificationOptionsSchema, { title: z.string() });

export type NotificationAction = z.infer<typeof NotificationActionSchema>;
export type NotificationOptions = z.infer<typeof NotificationOptionsSchema>;
export type NotificationEventData = z.infer<typeof NotificationEventDataSchema>;

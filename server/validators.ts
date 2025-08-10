import { parseISO } from 'date-fns/parseISO';
import z from 'zod';

export const signInValidator = z.object({
  username: z.string(),
  password: z.string(),
});

export const signUpValidator = z.object({
  username: z.string().min(4),
  password: z
    .string()
    .min(12)
    .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/, 'Password too week'),
});

export const createExpenseValidator = z.object({
  description: z.string().nullish(),
  amountCents: z.int().min(0, { error: 'Must be non-negative value' }),
  billedAt: z.iso.datetime({ error: 'Invalid date time' }).transform(val => parseISO(val)),
  accountId: z.string().nullish(),
  categoryId: z.string().nullish(),
});

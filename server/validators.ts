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

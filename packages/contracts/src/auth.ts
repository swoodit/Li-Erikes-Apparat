import { z } from "zod";

export const AuthRoleSchema = z.enum([
  "customer",
  "staff",
  "technician",
  "workshop_admin",
  "platform_admin",
]);

export type AuthRole = z.infer<typeof AuthRoleSchema>;

export const SupabaseJwtClaimsSchema = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  iss: z.string(),
  sub: z.string().min(1),
});

export type SupabaseJwtClaims = z.infer<typeof SupabaseJwtClaimsSchema>;

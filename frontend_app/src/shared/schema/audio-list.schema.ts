import { z } from "zod";

export const statusEnum = z.enum([
  "all",
  "uploaded",
  "processing",
  "completed",
  "failed",
]);

export const audioListSchema = z.object({
  search: z.string().optional(),
  status: statusEnum.default("all").optional(),
  created_at: z.string().optional(),
  created_at_start: z.string().optional(),
  created_at_end: z.string().optional(),
});

export type AudioListValues = z.infer<typeof audioListSchema>;

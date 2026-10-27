import { z } from "zod"

export const messageSchema = z.object({
  body: z.string().min(1).max(5000),
  client_message_id: z.string().uuid().optional(),
})

export const profileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
})

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
})
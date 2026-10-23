import { z } from "zod";

export const ITEM_FILTER_PAGE_SIZE = 10;
const schema = z.object({
  items: z.array(z.object({ id: z.uuid(), name: z.string().min(1), isActive: z.boolean() })).max(ITEM_FILTER_PAGE_SIZE),
  pagination: z.object({
    page: z.number().int().min(1).max(1000), pageSize: z.literal(ITEM_FILTER_PAGE_SIZE),
    total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(), hasNextPage: z.boolean(),
  }),
});

export type ItemFilterOptions = z.infer<typeof schema>;

export function parseItemFilterOptions(body: unknown, page: number) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) return null;
  const { pagination } = parsed.data;
  return pagination.page === page &&
    pagination.totalPages === Math.ceil(pagination.total / ITEM_FILTER_PAGE_SIZE) &&
    pagination.hasNextPage === (page * ITEM_FILTER_PAGE_SIZE < pagination.total) &&
    parsed.data.items.length <= pagination.total
    ? parsed.data : null;
}

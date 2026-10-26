import "server-only";

export const catalogPhotoSelect = { id: true, position: true } as const;

export function itemPhotoUrls(itemId: string, photos: { id: string; position: number }[]) {
  return photos.map(photo => ({
    id: photo.id,
    position: photo.position,
    url: `/api/items/${itemId}/photos/${photo.id}`,
  }));
}

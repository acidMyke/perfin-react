export type CoordinateAndRange = { latitude: number; longitude: number; radius: number };
export function getGeoCellId({ latitude, longitude, range }: CoordinateAndRange) {}

export const SHOP_NAME_TEXT_KIND = 'shopName' as const;
export const MALL_NAME_TEXT_KIND = 'mallName' as const;
export const ITEM_NAME_TEXT_KIND = 'itemName' as const;
export const ADJ_NAME_TEXT_KIND = 'adjName' as const;
export const TEXT_KIND = {
  SHOP_NAME: SHOP_NAME_TEXT_KIND,
  MALL_NAME: MALL_NAME_TEXT_KIND,
  ITEM_NAME: ITEM_NAME_TEXT_KIND,
  ADJ_NAME: ADJ_NAME_TEXT_KIND,
};
export type TextKind =
  typeof SHOP_NAME_TEXT_KIND | typeof MALL_NAME_TEXT_KIND | typeof ITEM_NAME_TEXT_KIND | typeof ADJ_NAME_TEXT_KIND;

export type TextIdParamter = {
  userId: string;
  kind: TextKind;
  text: string;
};

export function generateTextIds(...params: TextIdParamter[]) {}

export function generateSearchChunks(text: string) {}

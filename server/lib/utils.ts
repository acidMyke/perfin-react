import { tz } from '@date-fns/tz';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const singaporeTz = tz('Asia/Singapore');

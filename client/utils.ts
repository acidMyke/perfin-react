import { nanoid } from 'nanoid';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const generateId = () => nanoid();

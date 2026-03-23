import { clsx, type ClassValue } from 'clsx';

/** Merge Tailwind class names, filtering out falsy values. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

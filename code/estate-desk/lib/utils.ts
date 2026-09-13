// lib/utils.ts
//
// RECONSTRUCTED FILE. Standard shadcn/ui className helper, imported by every
// file under components/ui but missing from git history. This is the
// canonical shadcn implementation (see components.json's registry config),
// not a guess specific to this app.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

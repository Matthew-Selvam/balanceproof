import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware class merge: later conflicting classes win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

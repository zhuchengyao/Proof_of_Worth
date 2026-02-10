import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format lamports to SOL with 4 decimal places
 */
export function formatSOL(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(4);
}

/**
 * Format fixed-point value (1e6 precision) to human-readable price
 */
export function formatPrice(fixedPoint: number): string {
  return (fixedPoint / 1_000_000).toFixed(2);
}

/**
 * Format a unix timestamp to relative time
 */
export function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60) return `in ${absDiff}s`;
    if (absDiff < 3600) return `in ${Math.floor(absDiff / 60)}m`;
    if (absDiff < 86400) return `in ${Math.floor(absDiff / 3600)}h`;
    return `in ${Math.floor(absDiff / 86400)}d`;
  }

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Truncate a public key for display
 */
export function truncateKey(key: string, chars: number = 4): string {
  if (key.length <= chars * 2 + 3) return key;
  return `${key.slice(0, chars)}...${key.slice(-chars)}`;
}

/**
 * Map topic status number to label and color
 */
export function getStatusInfo(status: number): { label: string; color: string } {
  switch (status) {
    case 0:
      return { label: "Open", color: "text-green-400" };
    case 1:
      return { label: "Revealing", color: "text-yellow-400" };
    case 2:
      return { label: "Finalized", color: "text-blue-400" };
    case 3:
      return { label: "Settled", color: "text-gray-400" };
    default:
      return { label: "Unknown", color: "text-gray-500" };
  }
}

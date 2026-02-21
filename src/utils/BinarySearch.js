/**
 * Binary search on sorted timestamps array.
 * Returns index of first element >= target.
 */
export function lowerBound(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid][0] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Returns index of last element <= target.
 */
export function upperBound(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid][0] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Shannon entropy (in bits per character) of a string. Higher = more random-looking. */
export function calculateShannonEntropy(value: string): number {
  if (value.length === 0) return 0;

  const frequency = new Map<string, number>();
  for (const char of value) {
    frequency.set(char, (frequency.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of frequency.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

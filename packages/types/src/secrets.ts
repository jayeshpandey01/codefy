export type SecretKind =
  "aws-access-key" | "github-token" | "generic-api-key" | "high-entropy-string";

export interface EntropyResult {
  readonly value: string;
  readonly shannonEntropy: number;
  readonly threshold: number;
}

export interface SecretFinding {
  readonly id: string;
  readonly kind: SecretKind;
  readonly filePath: string;
  readonly line: number;
  readonly matchedPattern?: string;
  readonly entropy?: EntropyResult;
}

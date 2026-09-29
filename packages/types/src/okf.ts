/**
 * Open Knowledge Format (OKF) Data Contracts
 * Defines the structured knowledge projection types projected from
 * Code Property Graphs (CPG), AST, and scan findings.
 */

export type OkfDocumentType =
  | "architecture"
  | "security-findings"
  | "services"
  | "repository";

export interface OkfDocument {
  readonly filename: string;
  readonly type: OkfDocumentType;
  readonly title: string;
  readonly content: string;
  readonly updatedAt: string;
}

export interface OkfBundle {
  readonly repository: OkfDocument;
  readonly architecture: OkfDocument;
  readonly securityFindings: OkfDocument;
  readonly services: OkfDocument;
  readonly generatedAt: string;
  readonly workspacePath?: string;
}


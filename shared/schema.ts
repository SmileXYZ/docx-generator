import { z } from "zod";

// Template - uploaded .docx file with {{placeholder}} fields
export interface Template {
  id: string;
  name: string;
  filename: string;
  placeholders: string[];
  uploadedAt: string;
}

// Generated document record
export interface GeneratedDocument {
  id: string;
  templateId: string;
  templateName: string;
  data: Record<string, string>;
  generatedAt: string;
}

export const generateDocumentSchema = z.object({
  templateId: z.string().min(1),
  data: z.record(z.string(), z.string()),
});

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;

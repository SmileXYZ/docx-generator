import { type Template, type GeneratedDocument } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  createTemplate(template: Omit<Template, "id" | "uploadedAt">): Promise<Template>;
  deleteTemplate(id: string): Promise<boolean>;
  getTemplateFile(id: string): Promise<Buffer | undefined>;
  saveTemplateFile(id: string, buffer: Buffer): Promise<void>;
  addGeneratedDocument(doc: Omit<GeneratedDocument, "id" | "generatedAt">): Promise<GeneratedDocument>;
  getGeneratedDocuments(): Promise<GeneratedDocument[]>;
}

export class MemStorage implements IStorage {
  private templates: Map<string, Template> = new Map();
  private templateFiles: Map<string, Buffer> = new Map();
  private generatedDocs: GeneratedDocument[] = [];

  async getTemplates(): Promise<Template[]> {
    return Array.from(this.templates.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    return this.templates.get(id);
  }

  async createTemplate(input: Omit<Template, "id" | "uploadedAt">): Promise<Template> {
    const id = randomUUID();
    const template: Template = {
      ...input,
      id,
      uploadedAt: new Date().toISOString(),
    };
    this.templates.set(id, template);
    return template;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    this.templateFiles.delete(id);
    return this.templates.delete(id);
  }

  async getTemplateFile(id: string): Promise<Buffer | undefined> {
    return this.templateFiles.get(id);
  }

  async saveTemplateFile(id: string, buffer: Buffer): Promise<void> {
    this.templateFiles.set(id, buffer);
  }

  async addGeneratedDocument(input: Omit<GeneratedDocument, "id" | "generatedAt">): Promise<GeneratedDocument> {
    const doc: GeneratedDocument = {
      ...input,
      id: randomUUID(),
      generatedAt: new Date().toISOString(),
    };
    this.generatedDocs.unshift(doc);
    return doc;
  }

  async getGeneratedDocuments(): Promise<GeneratedDocument[]> {
    return this.generatedDocs;
  }
}

export const storage = new MemStorage();

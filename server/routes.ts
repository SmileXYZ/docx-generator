import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { generateDocumentSchema } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function extractPlaceholders(content: Buffer): string[] {
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  // Get all tags used in the document
  const fullText = doc.getFullText();
  const regex = /\{\{([^}]+)\}\}/g;
  const placeholders = new Set<string>();

  // Also scan the raw XML for tags docxtemplater recognizes
  const xmlFiles = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"];
  for (const file of xmlFiles) {
    try {
      const xml = zip.file(file)?.asText();
      if (xml) {
        // docxtemplater may split {{tag}} across XML runs, so we need to clean XML tags first
        const cleanText = xml.replace(/<[^>]+>/g, "");
        let match;
        const re = /\{\{([^}]+)\}\}/g;
        while ((match = re.exec(cleanText)) !== null) {
          placeholders.add(match[1].trim());
        }
      }
    } catch {
      // skip files that don't exist
    }
  }

  // Also check fullText
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    placeholders.add(match[1].trim());
  }

  return Array.from(placeholders).sort();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Get all templates
  app.get("/api/templates", async (_req, res) => {
    const templates = await storage.getTemplates();
    res.json(templates);
  });

  // Upload a new template
  app.post("/api/templates", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Файл не предоставлен" });
      }
      if (!req.file.originalname.endsWith(".docx")) {
        return res.status(400).json({ error: "Допускаются только .docx файлы" });
      }

      const buffer = req.file.buffer;
      let placeholders: string[];
      try {
        placeholders = extractPlaceholders(buffer);
      } catch (e: any) {
        return res.status(400).json({ error: `Не удалось обработать файл: ${e.message}` });
      }

      const name = req.body.name || req.file.originalname.replace(/\.docx$/, "");
      const template = await storage.createTemplate({
        name,
        filename: req.file.originalname,
        placeholders,
      });
      await storage.saveTemplateFile(template.id, buffer);

      res.json(template);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get a single template
  app.get("/api/templates/:id", async (req, res) => {
    const template = await storage.getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: "Шаблон не найден" });
    res.json(template);
  });

  // Delete a template
  app.delete("/api/templates/:id", async (req, res) => {
    const deleted = await storage.deleteTemplate(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Шаблон не найден" });
    res.json({ ok: true });
  });

  // Generate document from template
  app.post("/api/generate", async (req, res) => {
    try {
      const parsed = generateDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Неверные данные", details: parsed.error.flatten() });
      }

      const { templateId, data } = parsed.data;
      const template = await storage.getTemplate(templateId);
      if (!template) return res.status(404).json({ error: "Шаблон не найден" });

      const fileBuffer = await storage.getTemplateFile(templateId);
      if (!fileBuffer) return res.status(404).json({ error: "Файл шаблона не найден" });

      const zip = new PizZip(fileBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
      });

      doc.render(data);

      const outputBuffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });

      // Save record
      await storage.addGeneratedDocument({
        templateId,
        templateName: template.name,
        data,
      });

      const safeName = template.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const encodedName = encodeURIComponent(`${template.name}_filled.docx`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}_filled.docx"; filename*=UTF-8''${encodedName}`);
      res.send(outputBuffer);
    } catch (e: any) {
      res.status(500).json({ error: `Ошибка генерации: ${e.message}` });
    }
  });

  // Get generation history
  app.get("/api/history", async (_req, res) => {
    const docs = await storage.getGeneratedDocuments();
    res.json(docs);
  });

  return httpServer;
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Template, GeneratedDocument } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Download,
  Trash2,
  Clock,
  ChevronRight,
  FileUp,
  Loader2,
  ArrowLeft,
  History,
} from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type Step = "templates" | "fill" | "history";

export default function Home() {
  const [step, setStep] = useState<Step>("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [uploadName, setUploadName] = useState("");
  const { toast } = useToast();

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery<GeneratedDocument[]>({
    queryKey: ["/api/history"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      if (uploadName.trim()) fd.append("name", uploadName.trim());
      const res = await fetch(`${API_BASE}/api/templates`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json() as Promise<Template>;
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setUploadName("");
      toast({ title: "Шаблон загружен", description: `Найдено полей: ${template.placeholders.length}` });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Шаблон удалён" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("No template");
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplate.id, data: formData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = selectedTemplate?.name.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_") || "document";
      a.download = `${safeName}_filled.docx`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      toast({ title: "Документ создан", description: "Скачивание началось" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const selectTemplate = (t: Template) => {
    setSelectedTemplate(t);
    const initial: Record<string, string> = {};
    t.placeholders.forEach((p) => (initial[p] = ""));
    setFormData(initial);
    setStep("fill");
  };

  const goBack = () => {
    setStep("templates");
    setSelectedTemplate(null);
    setFormData({});
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none">DocGen</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Генерация документов по шаблону</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={step === "templates" || step === "fill" ? "default" : "outline"}
              size="sm"
              onClick={goBack}
              data-testid="nav-templates"
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Шаблоны
            </Button>
            <Button
              variant={step === "history" ? "default" : "outline"}
              size="sm"
              onClick={() => setStep("history")}
              data-testid="nav-history"
            >
              <History className="w-4 h-4 mr-1.5" />
              История
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* STEP: Templates list */}
        {step === "templates" && (
          <div className="space-y-6">
            {/* Upload section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Загрузить шаблон</CardTitle>
                <CardDescription>
                  Загрузите .docx файл с плейсхолдерами вида {"{{имя_поля}}"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Label htmlFor="template-name" className="mb-1.5 block text-sm">Название (опционально)</Label>
                    <Input
                      id="template-name"
                      data-testid="input-template-name"
                      placeholder="Например: Договор аренды"
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      <Button
                        asChild
                        disabled={uploadMutation.isPending}
                        data-testid="button-upload"
                      >
                        <span>
                          {uploadMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-1.5" />
                          )}
                          Загрузить .docx
                        </span>
                      </Button>
                    </Label>
                    <input
                      id="file-upload"
                      data-testid="input-file-upload"
                      type="file"
                      accept=".docx"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Templates list */}
            {loadingTemplates ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <FileUp className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Шаблонов пока нет. Загрузите первый .docx файл.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Ваши шаблоны ({templates.length})
                </h2>
                {templates.map((t) => (
                  <Card
                    key={t.id}
                    className="cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => selectTemplate(t)}
                    data-testid={`card-template-${t.id}`}
                  >
                    <CardContent className="py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate" data-testid={`text-template-name-${t.id}`}>{t.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{t.filename}</span>
                            <span>·</span>
                            <Badge variant="secondary" className="text-xs">
                              {t.placeholders.length} {t.placeholders.length === 1 ? "поле" : "полей"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(t.id);
                          }}
                          data-testid={`button-delete-${t.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP: Fill form */}
        {step === "fill" && selectedTemplate && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={goBack} data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
                <p className="text-sm text-muted-foreground">Заполните поля для генерации документа</p>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                {selectedTemplate.placeholders.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    В шаблоне не найдено плейсхолдеров {"{{...}}"}
                  </p>
                ) : (
                  selectedTemplate.placeholders.map((placeholder) => (
                    <div key={placeholder}>
                      <Label htmlFor={`field-${placeholder}`} className="mb-1.5 block text-sm font-medium">
                        {placeholder}
                      </Label>
                      <Input
                        id={`field-${placeholder}`}
                        data-testid={`input-field-${placeholder}`}
                        placeholder={`Введите ${placeholder}`}
                        value={formData[placeholder] || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [placeholder]: e.target.value }))
                        }
                      />
                    </div>
                  ))
                )}

                <Separator className="my-2" />

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Создать документ
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP: History */}
        {step === "history" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">История генерации</h2>
            {loadingHistory ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Документы ещё не создавались</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {history.map((doc) => (
                  <Card key={doc.id} data-testid={`card-history-${doc.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium" data-testid={`text-history-template-${doc.id}`}>
                          {doc.templateName}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(doc.generatedAt).toLocaleString("ru-RU")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(doc.data).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {value || "—"}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <PerplexityAttribution />
    </div>
  );
}

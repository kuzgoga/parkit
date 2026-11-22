import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";
import { PdfService } from "./pdf.service";
import { ExtractedObservation, YandexService } from "./yandex.service";
import { TermType } from "../prisma/generated/prisma/client";

const fields: Array<[keyof ExtractedObservation, TermType]> = [
  ["species", "SPECIES"],
  ["latin", "LATIN"],
  ["genus", "GENUS"],
  ["group", "GROUP"],
  ["place", "PLACE"],
  ["habitat", "HABITAT"],
  ["event", "EVENT"],
  ["observer", "OBSERVER"],
];

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
    private readonly yandex: YandexService,
  ) {}

  private async saveObservation(
    documentId: string,
    item: ExtractedObservation,
  ) {
    const terms: Array<{ type: TermType; label: string }> = [];
    for (const [field, type] of fields) {
      const value = item[field];
      if (typeof value === "string" && value.trim())
        terms.push({ type, label: value.trim() });
    }
    for (const keyword of item.keywords || []) {
      if (typeof keyword === "string" && keyword.trim())
        terms.push({ type: "KEYWORD", label: keyword.trim() });
    }
    const unique = [
      ...new Map(
        terms.map((term) => [`${term.type}:${term.label}`, term]),
      ).values(),
    ];
    const date =
      typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
        ? new Date(`${item.date}T00:00:00.000Z`)
        : undefined;
    await this.prisma.observation.create({
      data: {
        documentId,
        observedAt: date && !Number.isNaN(date.getTime()) ? date : undefined,
        observedYear: Number.isInteger(item.year)
          ? item.year
          : date?.getUTCFullYear(),
        numericValue:
          typeof item.numericValue === "number" &&
          Number.isFinite(item.numericValue)
            ? item.numericValue
            : undefined,
        numericUnit: item.numericUnit || undefined,
        sourcePage: Number.isInteger(item.sourcePage)
          ? item.sourcePage
          : undefined,
        sourceExcerpt: item.sourceExcerpt || undefined,
        notes: item.notes || undefined,
        terms: {
          create: unique.map((term) => ({
            term: {
              connectOrCreate: { where: { type_label: term }, create: term },
            },
          })),
        },
      },
    });
  }

  async process(documentId: string) {
    const document = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING", error: null },
    });
    try {
      const source = await this.storage.download(document.objectKey);
      const extracted = await this.pdf.extract(source, document.mimeType);
      const text = extracted.text.trim();
      if (!text) throw new Error("Document has no text");
      const textObjectKey = `text/${documentId}.md`;
      await this.storage.upload(
        textObjectKey,
        Buffer.from(text),
        "text/markdown; charset=utf-8",
      );
      await this.prisma.document.update({
        where: { id: documentId },
        data: { textObjectKey, ocrUsed: extracted.ocrUsed },
      });
      const chunks = text.match(/[\s\S]{1,12000}/g) || [];
      const observations: ExtractedObservation[] = [];
      for (const chunk of chunks)
        observations.push(...(await this.yandex.analyze(chunk)));
      await this.prisma.observation.deleteMany({ where: { documentId } });
      for (const item of observations)
        await this.saveObservation(documentId, item);
      const fileId =
        document.aiFileId ||
        (await this.yandex.uploadText(document.filename, text));
      if (!document.aiFileId)
        await this.prisma.document.update({
          where: { id: documentId },
          data: { aiFileId: fileId },
        });
      await this.yandex.attachFile(fileId);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: "PROCESSED" },
      });
      return {
        observations: observations.length,
        ocrUsed: extracted.ocrUsed,
        aiFileId: fileId,
      };
    } catch (error) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}

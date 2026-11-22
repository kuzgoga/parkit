import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { randomUUID } from "node:crypto";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";
import type { Document } from "../prisma/generated/prisma/client";
import { decodeFilename } from "./filename";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue("documents") private readonly queue: Queue,
  ) {}

  async upload(file: Express.Multer.File) {
    if (
      !/^(application\/pdf|text\/plain|text\/markdown|application\/markdown)$/.test(
        file.mimetype,
      )
    ) {
      throw new BadRequestException(
        "Only PDF, TXT and Markdown files are supported",
      );
    }
    const filename = decodeFilename(file.originalname);
    const key = `documents/${randomUUID()}/${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await this.storage.upload(key, file.buffer, file.mimetype);
    let document: Document;
    try {
      document = await this.prisma.document.create({
        data: {
          filename,
          mimeType: file.mimetype,
          size: file.size,
          bucket: this.storage.bucket,
          objectKey: key,
        },
      });
    } catch (error) {
      await this.storage.remove(key);
      throw error;
    }
    try {
      await this.queue.add(
        "process",
        { documentId: document.id },
        {
          jobId: document.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: true,
        },
      );
    } catch (error) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: "FAILED", error: "Could not enqueue document" },
      });
      throw error;
    }
    return document;
  }

  list() {
    return this.prisma.document.findMany({ orderBy: { createdAt: "desc" } });
  }

  async get(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  async waitForChange(id: string, status: string, timeoutMs: number) {
    const deadline = Date.now() + Math.min(Math.max(timeoutMs, 1000), 25000);
    let document = await this.get(id);
    while (document.status === status && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      document = await this.get(id);
    }
    return { changed: document.status !== status, document };
  }

  async source(id: string) {
    const document = await this.get(id);
    return { url: await this.storage.downloadUrl(document.objectKey) };
  }
}

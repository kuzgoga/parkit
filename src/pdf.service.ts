import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OCR_MAX_FILE_BYTES, YandexService } from "./yandex.service";

const run = promisify(execFile);

@Injectable()
export class PdfService {
  constructor(private readonly yandex: YandexService) {}

  private async ocrPage(path: string, dir: string, page: number) {
    const pagePath = join(dir, `page-${page}.pdf`);
    await run("pdfseparate", [
      "-f",
      String(page),
      "-l",
      String(page),
      path,
      pagePath,
    ]);
    if ((await stat(pagePath)).size <= OCR_MAX_FILE_BYTES)
      return this.yandex.ocr(await readFile(pagePath), "application/pdf");

    for (const dpi of [150, 110, 80, 60]) {
      const imagePath = join(dir, `page-${page}-${dpi}`);
      await run(
        "pdftoppm",
        [
          "-f",
          String(page),
          "-l",
          String(page),
          "-singlefile",
          "-r",
          String(dpi),
          "-jpeg",
          "-jpegopt",
          "quality=80",
          path,
          imagePath,
        ],
        { maxBuffer: 1024 * 1024 },
      );
      const image = await readFile(`${imagePath}.jpg`);
      if (image.length <= OCR_MAX_FILE_BYTES)
        return this.yandex.ocr(image, "image/jpeg");
    }
    throw new Error(`PDF page ${page} cannot fit into the 10 MB OCR limit`);
  }

  async extract(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ text: string; ocrUsed: boolean }> {
    if (mimeType !== "application/pdf") {
      if (
        !/^(text\/plain|text\/markdown|application\/markdown)$/.test(mimeType)
      )
        throw new Error("Only PDF, TXT and Markdown files are supported");
      return { text: buffer.toString("utf8"), ocrUsed: false };
    }
    const dir = await mkdtemp(join(tmpdir(), "chronicles-pdf-"));
    const path = join(dir, "source.pdf");
    await writeFile(path, buffer);
    try {
      const info = await run("pdfinfo", [path], { maxBuffer: 1024 * 1024 });
      const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
      if (!Number.isInteger(pages) || pages < 1)
        throw new Error("Invalid PDF page count");
      const parts: string[] = [];
      let ocrUsed = false;
      for (let page = 1; page <= pages; page++) {
        const layer = await run(
          "pdftotext",
          ["-f", String(page), "-l", String(page), "-layout", path, "-"],
          { maxBuffer: 10 * 1024 * 1024 },
        );
        let text = layer.stdout.trim();
        if (text.replace(/\s/g, "").length < 20) {
          text = await this.ocrPage(path, dir, page);
          ocrUsed = true;
        }
        parts.push(`# Страница ${page}\n\n${text}`);
      }
      return { text: parts.join("\n\n"), ocrUsed };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

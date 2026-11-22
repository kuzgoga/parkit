import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: "Upload a source document and enqueue processing" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("file is required");
    return this.documents.upload(file);
  }

  @Get()
  list() {
    return this.documents.list();
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.documents.get(id);
  }

  @Get(":id/wait")
  wait(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("status") status = "QUEUED",
    @Query("timeoutMs") timeout = "25000",
  ) {
    const timeoutMs = Number(timeout);
    if (!Number.isFinite(timeoutMs))
      throw new BadRequestException("Invalid timeoutMs");
    return this.documents.waitForChange(id, status, timeoutMs);
  }

  @Get(":id/source")
  source(@Param("id", ParseUUIDPipe) id: string) {
    return this.documents.source(id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { YandexService } from "./yandex.service";
import { PdfService } from "./pdf.service";

class TextDto {
  @ApiProperty() @IsString() @MinLength(1) text!: string;
}
class QueryDto {
  @ApiProperty() @IsString() @MinLength(1) query!: string;
}
class ChatTurnDto {
  @ApiProperty({ enum: ["user", "assistant"] })
  @IsIn(["user", "assistant"])
  role!: "user" | "assistant";

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  content!: string;
}

class ChatDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) message!: string;
  @ApiProperty({ required: false, type: [ChatTurnDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

@ApiTags("Pipeline checks")
@Controller("debug")
export class DebugController {
  constructor(
    private readonly yandex: YandexService,
    private readonly pdf: PdfService,
  ) {}

  @Post("ocr")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  async ocr(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("file is required");
    if (file.mimetype === "application/pdf")
      return this.pdf.extract(file.buffer, file.mimetype);
    return { text: await this.yandex.ocr(file.buffer, file.mimetype) };
  }

  @Post("llm")
  llm(@Body() body: TextDto) {
    return this.yandex.analyze(body.text);
  }

  @Post("rag")
  rag(@Body() body: QueryDto) {
    return this.yandex.search(body.query);
  }
}

@ApiTags("RAG chat")
@Controller("chat")
export class ChatController {
  constructor(private readonly yandex: YandexService) {}

  @Post()
  chat(@Body() body: ChatDto) {
    return this.yandex.chat(body.message, body.history);
  }
}

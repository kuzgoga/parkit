import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "./prisma.service";
import { AppController } from "./app.controller";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentProcessor } from "./document.processor";
import { ObservationsController } from "./observations.controller";
import { StorageService } from "./storage.service";
import { config } from "./configuration";
import { YandexService } from "./yandex.service";
import { PdfService } from "./pdf.service";
import { PipelineService } from "./pipeline.service";
import { DebugController, ChatController } from "./ai.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: config.redisHost,
        port: config.redisPort,
      },
    }),
    BullModule.registerQueue({ name: "documents" }),
  ],
  controllers: [
    AppController,
    DocumentsController,
    ObservationsController,
    DebugController,
    ChatController,
  ],
  providers: [
    PrismaService,
    StorageService,
    DocumentsService,
    DocumentProcessor,
    YandexService,
    PdfService,
    PipelineService,
  ],
})
export class AppModule {}

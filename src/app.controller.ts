import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Controller("ping")
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async ping() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}

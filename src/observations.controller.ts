import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "./prisma.service";
import { TermType } from "../prisma/generated/prisma/client";

@ApiTags("Strict search")
@Controller("observations")
export class ObservationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: "species", required: false })
  @ApiQuery({ name: "latin", required: false })
  @ApiQuery({ name: "genus", required: false })
  @ApiQuery({ name: "group", required: false })
  @ApiQuery({ name: "place", required: false })
  @ApiQuery({ name: "habitat", required: false })
  @ApiQuery({ name: "event", required: false })
  @ApiQuery({ name: "observer", required: false })
  @ApiQuery({ name: "keyword", required: false })
  @ApiQuery({ name: "yearFrom", required: false, type: Number })
  @ApiQuery({ name: "yearTo", required: false, type: Number })
  @ApiQuery({ name: "dateFrom", required: false })
  @ApiQuery({ name: "dateTo", required: false })
  @ApiQuery({ name: "skip", required: false, type: Number })
  @ApiQuery({ name: "take", required: false, type: Number })
  async list(@Query() query: Record<string, string>) {
    const skip = Number(query.skip || 0);
    const take = Number(query.take || 100);
    if (
      !Number.isInteger(skip) ||
      skip < 0 ||
      !Number.isInteger(take) ||
      take < 1 ||
      take > 500
    )
      throw new BadRequestException("Invalid pagination");
    const mapping: Record<string, TermType> = {
      species: "SPECIES",
      latin: "LATIN",
      genus: "GENUS",
      group: "GROUP",
      place: "PLACE",
      habitat: "HABITAT",
      event: "EVENT",
      observer: "OBSERVER",
      keyword: "KEYWORD",
    };
    const and: Record<string, unknown>[] = [
      { document: { is: { status: "PROCESSED" } } },
    ];
    for (const [key, type] of Object.entries(mapping)) {
      const label = query[key]?.trim();
      if (label)
        and.push({
          terms: {
            some: {
              term: { type, label: { equals: label, mode: "insensitive" } },
            },
          },
        });
    }
    const years = [query.yearFrom, query.yearTo].map((value) =>
      value === undefined ? undefined : Number(value),
    );
    if (
      years.some(
        (value) =>
          value !== undefined && (!Number.isInteger(value) || value < 1),
      )
    )
      throw new BadRequestException("Invalid year");
    if (years[0] || years[1])
      and.push({ observedYear: { gte: years[0], lte: years[1] } });
    const dates = [query.dateFrom, query.dateTo].map((value) =>
      value ? new Date(value) : undefined,
    );
    if (dates.some((value) => value && Number.isNaN(value.getTime())))
      throw new BadRequestException("Invalid date");
    if (dates[0] || dates[1])
      and.push({ observedAt: { gte: dates[0], lte: dates[1] } });
    const observations = await this.prisma.observation.findMany({
      where: { AND: and },
      include: {
        document: { select: { id: true, filename: true } },
        terms: { include: { term: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
    });
    return observations.map((observation) => ({
      ...observation,
      sourceUrl: `/api/v1/documents/${observation.documentId}/source`,
    }));
  }
}

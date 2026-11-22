import { Process, Processor } from "@nestjs/bull";
import type { Job } from "bull";
import { PipelineService } from "./pipeline.service";

@Processor("documents")
export class DocumentProcessor {
  constructor(private readonly pipeline: PipelineService) {}

  @Process("process")
  process(job: Job<{ documentId: string }>) {
    return this.pipeline.process(job.data.documentId);
  }
}

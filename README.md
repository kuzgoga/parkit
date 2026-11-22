# Nature Chronicles backend

NestJS API for chronicle documents. Uploads go to S3/MinIO and a Bull queue. The worker reads each PDF page, uses its text layer when present, calls Yandex Vision OCR Markdown for pages without usable text, extracts observations with Qwen3.6-35B, stores the source text in S3, and adds that text to the existing Yandex AI Studio Vector Store. A simple PostgreSQL index supports exact filters. Chat searches that Vector Store and sends the matched fragments to Qwen through Chat Completions API. Pages sent to synchronous OCR are split into single-page PDFs of at most 10 MB; an oversized page is sent as a compressed JPEG instead.

## Local start

1. Start PostgreSQL, Redis and MinIO from `docker-compose.yaml` if they are not already running. Container names are unchanged.
2. Copy `.env.sample` to `.env`. Set the Postgres and S3 credentials, `YANDEX_API_KEY`, `YANDEX_FOLDER_ID` and `YANDEX_VECTOR_STORE_ID`. Keep `.env` local; it is ignored by Git.
3. Run `pnpm install` and `pnpm start` (or `pnpm start:dev`). Prisma Client generation and committed migrations run on every start.

The runtime image includes Poppler tools for PDF page inspection. For production, `docker compose up --build` starts the same services.

## API

Swagger UI: `http://localhost:3000/api/docs`.

- `POST /api/v1/documents` — multipart `file` (PDF, TXT or Markdown, up to 50 MB); returns queued document
- `GET /api/v1/documents` and `GET /api/v1/documents/:id` — status, OCR flag, vector file ID and errors
- `GET /api/v1/documents/:id/wait?status=QUEUED&timeoutMs=25000` — HTTP long poll; returns `{changed, document}` when the status changes or after at most 25 seconds
- `GET /api/v1/documents/:id/source` — signed source URL
- `GET /api/v1/observations` — strict, case-insensitive exact filters: `species`, `latin`, `genus`, `group`, `place`, `habitat`, `event`, `observer`, `keyword`, `yearFrom`, `yearTo`, `dateFrom`, `dateTo`; filters combine with AND; `skip` and `take` paginate results
- `POST /api/v1/debug/ocr` — multipart `file`, inspect PDF text layer/OCR or OCR an image
- `POST /api/v1/debug/llm` — JSON `{ "text": "..." }`, extract observations
- `POST /api/v1/debug/rag` — JSON `{ "query": "..." }`, search the configured Vector Store
- `POST /api/v1/chat` — JSON `{ "message": "...", "history": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}] }`; returns the answer, matching sources, and updated history for the next request

Example:

```sh
curl -F "file=@chronicle.pdf" http://localhost:3000/api/v1/documents
```

The new index uses `Observation` plus typed `Term` labels and links to the original document/page. The migration retains the old observation columns and `Taxon` table in PostgreSQL to preserve existing data; the application uses only the simpler new structure.

The Bun-powered frontend is in `../pasvik-site`; see its README for local startup and `API_URL` configuration.

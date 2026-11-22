import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL || "",
  redisHost: process.env.REDIS_HOST || "localhost",
  redisPort: Number(process.env.REDIS_PORT || 6379),
  s3: {
    endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    publicEndpoint:
      process.env.S3_PUBLIC_ENDPOINT ||
      process.env.S3_ENDPOINT ||
      "http://localhost:9000",
    region: process.env.S3_REGION || "us-east-1",
    bucket: process.env.S3_BUCKET || "chronicles",
    accessKey: process.env.S3_ACCESS_KEY || "",
    secretKey: process.env.S3_SECRET_KEY || "",
  },
  yandex: {
    baseUrl:
      process.env.YANDEX_API_BASE_URL || "https://ai.api.cloud.yandex.net",
    apiKey: process.env.YANDEX_API_KEY || "",
    folderId: process.env.YANDEX_FOLDER_ID || "",
    vectorStoreId: process.env.YANDEX_VECTOR_STORE_ID || "",
    model: process.env.YANDEX_MODEL || "qwen3.6-35b-a3b",
    reasoningEffort: process.env.YANDEX_REASONING_EFFORT || "medium",
    chatInstructions: process.env.YANDEX_CHAT_INSTRUCTIONS || "",
  },
};

export function required(value: string, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

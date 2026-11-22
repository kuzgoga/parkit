import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config, required } from "./configuration";

@Injectable()
export class StorageService implements OnModuleInit {
  readonly bucket = config.s3.bucket;
  private readonly client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: required(config.s3.accessKey, "S3_ACCESS_KEY"),
      secretAccessKey: required(config.s3.secretKey, "S3_SECRET_KEY"),
    },
  });

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async upload(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error("S3 object has no body");
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async downloadUrl(key: string) {
    const publicClient = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.publicEndpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: required(config.s3.accessKey, "S3_ACCESS_KEY"),
        secretAccessKey: required(config.s3.secretKey, "S3_SECRET_KEY"),
      },
    });
    return getSignedUrl(
      publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }
}

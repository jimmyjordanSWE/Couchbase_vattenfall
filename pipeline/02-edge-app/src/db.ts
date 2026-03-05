import couchbase, { Bucket, Collection, Cluster } from "couchbase";
import { config } from "./config.js";

export interface DbHandles {
  cluster: Cluster;
  bucket: Bucket;
  collection: Collection;
  bucketName: string;
}

export async function connectDb(): Promise<DbHandles> {
  const cluster = await couchbase.connect(config.couchbase.connStr, {
    username: config.couchbase.username,
    password: config.couchbase.password,
  });

  const bucketName = await ensureBucket(cluster, config.couchbase.bucket);
  const bucket = cluster.bucket(bucketName);
  const collection = bucket.defaultCollection();
  return { cluster, bucket, collection, bucketName };
}

async function ensureBucket(cluster: Cluster, requestedBucket: string): Promise<string> {
  const manager = cluster.buckets();
  const buckets = await manager.getAllBuckets();

  const exists = buckets.find((b) => b.name === requestedBucket);
  if (exists) {
    return requestedBucket;
  }

  if (buckets.length === 0) {
    await manager.createBucket({
      name: requestedBucket,
      ramQuotaMB: 256,
      bucketType: "couchbase",
      flushEnabled: true,
    });
    return requestedBucket;
  }

  // Fallback: use first existing bucket if requested one is missing.
  return buckets[0].name;
}

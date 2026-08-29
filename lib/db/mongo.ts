import { MongoClient, type Db, type Collection } from "mongodb";
import { logger } from "@/lib/logger";

/**
 * Centralised MongoDB connection for ALL application data.
 *
 * One MongoClient is kept alive for the lifetime of the Next.js process.
 * In Next.js dev mode the module is hot-reloaded on every save, so we
 * cache the client on globalThis (the same trick used previously for
 * the SQLite connection).
 */

declare global {
    // eslint-disable-next-line no-var
    var __mongoClient: MongoClient | undefined;
    // eslint-disable-next-line no-var
    var __mongoConnecting: Promise<MongoClient> | undefined;
}

export function getMongoUri(): string {
    const uri = process.env.MONGODB_URI;
    if (!uri || uri.trim().length === 0) {
        throw new Error("MONGODB_URI environment variable is not set. Please configure it in .env");
    }
    return uri;
}

export function isDbConfigured(): boolean {
    return !!process.env.MONGODB_URI && process.env.MONGODB_URI.trim().length > 0;
}

export async function getDb(): Promise<Db> {
    if (globalThis.__mongoClient) {
        return globalThis.__mongoClient.db();
    }

    if (!globalThis.__mongoConnecting) {
        const uri = getMongoUri();
        globalThis.__mongoConnecting = MongoClient.connect(uri, {
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000,
            appName: "jewellery-polishing-app",
        })
            .then((c) => {
                globalThis.__mongoClient = c;
                logger.info("Connected to MongoDB Atlas");
                return c;
            })
            .catch((err) => {
                globalThis.__mongoConnecting = undefined;
                throw err;
            });
    }

    const client = await globalThis.__mongoConnecting;
    return client.db();
}

export async function closeDb() {
    if (globalThis.__mongoClient) {
        await globalThis.__mongoClient.close().catch(() => { });
        globalThis.__mongoClient = undefined;
        globalThis.__mongoConnecting = undefined;
    }
}

/** Typed helper — returns a strongly-typed MongoDB collection. */
export async function col<T extends object = object>(name: string): Promise<Collection<T>> {
    const db = await getDb();
    return db.collection<T>(name);
}

/** Create all necessary indexes on first run. Call from instrumentation.ts. */
export async function ensureIndexes() {
    const db = await getDb();

    // users
    await db.collection("users").createIndex({ username: 1 }, { unique: true });

    // customers — scoped by userId
    await db.collection("customers").createIndex({ userId: 1, deletedAt: 1 });
    await db.collection("customers").createIndex({ userId: 1, name: 1 });

    // orders — scoped by userId
    await db.collection("orders").createIndex({ userId: 1, deletedAt: 1 });
    await db.collection("orders").createIndex({ userId: 1, orderDate: -1 });
    await db.collection("orders").createIndex({ userId: 1, customerId: 1 });
    await db.collection("orders").createIndex({ userId: 1, orderNumber: 1 }, { unique: true });

    // settings — scoped by userId+key
    await db.collection("settings").createIndex({ userId: 1, key: 1 }, { unique: true });

    logger.info("MongoDB indexes ensured");
}

export function mapDoc<T extends { _id: string }>(doc: T): T & { id: string } {
    return {
        ...doc,
        id: doc._id,
    };
}

export function mapDocs<T extends { _id: string }>(docs: T[]): (T & { id: string })[] {
    return docs.map(mapDoc);
}


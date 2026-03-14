import { createHash } from "crypto";
import fs from "fs";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

import type { PrismaClient as PrismaClientType } from "@prisma/client";

type PrismaModule = typeof import("@prisma/client");

function loadPrismaModule() {
  return require("@prisma/client") as PrismaModule;
}

function createPrismaClient() {
  const dbUrl =
    process.env.DATABASE_URL ||
    `file:${path.join(process.cwd(), "dev.db")}`;

  const adapter = new PrismaLibSql({ url: dbUrl });
  const { PrismaClient } = loadPrismaModule();

  return new PrismaClient({
    adapter,
  } as ConstructorParameters<typeof PrismaClient>[0]) as PrismaClientType;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
  prismaSchemaHash: string | undefined;
  generatedPrismaSchemaHash: string | undefined;
};

function getFileHash(filePath: string) {
  try {
    return createHash("sha1")
      .update(fs.readFileSync(filePath, "utf8"))
      .digest("hex");
  } catch {
    return "unknown";
  }
}

function getPrismaSchemaHash() {
  return getFileHash(path.join(process.cwd(), "prisma", "schema.prisma"));
}

function getGeneratedPrismaSchemaHash() {
  return getFileHash(
    path.join(process.cwd(), "node_modules", ".prisma", "client", "schema.prisma")
  );
}

function clearPrismaModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (
      cacheKey.includes(`${path.sep}.prisma${path.sep}client${path.sep}`) ||
      cacheKey.includes(`${path.sep}@prisma${path.sep}client${path.sep}`)
    ) {
      delete require.cache[cacheKey];
    }
  }
}

function getPrismaClient() {
  const schemaHash = getPrismaSchemaHash();
  const generatedSchemaHash = getGeneratedPrismaSchemaHash();
  const shouldRefreshClient =
    !globalForPrisma.prisma ||
    globalForPrisma.prismaSchemaHash !== schemaHash ||
    globalForPrisma.generatedPrismaSchemaHash !== generatedSchemaHash;

  if (shouldRefreshClient) {
    if (globalForPrisma.prisma) {
      void globalForPrisma.prisma.$disconnect().catch(() => {});
    }

    clearPrismaModuleCache();
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaSchemaHash = schemaHash;
    globalForPrisma.generatedPrismaSchemaHash = generatedSchemaHash;
  }

  if (!globalForPrisma.prisma) {
    throw new Error("Failed to initialize Prisma client.");
  }

  return globalForPrisma.prisma;
}

export const prisma =
  process.env.NODE_ENV === "production"
    ? getPrismaClient()
    : (new Proxy({} as PrismaClientType, {
        get(_target, prop, receiver) {
          const client = getPrismaClient();
          const value = Reflect.get(
            client as unknown as object,
            prop,
            receiver
          );

          return typeof value === "function" ? value.bind(client) : value;
        },
      }) as PrismaClientType);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = getPrismaClient();
  const schemaHash = getPrismaSchemaHash();
  globalForPrisma.prismaSchemaHash = schemaHash;
  globalForPrisma.generatedPrismaSchemaHash = getGeneratedPrismaSchemaHash();
}

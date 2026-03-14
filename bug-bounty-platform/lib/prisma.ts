import { createHash } from "crypto";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

function createPrismaClient() {
  const dbUrl =
    process.env.DATABASE_URL ||
    `file:${path.join(process.cwd(), "dev.db")}`;

  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaHash: string | undefined;
};

function getPrismaSchemaHash() {
  try {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "prisma", "schema.prisma"),
      "utf8"
    );

    return createHash("sha1").update(schema).digest("hex");
  } catch {
    return "unknown";
  }
}

const schemaHash = getPrismaSchemaHash();

if (
  !globalForPrisma.prisma ||
  globalForPrisma.prismaSchemaHash !== schemaHash
) {
  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => {});
  }

  globalForPrisma.prisma = createPrismaClient();
  globalForPrisma.prismaSchemaHash = schemaHash;
}

export const prisma = globalForPrisma.prisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaHash = schemaHash;
}

import { createDb, OfferEntity, type AppDb } from "./index";

/**
 * In-memory DB for tests with the seeded placeholder offers removed, so tests
 * can assert against exactly the rows they insert themselves.
 */
export async function createTestDb(): Promise<AppDb> {
  const db = await createDb(":memory:");
  await db.getRepository(OfferEntity).clear();
  return db;
}

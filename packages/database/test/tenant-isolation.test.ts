import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { tenantId } from "@li-erikes/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  type DatabaseClient,
  type SqlStatement,
} from "../src/client";
import { withTenant } from "../src/tenant-transaction";

const tenantAId = tenantId("11111111-1111-4111-8111-111111111111");
const tenantBId = tenantId("22222222-2222-4222-8222-222222222222");
const vehicleAId = "33333333-3333-4333-8333-333333333333";

describe("tenant persistence isolation", () => {
  let engine: PGlite;
  let db: DatabaseClient;

  beforeEach(async () => {
    engine = await PGlite.create({ extensions: { pgcrypto } });
    await engine.exec(
      await readFile(
        new URL(
          "../../../supabase/migrations/0001_tenant_customer_vehicle.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const seed = await readFile(
      new URL("../../../supabase/seed.sql", import.meta.url),
      "utf8",
    );
    await engine.exec(`
      create role app_user;
      grant select, insert on all tables in schema public to app_user;
      set role app_user;
    `);
    await engine.exec(seed);
    await engine.exec(`
      reset role;
      insert into tenants (id, name) values
        ('${tenantAId}', 'Tenant A'),
        ('${tenantBId}', 'Tenant B');
      set role app_user;
    `);
    const { rows: users } = await engine.query<{
      current_user: string;
    }>("select current_user");
    const [{ current_user: currentUser }] = users;
    expect(currentUser).toBe("app_user");
    db = createPgliteDatabase(engine);
  });

  afterEach(async () => {
    await engine.close();
  });

  it("enforces RLS and rejects an ownership link to another tenant customer", async () => {
    const customerA = await withTenant(
      db,
      { tenantId: tenantAId },
      async (tenantA) => {
        const saved = await tenantA.customers.create({
          name: "Anna",
          email: "anna@example.test",
        });

        expect(await tenantA.customers.findById(saved.id)).toMatchObject({
          name: "Anna",
        });

        await tenantA.sql.query({
          text: "insert into vehicles (id, tenant_id, registration_number) values ($1, $2, $3)",
          values: [vehicleAId, tenantAId, "ABC123"],
        });

        return saved;
      },
    );

    const customerB = await withTenant(db, { tenantId: tenantBId }, (tenantB) =>
      tenantB.customers.create({
        name: "Bea",
        email: "bea@example.test",
      }),
    );

    await withTenant(db, { tenantId: tenantBId }, async (tenantB) => {
      expect(await tenantB.customers.findById(customerA.id)).toBeNull();

      const rows = await tenantB.sql.query({
        text: "select id, tenant_id, name, email from customers where id = $1",
        values: [customerA.id],
      });

      expect(rows).toEqual([]);
    });

    await expect(
      withTenant(db, { tenantId: tenantAId }, (tenantA) =>
        tenantA.sql.query({
          text: "insert into vehicle_ownerships (tenant_id, vehicle_id, customer_id) values ($1, $2, $3)",
          values: [tenantAId, vehicleAId, customerB.id],
        }),
      ),
    ).rejects.toThrow(/foreign key/i);
  });
});

function createPgliteDatabase(engine: PGlite): DatabaseClient {
  return createDatabaseClient({
    execute: async (statement) => {
      await engine.exec(statement);
    },
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      statement: SqlStatement,
    ): Promise<readonly Row[]> {
      const result = await engine.query<Row>(
        statement.text,
        statement.values === undefined ? [] : [...statement.values],
      );
      return result.rows;
    },
  });
}

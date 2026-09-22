import type { TenantId } from "@li-erikes/domain";
import type { DatabaseClient, DatabaseSession } from "./client";
import { CustomerRepository } from "./repositories/customer-repository";

export type TenantContext = Readonly<{
  tenantId: TenantId;
}>;

export type TenantTransaction = Readonly<{
  customers: CustomerRepository;
  sql: DatabaseSession;
}>;

export async function withTenant<T>(
  db: DatabaseClient,
  context: TenantContext,
  work: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (sql) => {
    await sql.query({
      text: "select set_config('app.tenant_id', $1, true)",
      values: [context.tenantId],
    });

    return work({
      customers: new CustomerRepository(sql, context.tenantId),
      sql,
    });
  });
}

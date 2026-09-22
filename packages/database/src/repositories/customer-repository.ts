import { customerId, type CustomerId, type TenantId } from "@li-erikes/domain";
import type { DatabaseSession } from "../client";

export type Customer = Readonly<{
  id: CustomerId;
  name: string;
  email: string;
}>;

export type CreateCustomer = Readonly<{
  name: string;
  email: string;
}>;

type CustomerSqlRow = Readonly<{
  id: string;
  tenant_id: string;
  name: string;
  email: string;
}>;

export class CustomerRepository {
  constructor(
    private readonly sql: DatabaseSession,
    private readonly tenantId: TenantId,
  ) {}

  async create(input: CreateCustomer): Promise<Customer> {
    const [row] = await this.sql.query<CustomerSqlRow>({
      text: "insert into customers (tenant_id, name, email) values ($1, $2, $3) returning id, tenant_id, name, email",
      values: [this.tenantId, input.name, input.email],
    });

    if (row === undefined) {
      throw new Error("Customer insert did not return a row");
    }

    return toCustomer(row);
  }

  async findById(id: CustomerId): Promise<Customer | null> {
    const [row] = await this.sql.query<CustomerSqlRow>({
      text: "select id, tenant_id, name, email from customers where id = $1",
      values: [id],
    });

    return row === undefined ? null : toCustomer(row);
  }
}

function toCustomer(row: CustomerSqlRow): Customer {
  return {
    id: customerId(row.id),
    name: row.name,
    email: row.email,
  };
}

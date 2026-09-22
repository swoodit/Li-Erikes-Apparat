export type SqlStatement = Readonly<{
  text: string;
  values?: readonly unknown[];
}>;

export interface DatabaseSession {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: SqlStatement,
  ): Promise<readonly Row[]>;
}

export interface TransactionalSqlConnection extends DatabaseSession {
  execute(statement: string): Promise<void>;
}

export interface DatabaseClient {
  transaction<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T>;
}

export function createDatabaseClient(
  connection: TransactionalSqlConnection,
): DatabaseClient {
  return {
    async transaction<T>(
      work: (session: DatabaseSession) => Promise<T>,
    ): Promise<T> {
      await connection.execute("begin");

      try {
        const result = await work(connection);
        await connection.execute("commit");
        return result;
      } catch (error) {
        await connection.execute("rollback");
        throw error;
      }
    },
  };
}

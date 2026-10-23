import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";

export class SerializedPrismaPg extends PrismaPg {
  override async connect() {
    const connection = await super.connect();
    const startTransaction = connection.startTransaction.bind(connection);

    connection.startTransaction = async (...args) => {
      const transaction = await startTransaction(...args);
      let tail: Promise<unknown> = Promise.resolve();

      // Prisma relation reads can overlap on one pg client; only that transaction needs a queue.
      function enqueue<T>(query: () => Promise<T>): Promise<T> {
        const result = tail.then(query);
        tail = result.catch(() => undefined);
        return result;
      }

      const queryRaw = transaction.queryRaw.bind(transaction);
      const executeRaw = transaction.executeRaw.bind(transaction);
      transaction.queryRaw = query => enqueue(() => queryRaw(query));
      transaction.executeRaw = query => enqueue(() => executeRaw(query));
      return transaction;
    };

    return connection;
  }
}

import type { BatchItem } from 'drizzle-orm/batch';
import type { AppDatabase } from './db';

export class BatchCollector {
  private queue: { query: any; name: string }[] = [];

  private inferQueryName(query: any): string | undefined {
    if (!query || typeof query.toSQL !== 'function') {
      return undefined;
    }

    try {
      const { sql } = query.toSQL();
      const normalizedSql = sql.trim().replace(/\s+/g, ' ') as string;

      const insertMatch = normalizedSql.match(/^insert into ["`]?([^"` ]+)["`]?/i);
      if (insertMatch) return `INSERT_${insertMatch[1]}`;

      const updateMatch = normalizedSql.match(/^update ["`]?([^"` ]+)["`]?/i);
      if (updateMatch) return `UPDATE_${updateMatch[1]}`;

      const deleteMatch = normalizedSql.match(/^delete from ["`]?([^"` ]+)["`]?/i);
      if (deleteMatch) return `DELETE_${deleteMatch[1]}`;

      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Pushes a Drizzle query into the batch queue.
   */
  push(query: BatchItem<'sqlite'>, name?: string) {
    const fallbackName = this.inferQueryName(query) ?? `Index_${this.queue.length}`;
    this.queue.push({
      query,
      name: name ?? fallbackName,
    });
  }

  pushAll(...queries: BatchItem<'sqlite'>[]) {
    queries.forEach(query => this.push(query));
  }

  get hasPending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Executes the batch and maps the results back to their identifying names.
   * @param db The Drizzle database instance
   * @param enableLogging If true, prints a mapped breakdown of the successful batch
   */
  async executeBatch(db: AppDatabase, enableLogging: boolean = false) {
    if (!this.hasPending) {
      return [];
    }

    const queries = this.queue.map(item => item.query);

    try {
      //@ts-ignore
      const rawResults = await db.batch(queries);
      const mappedResults = rawResults.map((result, index) => ({ name: this.queue[index].name, result: result }));

      if (enableLogging) {
        console.log(`\n=== D1 Batch Execution: ${mappedResults.length} Queries ===`);
        mappedResults.forEach(item => {
          console.log(`✅ [${item.name}]:`, item.result);
        });
        console.log(`====\n`);
      }

      this.queue = [];
      return mappedResults;
    } catch (error: any) {
      const batchContextMap = this.queue.map((item, index) => `  [${index}] ${item.name}`).join('\n');
      const errorMessage =
        `D1 Batch Execution Failed.\n` +
        `Queries in this batch:\n${batchContextMap}\n` +
        `Original Error: ${error.message}`;
      console.error(errorMessage);
      throw error;
    }
  }
}

export function maybeBatch<Q extends BatchItem<'sqlite'>>(
  collector: BatchCollector | undefined,
  query: Q,
  name?: string,
) {
  if (!collector) return query;
  collector.push(query, name);
  return Promise.resolve();
}

export default BatchCollector;

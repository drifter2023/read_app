import { loadSqlJs } from '../core/db/sqljs.ts';
import { DictService } from '../core/dict/service.ts';
import { sqlJsDictSource } from '../core/dict/sqljs.ts';

let loading: Promise<DictService> | null = null;

/**
 * dict.db is bundled with the app and read into sql.js in memory (~5 MB), on iOS and web alike:
 * lookups are then synchronous, with no native-bridge round trip inside the 100 ms tap budget (R-04).
 */
export function loadDict(): Promise<DictService> {
  loading ??= (async () => {
    const [SQL, res] = await Promise.all([loadSqlJs(), fetch(`${import.meta.env.BASE_URL}dict.db`)]);
    if (!res.ok) throw new Error('词典文件缺失');
    return new DictService(sqlJsDictSource(new SQL.Database(new Uint8Array(await res.arrayBuffer()))));
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

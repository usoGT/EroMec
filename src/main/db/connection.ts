// sql.js (WebAssembly SQLite) bağlantısı ve dosyaya kalıcı yazma.
// Veritabanı bellekte çalışır; her başarılı yazma işleminden sonra dosyaya
// atomik olarak (önce geçici dosya, sonra yeniden adlandırma) kaydedilir.
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic, type SqlValue } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';

export type Params = SqlValue[] | Record<string, SqlValue>;

let sqlPromise: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(wasmDir: string): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: (file: string) => path.join(wasmDir, file) });
  }
  return sqlPromise;
}

export class Db {
  private inTx = false;

  constructor(
    readonly SQL: SqlJsStatic,
    private db: SqlJsDatabase,
    readonly filePath: string | null,
    /** Verilirse dosya yerine bu işlev kaydeder (tarayıcı/telefon sürümü). */
    private saver: ((bytes: Uint8Array) => void) | null = null,
  ) {
    this.applyPragmas();
  }

  static async open(wasmDir: string, filePath: string | null): Promise<Db> {
    const SQL = await loadSqlJs(wasmDir);
    let db: SqlJsDatabase;
    if (filePath && fs.existsSync(filePath)) {
      db = new SQL.Database(fs.readFileSync(filePath));
    } else {
      db = new SQL.Database();
    }
    return new Db(SQL, db, filePath);
  }

  private applyPragmas() {
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  all<T>(sql: string, params: Params = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  run(sql: string, params: Params = []): { lastId: number; changes: number } {
    const stmt = this.db.prepare(sql);
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
    const changes = this.db.getRowsModified();
    const lastId = Number(this.db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0);
    return { lastId, changes };
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  /** İşlemi bir veritabanı işlemi (transaction) içinde çalıştırır ve sonunda diske yazar. */
  tx<T>(fn: () => T): T {
    if (this.inTx) return fn();
    this.inTx = true;
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      this.inTx = false;
      this.persist();
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* işlem zaten kapanmış olabilir */
      }
      this.inTx = false;
      throw err;
    }
  }

  /** Veritabanının ikili kopyası (yedekleme için). */
  exportBytes(): Uint8Array {
    const bytes = this.db.export();
    // sql.js export() bağlantıyı yeniden açtığı için PRAGMA ayarları sıfırlanır.
    this.applyPragmas();
    return bytes;
  }

  persist() {
    if (this.saver) return this.saver(this.exportBytes());
    if (!this.filePath) return;
    const bytes = this.exportBytes();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.filePath);
  }

  /** Bellekteki veritabanını başka bir veritabanıyla değiştirir (yedekten geri yükleme). */
  replaceWith(bytes: Uint8Array) {
    const next = new this.SQL.Database(bytes);
    this.db.close();
    this.db = next;
    this.applyPragmas();
  }

  close() {
    this.db.close();
  }
}

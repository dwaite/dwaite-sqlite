/**
 * SQLite client library for Node.js applications
 *
 * Copyright © 2016 Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line no-unused-vars,import/no-unresolved,import/extensions
import * as sqlite3 from 'sqlite3'; // import sqlite3 for jsdoc type information only
import { RunResult, Statement } from './Statement';

export interface Migration {
  id: number,
  name: string,
  filename: string,
  up?: string,
  down?: string
};
export enum AccessMode {
  ReadOnly = sqlite3.OPEN_READONLY,
  ReadWrite = sqlite3.OPEN_READWRITE,
  ReadWriteCreate = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
}

export class Database {
  /**
   * Initializes a new instance of the database client.
   * @param {sqlite3.Database} driver An instance of SQLite3 driver library.
     */
  constructor(private driver: sqlite3.Database) {
  }
  /**
   * Opens SQLite database.
   *
   * @returns Promise<Database> A promise that resolves to an instance of SQLite database client.
   */
  static open(filename: string, options?: {
    mode?: AccessMode,
    verbose?: boolean,
    cached?: boolean}): Promise<Database> {

    let mode = options? options.mode : null;
    let cached = options ? options.cached : false;
    let verbose = options ? options.verbose : false;

    if (verbose) {
      sqlite3.verbose();
    }

    return new Promise<sqlite3.Database>((resolve, reject) => {
      if (mode && cached) {
        let driver = sqlite3.cached.Database(filename, mode as number, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve(driver);
          }
        });
        return;
      }
      if (mode && !cached) {
        let driver = new sqlite3.Database(filename, mode as number, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve(driver);
          }
        });
      }
      if (!mode && cached) {
        let driver = sqlite3.cached.Database(filename, (err: Error | null) => {
          if (err) {
            reject(err);
          }
          resolve(driver);
        });
        return;
      }
      if (!mode && !cached) {
        let driver = new sqlite3.Database(filename, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve(driver);
          }
        });
        return;
      }
      throw new Error("didn't match")
    }).then((driver: sqlite3.Database) => {
      return new Database(driver);
    });
  }

  /**
   * Close the database.
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.driver.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Register listeners for Sqlite3 events
   *
   * @param {'trace'|'profile'|'error'|'open'|'close'} eventName
   * @param {() => void} listener trigger listener function
   */
  on(eventName:'trace'|'profile'|'error'|'open'|'close', listener: any) {
    this.driver.on(eventName, listener);
  }

  run(sql: string, ...params: any[]): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      this.driver.run(sql, ...params, function runExecResult(this: sqlite3.RunResult, err:Error) {
        if (err) {
          reject(err);
        } else {
          // Per https://github.com/mapbox/node-sqlite3/wiki/API#databaserunsql-param--callback
          // when run() succeeds, the `this' object is a driver statement object. Wrap it as a
          // Statement.
          resolve(new RunResult(this));
        }
      });
    });
  }

  get(sql: string, ...params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.driver.get(sql, ...params, (err: Error, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql: string, ...params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.driver.all(sql, ...params, (err: Error, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  };

  /**
   * Runs all the SQL queries in the supplied string. No result rows are retrieved.
   */
  exec(sql: string): Promise<Statement> {
    return new Promise((resolve, reject) => {
      this.driver.exec(sql, function (this: sqlite3.Statement, err: Error|null) {
        if (err) {
          reject(err);
        } else {
          resolve(new Statement(this));
        }
      });
    });
  }

  //   each(sql: string, callback?: (this: Statement, err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
  //   each(sql: string, params: any, callback?: (this: Statement, err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
  //   each(sql: string, ...params: any[]): this;

  each(sql: string, params: any[], callback: (this: sqlite3.RunResult, err: Error | null, row: any) => void): Promise<number> {
    return new Promise((resolve, reject) => {
      this.driver.each(sql, params, callback, (err: Error|null, rowsCount = 0) => {
        if (err) {
          reject(err);
        } else {
          resolve(rowsCount);
        }
      });
    });
  }

  prepare(sql: string, ...params: any[]): Promise<Statement> {
    return new Promise((resolve, reject) => {
      const stmt = this.driver.prepare(sql, ...params, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve(new Statement(stmt));
        }
      });
    });
  }

  /**
   * Set a configuration option for the database.
   */
  configure(option: "busyTimeout", value: number) {
    this.driver.configure(option, value);
  }


  /**
   * Migrates database schema to the latest version
   */
  async migrate({ force = null , table = 'migrations', migrationsPath = './migrations' } = {}): Promise<this> {
    /* eslint-disable no-await-in-loop */
    const location = path.resolve(migrationsPath);

    // Get the list of migration files, for example:
    //   { id: 1, name: 'initial', filename: '001-initial.sql' }
    //   { id: 2, name: 'feature', fielname: '002-feature.sql' }
    const migrations= await new Promise<Migration[]>((resolve, reject) => {
      fs.readdir(location, (err, files) => {
        if (err) {
          reject(err);
        } else {
          resolve(files
            .map(x => x.match(/^(\d+).(.*?)\.sql$/))
            .filter(x => x !== null)
            .map(x => ({ id: Number(x![1]), name: x![2], filename: x![0] }))
            .sort((a, b) => Math.sign(a.id - b.id)));
        }
      });
    });

    if (!migrations.length) {
      throw new Error(`No migration files found in '${location}'.`);
    }

    // Ge the list of migrations, for example:
    //   { id: 1, name: 'initial', filename: '001-initial.sql', up: ..., down: ... }
    //   { id: 2, name: 'feature', fielname: '002-feature.sql', up: ..., down: ... }
    await Promise.all(migrations.map(migration => new Promise((resolve, reject) => {
      const filename = path.join(location, migration.filename);
      fs.readFile(filename, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
        } else {
          const [up, down] = data.split(/^--\s+?down\b/mi);
          if (!down) {
            const message = `The ${migration.filename} file does not contain '-- Down' separator.`;
            reject(new Error(message));
          } else {
            /* eslint-disable no-param-reassign */
            migration.up = up.replace(/^-- .*?$/gm, '').trim();// Remove comments
            migration.down = down.trim(); // and trim whitespaces
            /* eslint-enable no-param-reassign */
            resolve();
          }
        }
      });
    })));

    // Create a database table for migrations meta data if it doesn't exist
    await this.run(`CREATE TABLE IF NOT EXISTS "${table}" (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL,
  up   TEXT    NOT NULL,
  down TEXT    NOT NULL
)`);

    // Get the list of already applied migrations
    let dbMigrations = await this.all(
      `SELECT id, name, up, down FROM "${table}" ORDER BY id ASC`,
    );
    // Undo migrations that exist only in the database but not in files,
    // also undo the last migration if the `force` option was set to `last`.
    const lastMigration = migrations[migrations.length - 1];
    for (const migration of dbMigrations.slice().sort((a, b) => Math.sign(b.id - a.id))) {
      if (!migrations.some(x => x.id === migration.id) ||
        (force === 'last' && migration.id === lastMigration.id)) {
        await this.run('BEGIN');
        try {
          await this.exec(migration.down);
          await this.run(`DELETE FROM "${table}" WHERE id = ?`, migration.id);
          await this.run('COMMIT');
          dbMigrations = dbMigrations.filter(x => x.id !== migration.id);
        } catch (err) {
          await this.run('ROLLBACK');
          throw err;
        }
      } else {
        break;
      }
    }

    // Apply pending migrations
    const lastMigrationId = dbMigrations.length ? dbMigrations[dbMigrations.length - 1].id : 0;
    for (const migration of migrations) {
      if (migration.id > lastMigrationId) {
        await this.run('BEGIN');
        try {
          await this.exec(migration.up!);
          await this.run(
            `INSERT INTO "${table}" (id, name, up, down) VALUES (?, ?, ?, ?)`,
            migration.id, migration.name, migration.up, migration.down,
          );
          await this.run('COMMIT');
        } catch (err) {
          await this.run('ROLLBACK');
          throw err;
        }
      }
    }

    /* eslint-enable no-await-in-loop */
    return this;
  }
}

/**
 * SQLite client library for Node.js applications
 *
 * Copyright © 2016 Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

import * as sqlite3 from 'sqlite3';
import { SQLStatement } from 'sql-template-strings';


// export class Statement {
//   bind(callback?: (err: Error | null) => void): this;
//   bind(...params: any[]): this;

//   reset(callback?: (err: null) => void): this;

//   finalize(callback?: (err: Error) => void): Database;

//   run(callback?: (err: Error | null) => void): this;
//   run(params: any, callback?: (this: RunResult, err: Error | null) => void): this;
//   run(...params: any[]): this;

//   get(callback?: (err: Error | null, row?: any) => void): this;
//   get(params: any, callback?: (this: RunResult, err: Error | null, row?: any) => void): this;
//   get(...params: any[]): this;

//   all(callback?: (err: Error | null, rows: any[]) => void): this;
//   all(params: any, callback?: (this: RunResult, err: Error | null, rows: any[]) => void): this;
//   all(...params: any[]): this;

//   each(callback?: (err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
//   each(params: any, callback?: (this: RunResult, err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
//   each(...params: any[]): this;
// }

export class Statement {

  constructor(protected stmt: sqlite3.Statement) {
  }

  // get sql() {
  //   return this.stmt.sql;
  // }

  bind(...params: any[]): Promise<this> {
    return new Promise((resolve, reject) => {
      this.stmt.bind(params, (err:Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  reset(): Promise<this> {
    return new Promise((resolve) => {
      this.stmt.reset(() => {
        resolve(this);
      });
    });
  }

  finalize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stmt.finalize((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  run(...params: any[]): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      this.stmt.run(params, function (this: sqlite3.RunResult, err) {
        if (err) {
          reject(err);
        } else {
          resolve(new RunResult(this));
        }
      });
    });
  }

  get(...params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.stmt.get(params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(...params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.stmt.all(params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  each(...params: any[]): ((callback: (row: any, err: Error | null) => void) => Promise<number>) {
    return (callback) => {
      return new Promise((resolve, reject) => {
        this.stmt.each(params, callback, (err: Error | null, rowsCount = 0) => {
          if (err) {
            reject(err);
          } else {
            resolve(rowsCount);
          }
        });
      });
    }
  };
}

export class RunResult extends Statement {
  get lastID() {
    return (this.stmt as sqlite3.RunResult).lastID;
  }

  get changes() {
    return (this.stmt as sqlite3.RunResult).changes;
  }
}

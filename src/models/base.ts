import { db, isDbConnected } from '../db/index.js';

export type GenericData = {
    id: number | string;
};

export type InsertData<T> = Omit<T, 'id' | 'created_at'>;
export type UpdateData<T> = Partial<Omit<T, 'id' | 'created_at'>>;

export type ModelConstructor<M extends Model<T>, T extends GenericData> = {
    new (data: T): M;
    tableName: string;
};

export abstract class Model<T extends GenericData> {
    id!: T['id'];

    static readonly tableName: string;

    constructor(data: T) {
        Object.assign(this, data);
    }

    static async create<M extends Model<T>, T extends GenericData>(
        this: ModelConstructor<M, T>,
        fields: InsertData<T>,
    ): Promise<M> {
        if (!isDbConnected()) throw new Error('Database not connected');

        const keys = Object.keys(fields);
        const values = Object.values(fields);
        const placeholders = keys.map((_, i) => `$${i + 1}`);

        const { rows } = await db.query(
            `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
            values,
        );

        return new this(rows[0]);
    }

    static async get<M extends Model<T>, T extends GenericData>(
        this: ModelConstructor<M, T>,
        id: T['id'],
    ): Promise<M | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(`SELECT * FROM ${this.tableName} WHERE id = $1`, [id]);

        return rows[0] ? new this(rows[0]) : null;
    }

    static async list<M extends Model<T>, T extends GenericData>(
        this: ModelConstructor<M, T>,
        options?: {
            where?: Partial<T>;
            orderBy?: { column: keyof T; direction: 'ASC' | 'DESC' };
            limit?: number;
            offset?: number;
        },
    ): Promise<M[]> {
        if (!isDbConnected()) return [];

        let query = `SELECT * FROM ${this.tableName}`;
        const params: any[] = [];
        let paramIndex = 1;

        if (options?.where) {
            const conditions = Object.entries(options.where)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => {
                    params.push(v);
                    return `${k} = $${paramIndex++}`;
                });
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
        }

        if (options?.orderBy) {
            query += ` ORDER BY ${String(options.orderBy.column)} ${options.orderBy.direction}`;
        }

        if (options?.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(options.limit);
        }

        if (options?.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(options.offset);
        }

        const { rows } = await db.query(query, params);

        return rows.map((row) => new this(row));
    }

    static async count<M extends Model<T>, T extends GenericData>(
        this: ModelConstructor<M, T>,
        where?: Partial<T>,
    ): Promise<number> {
        if (!isDbConnected()) return 0;

        let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
        const params: any[] = [];
        let paramIndex = 1;

        if (where) {
            const conditions = Object.entries(where)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => {
                    params.push(v);
                    return `${k} = $${paramIndex++}`;
                });
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
        }

        const { rows } = await db.query(query, params);

        return parseInt(rows[0].count, 10);
    }

    static async deleteAll<M extends Model<T>, T extends GenericData>(
        this: ModelConstructor<M, T>,
    ): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`DELETE FROM ${this.tableName}`);
    }

    async update(fields: UpdateData<T>): Promise<void> {
        if (!isDbConnected()) return;

        const ctor = this.constructor as ModelConstructor<Model<T>, T>;
        const keys = Object.keys(fields);
        const values = Object.values(fields);

        if (keys.length === 0) return;

        const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

        await db.query(`UPDATE ${ctor.tableName} SET ${setClause} WHERE id = $${keys.length + 1}`, [
            ...values,
            this.id,
        ]);

        Object.assign(this, fields);
    }

    async delete(): Promise<void> {
        if (!isDbConnected()) return;

        const ctor = this.constructor as ModelConstructor<Model<T>, T>;

        await db.query(`DELETE FROM ${ctor.tableName} WHERE id = $1`, [this.id]);
    }
}

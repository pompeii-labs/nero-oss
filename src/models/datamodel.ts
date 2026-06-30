import { getLux, unwrap } from '../lib/lux';

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';

/** A single `where` clause for `DataModel.list`. */
export interface Filter {
    column: string;
    operator: FilterOperator;
    value: unknown;
}

export interface GenericData {
    id: string | number;
}

export type DataModelCtor<M extends DataModel<T>, T extends GenericData> = {
    new (data: T): M;
    tableName: string;
    stampUpdatedAt: boolean;
};

/** The Lux query builder, narrowed to the filter methods we dispatch dynamically. */
type Filterable = { [K in FilterOperator]: (column: string, value: unknown) => Filterable };

/**
 * ActiveRecord-style base over the Lux SDK. A model is a class with a
 * `static tableName`, a snake_case `*Data` interface, and instance fields mirroring
 * the DB columns. Subclasses get create/get/list/update/delete for free and add
 * only their genuinely custom queries. JSON columns decode on the SDK read path, so
 * no manual coercion is needed.
 */
export class DataModel<T extends GenericData> {
    id!: T['id'];

    static readonly tableName: string;
    /** Set true on models whose table has an `updated_at` column to auto-stamp it. */
    static readonly stampUpdatedAt: boolean = false;

    static async create<M extends DataModel<T>, T extends GenericData>(
        this: DataModelCtor<M, T>,
        fields: Partial<T>,
    ): Promise<M> {
        const row = unwrap(
            await getLux()
                .table(this.tableName as never)
                .insert(fields as never),
        ) as T;
        return new this(row);
    }

    static async createMany<M extends DataModel<T>, T extends GenericData>(
        this: DataModelCtor<M, T>,
        fields: Partial<T>[],
    ): Promise<M[]> {
        const rows = unwrap(
            await getLux()
                .table(this.tableName as never)
                .insert(fields as never),
        ) as T[];
        return rows.map((r) => new this(r));
    }

    static async get<M extends DataModel<T>, T extends GenericData>(
        this: DataModelCtor<M, T>,
        id: T['id'],
    ): Promise<M | null> {
        const rows = unwrap(
            await getLux()
                .table(this.tableName as never)
                .select()
                .eq('id', id)
                .limit(1),
        ) as T[];
        return rows.length ? new this(rows[0]) : null;
    }

    static async list<M extends DataModel<T>, T extends GenericData>(
        this: DataModelCtor<M, T>,
        ...filters: Filter[]
    ): Promise<M[]> {
        let q = getLux()
            .table(this.tableName as never)
            .select();
        for (const f of filters.filter(Boolean)) {
            q = (q as unknown as Filterable)[f.operator](f.column, f.value) as unknown as typeof q;
        }
        const rows = unwrap(await q) as T[];
        return rows.map((r) => new this(r));
    }

    static async update<M extends DataModel<T>, T extends GenericData>(
        this: DataModelCtor<M, T>,
        id: T['id'],
        patch: Partial<T>,
    ): Promise<void> {
        const body = this.stampUpdatedAt ? { ...patch, updated_at: Date.now() } : { ...patch };
        unwrap(
            await getLux()
                .table(this.tableName as never)
                .update(body as never)
                .eq('id', id),
        );
    }

    static async delete<M extends DataModel<T>, T extends GenericData>(
        this: DataModelCtor<M, T>,
        id: T['id'],
    ): Promise<void> {
        unwrap(
            await getLux()
                .table(this.tableName as never)
                .delete()
                .eq('id', id),
        );
    }

    async update(patch: Partial<T>): Promise<void> {
        const ctor = this.constructor as DataModelCtor<DataModel<T>, T>;
        const body = ctor.stampUpdatedAt ? { ...patch, updated_at: Date.now() } : { ...patch };
        unwrap(
            await getLux()
                .table(ctor.tableName as never)
                .update(body as never)
                .eq('id', this.id),
        );
        Object.assign(this, patch);
    }

    async delete(): Promise<void> {
        const ctor = this.constructor as DataModelCtor<DataModel<T>, T>;
        unwrap(
            await getLux()
                .table(ctor.tableName as never)
                .delete()
                .eq('id', this.id),
        );
    }
}

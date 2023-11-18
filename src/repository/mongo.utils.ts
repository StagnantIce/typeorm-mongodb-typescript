import { DeepPartial, FilterOperators, UpdateFilter } from 'typeorm';
import {
    Document,
} from 'typeorm/driver/mongodb/typings';

import { AlternativeType, ObjectId } from 'mongodb';
import {
    NumericType,
    OnlyFieldsOfType,
    PushOperator,
    SetFields,
} from 'typeorm/driver/mongodb/typings';

type Operators<TValue> = AlternativeType<TValue> | {
    $eq?: TValue;
    $gt?: TValue;
    $gte?: TValue;
    $in?: ReadonlyArray<TValue>;
    $lt?: TValue;
    $lte?: TValue;
    $ne?: TValue;
    $nin?: ReadonlyArray<TValue>;
    $exists?: boolean;
}
type RootOperators<TSchema> = {
    _id?: ObjectId,
    $and?: DeepOperators<TSchema>[];
    $or?: DeepOperators<TSchema>[];
    $where?: string | ((this: TSchema) => boolean);
}

export type DeepOperators<T> = (
    T extends Date ? Operators<T> :
        T extends Array<infer U> ? DeepOperators<U>[]
            : T extends object ? {
                [K in keyof T]?: DeepOperators<T[K]>;
            } : Operators<T> );

export type DeepFilterPartial<T> = RootOperators<T> | DeepOperators<Omit<T, 'id'>>;

export declare type DeepUpdateFilterPartial<TSchema> = {
    $inc?: OnlyFieldsOfType<TSchema, NumericType | undefined> | DeepPartial<TSchema>;
    $min?: DeepPartial<TSchema>;
    $max?: DeepPartial<TSchema>;
    $set?: DeepPartial<TSchema>;
    $addToSet?: SetFields<TSchema>;
    $push?: PushOperator<TSchema>;
};

export function isValue(value: unknown): boolean {
    return !(value instanceof Object)
        || value instanceof Date
        || Array.isArray(value) && isValue(value[0] ?? null)
        || value instanceof RegExp
        || value instanceof ObjectId;
}

export function deepEntryToFilter<F>(
    entry: DeepFilterPartial<F>,
    prefix = ''
): FilterOperators<F> {
    const entries: Map<string, unknown> = new Map();
    const push = (k: string, v: unknown) => (entries.get(k) instanceof Object && v instanceof Object)
        ? entries.set(k, { ...entries.get(k) as object, ...v })
        : entries.set(k, v);
    Object.entries(entry).forEach(([key, value]) => {
        if (value === undefined) {
            return;
        }
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        if (isValue(value)) {
            if (key.startsWith('$') && prefix) {
                push(prefix, { [key]: value });
            } else {
                push(newPrefix, value);
            }
        } else if (Array.isArray(value)) {
            const res: unknown[] = [];
            value.forEach(v => {
                res.push(deepEntryToFilter<F>(v, key.startsWith('$') ? prefix : ''));
            });
            if (key.startsWith('$')) {
                push(key, res);
            } else {
                push(newPrefix, res);
            }
        } else {
            if (key.startsWith('$')) {
                const toFront = ['$inc', '$or', '$and'].includes(key);
                const stop = ['$set', '$push'].includes(key);
                if (stop) {
                    push(key, value);
                } else if (toFront || !prefix) {
                    push(key, deepEntryToFilter<F>(value, prefix));
                } else {
                    push(prefix, { [key]: deepEntryToFilter<F>(value, '') });
                }
            } else {
                Object.entries(deepEntryToFilter<F>(value as F, newPrefix)).forEach(([k, v]) => push(k,v));
            }
        }
    });
    return Object.fromEntries(entries.entries());
}

export function deepEntryToUpdateFilter<F>(
    entry: DeepPartial<F>,
    prefix = ''
): DeepPartial<F> {
    return deepEntryToFilter(entry as DeepFilterPartial<F>, prefix) as DeepPartial<F>;
}

export function deepUpdateEntryToUpdateFilter<F>(
    entry: DeepUpdateFilterPartial<F>,
    prefix = ''
): UpdateFilter<Document> {
    return deepEntryToFilter<F>(entry as DeepFilterPartial<F>, prefix) as UpdateFilter<Document>;
}

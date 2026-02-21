import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type WithoutChildrenOrChild<T> = T extends infer U ? Omit<U, 'children' | 'child'> : never;

export type WithoutChildren<T> = WithoutChildrenOrChild<T>;

export type WithoutChild<T> = T extends infer U ? Omit<U, 'child'> : never;

export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & {
    ref?: E | null;
};

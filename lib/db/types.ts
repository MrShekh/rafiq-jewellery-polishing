/**
 * TypeScript shapes for every MongoDB document in the app.
 * All collection documents use string _id (nanoid) for consistency.
 */

export interface UserDoc {
    _id: string;
    username: string;
    displayName: string;
    passwordHash: string;
    role: "admin" | "staff";
    isActive: boolean;
    lastLoginAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CustomerDoc {
    _id: string;
    /** Tenant isolation: which user/account this customer belongs to. */
    userId: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive: boolean;
    createdBy?: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface OrderDoc {
    _id: string;
    /** Tenant isolation: which user/account this order belongs to. */
    userId: string;
    orderNumber: string;
    orderDate: string;       // YYYY-MM-DD
    customerId: string;
    customerNameSnapshot: string;
    item: string;
    pieces: number;
    weightIn: string;        // stored as string to avoid float precision issues
    weightOut: string;
    makingCharge: string;
    loss: string;
    touch: string;
    fineTotal: string;
    weightIn2?: string | null;
    weightOut2?: string | null;
    weightExceedsConfirmed: boolean;
    notes?: string | null;
    createdBy?: string | null;
    updatedBy?: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface SettingDoc {
    _id: string;
    userId: string;
    key: string;
    value: string;
    updatedAt: string;
}

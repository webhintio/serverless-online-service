declare module 'mongodb-lock' {
    type Lock = {
        acquire: () => void;
        acquireAsync: () => Promise<string>;
        code: string;
        ensureIndexes: () => void;
        ensureIndexesAsync: () => Promise<void>;
        release: (code: string) => void;
        releaseAsync: (code: string) => Promise<void>;
    }

    function mongodbLock(collection: import('mongoose').Collection, key: string, options: any): Lock;

    export = mongodbLock;
}

import { promisify } from 'util';

import * as mongoose from 'mongoose';

(mongoose.Promise as any) = global.Promise;

import { debug as d } from '../../debug';
import * as logger from '../../logging';

import mongoDBLock = require('mongodb-lock');

const tri = require('tri');
const debug = d(__filename);
let cachedDb: mongoose.Connection | null = null;
const lockName = 'index';
const moduleName = 'Database:common';
const { DatabaseConnection: dbConnectionString } = process.env; // eslint-disable-line no-process-env

/**
 * Create a lock object.
 * @param {string} url - URL to lock in the database.
 */
export const createLock = (url: string) => {
    const collection = cachedDb!.collection('locks');
    const lock = mongoDBLock(collection, url, { removeExpired: true });

    debug(`Creating lock object for url: ${url ? url : 'initial'}`);
    lock.acquireAsync = promisify(lock.acquire);
    lock.releaseAsync = promisify(lock.release);
    lock.ensureIndexesAsync = promisify(lock.ensureIndexes);

    return lock;
};

/**
 * Create a connection to the database.
 * @param {string} connectionString Connection string to the database.
 */
export const connect = async () => {
    if (cachedDb && (cachedDb as any).serverConfig.isConnected() && mongoose.connection.readyState === 1) {
        // Do nothing, connection already exists;
        return;
    }

    try {
        cachedDb = (await mongoose.connect(dbConnectionString!, { useNewUrlParser: true, useUnifiedTopology: true })).connection.db as any;

        debug('Connected to database');

        const indexLock = createLock(lockName);

        debug('Creating index in database');
        await indexLock.ensureIndexesAsync();
    } catch (err) {
        debug('Error connecting to the database');
        throw err;
    }
};

/**
 * Release a lock.
 * @param dbLock - Lock object to release.
 */
export const unlock = async (dbLock: any) => {
    await connect();
    logger.log(`Release lock for key ${dbLock.name}`, moduleName);
    await dbLock.releaseAsync(dbLock.code);
};

/**
 * Create a lock for a key.
 * @param {string} key - Key to lock in the database.
 */
export const lock = async (key: string) => {
    await connect();
    const dbLock = createLock(key);

    const getLock = async () => {
        const code = await dbLock.acquireAsync();

        if (!code) {
            logger.error(`Lock not acquired for key ${key}`, moduleName);

            throw new Error('Lock not acquired');
        }

        logger.log(`Lock acquired for key ${key}`, moduleName);

        return code;
    };

    dbLock.code = await tri(getLock, {
        delay: 500,
        maxAttempts: 10
    });

    return dbLock;
};

/**
 * Disconnect from the database.
 */
export const disconnect = async () => {
    if (cachedDb) {
        try {
            await mongoose.disconnect();
        } catch (err) {
            // Do nothing.
        } finally {
            cachedDb = null;
        }
    }
};

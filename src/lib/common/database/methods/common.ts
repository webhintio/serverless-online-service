import { promisify } from 'util';

import * as mongoDBLock from 'mongodb-lock';
import * as mongoose from 'mongoose';
import * as tri from 'tri';

(mongoose.Promise as any) = global.Promise;

import { debug as d } from '../../../utils/debug';
import * as logger from '../../../utils/logging';

const debug: debug.IDebugger = d(__filename);
let cachedDb: mongoose.Connection;
const lockName: string = 'index';
const moduleName: string = 'Database:common';
const { DatabaseConnection: dbConnectionString } = process.env; // eslint-disable-line no-process-env

/**
 * Create a lock object.
 * @param {string} url - URL to lock in the database.
 */
export const createLock = (url: string) => {
    const lock = mongoDBLock(cachedDb, 'locks', url, { removeExpired: true });

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
    if (cachedDb && cachedDb.serverConfig.isConnected() && mongoose.connection.readyState === 1) {
        // Do nothing, connection already exists;
        return;
    }

    try {
        cachedDb = (await mongoose.connect(dbConnectionString, { useNewUrlParser: true })).connection.db;
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
export const unlock = async (dbLock) => {
    await connect();
    logger.log(`Release lock for key ${dbLock.name}`, moduleName);
    await dbLock.releaseAsync(dbLock.code);
};

/**
 * Create a lock for an url.
 * @param {string} url - URL to lock in the database.
 */
export const lock = async (url: string) => {
    const dbLock = createLock(url);

    const getLock = async () => {
        await connect();
        const code = await dbLock.acquireAsync();

        if (!code) {
            logger.error(`Lock not acquired for key ${url}`, moduleName);

            throw new Error('Lock not acquired');
        }

        logger.log(`Lock acquired for key ${url}`, moduleName);

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

import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

type DatabaseServerConfig = {
    isConnected: () => boolean;
}

type DatabaseConnectionDB = {
    command: ({ replSetGetStatus: number }) => Promise<any>;
    serverConfig: DatabaseServerConfig;
}

type DatabaseConnection = {
    db: DatabaseConnectionDB;
    host: string;
    port: number;
}

type ServerConfig = {
    isConnected: () => boolean;
}

type Database = {
    connection: DatabaseConnection;
    serverConfig: ServerConfig;
}

type Mongoose = {
    connect: () => Promise<Database>;
    connection: {
        readyState: number;
    };
    disconnect: () => void;
}

type DBLock = {
    acquire: (callback: Function) => void;
    ensureIndexes: () => void;
    release: () => void;
}

type MongoDBLock = () => DBLock;

type DBCommonTestContext = {
    database: Database;
    dbLock: DBLock;
    dbLockEnsureIndexes: sinon.SinonStub;
    mongoDBLock: MongoDBLock;
    mongoose: Mongoose;
    mongooseConnectStub: sinon.SinonStub;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestInterface<DBCommonTestContext>;

const loadScript = (context: DBCommonTestContext) => {
    return proxyquire('../../../../src/lib/common/database/methods/common', {
        'mongodb-lock': context.mongoDBLock,
        mongoose: context.mongoose
    });
};

test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    t.context.dbLock = {
        acquire(callback) {
            callback(null, 'code');
        },
        ensureIndexes() { },
        release() { }
    };

    t.context.mongoDBLock = () => {
        return t.context.dbLock;
    };
    t.context.mongoose = {
        connect(): Promise<Database> {
            return null;
        },
        connection: { readyState: 1 },
        disconnect() { }
    };
    t.context.database = {
        connection: {
            db: {
                command({ replSetGetStatus: number }): Promise<any> {
                    return null;
                },
                serverConfig: {
                    isConnected() {
                        return false;
                    }
                }
            },
            host: 'localhost',
            port: 27017
        },
        serverConfig: {
            isConnected() {
                return false;
            }
        }
    };

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('disconnect should do nothing if database is not connected', async (t) => {
    const sandbox = t.context.sandbox;

    const mongooseDisconnectSpy = sandbox.spy(t.context.mongoose, 'disconnect');
    const dbCommon = loadScript(t.context);

    await dbCommon.disconnect();

    t.false(mongooseDisconnectSpy.called);
});

test('unlock should call to releaseAsync', async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);

    const lock = {
        releaseAsync(): Promise<any> {
            return null;
        }
    };

    const lockReleaseAsync = sandbox.stub(lock, 'releaseAsync').resolves([]);
    const dbCommon = loadScript(t.context);

    await dbCommon.unlock(lock);

    t.true(lockReleaseAsync.calledOnce);
});

test('connect should connect to mongoose and create an index', async (t) => {
    const sandbox = t.context.sandbox;
    const dbCommon = loadScript(t.context);

    t.context.mongooseConnectStub = sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    t.context.dbLockEnsureIndexes = sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);

    await dbCommon.connect();

    t.true(t.context.mongooseConnectStub.calledOnce);
    t.true(t.context.dbLockEnsureIndexes.calledOnce);
});

test('connect should do nothing if the database is already connected', async (t) => {
    const sandbox = t.context.sandbox;
    const dbCommon = loadScript(t.context);

    t.context.mongooseConnectStub = sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    sandbox.stub(t.context.database.connection.db.serverConfig, 'isConnected').returns(true);
    t.context.dbLockEnsureIndexes = sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);

    await dbCommon.connect();
    await dbCommon.connect();

    t.true(t.context.mongooseConnectStub.calledOnce);
    t.true(t.context.dbLockEnsureIndexes.calledOnce);
});

test('if connect fail, it should throw an error', async (t) => {
    const sandbox = t.context.sandbox;
    const errorMessage = 'error connecting';

    t.context.mongooseConnectStub = sandbox.stub(t.context.mongoose, 'connect').rejects(new Error(errorMessage));
    t.context.dbLockEnsureIndexes = sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);

    t.plan(3);
    const dbCommon = loadScript(t.context);

    try {
        await dbCommon.connect('conectionString');
    } catch (err) {
        t.is(err.message, errorMessage);
        t.true(t.context.mongooseConnectStub.calledOnce);
        t.false(t.context.dbLockEnsureIndexes.called);
    }
});

test('if ensureIndexes fail, it should throw an error', async (t) => {
    const sandbox = t.context.sandbox;
    const errorMessage = 'error connecting';

    t.context.mongooseConnectStub = sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    t.context.dbLockEnsureIndexes = sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArgWith(0, errorMessage);

    t.plan(3);
    const dbCommon = loadScript(t.context);

    try {
        await dbCommon.connect('conectionString');
    } catch (err) {
        t.is(err, errorMessage);
        t.true(t.context.mongooseConnectStub.calledOnce);
        t.true(t.context.dbLockEnsureIndexes.calledOnce);
    }
});

test('lock should lock the database', async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);

    const dbLockAcquireStub = sandbox.stub(t.context.dbLock, 'acquire').callsFake((callback) => {
        callback(null, 'code');
    });

    const dbCommon = loadScript(t.context);
    const lock = await dbCommon.lock('url');

    t.true(dbLockAcquireStub.calledOnce);
});

test('if database is locked, it should retry to lock the database', async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);
    const dbLockAcquireStub = sandbox.stub(t.context.dbLock, 'acquire')
        .onFirstCall()
        .callsFake((callback) => {
            callback(null, null);
        })
        .onSecondCall()
        .callsFake((callback) => {
            callback(null, 'code');
        });
    const dbCommon = loadScript(t.context);

    await dbCommon.lock('url');

    t.true(dbLockAcquireStub.calledTwice);
});

test('if database is locked for a long time, it should throw an error', async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);
    const dbLockAcquireStub = sandbox.stub(t.context.dbLock, 'acquire')
        .callsFake((callback) => {
            callback(null, null);
        });
    const dbCommon = loadScript(t.context);

    try {
        await dbCommon.lock('url');
    } catch (err) {
        t.is(dbLockAcquireStub.callCount, 10);
        t.is(err.message, 'Lock not acquired');
    }
});

test('disconnect should call to mongoose.disconnect', async (t) => {
    const sandbox = t.context.sandbox;

    t.context.mongooseConnectStub = sandbox.stub(t.context.mongoose, 'connect').resolves(t.context.database);
    t.context.dbLockEnsureIndexes = sandbox.stub(t.context.dbLock, 'ensureIndexes').callsArg(0);

    const mongooseDisconnectStub = sandbox.stub(t.context.mongoose, 'disconnect').resolves();

    const dbCommon = loadScript(t.context);

    await dbCommon.connect('conectionString');
    await dbCommon.disconnect();

    t.true(mongooseDisconnectStub.called);
});

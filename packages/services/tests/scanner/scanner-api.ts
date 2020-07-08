import * as path from 'path';
import * as fs from 'fs';

import anyTest, { TestInterface, ExecutionContext } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';
import * as moment from 'moment';
import { UserConfig } from '@hint/utils/dist/src/config/types';
import { HintStatus, IJob, IServiceConfig, JobStatus, logger, readFileAsync } from '@online-service/utils';

process.env.QueueConnection = 'connectionString'; // eslint-disable-line no-process-env

type DatabaseJob = {
    add: () => Promise<any>;
    get: () => Promise<any>;
    getLatestByUrl: () => Promise<any>;
    update: () => Promise<void>;
}

type DatabaseServiceConfig = {
    getActive: () => Promise<IServiceConfig>;
}

type Database = {
    connect: () => Promise<any>;
    disconnect: () => Promise<any>;
    job: DatabaseJob;
    lock: () => Promise<any>;
    serviceConfig: DatabaseServiceConfig;
    unlock: () => Promise<void>;
}

type NTPObject = {
    now: Date;
}

type NTP = {
    getTime: () => Promise<NTPObject>;
}

type QueueMethods = {
    getMessagesCount: () => number;
    sendMessage: () => void;
}

type QueueObject = {
    Queue: () => QueueMethods;
}

type JobTestContext = {
    configManagerActiveStub: sinon.SinonStub;
    database: Database;
    jobs: any;
    databaseLockStub: sinon.SinonStub;
    databaseJobAddStub: sinon.SinonStub | sinon.SinonSpy;
    databaseJobGetByUrlStub: sinon.SinonStub;
    databaseJobGetStub: sinon.SinonStub;
    databaseJobUpdateSpy: sinon.SinonSpy;
    databaseUnlockStub: sinon.SinonStub;
    ntp: NTP;
    queueMethods: QueueMethods;
    queueMethodsGetMessagesCountSpy: sinon.SinonSpy;
    queueMethodsSendMessageStub: sinon.SinonStub | sinon.SinonSpy;
    queueObject: QueueObject;
    resourceLoaderLoadHintStub: sinon.SinonStub;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestInterface<JobTestContext>;

const activeConfig: IServiceConfig = {
    active: true,
    jobCacheTime: 120,
    jobRunTime: 100,
    name: 'test',
    webhintConfigs: [{
        hints: {
            hint1: 'error',
            hint2: 'error'
        }
    },
    {
        hints: {
            hint3: 'error',
            hint4: 'error',
            hint5: 'off'
        }
    }]
};

const extendsConfig: IServiceConfig = {
    active: true,
    jobCacheTime: 120,
    jobRunTime: 100,
    name: 'test',
    webhintConfigs: [{
        extends: ['config'],
        hints: {
            hint1: 'error',
            hint2: 'error'
        }
    },
    {
        hints: {
            hint3: 'error',
            hint4: 'error',
            hint5: 'off'
        }
    }]
};

const setExpired = (job: IJob) => {
    job.finished = moment().subtract(3, 'minutes')
        .toDate();
    job.status = JobStatus.finished;
};

const setNoExpired = (job: IJob) => {
    job.finished = new Date();
    job.status = JobStatus.finished;
};

const validatedJobCreatedInDatabase = (t: ExecutionContext<JobTestContext>, jobResult: IJob, isExtends: boolean = false) => {
    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobAddStub.calledOnce);
    t.true(t.context.queueMethodsSendMessageStub.calledTwice);

    const args = t.context.databaseJobAddStub.args[0];

    const expectedHints = [{
        category: 'category',
        messages: [],
        name: 'hint1',
        status: HintStatus.pending
    }, {
        category: 'category',
        messages: [],
        name: 'hint2',
        status: HintStatus.pending
    }, {
        category: 'category',
        messages: [],
        name: 'hint3',
        status: HintStatus.pending
    }, {
        category: 'category',
        messages: [],
        name: 'hint4',
        status: HintStatus.pending
    }];

    const expectedConfigs: UserConfig[] = [{
        hints: {
            hint1: 'error',
            hint2: 'error'
        }
    },
    {
        hints: {
            hint3: 'error',
            hint4: 'error',
            hint5: 'off'
        }
    }];

    if (isExtends) {
        expectedHints.unshift({
            category: 'category',
            messages: [],
            name: 'hint-config2',
            status: HintStatus.pending
        });

        expectedHints.unshift({
            category: 'category',
            messages: [],
            name: 'hint-config1',
            status: HintStatus.pending
        });

        expectedConfigs[0].extends = ['config'];
    }

    t.is(args[0], jobResult.url);
    t.is(args[1], JobStatus.pending);
    t.deepEqual(args[2], expectedHints);
    t.deepEqual(args[3], expectedConfigs);
};

const loadScript = (context: JobTestContext) => {
    return proxyquire('../../src/scanner/scanner-api', {
        './categories.json': JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'categories.json'), 'utf-8')), // eslint-disable-line no-sync
        './hint-extends.json': JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hint-extends.json'), 'utf-8')), // eslint-disable-line no-sync
        '@online-service/utils': {
            database: context.database,
            logger,
            ntp: context.ntp,
            Queue: context.queueObject.Queue
        }
    });
};

test.beforeEach(async (t) => {
    const sandbox = sinon.createSandbox();

    t.context.database = {
        connect: () => {
            return null as any;
        },
        disconnect: () => {
            return null as any;
        },
        job: {
            add(): Promise<any> {
                return null as any;
            },
            get(): Promise<any> {
                return Promise.resolve(null);
            },
            getLatestByUrl(): Promise<IJob[]> {
                return Promise.resolve([]);
            },
            update() {
                return Promise.resolve();
            }
        },
        lock(): Promise<any> {
            return Promise.resolve(null);
        },
        serviceConfig: {
            getActive(): Promise<IServiceConfig> {
                return Promise.resolve(null as any);
            }
        },
        unlock(): Promise<any> {
            return Promise.resolve(null);
        }
    };

    t.context.ntp = {
        getTime() {
            return Promise.resolve({ now: new Date() });
        }
    };

    t.context.queueMethods = {
        getMessagesCount() {
            return 0;
        },
        sendMessage() { }
    };

    const Queue = function () {
        return t.context.queueMethods;
    };

    t.context.queueObject = { Queue };

    t.context.databaseJobGetStub = sandbox.stub(t.context.database.job, 'get').resolves({});
    t.context.databaseLockStub = sandbox.stub(t.context.database, 'lock').resolves({});
    t.context.databaseUnlockStub = sandbox.stub(t.context.database, 'unlock').resolves();
    t.context.databaseJobUpdateSpy = sandbox.spy(t.context.database.job, 'update');
    t.context.queueMethodsGetMessagesCountSpy = sandbox.spy(t.context.queueMethods, 'getMessagesCount');

    t.context.jobs = JSON.parse(await readFileAsync(path.join(__dirname, 'fixtures', 'jobs.json')));

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test(`if there is no url, it should return an error`, async (t) => {
    const scannerApi = loadScript(t.context);

    try {
        await scannerApi.createJob();
    } catch (err) {
        t.is(err.message, 'Url is required');
    }
});

test(`if the job doesn't exist, it should create a new job and add it to the queue`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves([]);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        error: null,
        finished: null as any,
        hints: [],
        maxRunTime: 100,
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    };

    t.context.databaseJobAddStub = sandbox.stub(t.context.database.job, 'add').resolves(jobResult);

    const scannerApi = loadScript(t.context);

    await scannerApi.createJob('http://webhint.io');

    validatedJobCreatedInDatabase(t, jobResult);
});

test(`if the job doesn't exist, it should create a new job and add it to the queue and use the extends property`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(extendsConfig);
    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves([]);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        error: null,
        finished: null as any,
        hints: [],
        maxRunTime: 100,
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    };

    t.context.databaseJobAddStub = sandbox.stub(t.context.database.job, 'add').resolves(jobResult);

    const scannerApi = loadScript(t.context);

    await scannerApi.createJob('http://webhint.io');

    validatedJobCreatedInDatabase(t, jobResult, true);
});

test(`if the job doesn't exist, but there is an error in Service Bus, it should set the status or the job to error`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
    t.context.queueMethodsSendMessageStub = sandbox.stub(t.context.queueMethods, 'sendMessage').rejects();
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves([]);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        hints: [],
        url: 'http://webhint.io'
    };

    t.context.databaseJobAddStub = sandbox.stub(t.context.database.job, 'add').resolves(jobResult);

    const scannerApi = loadScript(t.context);

    await scannerApi.createJob('http://webhint.io');

    t.true(t.context.databaseJobUpdateSpy.calledOnce);
});

test(`if the job exists, but it is expired, it should create a new job and add it to the queue`, async (t) => {
    const sandbox = t.context.sandbox;
    const jobs = t.context.jobs;

    setExpired(jobs[0]);

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves(jobs);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        error: null,
        finished: null as any,
        hints: [],
        maxRunTime: 100,
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    };

    t.context.databaseJobAddStub = sandbox.stub(t.context.database.job, 'add').resolves(jobResult);

    const scannerApi = loadScript(t.context);

    await scannerApi.createJob('http://webhint.io');

    validatedJobCreatedInDatabase(t, jobResult);
});

test(`if the job exists, but config is different, it should create a new job and add it to the queue`, async (t) => {
    const sandbox = t.context.sandbox;
    const jobs = t.context.jobs;

    jobs[0].config = [{
        hints: {
            hint1: HintStatus.error,
            hint3: HintStatus.error
        }
    }];

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves(jobs);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        error: null,
        finished: null as any,
        hints: [],
        maxRunTime: 100,
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    };

    t.context.databaseJobAddStub = sandbox.stub(t.context.database.job, 'add').resolves(jobResult);

    const scannerApi = loadScript(t.context);

    await scannerApi.createJob('http://webhint.io');

    validatedJobCreatedInDatabase(t, jobResult);
});

test(`if the job exists and it isn't expired, it shouldn't create a new job`, async (t) => {
    const sandbox = t.context.sandbox;
    const jobs = t.context.jobs;

    setNoExpired(jobs[0]);

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves(jobs);
    t.context.databaseJobAddStub = sandbox.spy(t.context.database.job, 'add');

    const scannerApi = loadScript(t.context);
    const result = await scannerApi.createJob('http://webhint.io');

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.false(t.context.databaseJobAddStub.called);
    t.false(t.context.queueMethodsSendMessageStub.called);
    t.is(result, jobs[0]);
});

test(`if the job exists, the status is neither finish or error, but finished is set, it shouldn't create a new job`, async (t) => {
    const sandbox = t.context.sandbox;
    const jobs = t.context.jobs;

    jobs[0].finished = new Date();

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves(jobs);
    t.context.databaseJobAddStub = sandbox.spy(t.context.database.job, 'add');

    const scannerApi = loadScript(t.context);
    const result = await scannerApi.createJob('http://webhint.io');

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.false(t.context.databaseJobAddStub.called);
    t.false(t.context.queueMethodsSendMessageStub.called);
    t.is(result, jobs[0]);
});

test(`if the job is still running, it shouldn't create a new job`, async (t) => {
    const sandbox = t.context.sandbox;
    const jobs = t.context.jobs;

    sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getLatestByUrl').resolves(jobs);
    t.context.databaseJobAddStub = sandbox.spy(t.context.database.job, 'add');

    const scannerApi = loadScript(t.context);
    const result = await scannerApi.createJob('http://webhint.io');

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.false(t.context.databaseJobAddStub.called);
    t.false(t.context.queueMethodsSendMessageStub.called);
    t.is(result, jobs[0]);
});

test('scannerApi.getJob should call to the database to get the job', async (t) => {
    const scannerApi = loadScript(t.context);

    await scannerApi.getJobStatus('jobId');

    t.true(t.context.databaseJobGetStub.calledOnce);
});

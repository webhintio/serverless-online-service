import * as path from 'path';
import * as fs from 'fs';

import anyTest, { TestInterface, ExecutionContext } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';
import * as moment from 'moment';

import { JobStatus, HintStatus } from '../../../../src/lib/enums/status';
import { readFileAsync } from '../../../../src/lib/utils/misc';
import { IJob, IServiceConfig } from '../../../../src/lib/types';

process.env.QueueConnection = 'connectionString'; // eslint-disable-line no-process-env

type DatabaseJob = {
    add: () => Promise<any>;
    get: () => Promise<any>;
    getByUrl: () => Promise<any>;
    update: () => Promise<void>;
}

type DatabaseServiceConfig = {
    getActive: () => Promise<IServiceConfig>;
}

type Database = {
    connect: () => Promise<any>;
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

const setExpired = (job: IJob) => {
    job.finished = moment().subtract(3, 'minutes')
        .toDate();
    job.status = JobStatus.finished;
};

const setNoExpired = (job: IJob) => {
    job.finished = new Date();
    job.status = JobStatus.finished;
};

const validatedJobCreatedInDatabase = (t: ExecutionContext<JobTestContext>, jobResult) => {
    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobAddStub.calledOnce);
    t.true(t.context.queueMethodsSendMessageStub.calledTwice);

    const args = t.context.databaseJobAddStub.args[0];

    t.is(args[0], jobResult.url);
    t.is(args[1], JobStatus.pending);
    t.deepEqual(args[2], [{
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
    }]);
    t.deepEqual(args[3], [{
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
    }]);
};

const loadScript = (context: JobTestContext) => {
    return proxyquire('../../../../src/lib/microservices/scanner-api/scanner-api', {
        '../../common/database/database': context.database,
        '../../common/ntp/ntp': context.ntp,
        '../../common/queue/queue': context.queueObject,
        './categories.json': JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'categories.json'), 'utf-8')) // eslint-disable-line no-sync
    });
};

test.beforeEach(async (t) => {
    const sandbox = sinon.createSandbox();

    t.context.database = {
        connect: () => {
            return null;
        },
        job: {
            add(): Promise<any> {
                return null;
            },
            get(): Promise<any> {
                return null;
            },
            getByUrl(): Promise<IJob[]> {
                return null;
            },
            update() {
                return null;
            }
        },
        lock(): Promise<any> {
            return null;
        },
        serviceConfig: {
            getActive(): Promise<IServiceConfig> {
                return null;
            }
        },
        unlock(): Promise<any> {
            return null;
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
    t.context.configManagerActiveStub = sandbox.stub(t.context.database.serviceConfig, 'getActive').resolves(activeConfig);
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

    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves([]);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        hints: [],
        url: 'http://webhint.io'
    };

    t.context.databaseJobAddStub = sandbox.stub(t.context.database.job, 'add').resolves(jobResult);

    const scannerApi = loadScript(t.context);

    await scannerApi.createJob('http://webhint.io');

    validatedJobCreatedInDatabase(t, jobResult);
});

test(`if the job doesn't exist, but there is an error in Service Bus, it should set the status or the job to error`, async (t) => {
    const sandbox = t.context.sandbox;

    t.context.queueMethodsSendMessageStub = sandbox.stub(t.context.queueMethods, 'sendMessage').rejects();
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves([]);

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

test(`if the job doesn't exist, it should use the defaul configuration if source is not set`, async (t) => {
    const sandbox = t.context.sandbox;

    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves([]);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        hints: [],
        url: 'http://webhint.io'
    };

    t.context.databaseJobAddStub = sandbox.stub(t.context.database.job, 'add').resolves(jobResult);

    const scannerApi = loadScript(t.context);

    await scannerApi.createJob('http://webhint.io');

    validatedJobCreatedInDatabase(t, jobResult);
});

test(`if the job exists, but it is expired, it should create a new job and add it to the queue`, async (t) => {
    const sandbox = t.context.sandbox;
    const jobs = t.context.jobs;

    setExpired(jobs[0]);

    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves(jobs);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        hints: [],
        url: 'http://webhint.io'
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

    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves(jobs);

    const jobResult = {
        config: activeConfig.webhintConfigs,
        hints: [],
        url: 'http://webhint.io'
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

    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves(jobs);
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

    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves(jobs);
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

    t.context.queueMethodsSendMessageStub = sandbox.spy(t.context.queueMethods, 'sendMessage');
    t.context.databaseJobGetByUrlStub = sandbox.stub(t.context.database.job, 'getByUrl').resolves(jobs);
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

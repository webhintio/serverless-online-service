import * as path from 'path';
import * as fs from 'fs';

import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';
import * as moment from 'moment';
import * as _ from 'lodash';

import { IStatus, logger } from '@online-service/utils';

type DatabaseJob = {
    getByDate: (field: string, fromDate: Date, toDate: Date) => Promise<any>;
}

type DatabaseStatus = {
    add: () => Promise<IStatus>;
    getByDate: (fromQuarter: moment.Moment, toQuarter: moment.Moment) => Promise<IStatus[]>;
    getMostRecent: () => Promise<IStatus>;
    update: () => Promise<void>;
}

type Database = {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    job: DatabaseJob;
    status: DatabaseStatus;
};

type QueueMethods = {
    getMessagesCount: () => void;
}

type QueueObject = {
    Queue: () => QueueMethods;
}

process.env.DatabaseConnection = 'Database connection string'; // eslint-disable-line no-process-env
process.env.QueueConnection = 'Queue connection string'; // eslint-disable-line no-process-env

type StatusTestContext = {
    database: Database;
    databaseStatusAddStub: sinon.SinonStub;
    databaseStatusUpdateStub: sinon.SinonStub;
    queueObject: QueueObject;
    sandbox: sinon.SinonSandbox;
    validStatus: IStatus;
};

const getValidJob = () => {
    const job = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'job.json'), 'utf-8')); // eslint-disable-line no-sync

    job.finished = new Date(job.finished);
    job.queued = new Date(job.queued);
    job.started = new Date(job.started);

    return job;
};

const getValidTestData = () => {
    const validJob = getValidJob();
    const validJob2 = getValidJob();
    const validJob3 = getValidJob();

    validJob.queued = moment()
        .startOf('hour')
        .toDate();
    validJob.started = moment(validJob.queued)
        .add(1, 's')
        .toDate();
    validJob.finished = moment(validJob.started)
        .add(1, 'm')
        .toDate();

    validJob2.queued = moment()
        .startOf('hour')
        .toDate();
    validJob2.started = moment(validJob2.queued)
        .add(3, 's')
        .toDate();
    validJob2.finished = moment(validJob2.started)
        .add(1, 'm')
        .add(30, 's')
        .toDate();
    validJob2.url = 'http://www.new-url.com';

    validJob3.queued = moment()
        .startOf('hour')
        .toDate();
    validJob3.started = moment(validJob3.queued)
        .add(5, 's')
        .toDate();
    validJob3.finished = moment(validJob3.started)
        .add(2, 'm')
        .toDate();
    validJob3.hints[1].status = 'warning';

    return [validJob, validJob2, validJob3];
};

const test = anyTest as TestInterface<StatusTestContext>;

const loadScript = (context: StatusTestContext) => {
    return proxyquire('../../src/status/status', {
        '@online-service/utils': {
            database: context.database,
            logger,
            Queue: context.queueObject.Queue
        }
    });
};

test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    const queueMethods = { getMessagesCount() { } };

    const Queue = function () {
        return queueMethods;
    };

    t.context.validStatus = {
        average: {
            finish: 0,
            start: 0
        },
        date: new Date('2017-10-15T08:15:00.000Z'),
        hints: null as any,
        queues: null as any,
        scans: {
            created: 0,
            finished: {
                error: 0,
                success: 0
            },
            started: 0
        }
    };
    t.context.queueObject = { Queue };
    t.context.database = {
        connect() {
            return null as any;
        },
        disconnect() {
            return null as any;
        },
        job: {
            getByDate(field: string, fromDate: Date, toDate: Date): Promise<any> {
                return null as any;
            }
        },
        status: {
            add(): Promise<IStatus> {
                return null as any;
            },
            getByDate(fromQuarter: moment.Moment, toQuarter: moment.Moment): Promise<IStatus[]> {
                return null as any;
            },
            getMostRecent(): Promise<IStatus> {
                return null as any;
            },
            update() {
                return null as any;
            }
        }
    };

    sandbox.stub(t.context.database, 'connect').resolves();
    t.context.databaseStatusAddStub = sandbox.stub(t.context.database.status, 'add').resolves(t.context.validStatus);
    t.context.databaseStatusUpdateStub = sandbox.stub(t.context.database.status, 'update').resolves();
    sandbox.stub(queueMethods, 'getMessagesCount').resolves();

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('getStatus should return the items in the database between the dates (1/3)', async (t) => {
    const sandbox = t.context.sandbox;

    const databaseStatusGetByDateStub = sandbox.stub(t.context.database.status, 'getByDate').resolves([t.context.validStatus]);
    const status = loadScript(t.context);

    await status.getStatus(new Date('2017-10-15T08:29:59.999Z'), new Date('2017-10-15T08:30:00.000Z'));

    t.is(databaseStatusGetByDateStub.callCount, 1);

    const args = databaseStatusGetByDateStub.args;

    t.true(moment(args[0][0]).isSame(moment('2017-10-15T08:15:00.000Z')));
    t.true(moment(args[0][1]).isSame(moment('2017-10-15T08:30:00.000Z')));
});

test('getStatus should return the items in the database between the dates (2/3)', async (t) => {
    const sandbox = t.context.sandbox;

    const databaseStatusGetByDateStub = sandbox.stub(t.context.database.status, 'getByDate').resolves([t.context.validStatus]);
    const status = loadScript(t.context);

    await status.getStatus(new Date('2017-10-15T09:15:00.000Z'), new Date('2017-10-15T09:38:00.000Z'));

    t.is(databaseStatusGetByDateStub.callCount, 1);

    const args = databaseStatusGetByDateStub.args;

    t.true(moment(args[0][0]).isSame(moment('2017-10-15T09:15:00.000Z')));
    t.true(moment(args[0][1]).isSame(moment('2017-10-15T09:30:00.000Z')));
});

test('getStatus should return the items in the database between the dates (3/3)', async (t) => {
    const sandbox = t.context.sandbox;

    const databaseStatusGetByDateStub = sandbox.stub(t.context.database.status, 'getByDate').resolves([t.context.validStatus]);
    const status = loadScript(t.context);

    await status.getStatus(new Date('2017-10-15T10:00:00.000Z'), new Date('2017-10-15T10:59:59.999Z'));

    t.is(databaseStatusGetByDateStub.callCount, 1);

    const args = databaseStatusGetByDateStub.args;

    t.true(moment(args[0][0]).isSame(moment('2017-10-15T10:00:00.000Z')));
    t.true(moment(args[0][1]).isSame(moment('2017-10-15T10:45:00.000Z')));
});

test('updateStatuses should get results every 15 minutes', async (t) => {
    const sandbox = t.context.sandbox;
    const recentDate = moment()
        .subtract(16, 'm')
        .startOf('minute');

    sandbox.stub(t.context.database.status, 'getMostRecent').resolves({ date: recentDate.toDate() } as IStatus);
    const databaseJobGetByDate = sandbox.stub(t.context.database.job, 'getByDate').resolves([]);
    const status = loadScript(t.context);

    await status.updateStatuses();

    t.is(databaseJobGetByDate.callCount, 3);
    t.true(t.context.databaseStatusAddStub.calledOnce);
    t.true(t.context.databaseStatusUpdateStub.calledOnce);

    const args = databaseJobGetByDate.args;

    t.is(args[0][0], 'queued');
    t.is(args[1][0], 'started');
    t.is(args[2][0], 'finished');
});

test('updateStatuses should just update the queue status for the last period of time', async (t) => {
    const sandbox = t.context.sandbox;
    const recentDate = moment()
        .subtract(31, 'm')
        .startOf('minute');

    sandbox.stub(t.context.database.status, 'getMostRecent').resolves({ date: recentDate.toDate() } as IStatus);
    const databaseJobGetByDate = sandbox.stub(t.context.database.job, 'getByDate').resolves([]);
    const status = loadScript(t.context);

    await status.updateStatuses();

    t.is(databaseJobGetByDate.callCount, 6);
    t.true(t.context.databaseStatusAddStub.calledTwice);
    t.true(t.context.databaseStatusUpdateStub.calledOnce);
});

test('updateStatuses should calculate the averages', async (t) => {
    const sandbox = t.context.sandbox;
    const recentDate = moment()
        .subtract(16, 'm')
        .startOf('minute');

    sandbox.stub(t.context.database.status, 'getMostRecent').resolves({ date: recentDate.toDate() } as IStatus);
    const databaseJobGetByDate = sandbox.stub(t.context.database.job, 'getByDate').resolves(getValidTestData());
    const status = loadScript(t.context);

    await status.updateStatuses();

    t.is(databaseJobGetByDate.callCount, 3);
    t.true(t.context.databaseStatusAddStub.calledOnce);
    t.true(t.context.databaseStatusUpdateStub.calledOnce);

    const args = t.context.databaseStatusAddStub.args[0][0];

    t.is(args.average.start, 3000);
    t.is(args.average.finish, 90000);
});

test('updateStatuses should calculate the averages if some time is missed', async (t) => {
    const sandbox = t.context.sandbox;
    const recentDate = moment()
        .subtract(16, 'm')
        .startOf('minute');

    sandbox.stub(t.context.database.status, 'getMostRecent').resolves({ date: recentDate.toDate() } as IStatus);

    const data = getValidTestData();

    data[1].started = null;

    const databaseJobGetByDate = sandbox.stub(t.context.database.job, 'getByDate').resolves(data);
    const status = loadScript(t.context);

    await status.updateStatuses();

    t.is(databaseJobGetByDate.callCount, 3);
    t.true(t.context.databaseStatusAddStub.calledOnce);
    t.true(t.context.databaseStatusUpdateStub.calledOnce);

    const args = t.context.databaseStatusAddStub.args[0][0];

    t.is(args.average.start, 3000);
    t.is(args.average.finish, 90000);
});

test('updateStatuses should calculate the averages if some times are equal', async (t) => {
    const sandbox = t.context.sandbox;
    const recentDate = moment()
        .subtract(16, 'm')
        .startOf('minute');

    sandbox.stub(t.context.database.status, 'getMostRecent').resolves({ date: recentDate.toDate() } as IStatus);

    const data = getValidTestData();

    data[1].queued = data[1].started;

    const databaseJobGetByDate = sandbox.stub(t.context.database.job, 'getByDate').resolves(data);
    const status = loadScript(t.context);

    await status.updateStatuses();

    t.is(databaseJobGetByDate.callCount, 3);
    t.true(t.context.databaseStatusAddStub.calledOnce);
    t.true(t.context.databaseStatusUpdateStub.calledOnce);

    const args = t.context.databaseStatusAddStub.args[0][0];

    t.is(args.average.start, 3000);
    t.is(args.average.finish, 90000);
});

test('updateStatuses should calculate the averages if all times are equal', async (t) => {
    const sandbox = t.context.sandbox;
    const recentDate = moment()
        .subtract(16, 'm')
        .startOf('minute');

    sandbox.stub(t.context.database.status, 'getMostRecent').resolves({ date: recentDate.toDate() } as IStatus);

    const data = getValidTestData();

    data[0].started = data[0].queued;
    data[0].finished = data[0].queued;
    data[1].started = data[1].queued;
    data[1].finished = data[1].queued;
    data[2].started = data[2].queued;
    data[2].finished = data[2].queued;

    const databaseJobGetByDate = sandbox.stub(t.context.database.job, 'getByDate').resolves(data);
    const status = loadScript(t.context);

    await status.updateStatuses(true);

    t.is(databaseJobGetByDate.callCount, 3);
    t.true(t.context.databaseStatusAddStub.calledOnce);
    t.true(t.context.databaseStatusUpdateStub.calledOnce);

    const args = t.context.databaseStatusAddStub.args[0][0];

    t.is(args.average.start, Number.MAX_SAFE_INTEGER);
    t.is(args.average.finish, Number.MAX_SAFE_INTEGER);
});

test('updateStatuses should calculate hints status', async (t) => {
    const sandbox = t.context.sandbox;
    const recentDate = moment()
        .subtract(16, 'm')
        .startOf('minute');

    sandbox.stub(t.context.database.status, 'getMostRecent').resolves({ date: recentDate.toDate() } as IStatus);
    const databaseJobGetByDate = sandbox.stub(t.context.database.job, 'getByDate').resolves(getValidTestData());
    const status = loadScript(t.context);

    await status.updateStatuses();

    t.is(databaseJobGetByDate.callCount, 3);
    t.true(t.context.databaseStatusAddStub.calledOnce);
    t.true(t.context.databaseStatusUpdateStub.calledOnce);

    const args = t.context.databaseStatusAddStub.args[0][0];

    t.is(args.hints.errors, 2);
    t.is(args.hints.warnings, 1);
    t.is(args.hints.passes, 3);

    const noDisallowedHeaders = args.hints.hints['no-disallowed-headers'];
    const noFriendlyErrorPages = args.hints.hints['no-friendly-error-pages'];

    t.is(noDisallowedHeaders.errors, 2);
    t.is(noDisallowedHeaders.warnings, 1);
    t.is(noDisallowedHeaders.passes, 0);
    t.is(noDisallowedHeaders.urls.length, 3);
    t.is(noDisallowedHeaders.urls[0].errors, 1);
    t.is(noDisallowedHeaders.urls[0].warnings, 1);
    t.is(noFriendlyErrorPages.urls.length, 3);
    t.is(noFriendlyErrorPages.passes, 3);
    t.is(noFriendlyErrorPages.errors, 0);
    t.is(noFriendlyErrorPages.warnings, 0);
});

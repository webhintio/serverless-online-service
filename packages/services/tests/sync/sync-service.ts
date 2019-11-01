import * as path from 'path';

import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

import { generateLog, HintStatus, IJob, JobStatus, readFile, readFileAsync } from '@online-service/utils';
import { Contracts } from 'applicationinsights';

type Github = {
    IssueReporter: () => any;
}

type DatabaseJob = {
    get: () => Promise<any>;
    update: () => Promise<void>;
}

type Database = {
    connect: () => void;
    job: DatabaseJob;
    lock: () => Promise<any>;
    unlock: () => Promise<void>;
}

type AppInsightsClient = {
    trackEvent: (telemetry: Contracts.EventTelemetry) => void;
    trackException: (telemetry: Contracts.ExceptionTelemetry) => void;
}

type AppInsights = {
    getClient: () => AppInsightsClient;
}

type Logger = {
    error: () => void;
    log: () => void;
}

const jobs = {
    error: JSON.parse(readFile(path.join(__dirname, 'fixtures', 'error.json'))),
    finished: JSON.parse(readFile(path.join(__dirname, 'fixtures', 'finished.json'))),
    finishedPart1: JSON.parse(readFile(path.join(__dirname, 'fixtures', 'finished-part1.json'))),
    finishedPart2: JSON.parse(readFile(path.join(__dirname, 'fixtures', 'finished-part2.json'))),
    finishedWithError: JSON.parse(readFile(path.join(__dirname, 'fixtures', 'finished-with-error.json'))),
    started: JSON.parse(readFile(path.join(__dirname, 'fixtures', 'started.json'))),
    startedNewId: JSON.parse(readFile(path.join(__dirname, 'fixtures', 'started-new-id.json')))
};

type SyncTestContext = {
    appInsights: AppInsights;
    appInsightsClient: AppInsightsClient;
    database: Database;
    databaseConnectStub: sinon.SinonStub;
    databaseJobGetStub: sinon.SinonStub;
    databaseJobUpdateStub: sinon.SinonStub;
    databaseLockStub: sinon.SinonStub;
    databaseUnlockStub: sinon.SinonStub;
    github: Github;
    issueReporterReportSpy: sinon.SinonSpy;
    job: IJob;
    logger: Logger;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestInterface<SyncTestContext>;

const loadScript = (context: SyncTestContext) => {
    return proxyquire('../../src/sync/sync-service', {
        '@online-service/utils': {
            appinsights: context.appInsights,
            database: context.database,
            generateLog,
            IssueReporter: context.github.IssueReporter,
            logger: context.logger
        }
    });
};

test.beforeEach(async (t) => {
    const sandbox = sinon.createSandbox();

    t.context.appInsightsClient = {
        trackEvent(telemetry: Contracts.EventTelemetry) { },
        trackException(telemetry: Contracts.ExceptionTelemetry) { }
    };

    t.context.appInsights = {
        getClient() {
            return t.context.appInsightsClient;
        }
    };

    t.context.database = {
        connect() { },
        job: {
            get(): Promise<any> {
                return null as any;
            },
            update() {
                return null as any;
            }
        },
        lock(): Promise<any> {
            return null as any;
        },
        unlock() {
            return null as any;
        }
    };

    t.context.logger = { error() { }, log() { } };

    const IssueReporter = function () { };

    IssueReporter.prototype.report = () => { };

    t.context.github = { IssueReporter };

    const databaseConnectStub = sandbox.stub(t.context.database, 'connect').resolves();
    const databaseLockStub = sandbox.stub(t.context.database, 'lock').resolves('asdf');
    const databaseUnlockStub = sandbox.stub(t.context.database, 'unlock').resolves();
    const databaseJobUpdateStub = sandbox.stub(t.context.database.job, 'update').resolves();
    const issueReporterReportSpy = sandbox.spy(IssueReporter.prototype, 'report');

    t.context.job = JSON.parse(await readFileAsync(path.join(__dirname, 'fixtures', 'dbdata.json')));
    t.context.job.queued = new Date(t.context.job.queued);

    t.context.databaseConnectStub = databaseConnectStub;
    t.context.databaseLockStub = databaseLockStub;
    t.context.databaseUnlockStub = databaseUnlockStub;
    t.context.databaseJobUpdateStub = databaseJobUpdateStub;
    t.context.issueReporterReportSpy = issueReporterReportSpy;

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test(`if the job in the database has the status 'error', it should work as normal`, async (t) => {
    const sandbox = t.context.sandbox;

    t.context.job.status = JobStatus.error;
    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);


    const sync = loadScript(t.context);

    await sync.run(jobs.started);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);
});

test(`if the job status is 'started' and the job status is database 'pending', it should update the status and the started property`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.started);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);
    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.started);
    t.is(dbJob.started, jobs.started.started);
});


test(`if a job status is not finished it will not track any telemetry`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);
    const appInsightsClientTrackEventSpy = sandbox.spy(t.context.appInsightsClient, 'trackEvent');
    const appInsightsClientTrackExceptionSpy = sandbox.spy(t.context.appInsightsClient, 'trackException');

    const sync = loadScript(t.context);

    await sync.run(jobs.started);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);
    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.started);
    t.is(dbJob.started, jobs.started.started);
    t.false(appInsightsClientTrackEventSpy.called);
    t.false(appInsightsClientTrackExceptionSpy.called);
});

test(`if the job status is 'started' and the job status in database is not 'pending', it should update just the started property`, async (t) => {
    const sandbox = t.context.sandbox;

    t.context.job.status = JobStatus.finished;
    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.started);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);
    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.finished);
    t.is(dbJob.started, jobs.started.started);
});

test(`if the job status is 'started' and the property started in database is greater than the current one, it should update the started property`, async (t) => {
    const sandbox = t.context.sandbox;

    t.context.job.status = JobStatus.finished;
    t.context.job.started = new Date('2017-08-31T23:55:00.877Z');
    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.started);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);
    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.finished);
    t.is(dbJob.started, jobs.started.started);
});

test(`if the job status is 'error', it should update the job in database properly`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.error);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);
    t.true(t.context.issueReporterReportSpy.called);
    t.is(t.context.issueReporterReportSpy.args[0][0].errorType, 'crash');
    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.not(dbJob.status, JobStatus.error);
    t.is(dbJob.finished, jobs.error.finished);
    t.deepEqual(dbJob.error[0], jobs.error.error);
});

test(`if the job status is 'finished' and all hints are processed, it should update hints and send the status finished if there is no errors`, async (t) => {
    const sandbox = t.context.sandbox;

    t.context.job.started = t.context.job.queued;
    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.finished);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);
    t.true(t.context.issueReporterReportSpy.called);
    t.falsy(t.context.issueReporterReportSpy.args[0][0].errorType);

    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.finished);
    t.is(dbJob.finished.getTime(), jobs.finished.finished.getTime());

    for (const hint of dbJob.hints) {
        t.not(hint.status, HintStatus.pending);
    }
});

test(`if the job status is 'finished' and all hints are processed, it should update hints and send the status error if there is a previous error in database`, async (t) => {
    const sandbox = t.context.sandbox;

    t.context.job.error = jobs.error.error;
    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.finished);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);

    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.error);
    t.is(dbJob.finished.getTime(), jobs.finished.finished.getTime());

    for (const hint of dbJob.hints) {
        t.not(hint.status, HintStatus.pending);
    }
});

test(`if the job status is 'finished' and all hints are processed, it should update hints and send the status error if there is any error`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.finishedWithError);

    t.true(t.context.databaseLockStub.calledOnce);
    t.true(t.context.databaseUnlockStub.calledOnce);
    t.true(t.context.databaseJobUpdateStub.called);

    const dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.error);
    t.is(dbJob.finished.getTime(), jobs.finished.finished.getTime());

    for (const hint of dbJob.hints) {
        t.not(hint.status, HintStatus.pending);
    }
});

test(`if the job finish with error, we should track the exception`, async (t) => {
    const sandbox = t.context.sandbox;

    const appInsightsClientTrackEventSpy = sandbox.spy(t.context.appInsightsClient, 'trackEvent');
    const appInsightsClientTrackExceptionSpy = sandbox.spy(t.context.appInsightsClient, 'trackException');

    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.finishedWithError);

    t.true(appInsightsClientTrackEventSpy.calledOnce);
    t.is(appInsightsClientTrackEventSpy.args[0][0].name, 'online-error');
    t.true(appInsightsClientTrackExceptionSpy.calledOnce);
    t.deepEqual(appInsightsClientTrackExceptionSpy.args[0][0].exception, jobs.finishedWithError.error);
});

test(`if the job status is 'finished' but they are partial results, it should update hints and just send the status finished when all the hints are processed`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);

    const sync = loadScript(t.context);

    await sync.run(jobs.started);

    let dbJob: IJob = t.context.databaseJobUpdateStub.args[0][0];

    t.is(dbJob.status, JobStatus.started);
    t.is(dbJob.started, jobs.started.started);

    await sync.run(jobs.finishedPart1);

    dbJob = t.context.databaseJobUpdateStub.args[1][0];

    t.is(dbJob.status, JobStatus.started);

    await sync.run(jobs.finishedPart2);

    dbJob = t.context.databaseJobUpdateStub.args[2][0];

    t.is(dbJob.status, JobStatus.finished);
    t.truthy(dbJob.finished);

    t.is(t.context.databaseLockStub.callCount, 3);
    t.is(t.context.databaseUnlockStub.callCount, 3);
    t.is(t.context.databaseJobUpdateStub.callCount, 3);
});

test(`if a job finish and status is finished, it will track the result`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.database.job, 'get').resolves(t.context.job);
    const appInsightsClientTrackEventSpy = sandbox.spy(t.context.appInsightsClient, 'trackEvent');
    const appInsightsClientTrackExceptionSpy = sandbox.spy(t.context.appInsightsClient, 'trackException');

    const sync = loadScript(t.context);

    await sync.run(jobs.started);
    await sync.run(jobs.finishedPart1);
    await sync.run(jobs.finishedPart2);

    t.false(appInsightsClientTrackExceptionSpy.called);
    t.true(appInsightsClientTrackEventSpy.calledOnce);

    const args = appInsightsClientTrackEventSpy.args[0][0];

    t.truthy(args.measurements!['online-finish-duration']);
    t.truthy(args.measurements!['online-start-duration']);
    t.is(args.name, 'online-finish');
    t.deepEqual(args.properties, {
        axe: 'failed',
        'content-type': 'failed',
        'disown-opener': 'passed',
        'highest-available-document-mode': 'passed',
        'html-checker': 'failed',
        'manifest-exists': 'passed',
        'manifest-file-extension': 'passed',
        'manifest-is-valid': 'passed',
        'meta-charset-utf-8': 'passed',
        'no-disallowed-headers': 'failed',
        'no-friendly-error-pages': 'failed',
        'no-html-only-headers': 'failed',
        'no-protocol-relative-urls': 'passed',
        ssllabs: 'passed',
        'strict-transport-security': 'failed',
        'validate-set-cookie-header': 'passed',
        'x-content-type-options': 'failed'
    });
});

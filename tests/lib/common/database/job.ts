import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';
import * as moment from 'moment';
import { IJob } from '../../../../src/lib/types';
import { JobStatus } from '../../../../src/lib/enums/status';

type Query = {
    count: () => Query;
    exec: () => Promise<any>;
    remove: () => Query;
    sort: () => Query;
};

type ModelObject = {
    save: () => void;
}

type JobModels = {
    Job: () => ModelObject;
}

type NTPObject = {
    now: Date;
}

type NTP = {
    getTime: () => Promise<NTPObject>;
}

type DBJobTestContext = {
    jobFindStub: sinon.SinonStub;
    jobFindOneStub: sinon.SinonStub;
    jobModels: JobModels;
    jobResult: Array<IJob>;
    modelObject: ModelObject;
    ntp: NTP;
    query: Query;
    queryCountStub: sinon.SinonStub;
    queryRemoveStub: sinon.SinonStub;
    querySortStub: sinon.SinonStub;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestInterface<DBJobTestContext>;

const loadScript = (context: DBJobTestContext) => {
    return proxyquire('../../../../src/lib/common/database/methods/job', {
        '../../ntp/ntp': context.ntp,
        '../models/job': context.jobModels
    });
};

test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    t.context.modelObject = { save() { } };

    const Job: any = function () {
        return t.context.modelObject;
    };

    Job.find = () => { };
    Job.findOne = () => { };

    t.context.jobModels = { Job };
    t.context.query = {
        count() {
            return t.context.query;
        },
        exec(): Promise<any> {
            return null;
        },
        remove() {
            return t.context.query;
        },
        sort() {
            return t.context.query;
        }
    };
    t.context.ntp = {
        getTime() {
            return Promise.resolve({ now: new Date() });
        }
    };
    t.context.jobFindStub = sandbox.stub(Job, 'find').returns(t.context.query);
    t.context.jobFindOneStub = sandbox.stub(Job, 'findOne').returns(t.context.query);
    t.context.queryCountStub = sandbox.stub(t.context.query, 'count').returns(t.context.query);
    t.context.queryRemoveStub = sandbox.stub(t.context.query, 'remove').returns(t.context.query);
    t.context.querySortStub = sandbox.stub(t.context.query, 'sort').returns(t.context.query);
    t.context.jobResult = [{
        config: null,
        error: null,
        finished: new Date(),
        hints: null,
        maxRunTime: 180,
        queued: new Date(),
        started: new Date(),
        status: JobStatus.pending,
        url: 'url',
        webhintVersion: null
    }];

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('job.getByUrl should return a job', async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves(t.context.jobResult);
    const job = loadScript(t.context);
    const result = await job.getByUrl('url');

    t.true(queryExecStub.calledOnce);
    t.true(t.context.jobFindStub.calledOnce);
    t.is(result, t.context.jobResult);

    queryExecStub.restore();
});

test('job.get should return a job', async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves(t.context.jobResult[0]);
    const job = loadScript(t.context);
    const result = await job.get('url');

    t.true(queryExecStub.calledOnce);
    t.true(t.context.jobFindOneStub.calledOnce);
    t.is(result, t.context.jobResult[0]);

    queryExecStub.restore();
});

test('job.add should save a new job in database', async (t) => {
    const sandbox = t.context.sandbox;
    const modelObjectSaveStub = sandbox.stub(t.context.modelObject, 'save').resolves();
    const job = loadScript(t.context);

    await job.add('url', JobStatus.pending, null, null, 180);

    t.true(modelObjectSaveStub.calledOnce);
});

test('job.getByDate should return the jobs between both dates', async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves(t.context.jobResult);

    const field = 'started';
    const from = moment();
    const to = moment().add(3, 'hour');
    const job = loadScript(t.context);
    const result = await job.getByDate(field, from.toDate(), to.toDate());

    t.true(queryExecStub.calledOnce);
    t.true(t.context.jobFindStub.calledOnce);

    const args = t.context.jobFindStub.args[0][0];

    t.true(from.isSame(moment(args[field].$gte)));
    t.true(to.isSame(moment(args[field].$lt)));
    t.is(result, t.context.jobResult);

    queryExecStub.restore();
});

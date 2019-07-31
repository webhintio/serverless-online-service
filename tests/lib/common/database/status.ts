import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

import { IStatus } from '../../../../src/lib/types';

type Query = {
    exec: () => Query;
    sort: () => Query;
};

type ModelObject = {
    save: () => void;
}

type StatusModels = {
    Status: () => ModelObject;
}

type DBStatusTestContext = {
    modelObject: ModelObject;
    query: Query;
    querySortStub: sinon.SinonStub;
    sandbox: sinon.SinonSandbox;
    statusFindOneStub: sinon.SinonStub;
    statusModels: StatusModels;
};

const test = anyTest as TestInterface<DBStatusTestContext>;

const loadScript = (context: DBStatusTestContext) => {
    return proxyquire('../../../../src/lib/common/database/methods/status', { '../models/status': context.statusModels });
};

test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    t.context.modelObject = { save() { } };

    const Status: any = function () {
        return t.context.modelObject;
    };

    Status.findOne = () => { };

    t.context.statusModels = { Status };

    t.context.query = {
        exec() {
            return t.context.query;
        },
        sort() {
            return t.context.query;
        }
    };
    t.context.statusFindOneStub = sandbox.stub(Status, 'findOne').returns(t.context.query);
    t.context.querySortStub = sandbox.stub(t.context.query, 'sort').returns(t.context.query);

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('status.add should create a new status in database', async (t) => {
    const sandbox = t.context.sandbox;
    const modelObjectSaveStub = sandbox.stub(t.context.modelObject, 'save').resolves();
    const status = loadScript(t.context);

    await status.add({ date: new Date() } as IStatus);

    t.true(modelObjectSaveStub.calledOnce);
});

test('status.getMostRecent should return the newest item in the database', async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves();
    const status = loadScript(t.context);

    await status.getMostRecent();

    t.true(t.context.querySortStub.calledOnce);
    t.is(t.context.querySortStub.args[0][0].date, -1);
    t.true(queryExecStub.calledOnce);
    t.true(t.context.statusFindOneStub.calledOnce);
    t.is(t.context.statusFindOneStub.args[0][0], void 0);
});

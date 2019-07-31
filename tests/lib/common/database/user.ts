import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

type Query = {
    exec: () => Query;
    remove: () => Query;
};

type ModelObject = {
    save: () => void;
}

type UserModels = {
    User: () => ModelObject;
}

type DBUserTestContext = {
    modelObject: ModelObject;
    query: Query;
    queryRemoveStub: sinon.SinonStub;
    sandbox: sinon.SinonSandbox;
    userFindOneStub: sinon.SinonStub;
    userFindStub: sinon.SinonStub;
    userModels: UserModels;
};

const test = anyTest as TestInterface<DBUserTestContext>;

const loadScript = (context: DBUserTestContext) => {
    return proxyquire('../../../../src/lib/common/database/methods/user', { '../models/user': context.userModels });
};

test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    t.context.query = {
        exec() {
            return t.context.query;
        },
        remove() {
            return t.context.query;
        }
    };

    t.context.modelObject = { save() { } };

    const User: any = function () {
        return t.context.modelObject;
    };

    User.find = () => { };
    User.findOne = () => { };

    t.context.userModels = { User };

    t.context.userFindStub = sandbox.stub(User, 'find').returns(t.context.query);
    t.context.userFindOneStub = sandbox.stub(User, 'findOne').returns(t.context.query);
    t.context.queryRemoveStub = sandbox.stub(t.context.query, 'remove').returns(t.context.query);

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('user.add should save a new user in database', async (t) => {
    const sandbox = t.context.sandbox;

    const modelObjectSaveStub = sandbox.stub(t.context.modelObject, 'save').resolves();
    const user = loadScript(t.context);

    await user.add('userName');

    t.true(modelObjectSaveStub.calledOnce);
});

test('user.getAll should return all users in the database', async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.query, 'exec').resolves();

    const user = loadScript(t.context);

    await user.getAll();

    t.deepEqual(t.context.userFindStub.args[0][0], {});
    t.true(t.context.userFindStub.calledOnce);
});

test('user.get should return an user', async (t) => {
    const sandbox = t.context.sandbox;

    const name = 'userName';

    sandbox.stub(t.context.query, 'exec').resolves();

    const user = loadScript(t.context);

    await user.get(name);

    t.deepEqual(t.context.userFindOneStub.args[0][0].name, name);
    t.true(t.context.userFindOneStub.calledOnce);
});

test('user.remove should remove an user from the database', async (t) => {
    const sandbox = t.context.sandbox;

    const name = 'userName';

    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves();
    const user = loadScript(t.context);

    await user.remove(name);

    t.true(queryExecStub.calledOnce);
    t.true(t.context.queryRemoveStub.calledOnce);
    t.true(t.context.userFindOneStub.calledOnce);
    t.is(t.context.userFindOneStub.args[0][0].name, name);
});

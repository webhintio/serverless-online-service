import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';
import { UserConfig } from 'hint/dist/src/lib/types';

type Query = {
    exec: () => Promise<any>;
    remove: () => Query;
};

type ModelObject = {
    save: () => void;
}

type ServiceConfigModels = {
    ServiceConfig: () => ModelObject;
}

type Common = {
    connect: () => Promise<void>;
}

type DBServiceConfigTestContext = {
    common: Common;
    modelObject: ModelObject;
    query: Query;
    queryRemoveStub: sinon.SinonStub;
    sandbox: sinon.SinonSandbox;
    serviceConfigFindStub: sinon.SinonStub;
    serviceConfigFindOneStub: sinon.SinonStub;
    serviceConfigModels: ServiceConfigModels;
};

const test = anyTest as TestInterface<DBServiceConfigTestContext>;

const loadScript = (context: DBServiceConfigTestContext) => {
    return proxyquire('../../src/database/methods/serviceconfig', {
        '../models/serviceconfig': context.serviceConfigModels,
        './common': context.common
    });
};

test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    t.context.query = {
        exec(): Promise<any> {
            return null as any;
        },
        remove(): Query {
            return t.context.query;
        }
    };

    t.context.modelObject = { save() { } };

    const ServiceConfig: any = function () {
        return t.context.modelObject;
    };

    ServiceConfig.find = () => { };
    ServiceConfig.findOne = () => { };

    t.context.serviceConfigModels = { ServiceConfig };
    t.context.common = {
        connect() {
            return null as any;
        }
    };

    t.context.serviceConfigFindStub = sandbox.stub(ServiceConfig, 'find').returns(t.context.query);
    t.context.serviceConfigFindOneStub = sandbox.stub(ServiceConfig, 'findOne').returns(t.context.query);

    t.context.queryRemoveStub = sandbox.stub(t.context.query, 'remove').returns(t.context.query);

    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('serviceConfig.add should save a new configuration in database', async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.common, 'connect').resolves();
    const modelObjectSaveStub = sandbox.stub(t.context.modelObject, 'save').resolves();
    const serviceConfig = loadScript(t.context);

    await serviceConfig.add('configName', 120, 180, [{}] as UserConfig[]);

    t.true(modelObjectSaveStub.calledOnce);
});

test(`serviceConfig.add should throw an exception if it can't connect to the database`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.common, 'connect').rejects();
    const modelObjectSaveSpy = sandbox.spy(t.context.modelObject, 'save');
    const serviceConfig = loadScript(t.context);

    await t.throwsAsync(async () => {
        await serviceConfig.add('configName', 120, 180, [{}] as UserConfig[]);
    });

    t.false(modelObjectSaveSpy.called);
});

test('serviceConfig.activate should return an error if there is no data in the database', async (t) => {
    const sandbox = t.context.sandbox;
    const name = 'configName';

    sandbox.stub(t.context.common, 'connect').resolves();
    sandbox.stub(t.context.query, 'exec').resolves([]);

    t.plan(1);

    const serviceConfig = loadScript(t.context);

    try {
        await serviceConfig.activate(name);
    } catch (err) {
        t.is(err.message, `Configuration '${name}' doesn't exist`);
    }
});

test('serviceConfig.activate should return an error if there is no configuration with the given name', async (t) => {
    const sandbox = t.context.sandbox;
    const name = 'configName';

    sandbox.stub(t.context.common, 'connect').resolves();
    sandbox.stub(t.context.query, 'exec').resolves([{ name: 'otherName' }]);

    t.plan(1);

    const serviceConfig = loadScript(t.context);

    try {
        await serviceConfig.activate(name);
    } catch (err) {
        t.is(err.message, `Configuration '${name}' doesn't exist`);
    }
});

test('serviceConfig.activate should activate the configuration with the given name', async (t) => {
    const sandbox = t.context.sandbox;
    const name = 'configName';
    const modelFunctions = { save() { } };

    sandbox.stub(t.context.common, 'connect').resolves();
    const modelFunctionsSaveStub = sandbox.stub(modelFunctions, 'save').resolves();

    const configurations = [{
        active: null,
        name,
        save: modelFunctions.save
    }, {
        active: null,
        name: 'config1',
        save: modelFunctions.save
    },
    {
        active: null,
        name: 'config2',
        save: modelFunctions.save
    }];

    sandbox.stub(t.context.query, 'exec').resolves(configurations);

    const serviceConfig = loadScript(t.context);

    await serviceConfig.activate(name);

    t.is(modelFunctionsSaveStub.callCount, 3);
    t.true(configurations[0].active);
    t.false(configurations[1].active);
    t.false(configurations[2].active);
});

test(`serviceConfig.activate should throw an exception if it can't connect to the database`, async (t) => {
    const sandbox = t.context.sandbox;
    const name = 'configName';
    const modelFunctions = { save() { } };

    sandbox.stub(t.context.common, 'connect').rejects();
    const modelFunctionsSaveSpy = sandbox.spy(modelFunctions, 'save');
    const queryExecSpy = sandbox.spy(t.context.query, 'exec');

    const serviceConfig = loadScript(t.context);

    await t.throwsAsync(async () => {
        await serviceConfig.activate(name);
    });

    t.false(modelFunctionsSaveSpy.called);
    t.false(queryExecSpy.called);
});

test('serviceConfig.getAll should returns a list of configurations', async (t) => {
    const sandbox = t.context.sandbox;
    const configurations = [
        { name: 'config0' },
        { name: 'config1' },
        { name: 'config2' }
    ];

    sandbox.stub(t.context.common, 'connect').resolves();
    sandbox.stub(t.context.query, 'exec').resolves(configurations);

    const serviceConfig = loadScript(t.context);

    const list = await serviceConfig.getAll();

    t.is(list, configurations);
});

test(`serviceConfig.getAll should throw an exception if it can't connect to the database`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.common, 'connect').rejects();
    const queryExecSpy = sandbox.spy(t.context.query, 'exec');

    const serviceConfig = loadScript(t.context);

    await t.throwsAsync(async () => {
        await serviceConfig.getAll();
    });

    t.false(queryExecSpy.called);
});

test('serviceConfig.get should return a configuration', async (t) => {
    const sandbox = t.context.sandbox;
    const config = { name: 'config' };

    sandbox.stub(t.context.common, 'connect').resolves();
    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves(config);
    const serviceConfig = loadScript(t.context);
    const result = await serviceConfig.get('config');

    t.true(queryExecStub.calledOnce);
    t.true(t.context.serviceConfigFindOneStub.calledOnce);
    t.is(result, config);
});

test(`serviceConfig.get should throw an exception if it can't connect to the database`, async (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context.common, 'connect').rejects();
    const queryExecSpy = sandbox.spy(t.context.query, 'exec');
    const serviceConfig = loadScript(t.context);

    await t.throwsAsync(async () => {
        await serviceConfig.get('config');
    });

    t.false(queryExecSpy.called);
});

test('serviceConfig.remove should remove a configuration', async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves();

    sandbox.stub(t.context.common, 'connect').resolves();
    const serviceConfig = loadScript(t.context);

    await serviceConfig.remove('config');

    t.true(queryExecStub.calledOnce);
    t.true(t.context.queryRemoveStub.calledOnce);
    t.true(t.context.serviceConfigFindOneStub.calledOnce);
});

test(`serviceConfig.remove should throw an exception if it can't connect to the database`, async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecSpy = sandbox.spy(t.context.query, 'exec');

    sandbox.stub(t.context.common, 'connect').rejects();
    const serviceConfig = loadScript(t.context);

    await t.throwsAsync(async () => {
        await serviceConfig.remove('config');
    });

    t.false(queryExecSpy.called);
});

test('serviceConfig.getActive should return the active configuration', async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecStub = sandbox.stub(t.context.query, 'exec').resolves();

    sandbox.stub(t.context.common, 'connect').resolves();
    const serviceConfig = loadScript(t.context);

    await serviceConfig.getActive();

    t.true(queryExecStub.calledOnce);
    t.true(t.context.serviceConfigFindOneStub.calledOnce);
    t.true(t.context.serviceConfigFindOneStub.args[0][0].active);
});

test(`serviceConfig.getActive should throw an exception if it can't connect to the database`, async (t) => {
    const sandbox = t.context.sandbox;
    const queryExecSpy = sandbox.spy(t.context.query, 'exec');

    sandbox.stub(t.context.common, 'connect').rejects();
    const serviceConfig = loadScript(t.context);

    await t.throwsAsync(async () => {
        await serviceConfig.getActive();
    });

    t.false(queryExecSpy.called);
});

test(`serviceConfig.edit shouldn't modify the webhintConfigs property if config is null`, async (t) => {
    const sandbox = t.context.sandbox;
    const config = {
        jobCacheTime: 1,
        jobRunTime: 1,
        markModified() { },
        name: 'oldName',
        save() { },
        webhintConfigs: {}
    };
    const configMarkModifiedSpy = sandbox.spy(config, 'markModified');

    sandbox.stub(t.context.common, 'connect').resolves();
    sandbox.stub(t.context.query, 'exec').resolves(config);

    const serviceConfig = loadScript(t.context);
    const result = await serviceConfig.edit('oldName', 'newName', 100, 200);

    t.is(result.name, 'newName');
    t.is(result.jobCacheTime, 100);
    t.is(result.jobRunTime, 200);
    t.is(result.webhintConfigs, config.webhintConfigs);
    t.false(configMarkModifiedSpy.called);
});

test(`serviceConfig.edit should throw an exception if it can't connect to the database`, async (t) => {
    const sandbox = t.context.sandbox;
    const config = {
        jobCacheTime: 1,
        jobRunTime: 1,
        markModified() { },
        name: 'oldName',
        save() { },
        webhintConfigs: {}
    };
    const configMarkModifiedSpy = sandbox.spy(config, 'markModified');

    sandbox.stub(t.context.common, 'connect').rejects();
    const queryExecSpy = sandbox.spy(t.context.query, 'exec');

    const serviceConfig = loadScript(t.context);

    await t.throwsAsync(async () => {
        await serviceConfig.edit('oldName', 'newName', 100, 200);
    });

    t.false(configMarkModifiedSpy.called);
    t.false(queryExecSpy.called);
});

test(`serviceConfig.edit should modify the webhintConfigs property if config isn't null`, async (t) => {
    const sandbox = t.context.sandbox;
    const config = {
        jobCacheTime: 1,
        jobRunTime: 1,
        markModified(param: string) { },
        name: 'oldName',
        save() { },
        webhintConfigs: {}
    };
    const webhintConfigs: UserConfig[] = [{
        connector: {
            name: 'jsdom',
            options: {}
        }
    }];
    const configMarkModifiedSpy = sandbox.spy(config, 'markModified');

    sandbox.stub(t.context.common, 'connect').resolves();
    sandbox.stub(t.context.query, 'exec').resolves(config);

    const serviceConfig = loadScript(t.context);
    const result = await serviceConfig.edit('oldName', 'newName', 100, 200, webhintConfigs);

    t.is(result.name, 'newName');
    t.is(result.jobCacheTime, 100);
    t.is(result.jobRunTime, 200);
    t.is(result.webhintConfigs, webhintConfigs);
    t.true(configMarkModifiedSpy.calledOnce);
    t.is(configMarkModifiedSpy.args[0][0], 'webhintConfigs');
});

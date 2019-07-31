import anyTest, { TestInterface } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

type MultiPartyObject = {
    parse: () => void;
};

type Multiparty = {
    Form: () => MultiPartyObject;
};

type MiscTestContext = {
    multiparty: Multiparty;
    multipartyFormStub: sinon.SinonStub;
    multipartyObject: MultiPartyObject;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestInterface<MiscTestContext>;

const loadScript = (context: MiscTestContext) => {
    return proxyquire('../../../src/lib/utils/misc', { multiparty: context.multiparty }).getDataFromRequest;
};

test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    t.context.multipartyObject = { parse(): void { } };

    t.context.multiparty = {
        Form() {
            return t.context.multipartyObject;
        }
    };
    t.context.multipartyFormStub = sandbox.stub(t.context.multiparty, 'Form').returns(t.context.multipartyObject);
    t.context.sandbox = sandbox;
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('getDataFromRequest should fail if there is an error parsing', async (t) => {
    const sandbox = t.context.sandbox;
    const errorMessage = 'error parsing data';

    const multipartyObjectParseStub = sandbox.stub(t.context.multipartyObject, 'parse').callsArgWith(1, errorMessage);

    t.plan(3);
    const getDataFromRequest = loadScript(t.context);

    try {
        await getDataFromRequest({} as any);
    } catch (err) {
        t.true(t.context.multipartyFormStub.calledOnce);
        t.true(multipartyObjectParseStub.calledOnce);
        t.is(err, errorMessage);
    }

    multipartyObjectParseStub.restore();
});

test('getDataFromRequest should return and object with the properties fields and files', async (t) => {
    const sandbox = t.context.sandbox;
    const fields = {
        hints: [],
        source: ['manual'],
        url: ['http://url.com']
    };

    const files = {
        'config-file': {
            path: 'path/to/file',
            size: 15
        }
    };

    const multipartyObjectParseStub = sandbox.stub(t.context.multipartyObject, 'parse').callsArgWith(1, null, fields, files);
    const getDataFromRequest = loadScript(t.context);
    const data = await getDataFromRequest({} as any);

    t.deepEqual(data.fields, fields);
    t.deepEqual(data.files, files);

    multipartyObjectParseStub.restore();
});

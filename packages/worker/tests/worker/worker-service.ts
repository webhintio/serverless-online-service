import * as fs from 'fs';

import anyTest, { TestInterface } from 'ava';
import { EventEmitter2 as EventEmitter } from 'eventemitter2';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';
import { appinsights, debug, delay, generateLog, HintStatus, JobStatus, logger, IJob } from '@online-service/utils';

type Queue = {
    sendMessage?: (j: any) => void;
};

type QueueObject = {
    Queue: () => Queue;
};

type ChildProcess = {
    ChildProcess: () => void;
    fork: () => EventEmitter;
}

const ntp = {
    getTime() {
        Promise.resolve({ now: new Date() });
    }
};

type WorkerTestContext = {
    childProcess: ChildProcess;
    childProcessForkStub: sinon.SinonStub;
    emitter: EventEmitter;
    queueObject: QueueObject;
    queueObjectQueueStub: sinon.SinonStub;
    resultsQueue: Queue;
    resultsQueueSendMessageStub: sinon.SinonStub;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestInterface<WorkerTestContext>;

const loadScript = (context: WorkerTestContext) => {
    return proxyquire('../../src/worker/worker', {
        '@online-service/utils': {
            appinsights,
            debug,
            generateLog,
            logger,
            ntp,
            Queue: context.queueObject.Queue
        },
        child_process: context.childProcess // eslint-disable-line camelcase
    });
};


test.beforeEach((t) => {
    const sandbox = sinon.createSandbox();

    t.context.resultsQueue = { sendMessage() { } };

    const Queue = function (): Queue {
        return t.context.resultsQueue;
    };

    const queueObject: QueueObject = { Queue };

    const queueObjectQueueStub = sandbox.stub(queueObject, 'Queue').returns(t.context.resultsQueue);

    t.context.queueObject = queueObject;

    t.context.queueObjectQueueStub = queueObjectQueueStub;
    t.context.sandbox = sandbox;
    t.context.childProcess = {
        ChildProcess() { },
        fork(): EventEmitter {
            return null as any;
        }
    };

    const emitter = new EventEmitter();


    (emitter as any).send = () => { };
    (emitter as any).kill = () => { };
    (emitter as any).stdout = new EventEmitter();
    (emitter as any).stderr = new EventEmitter();

    t.context.emitter = emitter;
    t.context.childProcessForkStub = sandbox.stub(t.context.childProcess, 'fork').returns(emitter);
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

const getHint = (name: string, hints: any) => {
    return hints.find((hint: any) => {
        return hint.name === name;
    });
};

test(`If there is no problem running webhint, it should send a couple of messages with the current status`, async (t) => {
    const sandbox = t.context.sandbox;
    const job = {
        config: [{ hints: { 'content-type': 'warning' } }],
        error: null,
        finished: null as any,
        hints: [{
            category: 'compatibility',
            messages: [],
            name: 'content-type',
            status: 'pending'
        }],
        id: '0',
        maxRunTime: 100,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage');

    const worker = loadScript(t.context);

    const promise = worker.run(job);

    // Wait a little bit to ensure that 'runWebhint' was launched
    await delay(500);
    await t.context.emitter.emitAsync('message', {
        messages: [],
        ok: true
    });

    await promise;

    t.true(t.context.resultsQueueSendMessageStub.calledTwice);
    t.is(t.context.resultsQueueSendMessageStub.args[1][0].status, JobStatus.finished);
});

test(`If there is a problem running webhint, it should send a couple of messages with the current status`, async (t) => {
    const sandbox = t.context.sandbox;
    const job = {
        config: [{}],
        error: null,
        finished: null as any,
        hints: [],
        id: '0',
        maxRunTime: 100,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage');

    const worker = loadScript(t.context);

    const promise = worker.run(job);

    // Wait a little bit to ensure that 'runWebhint' was launched
    await delay(500);
    await t.context.emitter.emitAsync('message', {
        error: '"Error running webhint"',
        ok: false
    });

    await promise;

    t.true(t.context.resultsQueueSendMessageStub.calledTwice);
    t.is(t.context.resultsQueueSendMessageStub.args[1][0].status, JobStatus.error);
});

test(`If there is a problem running webhint, the job sent to the queue has all hints in the configuration set as error`, async (t) => {
    const sandbox = t.context.sandbox;
    const job = {
        config: [{
            hints: {
                axe: 'warning',
                'content-type': 'error',
                'disown-opener': ['off', {}]
            }
        }],
        error: null,
        finished: null as any,
        hints: [
            {
                category: 'accessibility',
                messages: [],
                name: 'axe',
                status: HintStatus.pending
            },
            {
                category: 'compatibility',
                messages: [],
                name: 'content-type',
                status: HintStatus.pending
            },
            {
                category: 'security',
                messages: [],
                name: 'disown-opener',
                status: HintStatus.pending
            },
            {
                category: 'pwa',
                messages: [],
                name: 'manifest-exists',
                status: HintStatus.pending
            }
        ],
        id: '0',
        maxRunTime: 100,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage');

    const worker = loadScript(t.context);
    const promise = worker.run(job);

    // Wait a little bit to ensure that 'runWebhint' was launched
    await delay(500);
    await t.context.emitter.emitAsync('message', {
        error: '"Error running webhint"',
        ok: false
    });

    await promise;

    const jobSent = t.context.resultsQueueSendMessageStub.args[1][0];
    const hints = jobSent.hints;
    const axe = getHint('axe', hints);
    const contentType = getHint('content-type', hints);
    const disown = getHint('disown-opener', hints);
    const manifest = getHint('manifest-exists', hints);

    t.true(t.context.resultsQueueSendMessageStub.calledTwice);
    t.is(jobSent.status, JobStatus.error);
    t.is(axe.status, HintStatus.error);
    t.is(contentType.status, HintStatus.error);
    t.is(disown.status, HintStatus.off);
    t.is(manifest.status, HintStatus.pending);
});

test(`If a message is too big for Service Bus, we should send the hint with just one common error message`, async (t) => {
    const sandbox = t.context.sandbox;
    const job = {
        config: [{ hints: { axe: 'error' } }],
        error: null,
        finished: null as any,
        hints: [
            {
                category: 'accessibility',
                messages: [],
                name: 'axe',
                status: HintStatus.pending
            },
            {
                category: 'compatibility',
                messages: [],
                name: 'content-type',
                status: HintStatus.pending
            }
        ],
        id: '0',
        maxRunTime: 100,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.plan(3);

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage')
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .callsFake((j): void => {
            // j.hints change in each call, so we need to test the value here for the second call.
            t.is(j.hints[0].messages.length, 2);

            const err = { statusCode: 413 };

            throw err;
        })
        .onThirdCall()
        .resolves();

    const worker = loadScript(t.context);

    const promise = worker.run(job);

    // Wait a little bit to ensure that 'runWebhint' was launched
    await delay(500);
    await t.context.emitter.emitAsync('message', {
        messages: [{
            hintId: 'axe',
            message: 'First of a tons of messages'
        }, {
            hintId: 'axe',
            message: 'Second of a tons of messages'
        }],
        ok: true
    });

    await promise;

    const jobSent = t.context.resultsQueueSendMessageStub.args[2][0];

    t.is(t.context.resultsQueueSendMessageStub.callCount, 3);
    t.is(jobSent.hints[0].messages.length, 1);
});

test(`If there is no problem running webhint, it should send to the queue one message if the size is smaller than MAX_MESSAGE_SIZE`, async (t) => {
    const sandbox = t.context.sandbox;
    const job = {
        config: [{
            hints: {
                axe: 'warning',
                'content-type': 'error'
            }
        }],
        error: null,
        finished: null as any,
        hints: [
            {
                category: 'accessibility',
                messages: [],
                name: 'axe',
                status: HintStatus.pending
            },
            {
                category: 'compatibility',
                messages: [],
                name: 'content-type',
                status: HintStatus.pending
            },
            {
                category: 'security',
                messages: [],
                name: 'disown-opener',
                status: HintStatus.pending
            }
        ],
        id: '0',
        maxRunTime: 100,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage')
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .resolves();

    const worker = loadScript(t.context);

    const promise = worker.run(job);

    // Wait a little bit to ensure that 'runWebhint' was launched
    await delay(500);
    await t.context.emitter.emitAsync('message', {
        messages: [{
            hintId: 'axe',
            message: 'Warning 1 axe'
        },
        {
            hintId: 'axe',
            message: 'Warning 2 axe'
        }],
        ok: true
    });

    await promise;

    const axe = getHint('axe', t.context.resultsQueueSendMessageStub.args[1][0].hints);
    const contentType = getHint('content-type', t.context.resultsQueueSendMessageStub.args[1][0].hints);

    t.is(t.context.resultsQueueSendMessageStub.callCount, 2);
    t.is(axe.status, HintStatus.warning);
    t.is(contentType.status, HintStatus.pass);
});

test(`If there is no problem running webhint, it should send to the queue 2 messages if the total size is bigger than MAX_MESSAGE_SIZE`, async (t) => {
    const sandbox = t.context.sandbox;
    const lipsum = fs.readFileSync(`${__dirname}/fixtures/lipsum.txt`, 'utf-8'); // eslint-disable-line no-sync
    const job = {
        config: [{
            hints: {
                axe: 'warning',
                'content-type': 'error'
            }
        }],
        error: null,
        finished: null as any,
        hints: [
            {
                category: 'accessibility',
                messages: [],
                name: 'axe',
                status: HintStatus.pending
            },
            {
                category: 'compatibility',
                messages: [],
                name: 'content-type',
                status: HintStatus.pending
            }
        ],
        id: '0',
        maxRunTime: 100,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage')
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .resolves();

    const worker = loadScript(t.context);

    const promise = worker.run(job);

    // Wait a little bit to ensure that 'runWebhint' was launched
    await delay(500);
    await t.context.emitter.emitAsync('message', {
        messages: [{
            hintId: 'axe',
            message: lipsum
        },
        {
            hintId: 'content-type',
            message: lipsum
        }],
        ok: true
    });

    await promise;

    t.is(t.context.resultsQueueSendMessageStub.callCount, 3);
});


test(`If there is no problem running webhint, it should send a "Too many errors" message if the messages are bigger than MAX_MESSAGE_SIZE`, async (t) => {
    const sandbox = t.context.sandbox;
    const lipsum = fs.readFileSync(`${__dirname}/fixtures/lipsum.txt`, 'utf-8'); // eslint-disable-line no-sync
    const job = {
        config: [{
            hints: {
                axe: 'warning',
                'content-type': 'error'
            }
        }],
        error: null,
        finished: null as any,
        hints: [
            {
                category: 'accessibility',
                messages: [],
                name: 'axe',
                status: HintStatus.pending
            },
            {
                category: 'compatibility',
                messages: [],
                name: 'content-type',
                status: HintStatus.pending
            }
        ],
        id: '0',
        maxRunTime: 100,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage')
        .onFirstCall()
        .resolves();

    const worker = loadScript(t.context);
    const promise = worker.run(job);

    // Wait a little bit to ensure that 'runWebhint' was launched
    await delay(500);
    await t.context.emitter.emitAsync('message', {
        messages: [{
            hintId: 'axe',
            message: lipsum + lipsum
        }],
        ok: true
    });

    await promise;

    const axe = getHint('axe', t.context.resultsQueueSendMessageStub.args[1][0].hints);

    t.is(t.context.resultsQueueSendMessageStub.callCount, 2);
    t.is(axe.status, HintStatus.warning);
    t.is(axe.messages.length, 1);
    t.is(axe.messages[0].message, 'This hint has too many errors, please use webhint locally for more details');
});

test(`If webhint doesn't finish before the job.maxRunTime, it should report an error message to the queue, but the job status is finished`, async (t) => {
    const sandbox = t.context.sandbox;
    const job = {
        config: [{}],
        error: null,
        finished: null as any,
        hints: [],
        id: '0',
        maxRunTime: 1,
        partInfo: {
            part: 1,
            totalParts: 5
        },
        queued: new Date(),
        started: null as any,
        status: JobStatus.pending,
        url: 'http://webhint.io',
        webhintVersion: '0'
    } as IJob;

    t.context.resultsQueueSendMessageStub = sandbox.stub(t.context.resultsQueue, 'sendMessage');

    const worker = loadScript(t.context);

    await worker.run(job);

    t.true(t.context.resultsQueueSendMessageStub.calledTwice);

    const queueArgs = t.context.resultsQueueSendMessageStub.args[1][0];

    t.is(queueArgs.status, JobStatus.finished);
    t.is(queueArgs.error.message, 'TIMEOUT');
});

const AzureServiceBus = require('./azure.svcbus'); // Adjust path as needed

// Mock the Azure Service Bus SDK
jest.mock('@azure/service-bus', () => ({
    ServiceBusClient: jest.fn()
}));

// Mock the Azure Identity SDK
jest.mock('@azure/identity', () => ({
    DefaultAzureCredential: jest.fn()
}));

// Mock WebSocket
jest.mock('ws', () => jest.fn());

describe('AzureServiceBus', () => {
    let mockServiceBusClient;
    let mockSender;
    let mockReceiver;
    let mockCredential;
    let azureServiceBus;
    let consoleSpy;

    const testNamespace = 'test-namespace.servicebus.windows.net';
    const testQueueName = 'test-queue';

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock console methods
        consoleSpy = {
            debug: jest.spyOn(console, 'debug').mockImplementation(),
            error: jest.spyOn(console, 'error').mockImplementation(),
            log: jest.spyOn(console, 'log').mockImplementation()
        };

        // Setup mocks
        mockSender = {
            sendMessages: jest.fn(),
            close: jest.fn()
        };

        mockReceiver = {
            subscribe: jest.fn()
        };

        mockServiceBusClient = {
            createSender: jest.fn().mockReturnValue(mockSender),
            createReceiver: jest.fn().mockReturnValue(mockReceiver),
            close: jest.fn()
        };

        mockCredential = {};

        // Mock constructors
        const { ServiceBusClient } = require('@azure/service-bus');
        const { DefaultAzureCredential } = require('@azure/identity');
        
        ServiceBusClient.mockImplementation(() => mockServiceBusClient);
        DefaultAzureCredential.mockImplementation(() => mockCredential);

        azureServiceBus = new AzureServiceBus(testNamespace, testQueueName);
    });

    afterEach(() => {
        // Restore console methods
        Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    });

    describe('constructor', () => {
        it('should initialize with correct parameters', () => {
            expect(azureServiceBus.fullyQualifiedNamespace).toBe(testNamespace);
            expect(azureServiceBus.queueName).toBe(testQueueName);
        });

        it('should create DefaultAzureCredential', () => {
            const { DefaultAzureCredential } = require('@azure/identity');
            expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
        });

        it('should create ServiceBusClient with websocket options', () => {
            const { ServiceBusClient } = require('@azure/service-bus');
            const WebSocket = require('ws');
            
            expect(ServiceBusClient).toHaveBeenCalledWith(
                testNamespace,
                mockCredential,
                {
                    webSocketOptions: {
                        webSocket: WebSocket,
                        url: `wss://${testNamespace}:443/$servicebus/websocket`
                    }
                }
            );
        });

        it('should create sender for the specified queue', () => {
            expect(mockServiceBusClient.createSender).toHaveBeenCalledWith(testQueueName);
            expect(azureServiceBus.sender).toBe(mockSender);
        });
    });

    describe('sendJson', () => {
        const testMessage = { test: 'data', id: 123 };

        it('should send message successfully', async () => {
            mockSender.sendMessages.mockResolvedValue();

            await azureServiceBus.sendJson(testMessage);

            expect(mockSender.sendMessages).toHaveBeenCalledWith({
                body: testMessage
            });
            expect(consoleSpy.debug).toHaveBeenCalledWith('AzureServiceBus: sendJson: start');
            expect(consoleSpy.debug).toHaveBeenCalledWith(
                `'AzureServiceBus: sendJson: Message sent to queue "${testQueueName}" successfully.`
            );
        });

        it('should handle send message error', async () => {
            const error = new Error('Send failed');
            mockSender.sendMessages.mockRejectedValue(error);

            await expect(azureServiceBus.sendJson(testMessage)).rejects.toThrow('Send failed');
            
            expect(consoleSpy.error).toHaveBeenCalledWith(
                "Error:'AzureServiceBus: sendJson: sending message:",
                error
            );
        });

        it('should send different types of JSON objects', async () => {
            mockSender.sendMessages.mockResolvedValue();

            const testCases = [
                { simple: 'string' },
                { number: 42 },
                { array: [1, 2, 3] },
                { nested: { deep: { value: true } } },
                null,
                []
            ];

            for (const testCase of testCases) {
                await azureServiceBus.sendJson(testCase);
                expect(mockSender.sendMessages).toHaveBeenCalledWith({
                    body: testCase
                });
            }
        });
    });

    describe('subscribe', () => {
        let mockCallback;

        beforeEach(() => {
            mockCallback = jest.fn();
        });

        it('should subscribe to queue successfully', async () => {
            mockReceiver.subscribe.mockImplementation();

            await azureServiceBus.subscribe(mockCallback);

            expect(mockServiceBusClient.createReceiver).toHaveBeenCalledWith(testQueueName);
            expect(mockReceiver.subscribe).toHaveBeenCalledWith(
                {
                    processMessage: expect.any(Function),
                    processError: expect.any(Function)
                },
                {
                    autoCompleteMessages: true
                }
            );
            expect(consoleSpy.log).toHaveBeenCalledWith(
                `AzureServiceBus: Subscribed to queue "${testQueueName}".`
            );
        });

        it('should handle subscribe error', async () => {
            const error = new Error('Subscribe failed');
            mockServiceBusClient.createReceiver.mockImplementation(() => {
                throw error;
            });

            await expect(azureServiceBus.subscribe(mockCallback)).rejects.toThrow('Subscribe failed');
            
            expect(consoleSpy.error).toHaveBeenCalledWith(
                'Error subscribing to queue:',
                error
            );
        });

        it('should process received messages correctly', async () => {
            let processMessage;
            mockReceiver.subscribe.mockImplementation((handlers) => {
                processMessage = handlers.processMessage;
            });

            await azureServiceBus.subscribe(mockCallback);

            const testMessage = { body: { test: 'received data' } };
            await processMessage(testMessage);

            expect(consoleSpy.log).toHaveBeenCalledWith(
                "'AzureServiceBus: subscribe: Received message:",
                testMessage.body
            );
            expect(mockCallback).toHaveBeenCalledWith(testMessage.body);
        });

        it('should handle processMessage without callback', async () => {
            let processMessage;
            mockReceiver.subscribe.mockImplementation((handlers) => {
                processMessage = handlers.processMessage;
            });

            await azureServiceBus.subscribe();

            const testMessage = { body: { test: 'received data' } };
            await expect(processMessage(testMessage)).resolves.not.toThrow();

            expect(consoleSpy.log).toHaveBeenCalledWith(
                "'AzureServiceBus: subscribe: Received message:",
                testMessage.body
            );
        });

        it('should handle processMessage with non-function callback', async () => {
            let processMessage;
            mockReceiver.subscribe.mockImplementation((handlers) => {
                processMessage = handlers.processMessage;
            });

            await azureServiceBus.subscribe('not a function');

            const testMessage = { body: { test: 'received data' } };
            await expect(processMessage(testMessage)).resolves.not.toThrow();
        });

        it('should handle processError correctly', async () => {
            let processError;
            mockReceiver.subscribe.mockImplementation((handlers) => {
                processError = handlers.processError;
            });

            await azureServiceBus.subscribe(mockCallback);

            const testError = new Error('Processing error');
            await processError(testError);

            expect(consoleSpy.error).toHaveBeenCalledWith(
                'Error:AzureServiceBus: subscribe: receiving message:',
                testError
            );
        });

        it('should handle callback errors gracefully', async () => {
            let processMessage;
            mockReceiver.subscribe.mockImplementation((handlers) => {
                processMessage = handlers.processMessage;
            });

            const errorCallback = jest.fn().mockRejectedValue(new Error('Callback error'));
            await azureServiceBus.subscribe(errorCallback);

            const testMessage = { body: { test: 'data' } };
            
            // The processMessage should not throw even if callback fails
            await expect(processMessage(testMessage)).rejects.toThrow('Callback error');
            expect(errorCallback).toHaveBeenCalledWith(testMessage.body);
        });
    });

    describe('close', () => {
        it('should close sender and client connections', async () => {
            mockSender.close.mockResolvedValue();
            mockServiceBusClient.close.mockResolvedValue();

            await azureServiceBus.close();

            expect(mockSender.close).toHaveBeenCalledTimes(1);
            expect(mockServiceBusClient.close).toHaveBeenCalledTimes(1);
            expect(consoleSpy.log).toHaveBeenCalledWith('Service Bus connection closed.');
        });

        it('should handle close errors', async () => {
            const senderError = new Error('Sender close failed');
            mockSender.close.mockRejectedValue(senderError);

            await expect(azureServiceBus.close()).rejects.toThrow('Sender close failed');
        });

        it('should handle client close errors', async () => {
            mockSender.close.mockResolvedValue();
            const clientError = new Error('Client close failed');
            mockServiceBusClient.close.mockRejectedValue(clientError);

            await expect(azureServiceBus.close()).rejects.toThrow('Client close failed');
        });
    });

    describe('integration scenarios', () => {
        it('should handle complete workflow: send, subscribe, close', async () => {
            mockSender.sendMessages.mockResolvedValue();
            mockSender.close.mockResolvedValue();
            mockServiceBusClient.close.mockResolvedValue();

            const callback = jest.fn();
            const message = { data: 'test' };

            // Send message
            await azureServiceBus.sendJson(message);
            expect(mockSender.sendMessages).toHaveBeenCalledWith({ body: message });

            // Subscribe
            await azureServiceBus.subscribe(callback);
            expect(mockReceiver.subscribe).toHaveBeenCalled();

            // Close
            await azureServiceBus.close();
            expect(mockSender.close).toHaveBeenCalled();
            expect(mockServiceBusClient.close).toHaveBeenCalled();
        });

        it('should maintain separate instances with different configurations', () => {
            const secondNamespace = 'second-namespace.servicebus.windows.net';
            const secondQueue = 'second-queue';
            
            const secondInstance = new AzureServiceBus(secondNamespace, secondQueue);

            expect(secondInstance.fullyQualifiedNamespace).toBe(secondNamespace);
            expect(secondInstance.queueName).toBe(secondQueue);
            expect(secondInstance).not.toBe(azureServiceBus);
        });
    });
});
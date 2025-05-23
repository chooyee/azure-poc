const AzureServiceBus = require('./azure.svcbus.js'); // Adjust path
const { ServiceBusClient } = require('@azure/service-bus');
const { DefaultAzureCredential } = require('@azure/identity');

jest.mock('@azure/identity');
jest.mock('@azure/service-bus');

describe('AzureServiceBus', () => {
  let mockServiceBusClientInstance;
  let mockSenderInstance;
  let mockReceiverInstance;
  let mockDefaultAzureCredentialInstance;

  const FQNS = 'your-namespace.servicebus.windows.net';
  const QUEUE_NAME = 'test-queue';

  beforeEach(() => {
    jest.resetAllMocks();

    mockDefaultAzureCredentialInstance = {};
    DefaultAzureCredential.mockImplementation(() => mockDefaultAzureCredentialInstance);

    mockSenderInstance = {
      sendMessages: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };

    mockReceiverInstance = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      // Added close mock for receiver
      close: jest.fn().mockResolvedValue(undefined) 
    };
    
    mockServiceBusClientInstance = {
      createSender: jest.fn().mockReturnValue(mockSenderInstance),
      createReceiver: jest.fn().mockReturnValue(mockReceiverInstance),
      close: jest.fn().mockResolvedValue(undefined)
    };
    ServiceBusClient.mockImplementation(() => mockServiceBusClientInstance);
  });

  // Test Suite for Constructor
  describe('Constructor', () => {
    test('should initialize ServiceBusClient and Sender correctly', () => {
      new AzureServiceBus(FQNS, QUEUE_NAME);
      expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
      expect(ServiceBusClient).toHaveBeenCalledWith(FQNS, mockDefaultAzureCredentialInstance);
      expect(mockServiceBusClientInstance.createSender).toHaveBeenCalledWith(QUEUE_NAME);
    });
  });

  // Test Suite for sendJson method
  describe('sendJson', () => {
    test('should send a JSON message to the queue', async () => {
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      const messageJson = { data: 'test_payload', id: 123 };
      await serviceBus.sendJson(messageJson);
      expect(mockSenderInstance.sendMessages).toHaveBeenCalledWith({ body: messageJson });
    });

    test('should re-throw error if sender.sendMessages fails', async () => {
      const sendError = new Error('Failed to send message');
      mockSenderInstance.sendMessages.mockRejectedValue(sendError);
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      await expect(serviceBus.sendJson({ data: 'test' })).rejects.toThrow(sendError);
    });
  });

  // Test Suite for subscribe method
  describe('subscribe', () => {
    test('should create a receiver and call subscribe', async () => {
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      const mockCallback = jest.fn();
      await serviceBus.subscribe(mockCallback); 

      expect(mockServiceBusClientInstance.createReceiver).toHaveBeenCalledWith(QUEUE_NAME);
      expect(mockReceiverInstance.subscribe).toHaveBeenCalledTimes(1);
      expect(mockReceiverInstance.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          processMessage: expect.any(Function),
          processError: expect.any(Function)
        }),
        { autoCompleteMessages: true }
      );
    });

    test('should call the callback when processMessage is invoked', async () => {
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      const mockCallback = jest.fn();
      await serviceBus.subscribe(mockCallback);

      const processMessageFunc = mockReceiverInstance.subscribe.mock.calls[0][0].processMessage;
      const testMessage = { body: { data: 'from_test_message' } };
      await processMessageFunc(testMessage);
      expect(mockCallback).toHaveBeenCalledWith(testMessage.body);
    });
    
    test('should log error when processError is invoked', async () => {
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      const mockCallback = jest.fn(); 
      await serviceBus.subscribe(mockCallback);

      const processErrorFunc = mockReceiverInstance.subscribe.mock.calls[0][0].processError;
      const testError = new Error('Test subscription error');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); 
      
      await processErrorFunc(testError);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error receiving message:", testError);
      consoleErrorSpy.mockRestore();
    });

    test('should re-throw error if sbClient.createReceiver fails', async () => {
      const receiverError = new Error('Failed to create receiver');
      mockServiceBusClientInstance.createReceiver.mockImplementation(() => { throw receiverError; });
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      await expect(serviceBus.subscribe(jest.fn())).rejects.toThrow(receiverError);
    });
  });

  // Test Suite for close method
  describe('close', () => {
    test('should close sender, receiver (if exists), and ServiceBusClient', async () => {
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      // Call subscribe to ensure receiver is created
      await serviceBus.subscribe(jest.fn()); 
      await serviceBus.close();

      expect(mockSenderInstance.close).toHaveBeenCalledTimes(1);
      expect(mockReceiverInstance.close).toHaveBeenCalledTimes(1); 
      expect(mockServiceBusClientInstance.close).toHaveBeenCalledTimes(1);
    });
    
    test('should close sender and ServiceBusClient even if receiver was not created', async () => {
      const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
      await serviceBus.close();

      expect(mockSenderInstance.close).toHaveBeenCalledTimes(1);
      expect(mockReceiverInstance.close).not.toHaveBeenCalled(); 
      expect(mockServiceBusClientInstance.close).toHaveBeenCalledTimes(1);
    });


    test('should re-throw error if sender.close fails', async () => {
        const closeError = new Error('Sender close failed');
        mockSenderInstance.close.mockRejectedValue(closeError);
        const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
        await expect(serviceBus.close()).rejects.toThrow(closeError);
        expect(mockServiceBusClientInstance.close).not.toHaveBeenCalled(); 
    });

    test('should re-throw error if receiver.close fails (and sender succeeded)', async () => {
        const receiverCloseError = new Error('Receiver close failed');
        mockReceiverInstance.close.mockRejectedValue(receiverCloseError); 
        const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
        await serviceBus.subscribe(jest.fn()); 
        await expect(serviceBus.close()).rejects.toThrow(receiverCloseError);
        expect(mockSenderInstance.close).toHaveBeenCalledTimes(1); 
        expect(mockServiceBusClientInstance.close).not.toHaveBeenCalled(); 
    });

    test('should re-throw error if sbClient.close fails (and sender/receiver succeeded)', async () => {
        const clientCloseError = new Error('Client close failed');
        mockServiceBusClientInstance.close.mockRejectedValue(clientCloseError);
        const serviceBus = new AzureServiceBus(FQNS, QUEUE_NAME);
        await serviceBus.subscribe(jest.fn()); 
        await expect(serviceBus.close()).rejects.toThrow(clientCloseError);
        expect(mockSenderInstance.close).toHaveBeenCalledTimes(1); 
        expect(mockReceiverInstance.close).toHaveBeenCalledTimes(1); 
    });
  });
});

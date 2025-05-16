
const { ServiceBusClient } = require("@azure/service-bus");
const { DefaultAzureCredential } = require("@azure/identity");

class AzureServiceBus {
    // Instead of a connection string, use the fully qualified namespace (e.g. "your-namespace.servicebus.windows.net")
    constructor(fullyQualifiedNamespace, queueName) {
        this.fullyQualifiedNamespace = fullyQualifiedNamespace;
        this.queueName = queueName;
        const credential = new DefaultAzureCredential();
        this.sbClient = new ServiceBusClient(this.fullyQualifiedNamespace, credential);
        this.sender = this.sbClient.createSender(this.queueName);
    }

    // Sends a JSON object as a message to the Azure Service Bus queue.
    async sendJson(messageJson) {
        try {
            const message = { body: messageJson };
            await this.sender.sendMessages(message);
            console.log(`Message sent to queue "${this.queueName}" successfully.`);
        } catch (err) {
            console.error("Error sending message:", err);
            throw err;
        }
    }
    async subscribe(callback) {
        try {
            const receiver = this.sbClient.createReceiver(this.queueName);
            receiver.subscribe(
                {
                    processMessage: async (message) => {
                        console.log("Received message:", message.body);
                        if (callback && typeof callback === "function") {
                            await callback(message.body);
                        }
                    },
                    processError: async (err) => {
                        console.error("Error receiving message:", err);
                    }
                },
                {
                    autoCompleteMessages: true
                }
            );
            console.log(`AzureServiceBus: Subscribed to queue "${this.queueName}".`);
        } catch (err) {
            console.error("Error subscribing to queue:", err);
            throw err;
        }
    }
    // Closes the sender and client connections.
    async close() {
        await this.sender.close();
        await this.sbClient.close();
        console.log("Service Bus connection closed.");
    }
}

module.exports = AzureServiceBus;
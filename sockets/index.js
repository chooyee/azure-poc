const fs = require("fs").promises;
const path = require("path");
const MLKemEncryption = require("../factory/mlkem.js");
const AESEncryption = require("../factory/aes");
// const { DefaultAzureCredential } = require("@azure/identity");
// const { SecretClient } = require("@azure/keyvault-secrets");
// const { KeyClient } = require("@azure/keyvault-keys");

module.exports = (io) => {
    const clients = new Map();

    // Create a separate namespace for monitoring
    const monitorNamespace = io.of('/monitor');
    // Store recent messages for new monitor connections
    const recentMessages = [];
    const MAX_RECENT_MESSAGES = 100;

    // Monitor namespace connection handling
    monitorNamespace.on('connection', (socket) => {
        console.log('Monitor connected:', socket.id);

        // Send recent messages to new monitor
        socket.emit('recent_messages', recentMessages);

        socket.on('disconnect', () => {
            console.log('Monitor disconnected:', socket.id);
        });
    });

    async function emitMonitor(socketId, event, data, received = true) {
        const timestamp = new Date().toISOString();
        const messageData = {
            timestamp,
            socketId: socketId,
            event: event,
            data: data,
        };

        let header = 'message_received';
        if (!received) header = 'message_sent';

        recentMessages.push(messageData);
            if (recentMessages.length > MAX_RECENT_MESSAGES) {
                recentMessages.shift();
            }
        monitorNamespace.emit(header, messageData);
    };

    io.on("connection", (socket) => {
        console.log("New client connected:", socket.id);

        // Forward all events to the monitor
        const originalOnevent = socket.onevent;
        socket.onevent = function(packet) {
            const args = packet.data || [];
            console.log("socket.onevent: "+ args[0])
            // Call the original handler
            originalOnevent.call(this, packet);
            
            // Don't monitor internal events (those starting with underscore)
            if (args[0] && typeof args[0] === 'string' && !args[0].startsWith('_')) {
                
                
                // // Store the message
                // recentMessages.push(messageData);
                // if (recentMessages.length > MAX_RECENT_MESSAGES) {
                //     recentMessages.shift();
                // }
                
                // Forward to monitor
                //monitorNamespace.emit('message_received', messageData);
                emitMonitor(socket.id, args[0], args.slice(1));
            }
        };

        const originalEmit = socket.emit;
        socket.emit = function(event, ...args) {
            console.log("socket emit " + event)
            // Call the original emit
            const result = originalEmit.apply(this, [event, ...args]);
            
            // Don't monitor internal events or acknowledgements
            if (typeof event === 'string' && !event.startsWith('_')) {
                
                // // Store the message
                // recentMessages.push(messageData);
                // if (recentMessages.length > MAX_RECENT_MESSAGES) {
                //     recentMessages.shift();
                // }

                // Forward to monitor               
                emitMonitor(socket.id, event, args, false);
            }
            
            return result;
        };
        socket.on("handshake", async (data) => {
            console.log(`Handshake received: ${data.senderName}, ${data.bonShared}`);
            
            const { publicKey, secretKey } = await MLKemEncryption.generateKeyPair();
            console.log("Public Key:", publicKey);
            console.log("Secret Key:", secretKey);
          
            // Store the secretKey in Azure Key Vault
            // try {
            //     const vaultUrl = process.env.AZURE_KEY_VAULT_URL;  // Ensure you set this environment variable
            //     const credential = new DefaultAzureCredential();
            //     const secretClient = new SecretClient(vaultUrl, credential);
                
            //     for await (const secretProperties of secretClient.listPropertiesOfSecrets()){

            //         // do something with properties
            //         console.log(`Secret name: ${secretProperties.name}`);
                  
            //     }
            //     const keyName = socket.id.replace(/[^a-zA-Z0-9\s]/g, '');
            //     // Use a unique secret name, e.g. including the socket.id
            //     const publicKeyName = `socket-${keyName}-publicKey`;
            //     await secretClient.setSecret(publicKeyName, publicKey);

            //     const secretName = `socket-${keyName}-secretKey`;
            //     await secretClient.setSecret(secretName, secretKey);
            //     console.log("SecretKey stored in Azure Key Vault under name:", secretName);
            // } catch (err) {
            // console.error("Failed to store secretKey in Azure Key Vault:", err);
            // }

            const clientId = socket.id;
            clients.set(clientId, {
                senderName: data.senderName,
                key: null,
                chunks: [], // Initialize chunks array for file transfer
                publicKey: publicKey,
                secretKey: secretKey,
            });
           
            socket.emit("handshake_ack", { status: "success", publicKey: publicKey });
        });

        socket.on("secretmsg", async (data, callback) => {
            const eventId = "secretmsg";
            let callbackResult = {};
            const clientId = socket.id;
            const clientData = clients.get(clientId);
            if (!clientData) {
                const errormsg = `Client Id [${socket.id}] does not exists!`;
                callbackResult = {status:"failed", message: errormsg };
                callback(callbackResult);
                emitMonitor(socket.id, `${eventId}_ack`, callbackResult);
                return;
            }

            try {
                const secretMsg = await AESEncryption.decryptData(
                    data.secretMsg.encryptedData,
                    data.secretMsg.iv,
                    clientData.key
                );
                console.log("secretMsg: " + secretMsg);
                callbackResult = { status: "success", secretMsg: secretMsg };
                callback({ status: "success" });
                emitMonitor(socket.id, `${eventId}_ack`, callbackResult);
            } catch (error) {
                console.error("Decryption error:", error);
                callback({ status: "error", message: "Failed to decrypt message" });
            }
        });

        socket.on("bobshared", (data, callback) => {
            const eventId = "bobshared";
            let callbackResult = {};
            const clientId = socket.id;
            const clientData = clients.get(clientId);
            if (!clientData) {
                const errormsg = `Client Id [${socket.id}] does not exists!`;
                callbackResult = {status:"failed", message: errormsg };
                callback(callbackResult);
                emitMonitor(socket.id, `${eventId}_ack`, callbackResult);
                return;
            };

            MLKemEncryption.decrypt(data.cipherText, clientData.secretKey).then((sharedSecret) => {
                console.log("Shared Secret: " + sharedSecret);
                clientData.key = sharedSecret;
                callbackResult = { status: "success" };
                callback(callbackResult);
                emitMonitor(socket.id, `${eventId}_ack`, callbackResult);
            });
            
        });

        socket.on("secretfile", async (data, callback) => {
            const eventId = "secretfile";
            const clientId = socket.id;
            let callBackResult = {};
            const clientData = clients.get(clientId);
            if (!clientData) {
                const errormsg = `Client Id [${socket.id}] does not exists!`;
                callBackResult = {status:"failed", message: errormsg };
                callback(callBackResult);
                emitMonitor(socket.id, `${eventId}_ack`, callbackResult);
                return;
            }

            try {
                const secretFileArrayBuffer = await AESEncryption.decryptFile(
                    data.secretFile.encryptedData,
                    data.secretFile.iv,
                    clientData.key
                );
                
                const ext = path.extname(data.secretFile.fileName);
                const filename = `${data.secretFile.fileName}-${Date.now()}${ext}`;
                
                await fs.writeFile(
                    `./uploads/${filename}`,
                    Buffer.from(secretFileArrayBuffer)
                );
                
                console.log("File saved");
                //socket.emit("file_received_ack", { status: "success", fileName: filename });
                callbackResult = {status:"success", fileName: filename };
                callback(callbackResult);
                emitMonitor(socket.id, `${eventId}_ack`, callbackResult);
            } catch (error) {
                console.error("Error processing file:", error);
                socket.emit("error", { message: "Failed to process file" });
            }
        });

        socket.on("chunk", (data) => {
            const clientId = socket.id;
            const clientData = clients.get(clientId);
            if (!clientData) {
                socket.emit("error", { message: "Handshake required" });
                return;
            }

            const chunk = Buffer.isBuffer(data.chunk)
                ? data.chunk
                : Buffer.from(data.chunk, "base64");
            clientData.chunks.push(chunk);
            console.log(`Received chunk #${clientData.chunks.length}`);
        });

        socket.on("end", () => {
            const clientId = socket.id;
            const clientData = clients.get(clientId);
            if (!clientData) {
                socket.emit("error", { message: "No client data" });
                return;
            }

            const outputPath = path.join(__dirname, "../../uploads", `${clientData.fileName}`);
            const fullFile = Buffer.concat(clientData.chunks);
            fs.writeFileSync(outputPath, fullFile);
            console.log(`File saved: ${outputPath}`);

            socket.emit("file_received", { fileName: clientData.fileName });
            clients.delete(clientId);
        });

        socket.on("disconnect", () => {
            const clientId = socket.id;
            clients.delete(clientId);
            console.log("Client disconnected:", clientId);
        });

        socket.on("error", (err) => {
            console.error("Socket.IO error:", err);
        });
    });
};

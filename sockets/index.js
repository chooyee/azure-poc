const fs = require("fs").promises;
const path = require("path");
const MLKemEncryption = require("../factory/mlkem.js");
const AESEncryption = require("../factory/aes");
const FileStorageService = require('../services/filestore.service');
const AzureSvcBusService = require('../services/azuresvcbus.service');
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

        socket.on("handshake", async (data, callback) => {
            console.log(`Handshake received: ${data.senderName}, ${data.bonShared}`);
            
            const { publicKey, secretKey } = await MLKemEncryption.generateKeyPair();
            // console.log("Public Key:", publicKey);
            // console.log("Secret Key:", secretKey);
          
            /* Store the secretKey in Azure Key Vault
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
            */

            const clientId = socket.id;
            clients.set(clientId, {
                senderName: data.senderName,
                key: null,
                chunks: [], // Initialize chunks array for file transfer
                publicKey: publicKey,
                secretKey: secretKey,
                incomingMessages: new Map()
            });           
         
            callback({ status: "success", publicKey: publicKey });
            //socket.emit("handshake_ack", { status: "success", publicKey: publicKey });
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
            console.debug('secretfile: ' + socket.id)
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
              
                const fsService = new FileStorageService(filename, Buffer.from(secretFileArrayBuffer));
                const result = await fsService.StoreSecretFile();
                
                console.debug('StoreSecretFile Result:' + JSON.stringify(result));
                const svcbus = new AzureSvcBusService(process.env.AZURE_SVCBUS_NAMESPACE, process.env.AZURE_SVCBUS_QUEUE);
                await svcbus.SendJson(JSON.stringify(result));  

                callbackResult = {status:"success", fileName: filename };
                callback(callbackResult);
                emitMonitor(socket.id, `${eventId}_ack`, callbackResult);
            } catch (error) {
                console.error("Error processing file:", error);
                socket.emit("error", { status:"failed",message: "Failed to process file" });
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

         socket.on("secretChunk",  async ({ senderName, secretChunk }, callback) => {
            const clientId = socket.id;
            const clientData = clients.get(clientId);
            if (!clientData) {
                socket.emit("error", { message: "Handshake required" });
                return;
            }
            console.debug('secretChunk')
            incomingMessages =  clientData.incomingMessages;
            
            const { messageId, iv, chunkIndex, totalChunks, isLastChunk, encryptedChunkData,filename } = secretChunk;

            console.log(secretChunk)
            // Ensure encryptedChunkData is a Buffer on the server side if it comes as ArrayBuffer/Blob
            const chunkBuffer = Buffer.from(encryptedChunkData);


            if (!incomingMessages.has(messageId)) {
                incomingMessages.set(messageId, {
                    chunks: new Map(), // Use a Map to store chunks by index for easy reassembly
                    totalChunks: totalChunks,
                    receivedCount: 0,
                    iv: Buffer.from(iv), // Store the IV as a Buffer
                    senderName: senderName,
                    filename:filename,
                    createdAt: Date.now() // For potential timeout/cleanup
                });
                console.log(`New message transfer started for ID: ${messageId} from ${senderName}`);
            }

            const messageState = incomingMessages.get(messageId);

            // Store the chunk. Using a Map ensures we handle potential out-of-order delivery
            // though Socket.IO typically guarantees order for single-socket messages.
            if (!messageState.chunks.has(chunkIndex)) {
                messageState.chunks.set(chunkIndex, chunkBuffer);
                messageState.receivedCount++;
            } else {
                // Already received this chunk, acknowledge but do nothing else
                callback({ status: 'success', message: `Chunk ${chunkIndex + 1}/${totalChunks} already received.` });
                return;
            }

            try {
                if (messageState.receivedCount === messageState.totalChunks && messageState.chunks.size === messageState.totalChunks) {
                    // All chunks received and accounted for, reassemble and decrypt the entire message
                    console.log(`All chunks received for message ID: ${messageId}. Reassembling...`);

                    const sortedChunks = [];
                    for (let i = 0; i < messageState.totalChunks; i++) {
                        if (!messageState.chunks.has(i)) {
                            // This should ideally not happen if receivedCount matches totalChunks
                            // but is a good safeguard against missing chunks or logic errors.
                            console.error(`Missing chunk ${i} for message ID: ${messageId}`);
                            callback({ status: 'error', message: `Missing chunk ${i}. Reassembly failed.` });
                            incomingMessages.delete(messageId); // Clean up
                            return;
                        }
                        sortedChunks.push(messageState.chunks.get(i));
                    }

                    const fullEncryptedData = Buffer.concat(sortedChunks);

                    // --- Decrypt the entire message once ---
                    const secretFileArrayBuffer = await AESEncryption.decryptFile(
                        fullEncryptedData,
                        messageState.iv,
                        clientData.key);

                    await fs.writeFile(
                        `./uploads/${messageState.filename}`,
                        Buffer.from(secretFileArrayBuffer)
                    );
                
                console.log("File saved");
                    console.log(`Fully reassembled and decrypted message from ${senderName} (ID: ${messageId}):`);

                    // Clean up the message state
                    incomingMessages.delete(messageId);
                    callback({ status: 'success', message: 'Full message reassembled and decrypted.' });

                  
                } else {
                    // Not all chunks received yet, just acknowledge current chunk
                    callback({ status: 'success', message: `Chunk ${chunkIndex + 1}/${totalChunks} received.` });
                }
            } catch (error) {
                console.error('Error handling secret chunk or decryption:', error);
                callback({ status: 'error', message: 'Failed to process chunk or decrypt message.' });
                // Consider cleaning up partial message state on error
                incomingMessages.delete(messageId);
            }
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

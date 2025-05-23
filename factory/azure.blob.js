const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

class AzureBlobFactory{

    constructor(options = {}) {       
        if (!options.accountName) throw new Error('Azure storage account name is required');
        if (!options.containerName) throw new Error('Azure container name is required');

        this.options = {
            accountName: options.accountName,
            containerName: options.containerName
        };

        const credential = new DefaultAzureCredential();
        const blobUrl = `https://${options.accountName}.blob.core.windows.net`;
        this.blobServiceClient = new BlobServiceClient(blobUrl, credential);
        this.containerClient = this.blobServiceClient.getContainerClient(options.containerName);
    }


    // ✅ Ensure container exists
    async initContainer() {
        try {
            const exists = await this.containerClient.exists();
            if (!exists) {
                await this.containerClient.create();
                console.log(`Container "${this.containerClient.containerName}" created.`);
            } else {
                console.log(`Container "${this.containerClient.containerName}" already exists.`);
            }
        } catch (error) {
            throw new Error(`initContainer [${this.options.containerName}] Failed: ${error.message}`);
        }
    }

    // 📝 Upload or overwrite blob
    async uploadBlob(blobName, content) {
        try{
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
            await blockBlobClient.upload(buffer, buffer.length);
            console.log(`Blob "${blobName}" uploaded.`);
        }
        catch(error)
        {
            throw new Error(`UploadBlob [${blobName}] Failed: ${error}`);
        }
    }

    async listBlobs() {
        try {
            const blobs = [];
            for await (const blob of this.containerClient.listBlobsFlat()) {
                blobs.push(blob.name);
            }
            console.log(`Container contains: ${blobs.join(', ')}`);
            return blobs;
        } catch (error) {
            throw new Error(`listBlobs [${this.options.containerName}] Failed: ${error.message}`);
        }
    }

    // 📖 Read blob content
    async readBlob(blobName) {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            const response = await blockBlobClient.download(); // This can throw
            // _streamToString can also throw (e.g. if stream emits 'error')
            const downloaded = await this._streamToString(response.readableStreamBody); 
            console.log(`Blob "${blobName}" read.`);
            return downloaded;
        } catch (error) {
            // Check if the error is already prefixed by _streamToString or if it's a new error
            if (error.message && error.message.startsWith(`_streamToString Failed:`)) {
                 throw new Error(`readBlob [${blobName}] Failed: ${error.message}`);
            }
            throw new Error(`readBlob [${blobName}] Failed: ${error.message}`);
        }
    }

    // 📖 Read blob content as file buffer
    async readBlobAsBuffer(blobName) {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            const response = await blockBlobClient.download(); // This can throw
            const chunks = [];
            // Await the promise to ensure its rejection is caught by the outer try/catch
            return await new Promise((resolve, reject) => { 
                response.readableStreamBody.on('data', (data) => {
                    chunks.push(data);
                });
                response.readableStreamBody.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
                response.readableStreamBody.on('error', (streamError) => {
                    // Reject with the original stream error
                    reject(streamError); 
                });
            });
        } catch (error) {
            // This will now catch errors from download() or the stream directly and prefix them
            throw new Error(`readBlobAsBuffer [${blobName}] Failed: ${error.message}`);
        }
    }

    // ❌ Delete blob
    async deleteBlob(blobName) {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.deleteIfExists();
            console.log(`Blob "${blobName}" deleted (if it existed).`);
        } catch (error) {
            throw new Error(`deleteBlob [${blobName}] Failed: ${error.message}`);
        }
    }

    // 🔗 Get blob URL
    getBlobUrl(blobName) {
        const blobClient = this.containerClient.getBlockBlobClient(blobName);
        return blobClient.url;
    }

    // 🔧 Convert readable stream to string
    async _streamToString(readableStream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            readableStream.on('data', (data) => {
                chunks.push(Buffer.from(data));
            });
            readableStream.on('end', () => {
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
            // Rejects the promise if a stream error occurs
            readableStream.on('error', (streamError) => {
                reject(new Error(`_streamToString Failed: ${streamError.message}`));
            });
        });
    }
}

module.exports = AzureBlobFactory;
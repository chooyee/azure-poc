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
        const exists = await this.containerClient.exists();
        if (!exists) {
            await this.containerClient.create();
            console.log(`Container "${this.containerClient.containerName}" created.`);
        } else {
            console.log(`Container "${this.containerClient.containerName}" already exists.`);
        }
    }

    // 📝 Upload or overwrite blob
    async uploadBlob(blobName, content) {
        try{
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
            await blockBlobClient.upload(buffer, buffer.length);
            console.debug(`AzureBlobFactory:Blob "${blobName}" uploaded.`);
        }
        catch(error)
        {
            throw new Error(`AzureBlobFactory:UploadBlob [${blobName}] Failed: ${error}`);
        }
    }

    async listBlobs() {
        const blobs = [];
        for await (const blob of this.containerClient.listBlobsFlat()) {
            blobs.push(blob.name);
        }
        console.debug(`AzureBlobFactory:Container contains: ${blobs.join(', ')}`);
        return blobs;
    }

    // 📖 Read blob content
    async readBlob(blobName) {
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
        const response = await blockBlobClient.download();
        const downloaded = await this._streamToString(response.readableStreamBody);
        console.debug(`AzureBlobFactory:Blob "${blobName}" read.`);
        return downloaded;
    }

    // 📖 Read blob content as file buffer
    async readBlobAsBuffer(blobName) {
        try{
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            const response = await blockBlobClient.download();
            const chunks = [];
            return new Promise((resolve, reject) => {
                response.readableStreamBody.on('data', (data) => {
                    chunks.push(data);
                });
                response.readableStreamBody.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
                response.readableStreamBody.on('error', reject);
            });
        }
        catch(error)
        {
            throw new Error(`AzureBlobFactory:readBlobAsBuffer [${blobName}] Failed: ${error}`);
        }
    }

    // ❌ Delete blob
    async deleteBlob(blobName) {
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists();
        console.debug(`AzureBlobFactory:Blob "${blobName}" deleted (if it existed).`);
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
            readableStream.on('error', reject);
        });
    }
}

module.exports = AzureBlobFactory;

const AzureBlobFactory = require("../factory/azure.blob");
const AzureKeyFactory = require("../factory/azure.keyvault");
const fs = require("fs");
const {DecryptBuffer} = require('../services/pgp.service');

async function glueService(message) {
    console.info(`GlueService Started`)
    try {
        if (!message || Object.keys(message).length === 0) {
            throw new Error("Received message is null or empty");
        }
        const task = JSON.parse(message);
        console.info(`GlueService: [${task.FileName}]`)
        const outputPath = `./download/${task.FileName}`;

        const fileChunks = [];
        for(const chunk of task.FileChunks)
        {
            fileChunks.push(await getAzureBlob(chunk));
        }
        // Process the message here
        const gluedFile = Buffer.concat(fileChunks);
        //clearFile = await AzureKeyFactory.DecryptFile(process.env.AZURE_KEY_NAME, task.Key,task.IV,gluedFile);
        //fs.writeFileSync(outputPath,  Buffer.from(clearFile, "base64"));
        const privateKey = fs.readFileSync('./cert/pgp.pem');
        const outputBuffer = await DecryptBuffer(gluedFile, privateKey.toString(), ""); 
        fs.writeFileSync(outputPath,  outputBuffer.data);
        console.info(`GlueService write to ${outputPath} successully!`);

    } catch (error) {
        console.error("Error in subscribeCallback:", error.message);
    }
};

async function getAzureBlob(blobName)
{
    const azureBlob = new AzureBlobFactory({
        accountName: process.env.AZURE_BLOB_ACCOUNTNAME,
        containerName: process.env.AZURE_BLOB_CONTAINERNAME
    });

    return await azureBlob.readBlobAsBuffer(blobName);
}

module.exports = {glueService}
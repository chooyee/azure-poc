
const AzureBlobFactory = require("../factory/azure.blob");
const AzureKeyFactory = require("../factory/azure.keyvault");
const fs = require("fs");
const {DecryptBuffer} = require('../services/pgp.service');

const deleteBlob = true;

async function glueService(message) {
    console.info(`GlueService Started`);
    const fileChunks = [];

    try {        

        if (!message || Object.keys(message).length === 0) {
            throw new Error("Received message is null or empty");
        }
        const task = JSON.parse(message);
        console.info(`GlueService: [${task.FileName}]`)
        const outputPath = `./download/${task.FileName}`;

        const azureBlob = new AzureBlobFactory({
            accountName: process.env.AZURE_BLOB_ACCOUNTNAME,
            containerName: process.env.AZURE_BLOB_CONTAINERNAME
        });
       
        fileChunks.push(...await Promise.all(task.FileChunks.map(chunk => azureBlob.readBlobAsBuffer(chunk))));

        // Process the message here
        const gluedFile = Buffer.concat(fileChunks);

        //Delete chunk
        if (deleteBlob) await Promise.all(task.FileChunks.map(chunk => azureBlob.deleteBlob(chunk)));

        //clearFile = await AzureKeyFactory.DecryptFile(process.env.AZURE_KEY_NAME, task.Key,task.IV,gluedFile);
        //fs.writeFileSync(outputPath,  Buffer.from(clearFile, "base64"));
        //const privateKey = fs.readFileSync('./cert/pgp.pem');

        const outputBuffer = await DecryptBuffer(gluedFile, task.PvBase64, ""); 
        fs.writeFileSync(outputPath,  outputBuffer.data);
        console.info(`GlueService write to ${outputPath} successully!`);

    } catch (error) {
        console.error("Error in subscribeCallback:", error.message);
    }
};


module.exports = {glueService}
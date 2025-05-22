const AzureBlobFactory = require("../factory/azure.blob");
const AzureKeyFactory = require("../factory/azure.keyvault");
const crypto = require("crypto");
const {EncryptBuffer, CreatePGPCert} = require('../services/pgp.service');
const fs = require("fs");
/**
 * Class representing a file storage service for handling encrypted file storage.
 *
 * @class FileStorageService
 */

/**
 * Creates an instance of FileStorageService.
 *
 * @constructor
 * @param {string} fileName - The name of the file to be processed.
 * @param {Buffer} fileBuffer - The file data as a Buffer.
 */

/**
 * Encrypts and stores a secret file by chunking it and uploading each chunk to Azure Blob Storage.
 *
 * This asynchronous method encrypts the file using AzureKeyFactory, slices the encrypted file into
 * randomized chunks, uploads each chunk using AzureBlobService, and returns an object containing metadata
 * about the stored file, including file chunks, encrypted symmetric key, initialization vector, and the
 * storage timestamp.
 *
 * @async StoreSecretFile
 * @returns {Promise<Object>} A promise that resolves to an object with the following properties:
 *   - FileName {string}: The original file name.
 *   - Key {string}: The encrypted symmetric key.
 *   - IV {string}: The initialization vector used during encryption.
 *   - Date {number}: The timestamp of when the file was stored.
 *   - FileChunks {Array<string>}: An array of filenames for each stored file chunk.
 * @throws {Error} If encryption or file storage fails.
 */

/**
 * Generates a random integer between the specified minimum (inclusive) and maximum (exclusive) values.
 *
 * @private getRndInteger
 * @param {number} min - The minimum integer (inclusive).
 * @param {number} max - The maximum integer (exclusive).
 * @returns {number} A randomly generated integer within the specified range.
 */

/**
 * Calculates randomized file size parts for chunking the file.
 *
 * This private method divides the total file size into several parts by allocating bytes proportionally.
 * The allocation continues until the entire file size is partitioned.
 *
 * @private #getFileSizePart
 * @param {number} totalFileBytes - The total size of the file in bytes.
 * @returns {Array<Object>} An array of objects where each object has:
 *   - bytesAlloc {number}: The number of bytes allocated for that specific file chunk.
 */

/**
 * Chunks the encrypted file into smaller pieces and uploads each chunk to Azure Blob Storage.
 *
 * This private asynchronous method slices the encrypted file buffer into parts based on randomized sizes,
 * creates a random file name for each chunk, uploads them using an instance of AzureBlobService, and collects
 * the file names of the uploaded chunks.
 *
 * @private
 * @async #chunkFile
 * @param {Buffer} encryptedFile - The encrypted file buffer to be chunked.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of file names corresponding to each uploaded chunk.
 * @throws {Error} If an error occurs during file slicing or blob uploading.
 */
class FileStorageService{

    constructor(fileName, fileBuffer) {
        this.fileBuffer= fileBuffer;
        this.fileName = fileName;
        console.log(`FileStore Init: ${fileName}`);
    }

    async StoreSecretFile()
    {
        console.debug("StoreSecretFile: KeyName: " + process.env.AZURE_KEY_NAME);
        const result = {};
        try{
            // const encryptionResult = await AzureKeyFactory.EncryptFile(process.env.AZURE_KEY_NAME, this.fileBuffer);	
            // const encryptedFileBuffer = Buffer.from(encryptionResult.encryptedFile, "base64");
           
         
            //===================================================================================================
            // PGP Encryption
            //===================================================================================================
            //const publicKeyStr= fs.readFileSync('./cert/pgp.cer');
               const options = {
                userIds: [{ "name": "Alice", "email":"alice@chooyee.co" }],
                passphrase: '',
                curve: '',
            };
            const pgpKey = await CreatePGPCert(options);
            const publicKeyStr = pgpKey.publicKey.toString();
            const privateKeyBase64 = pgpKey.privateKey.toString('base64');
            const encryptedFileBuffer = await EncryptBuffer(this.fileBuffer, publicKeyStr.toString());
            //===================================================================================================
            // End PGP Encryption
            //===================================================================================================

            const chunks = await this.#chunkAndUploadFile(encryptedFileBuffer);
            result.FileName = this.fileName;
            // result.Key = encryptionResult.encryptedSymmetricKey;
            // result.IV = encryptionResult.iv;
            result.Date = Date.now();
            result.FileChunks = chunks;
            result.PvBase64 = privateKeyBase64;
            console.debug('StoreSecretFile done');
            return result;
        }
        catch(error)
        {
            console.error(`Error: FunctionName: ${funcName}, fileName:${this.fileName}, ErrorMsg: ${error}`)
            throw error;
        }
    }

    
    #getRndInteger(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    
    #getFileSizePart(totalFileBytes)
    {
        console.debug(`getFileSizePart: total file bytes: ${totalFileBytes}`)
        let totalBytesAlloc = 0;
        const parts = [];
        const maxPart = 10;
        let totalPart = maxPart;
        while (totalPart>0)
        {
            console.debug(`getFileSizePart: total file bytes Allocated: ${totalBytesAlloc}`)
            const rnd = this.#getRndInteger(1, maxPart);
            console.debug(`getFileSizePart: Part Percentage: ${rnd}`)
            const partData = {};
    
            if (rnd< totalPart)
            {
                const bytesAlloc =  Math.floor(totalFileBytes * (rnd/10));//calculate number of bytes to be slice
                console.debug(`getFileSizePart: bytesAlloc: ${bytesAlloc}`)
                
                partData.bytesAlloc = bytesAlloc;//number of bytes to be slice
                parts.push(partData);
                totalPart = totalPart - rnd;
                totalBytesAlloc+=bytesAlloc;// to track how many bytes allocated
            }
            else{
                const bytesAlloc = totalFileBytes - totalBytesAlloc; //get the last bit of unallocated bytes		
                partData.bytesAlloc = bytesAlloc;//number of bytes to be slice
                parts.push(partData);
                totalPart = 0;
            }
            console.debug(`getFileSizePart: totalPart: ${totalPart}`)
        }
   
        return parts;
    }	
    
    async #chunkAndUploadFile(encryptedFile)
    {
        const funcName = '#chunkFile';
        const chunksFiles = [];
    
        try
        {
    
            const azureBlob = new AzureBlobFactory({
                accountName: process.env.AZURE_BLOB_ACCOUNTNAME,
                containerName: process.env.AZURE_BLOB_CONTAINERNAME
            });
            
            console.debug(`funcName:${funcName}, fileName: ${this.fileName}, msg: azureBlob creation successfull!`);
    
            const chunks = this.#getFileSizePart(encryptedFile.length);
           
            let start=0;
            let end =0;
            for(const chunk of chunks)
            {		
                //console.debug(chunk)
                end = end + chunk.bytesAlloc; 
                console.log(`${funcName}: start: ${start} - end: ${ end}`)
                const fsSlice = encryptedFile.slice(start, end);
                start = end;
    
                // //random file name
                const filename = `${crypto.randomBytes(8).toString("hex")}.dat`;
                // console.log(filename);
                // console.log(fsSlice.toString('base64'))
                await azureBlob.uploadBlob(filename, fsSlice);
                console.debug(`${funcName}: ${filename} upload successfull`)
                chunksFiles.push(filename);
                // fs.writeFileSync(fileName, fsSlice);	
            }
            console.debug(`${funcName} done`);
            return chunksFiles;
        }
        catch(error)
        {
            console.log(`Error: FunctionName: ${funcName}, fileName:${this.fileName}, ErrorMsg: ${error}`)
            throw new Error(`Error: FunctionName: ${funcName}, fileName:${this.fileName}, ErrorMsg: ${error}`);
        }
    }
        
}

module.exports = FileStorageService;
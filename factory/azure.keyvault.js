const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const { KeyClient, CryptographyClient } = require("@azure/keyvault-keys");
const fs = require("fs").promises;
const crypto = require("crypto");

/**
 * AzureKeyFactory provides methods to interact with Azure Key Vault for managing keys
 * and performing envelope encryption and decryption on files.
 *
 * @namespace AzureKeyFactory
 */

/**
 * Lists all key names available from the configured Azure Key Vault.
 *
 * @async
 * @function List
 * @throws {Error} If the AZURE_KEY_VAULT_URL environment variable is not set or if an error occurs during the key listing.
 * @returns {Promise<string[]>} A promise that resolves to an array of key names (strings) available in the vault.
 */

/**
 * Encrypts a file using envelope encryption.
 *
 * This function reads a file (PDF, image, etc.), generates a random symmetric key and an initialization vector (IV),
 * encrypts the file's content using AES-256-CBC, and then encrypts the symmetric key using an RSA key from Azure Key Vault.
 *
 * @async
 * @function EncryptFile
 * @param {string} filePath - The path to the file to be encrypted.
 * @param {string} keyName - The name of the Azure Key Vault key used to encrypt the symmetric key.
 * @throws {Error} If the AZURE_KEY_VAULT_URL environment variable is not set or if any error occurs during encryption.
 * @returns {Promise<Object>} A promise that resolves to an object containing:
 *   - {string} encryptedSymmetricKey: The symmetric key encrypted with Azure Key Vault, encoded in base64.
 *   - {string} iv: The initialization vector used for AES encryption, encoded in base64.
 *   - {string} encryptedFile: The file contents encrypted using AES-256-CBC, encoded in base64.
 */

/**
 * Decrypts an encrypted file using envelope decryption.
 *
 * This function unwraps the encrypted symmetric key using Azure Key Vault, reads the encrypted file (which contains
 * the initialization vector and ciphertext), and then decrypts the file using AES-256-CBC with the retrieved symmetric key.
 *
 * Note: The function assumes that the key name for retrieving the decryption key is managed in context.
 *
 * @async
 * @function decryptFile
 * @param {string} encryptedSymmetricKeyBase64 - The encrypted symmetric key encoded in base64.
 * @param {string} encryptedFilePath - The file path to the encrypted file (with the first 16 bytes representing the IV).
 * @throws {Error} If the AZURE_KEY_VAULT_URL environment variable is not set or if any error occurs during decryption.
 * @returns {Promise<string>} A promise that resolves to the decrypted file contents encoded in base64.
 */


const AzureKeyFactory = {
    async List() {
        const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
        try {
            if (!vaultUrl) throw new Error("AZURE_KEY_VAULT_URL is not set");

            const keyClient = new KeyClient(vaultUrl, new DefaultAzureCredential());
            const keys = [];

            for await (const keyProperties of keyClient.listPropertiesOfKeys()) {
                keys.push(keyProperties.name);
            }

            return keys;
        }
        catch (error) {
            console.error("AzureKeyFactory:Error listing keys:", error);
            throw error;
        }
    },


    async EncryptFile(keyName, fileBuffer) {
        const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
        if (!vaultUrl) throw new Error("AZURE_KEY_VAULT_URL is not set");

        try {
            // Initialize the key client and get the key by name
            const keyClient = new KeyClient(vaultUrl, new DefaultAzureCredential());
            const key = await keyClient.getKey(keyName);
            const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());

            // Envelope encryption:
            // 1. Generate a random symmetric key and initialization vector (iv)
            const symmetricKey = crypto.randomBytes(32); // 2048 bits key
            const iv = crypto.randomBytes(16); // Initialization vector

            // 2. Encrypt the file using AES-256-CBC
            const cipher = crypto.createCipheriv("aes-256-cbc", symmetricKey, iv);
            const encryptedFilePart = cipher.update(fileBuffer);
            const encryptedFileFinal = cipher.final();
            const encryptedFile = Buffer.concat([encryptedFilePart, encryptedFileFinal]);

            // 3. Encrypt the symmetric key using the Key Vault key (RSA-OAEP)
            const encryptResult = await cryptoClient.encrypt("RSA-OAEP", symmetricKey);
            const encryptedSymmetricKey = encryptResult.result;

            // Return the encrypted symmetric key, iv, and encrypted file as base64 strings.
            return {
                encryptedSymmetricKey: encryptedSymmetricKey.toString("base64"),
                iv: iv.toString("base64"),
                encryptedFile: encryptedFile.toString("base64")
            };
        } catch (error) {
            console.error("AzureKeyFactory:Error encrypting file:", error);
            throw error;
        }
    },

    async DecryptFile(keyName, encryptedSymmetricKeyB64, ivB64, encryptedFileBuffer) {
        const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
        if (!vaultUrl) throw new Error("AZURE_KEY_VAULT_URL is not set");
    
        try {
            // Destructure the encrypted data
          
            // Decode from base64
            const encryptedSymmetricKey = Buffer.from(encryptedSymmetricKeyB64, "base64");
            const iv = Buffer.from(ivB64, "base64");
            //const encryptedFileBuffer =  await fs.readFile(encryptedFilePath);
    
            // Initialize the key client and get the key by name
            const keyClient = new KeyClient(vaultUrl, new DefaultAzureCredential());
            const key = await keyClient.getKey(keyName); // Or use the specific key version if known
            const cryptoClient = new CryptographyClient(key.id, new DefaultAzureCredential()); // key.id contains the full key identifier including version
    
            // 1. Decrypt the symmetric key using the Key Vault key (RSA-OAEP)
            const decryptResult = await cryptoClient.decrypt("RSA-OAEP", encryptedSymmetricKey);
            const symmetricKey = decryptResult.result;
    
            // 2. Decrypt the file using AES-256-CBC
            const decipher = crypto.createDecipheriv("aes-256-cbc", symmetricKey, iv);
            const decryptedFilePart = decipher.update(encryptedFileBuffer);
            const decryptedFileFinal = decipher.final();
            const decryptedFileBuffer = Buffer.concat([decryptedFilePart, decryptedFileFinal]);
    
            // Return the decrypted file as a Buffer.
            // You might want to save it to a file or process it further.
            return decryptedFileBuffer;
    
        } catch (error) {
            console.error("AzureKeyFactory:Error decrypting file:", error);
            throw error;
        }
    }

}
module.exports = AzureKeyFactory;
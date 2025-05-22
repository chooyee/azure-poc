const openpgp = require('openpgp');
const fs = require('fs');

'use strict';


class PGP {
    constructor() {}

    /**
     * Create a key pair (certificate) for the given user.
     * @param {Object} options - Options for key generation.
     * @param {Array} options.userIds - Array of user identity objects (e.g., [{ name: 'Alice', email: 'alice@example.com' }]).
     * @param {string} options.passphrase - Passphrase to secure the private key.
     * @param {string} [options.curve='ed25519'] - Elliptic curve to use (default is ed25519).
     * @returns {Promise<Object>} - Resolves with an object containing armored publicKey and privateKey.
     */
    async createCert(options) {
        try {
            const { userIds, passphrase, curve = 'ed25519' } = options;
            const key = await openpgp.generateKey({
                userIDs: userIds,
                curve,
                passphrase,
            });
            // key: { privateKey, publicKey }
            return key;
        } catch (error) {
            throw new Error(`Certificate creation failed: ${error.message}`);
        }
    }

 
    /**
     * Encrypt a file buffer using the provided public key(s).
     * @param {Object} params
     * @param {Buffer} params.inputBuffer - Buffer containing plaintext data.
     * @param {string|object|Array} params.publicKeys - Public key(s) in armored format or as openpgp.Key object.
     * @returns {Promise<Buffer>} - Promise that resolves with a Buffer containing the encrypted data.
     */
    async encryptBuffer(params) {
        console.debug('PGP:encryptBuffer');
        const { inputBuffer, publicKeys } = params;
       
        let encryptionKeys;
        try {
            if (typeof publicKeys === 'string') {
                encryptionKeys = await openpgp.readKey({ armoredKey: publicKeys });
            } else if (Array.isArray(publicKeys)) {
                encryptionKeys = await Promise.all(publicKeys.map(async key => {
                    if (typeof key === 'string') {
                        return await openpgp.readKey({ armoredKey: key });
                    }
                    return key;
                }));
            }
        } catch (error) {
            throw new Error(`Error: PGP:encryptBuffer: Invalid public key format: ${error.message}`);
        }

        
        let message;
        try {
            message = await openpgp.createMessage({ binary: inputBuffer });
        } catch (error) {
            throw new Error(`Error:PGP:encryptBuffer: creating message: ${error.message}`);
        }

        let encryptionResult;
        try {
            encryptionResult = await openpgp.encrypt({
                message,
                encryptionKeys,
                format: 'binary'
            });
        } catch (error) {
            throw new Error(`Error:PGP:encryptBuffer: during encryption: ${error.message}`);
        }
        console.debug('PGP:encryptBuffer: done!')
        return encryptionResult;
    }

    /**
     * Decrypt a file buffer (binary data) using the provided private key.
     * @param {Object} params
     * @param {Buffer} params.inputBuffer - Buffer containing encrypted data.
     * @param {object|string} params.privateKey - Private key in armored format or as an openpgp.Key object.
     * @param {string} params.passphrase - Passphrase to decrypt the private key, if necessary.
     * @returns {Promise<Buffer>} - Resolves with a Buffer containing the decrypted data.
     */
    async decryptBuffer(params) {
        console.debug('PGP:decryptBuffer')
        const {  inputBuffer, privateKey, passphrase } = params;

        let privKeyObject;
        try {
            privKeyObject = await openpgp.readKey({ armoredKey: privateKey });
            if (passphrase.length>0) {
               await privateKey.decrypt(passphrase);
            }
            
        } catch (error) {
            throw new Error(`Error: PGP:decryptBuffer: decrypting private key: ${error.message}`);
        }
        
        console.debug('privKeyObject done')

        let message;
        try {
            message = await openpgp.readMessage({
                binaryMessage: inputBuffer
            });
        } catch (error) {
            throw new Error(`Error: PGP:decryptBuffer: reading message: ${error.message}`);
        }

        console.debug('PGP:decryptBuffer done')

        let decrypted;
        try {
            decrypted = await openpgp.decrypt({
                message,
                decryptionKeys: privKeyObject,
                format: 'binary'
            });
           
        } catch (error) {
            throw new Error(`Error: PGP:decryptBuffer: during decryption: ${error.message}`);
        }
         console.debug('PGP:decryptBuffer: done')
        return decrypted;
    }

  
}

module.exports = PGP;
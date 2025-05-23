const forge = require('node-forge');
const fs = require('fs').promises; // For async operations
const fsSync = require('fs'); // For async operations

class RSAEncryption {
    constructor(options = {}) {
        this.keySize = options.keySize || 2048;
        this.keyPair = null;
        
        // If private key file path is provided, load it
        if (options.privateKeyFile) {
            // Pass the password from options to loadPrivateKeySync
            this.loadPrivateKeySync(options.privateKeyFile, options.privateKeyPassword);
        } else {
           throw new Error('Private key file path is required');
        }
    }

    // Method to load private key from file (made synchronous as per original file naming)
    loadPrivateKeySync(filePath, password) {
        const privateKeyPem = fsSync.readFileSync(filePath, 'utf8');
        const privateKeyObject = forge.pki.decryptRsaPrivateKey(privateKeyPem, password);

        if (privateKeyObject) {
            // Derive and set the public key using the components of the private key
            const publicKeyObject = forge.pki.setRsaPublicKey(privateKeyObject.n, privateKeyObject.e);
            this.keyPair = {
                privateKey: privateKeyObject,
                publicKey: publicKeyObject
            };
        } else {
            // Handle case where privateKeyObject is null (decryption failed)
            this.keyPair = null; // Explicitly set to null
            throw new Error('Failed to decrypt private key - wrong password?');
        }
    }

    encrypt(plaintext) {
        try {
            const buffer = forge.util.createBuffer(
                typeof plaintext === 'string' ? plaintext : plaintext.toString(),
                'utf8'
            );
            const encrypted = this.keyPair.publicKey.encrypt(buffer.getBytes(), 'RSA-OAEP', {
                md: forge.md.sha256.create()
            });
            return forge.util.encode64(encrypted);
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    decrypt(ciphertext) {
        try {
            const encryptedBytes = forge.util.decode64(ciphertext);
            const decrypted = this.keyPair.privateKey.decrypt(encryptedBytes, 'RSA-OAEP', {
                md: forge.md.sha256.create()
            });
            return forge.util.decodeUtf8(decrypted);
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }
}

module.exports = RSAEncryption;
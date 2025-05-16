const forge = require('node-forge');
const fs = require('fs').promises; // For async operations
const fsSync = require('fs'); // For async operations

class RSAEncryption {
    constructor(options = {}) {
        this.keySize = options.keySize || 2048;
        this.keyPair = null;
        
        // If private key file path is provided, load it
        if (options.privateKeyFile) {
            this.loadPrivateKeySync(options.privateKeyFile);
        } else {
           throw new Error('Private key file path is required');
        }
    }

    // Asynchronous method to load private key from file
    loadPrivateKeySync(filePath, password) {
        const privateKeyPem = fsSync.readFileSync(filePath, 'utf8');
        this.keyPair = {
            privateKey: forge.pki.decryptRsaPrivateKey(privateKeyPem, password),
            publicKey: null
        };
        if (!this.keyPair.privateKey) {
            throw new Error('Failed to decrypt private key - wrong password?');
        }
        // ... rest of the code
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
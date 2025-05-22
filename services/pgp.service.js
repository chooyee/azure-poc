const PGP = require('../factory/pgp');

async function CreatePGPCert(options)
{
    const pgp = new PGP();    
    return await pgp.createCert(options)
}

/**
 * Encrypts a buffer using the specified public key.
 *
 * @param {Buffer|Uint8Array} inputBuffer - The buffer containing data to encrypt.
 * @param {string|object} publicKey - The public key used for encryption.
 * @returns {Promise<Buffer|Uint8Array>} A promise that resolves with the encrypted buffer.
 */
async function EncryptBuffer(inputBuffer, publicKeys)
{

    try{
        const pgp = new PGP();    
        return await pgp.encryptBuffer({"inputBuffer":inputBuffer, "publicKeys":publicKeys});
    }
    catch(error) {throw error;}
}


/**
 * Decrypts the provided input buffer using the given private key and passphrase.
 *
 * @async
 * @function DecryptBuffer
 * @param {Buffer} inputBuffer - The buffer containing the encrypted data.
 * @param {string} privateKey - The private key used for decryption.
 * @param {string} passphrase - The passphrase for the private key.
 * @returns {Promise<Buffer>} A promise that resolves to the decrypted buffer.
 */
async function DecryptBuffer(inputBuffer, privateKey, passphrase) {
    try{
        const pgp = new PGP();
        return await pgp.decryptBuffer({inputBuffer, privateKey, passphrase});
    }catch(error) {throw error;}
}

module.exports = {CreatePGPCert, EncryptBuffer, DecryptBuffer}
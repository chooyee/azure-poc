
const { ml_kem512, ml_kem768, ml_kem1024 } = require("@noble/post-quantum/ml-kem");
const { randomBytes } = require("@noble/post-quantum/utils");

const MLKemEncryption = {
    async generateKeyPair() {
        // 1. [Alice] generates secret & public keys, then sends publicKey to Bob
        const seed = randomBytes(64); // seed is optional
        const aliceKeys = ml_kem768.keygen(seed);

        console.log(aliceKeys.publicKey);
        console.log(aliceKeys.secretKey);

        const alicePublicBase64 = Buffer.from(aliceKeys.publicKey).toString("base64");
        const aliceSecretBase64 = Buffer.from(aliceKeys.secretKey).toString("base64");

        return { publicKey: alicePublicBase64, secretKey: aliceSecretBase64 };
    },

    async encrypt(publicKey) {
        const publicKeyBytes = Buffer.from(publicKey, "base64");
        const { cipherText, sharedSecret: bobShared } = ml_kem768.encapsulate(publicKeyBytes);
        const cipherTextBase64 = Buffer.from(cipherText).toString("base64");
        const bobSharedBase64 = Buffer.from(bobShared).toString("base64");

        return { cipherText: cipherTextBase64, sharedSecret: bobSharedBase64 };
    },

    async decrypt(cipherText, secretKey) {
        const cipherTextBytes = Buffer.from(cipherText, "base64");
        const secretKeyBytes = Buffer.from(secretKey, "base64");
        const aliceShared = ml_kem768.decapsulate(cipherTextBytes, secretKeyBytes);
        return Buffer.from(aliceShared).toString("base64");
    }
};

module.exports = MLKemEncryption;


import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { utf8ToBytes, randomBytes } from '@noble/post-quantum/utils';
import { sha256 } from '@noble/hashes/sha256';

const MLDSADigitalSignature = {
    async generateKeyPair(seed) {
        if (!seed) {
            seed = randomBytes(32);
        }
        const seed = randomBytes(32);
        const { publicKey, secretKey } = ml_dsa65.keygen(seed);

        const publicKeyBase64 = Buffer.from(publicKey).toString("base64");
        const secretKeyBase64 = Buffer.from(secretKey).toString("base64");

        return { publicKey: publicKeyBase64, secretKey: secretKeyBase64 };
    },

    async sign(secretKey, message) {
        const secretKeyBytes = Buffer.from(secretKey, "base64");

         // Construct the signed message (assuming constructSignedMessage is the same)
        const finalMessage = constructSignedMessage(message);

        // Sign the message
        const signature = ml_dsa65.sign(secretKeyBytes, finalMessage);
        return Buffer.from(signature).toString("base64");
    },

    /**
   * Verifies a signature by reconstructing the final message with appended hash and length.
   * @param {Uint8Array} publicKey - The public key corresponding to the secret key that signed the message.
   * @param {string|Uint8Array} message - The original message (or file content).
   * @param {Uint8Array} signature - The signature to verify.
   * @returns {boolean} - True if the signature is valid, false otherwise.
   */
    async verify(publicKey, message, signature) {
        const publicKeyBytes = Buffer.from(publicKey, "base64");
        const signatureBytes = Buffer.from(signature, "base64");
        const finalMessage = constructSignedMessage(message);
        return ml_dsa65.verify(publicKeyBytes, finalMessage, signatureBytes);
    },
    /**
     * Constructs a message integrity structure by combining the message's hash,
     * the length of the message, and the original message itself.
     * This structure can be used for signing or integrity verification purposes.
     *
     * @param {Uint8Array} messageBytes - The message in byte format to be processed.
     * @returns {Uint8Array} The final message composed of the original message, its length, and its hash.
     */
    constructSignedMessage(message) {
        const hash = sha256(messageBytes);
        const lengthBytes = numberToBytes(messageBytes.length);

        // Reconstruct the final message that was signed
        const finalMessage = concatArrays([messageBytes, lengthBytes, hash]);
        return finalMessage;
    },
    /**
   * Concatenates multiple Uint8Arrays into a single Uint8Array.
   * @param {Uint8Array[]} arrays - An array of Uint8Array objects.
   * @returns {Uint8Array} - The concatenated Uint8Array.
   */
    concatArrays(arrays) {
        const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    },
    /**
   * Converts a number to a 4-byte Uint8Array (big-endian).
   * @param {number} num - The number to convert.
   * @returns {Uint8Array} - The resulting 4-byte array.
   */
    numberToBytes(num) {
        const bytes = new Uint8Array(4);
        bytes[0] = (num >> 24) & 0xff;
        bytes[1] = (num >> 16) & 0xff;
        bytes[2] = (num >> 8) & 0xff;
        bytes[3] = num & 0xff;
        return bytes;
    }
};
modules.export = MLDSADigitalSignature;
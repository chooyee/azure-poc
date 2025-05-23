const express = require("express");
const router = express.Router();
const fs = require("fs");

const { DefaultAzureCredential } = require("@azure/identity");
const { KeyClient } = require("@azure/keyvault-keys");
const upload = require("../middleware/mod.upload");
const {CreatePGPCert, EncryptBuffer, DecryptBuffer} = require('../services/pgp.service');

// List keys from Azure Key Vault
router.get("/api/v1/key/list", async (req, res) => {
	try {
		const keys =await AzureKeyFactory.List();		
		res.status(200).json(keys);
	} catch (error) {
		console.error("Error listing keys:", error);
		res.status(500).send("Error listing keys");
	}
});

router.post("/api/v1/file/encrypt/:keyName", upload.single("file"), (req, res) => {
	console.log(req.params.keyName);
	console.log(req.file);
	const keyName = req.params.keyName;
	
	res.status(200).send({ status: "success", message: "" });
});





router.post("/api/v1/key/new", async (req, res) => {
	const rsaKeyName = String(req.body.keyname).replace(/[^a-zA-Z0-9]/g, "");
	const rsaKeySize = parseInt(req.body.keysize, 10);
	const vaultUrl = process.env.AZURE_KEY_VAULT_URL;

	console.debug(rsaKeyName)
	try{
		if (!vaultUrl) {
			console.error("AZURE_KEY_VAULT_URL environment variable is not set");
			throw("Environment variable is not set");
		} else {
			const keyClient = new KeyClient(vaultUrl, new DefaultAzureCredential());
			//const rsaKeyName = `socket-${socket.id.replace(/[^a-zA-Z0-9]/g, "")}-rsa-key`;
			try {
				const rsaKey = await keyClient.createRsaKey(rsaKeyName, { keySize:rsaKeySize});
				console.log("RSA Key created with id:", rsaKey.key.kid);
				res.status(200).json({ keyId: rsaKey.key.kid });
			} catch (error) {
				console.error("Error creating RSA key in Key Vault:", error);
				throw("Error creating RSA key in Key Vault");
			}
		}
	}
	catch(error)
	{
		res.status(500).send("Unexpected error :"+ error);
	}

});


router.post("/api/v1/pgp/new", async (req, res) => {
	console.log(req.body.UserIDs)
	const options = {
		userIds: req.body.UserIDs,
		passphrase: req.body.passphrase,
		curve: req.body.curve,
	};
	const pgpKey = await CreatePGPCert(options);
	fs.writeFileSync('./cert/pgp.pem', pgpKey.privateKey);
	fs.writeFileSync('./cert/pgp.cer', pgpKey.publicKey);
	res.json(pgpKey);
});

module.exports = router;
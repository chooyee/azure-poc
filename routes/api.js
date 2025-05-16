const express = require("express");
const router = express.Router();
const fs = require("fs");
const certManager = require("../factory/certManager");
const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const { KeyClient, CryptographyClient } = require("@azure/keyvault-keys");
const upload = require("../middleware/mod.upload");
const { Client } = require("@microsoft/microsoft-graph-client");

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

router.post("/api/v1/cert/new", (req, res) => {
	const certGen = new certManager({
		id: req.body.id,
		commonName: req.body.commonName,
		validityYears: req.body.validityYears,
		altNames: req.body.altNames,
	});

	const certData = certGen.generate();
	certGen.saveToFiles("./certs/");
	console.log("Certificates saved successfully");
	res.status(200).send({ status: "success", message: certData.publicKey });
});

router.get("/api/v1/cert/get/:id", (req, res) => {
	const filePath = `./certs/${req.params.id}/public.key`;
	fs.readFile(filePath, { encoding: "utf-8" }, (err, data) => {
		if (!err) {
			res.writeHead(200, { "Content-Type": "text" });
			res.write(data);
			res.end();
		} else {
			console.log(err);
			res.status(500).send("Error reading certificate");
		}
	});
});

module.exports = router;
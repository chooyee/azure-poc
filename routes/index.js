const express = require("express");
const router = express.Router();
const upload = require("../middleware/mod.upload");
const FileStorageService = require('../services/filestore.service');
const AzureSvcBusService = require('../services/azuresvcbus.service');

router.get("/ping", (req, res) => {
	res.status(200).send("pong");
});

router.get("/", (req, res) => {
	const hostname =
		process.env.ENVIRONMENT === "dev"
			? `${req.protocol}://${req.header("host")}`
			: `${req.protocol}://${req.hostname}`;
	res.render("index");
});


// Routes
router.post("/upload", upload.single("file"), async (req, res) => {
	console.log(req.file);
	/*
	{
		fieldname: 'file',
		originalname: 'New Text Document.txt',
		encoding: '7bit',
		mimetype: 'text/plain',
		buffer: <Buffer 74 65 73 74>,
		size: 4
	}
  */
	try{
		const fsService = new FileStorageService(req.file.originalname, req.file.buffer);
		const metadata = await fsService.StoreSecretFile();
		console.log(JSON.stringify(metadata));
		const svcbus = new AzureSvcBusService(process.env.AZURE_SVCBUS_NAMESPACE, process.env.AZURE_SVCBUS_QUEUE);
		await svcbus.SendJson(JSON.stringify(metadata));
		res.status(200).json(metadata);
	}
	catch(error)
	{
		res.status(500).json({"Error":error});
	}

});


module.exports = router;


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

router.get("/server", (req, res) => {
	const hostname =
		process.env.ENVIRONMENT === "dev"
			? `${req.protocol}://${req.header("host")}`
			: `${req.protocol}://${req.hostname}`;
	res.render("server2");
});

router.get("/cert", (req, res) => {
	const hostname =
		process.env.ENVIRONMENT === "dev"
			? `${req.protocol}://${req.header("host")}`
			: `${req.protocol}://${req.hostname}`;
	res.render("cert");
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
		const result = await fsService.StoreSecretFile();
		console.log(JSON.stringify(result));
		const svcbus = new AzureSvcBusService(process.env.AZURE_SVCBUS_NAMESPACE, process.env.AZURE_SVCBUS_QUEUE);
		await svcbus.SendJson(JSON.stringify(result));
		res.status(200).json(result);
	}
	catch(error)
	{
		res.status(500).json({"Error":error});
	}
	//==============================================================================
	//Glue 
	//==============================================================================
	// const glue = [];
	// for (let x=0;x<i;x++)
	// {
	// 	const fileName = `./download/encrypted_part_${x + 1}.dat`;
	// 	glue.push(fs.readFileSync(fileName));
		
	// }
	// const gluedFile = Buffer.concat(glue);
	// const gluedFileName = "./download/gluedfile.dat";
	// fs.writeFileSync(gluedFileName, gluedFile);

	// descryptRes = await AzureKeyFactory.DecryptFile("test", result.encryptedSymmetricKey,result.iv,gluedFileName);
	// fs.writeFileSync("./download/" + req.file.filename,  Buffer.from(descryptRes, "base64"));
	//==============================================================================
	//end GLue
	//==============================================================================

	
	
});


module.exports = router;


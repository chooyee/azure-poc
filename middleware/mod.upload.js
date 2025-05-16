const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const _uploadDir = path.join(__dirname, "../uploads");

// Multer configuration
const maxSize = 100 * 1024 * 1024;
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, _uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
        cb(null, `${file.originalname.replace(ext, "")}-${uniqueSuffix}${ext}`);
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize },
});

module.exports = upload;
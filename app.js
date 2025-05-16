const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { corsOptions } = require("./config/cors");
const errorHandler = require("./middleware/errorHandler");
const indexRoutes = require("./routes/index");
const apiRoutes = require("./routes/api");
const initializeSocket = require("./sockets/index");
const AzureServiceBus = require('./factory/azure.svcbus');
const {glueService} = require('./services/glue.service');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

// Middleware
app.use(express.static("./public"));
app.use(express.json());
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.set("views", path.join(__dirname, "./views"));
app.set("view engine", "ejs");

if (app.get("env") === "production") {
  app.set("trust proxy", 1);
  // Assuming session middleware is used; otherwise, remove this block
  // sess.cookie.secure = true;
}

require('dotenv').config()
console.log(process.env.AZURE_CLIENT_ID)

// Routes
app.use("/", indexRoutes);
app.use("/", apiRoutes);

// Error handling
app.use(errorHandler);

// Socket.IO
initializeSocket(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

azuresvcbus = new AzureServiceBus(process.env.AZURE_SVCBUS_NAMESPACE, process.env.AZURE_SVCBUS_QUEUE);
azuresvcbus.subscribe(glueService);

// async function subscribeCallback(message) {
//   try {
//     if (!message || Object.keys(message).length === 0) {
//       throw new Error("Received message is null or empty");
//     }
//     const task = JSON.parse(message);
//     console.log(task.FileName)
//     // Process the message here
//   } catch (error) {
//     console.error("Error in subscribeCallback:", error.message);
//   }
// };
//example();
// TestSign.example();

// (async () => {
//     const MLKemEncryption = require("./factory/mlkem.js");
//     const { publicKey, secretKey } = await MLKemEncryption.generateKeyPair();
//     console.log("Public Key:", publicKey);
//     console.log("Secret Key:", secretKey);
// })();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const connectToDB = require("./config/db");
const { Server } = require("socket.io");
const http = require("http");
const Canvas = require("./models/canvasModel");
const jwt = require("jsonwebtoken");
const SECRET_KEY = "your_secret_key";

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");

const app = express();

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "https://whiteboard-alpha.vercel.app",
  "https://whiteboard-5lyf.onrender.com",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg =
        "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Add headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Test route
app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

// Mount routes with explicit path
app.use("/api/users", userRoutes);
app.use("/api/canvas", canvasRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something broke!" });
});

// 404 handler
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Route not found" });
});

connectToDB();

const server = http.createServer(app);

// Socket.IO configuration with proper CORS settings
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  },
  allowEIO3: true,
  transports: ["polling", "websocket"],
  path: "/socket.io/",
  pingTimeout: 60000,
  pingInterval: 25000,
});

const canvasData = new Map();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("joinCanvas", async ({ canvasId }) => {
    console.log("Joining canvas:", canvasId);
    try {
      const authHeader = socket.handshake.auth.token;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("No token provided.");
        socket.emit("unauthorized", { message: "Access Denied: No Token" });
        return;
      }

      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, SECRET_KEY);
      const userId = decoded.userId;
      console.log("User ID:", userId);

      const canvas = await Canvas.findById(canvasId);
      if (!canvas) {
        console.log("Canvas not found");
        socket.emit("unauthorized", { message: "Canvas not found" });
        return;
      }

      if (
        String(canvas.owner) !== String(userId) &&
        !canvas.shared.includes(userId)
      ) {
        console.log("Unauthorized access");
        socket.emit("unauthorized", {
          message: "You are not authorized to join this canvas",
        });
        return;
      }

      // Leave any previous canvas rooms
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });

      socket.join(canvasId);
      console.log(`User ${socket.id} joined canvas ${canvasId}`);

      // Send initial canvas data
      socket.emit("loadCanvas", canvas.elements);
    } catch (error) {
      console.error("Error in joinCanvas:", error);
      socket.emit("error", {
        message: "An error occurred while joining the canvas",
      });
    }
  });

  // Handle real-time drawing updates
  socket.on("drawing", ({ canvasId, element }) => {
    try {
      // Broadcast the drawing element to all other users in the canvas room
      socket.to(canvasId).emit("drawingUpdate", element);
    } catch (error) {
      console.error("Error in drawing:", error);
      socket.emit("error", { message: "Failed to broadcast drawing" });
    }
  });

  // Handle drawing completion
  socket.on("drawingComplete", ({ canvasId, element }) => {
    try {
      // Broadcast the completed element to all other users in the canvas room
      socket.to(canvasId).emit("drawingComplete", element);
    } catch (error) {
      console.error("Error in drawingComplete:", error);
      socket.emit("error", {
        message: "Failed to broadcast completed drawing",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(5000, () => console.log("Server running on port 5000"));

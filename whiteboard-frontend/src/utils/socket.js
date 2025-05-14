import { io } from "socket.io-client";

let socket = null;

// Determine the environment and set the appropriate socket URL
const isDevelopment = window.location.hostname === "localhost";
const SOCKET_URL = isDevelopment
  ? "http://localhost:5000"
  : "https://whiteboard-5lyf.onrender.com";

console.log("Environment:", isDevelopment ? "Development" : "Production");
console.log("Socket URL:", SOCKET_URL);

export const initializeSocket = () => {
  const token = localStorage.getItem("whiteboard_user_token");
  if (!token) {
    console.error("No authentication token found");
    return null;
  }

  if (!socket) {
    try {
      console.log("Initializing socket connection to:", SOCKET_URL);
      socket = io(SOCKET_URL, {
        auth: {
          token: `Bearer ${token}`,
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ["polling", "websocket"],
        timeout: 20000,
        withCredentials: true,
        path: "/socket.io/",
        forceNew: true,
        autoConnect: true,
        extraHeaders: {
          "Access-Control-Allow-Origin": "*",
        },
      });

      socket.on("connect", () => {
        console.log("Socket connected successfully");
      });

      socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        if (error.message.includes("CORS")) {
          console.log("CORS error detected, retrying with different transport");
          socket.io.opts.transports = ["polling"];
        }
      });

      socket.on("error", (error) => {
        console.error("Socket error:", error);
      });

      socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
        if (reason === "io server disconnect") {
          socket.connect();
        }
      });

      socket.on("reconnect", (attemptNumber) => {
        console.log("Socket reconnected after", attemptNumber, "attempts");
      });

      socket.on("reconnect_error", (error) => {
        console.error("Socket reconnection error:", error);
      });

      socket.on("reconnect_failed", () => {
        console.error("Socket reconnection failed");
      });

      socket.on("unauthorized", (error) => {
        console.error("Socket unauthorized:", error);
        disconnectSocket();
      });

      // Add handler for receiving drawing updates
      socket.on("drawingUpdate", (element) => {
        console.log("Received drawing update from another user");
        if (window.onDrawingUpdate) {
          window.onDrawingUpdate(element);
        }
      });

      // Add handler for receiving completed drawings
      socket.on("drawingComplete", (element) => {
        console.log("Received completed drawing from another user");
        if (window.onDrawingComplete) {
          window.onDrawingComplete(element);
        }
      });
    } catch (error) {
      console.error("Error initializing socket:", error);
      return null;
    }
  }

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    console.log("Disconnecting socket");
    socket.disconnect();
    socket = null;
  }
};

export const joinCanvas = (canvasId) => {
  const socket = getSocket();
  if (!socket) {
    console.error("Socket not initialized");
    return;
  }

  try {
    // Get current rooms
    const rooms = socket.rooms ? Array.from(socket.rooms) : [];
    console.log("Current rooms:", rooms);

    // Leave all rooms except the socket's own room
    rooms.forEach((room) => {
      if (room !== socket.id) {
        console.log("Leaving room:", room);
        socket.leave(room);
      }
    });

    // Join the new canvas room
    console.log("Joining canvas room:", canvasId);
    socket.emit("joinCanvas", { canvasId });
  } catch (error) {
    console.error("Error joining canvas:", error);
  }
};

export const sendDrawing = (canvasId, element) => {
  const socket = getSocket();
  if (!socket) {
    console.error("Socket not initialized");
    return;
  }

  try {
    socket.emit("drawing", { canvasId, element });
  } catch (error) {
    console.error("Error sending drawing:", error);
  }
};

export const sendDrawingComplete = (canvasId, element) => {
  const socket = getSocket();
  if (!socket) {
    console.error("Socket not initialized");
    return;
  }

  try {
    socket.emit("drawingComplete", { canvasId, element });
  } catch (error) {
    console.error("Error sending completed drawing:", error);
  }
};

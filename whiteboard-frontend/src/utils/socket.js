import { io } from "socket.io-client";

let socket = null;

export const initializeSocket = () => {
  const token = localStorage.getItem("whiteboard_user_token");
  if (!token) {
    console.error("No authentication token found");
    return null;
  }

  if (!socket) {
    socket = io("https://whiteboard-5lyf.onrender.com", {
      auth: {
        token: `Bearer ${token}`,
      },
    });
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
    socket.disconnect();
    socket = null;
  }
};

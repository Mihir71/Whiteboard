import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import "./index.min.css";
import { useNavigate } from "react-router-dom";
import boardContext from "../../store/board-context";
import { useParams } from "react-router-dom";
import { initializeSocket, joinCanvas } from "../../utils/socket";

const Sidebar = () => {
  const [canvases, setCanvases] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingCanvasId, setEditingCanvasId] = useState(null);
  const [newCanvasName, setNewCanvasName] = useState("");
  const [token, setToken] = useState(
    localStorage.getItem("whiteboard_user_token")
  );
  const {
    canvasId,
    setCanvasId,
    setElements,
    setHistory,
    isUserLoggedIn,
    setUserLoginStatus,
  } = useContext(boardContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { id } = useParams();

  useEffect(() => {
    if (isUserLoggedIn) {
      fetchCanvases();
    }
  }, [isUserLoggedIn]);

  useEffect(() => {
    // Update token when it changes in localStorage
    const handleStorageChange = () => {
      setToken(localStorage.getItem("whiteboard_user_token"));
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (id) {
      // First try to load from localStorage
      const savedCanvas = localStorage.getItem(`canvas_${id}`);
      if (savedCanvas) {
        const { elements, history } = JSON.parse(savedCanvas);
        setElements(elements);
        setHistory(history);
      }

      // Then fetch from server to ensure we have the latest data
      if (token) {
        axios
          .get(`http://localhost:5000/api/canvas/load/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          })
          .then((response) => {
            if (response.data) {
              setElements(response.data.elements || []);
              setHistory(response.data.history || []);
              // Update localStorage with latest data
              localStorage.setItem(
                `canvas_${id}`,
                JSON.stringify({
                  elements: response.data.elements || [],
                  history: response.data.history || [],
                })
              );
            }
          })
          .catch((error) => {
            if (error.response?.status === 401) {
              localStorage.removeItem("whiteboard_user_token");
              setUserLoginStatus(false);
              navigate("/login");
            }
          });
      }
    }
  }, [id, token]);

  const fetchCanvases = async () => {
    try {
      console.log("Fetching canvas list...");
      if (!token) {
        console.log("No token found, returning...");
        return;
      }
      const response = await axios.get(
        "http://localhost:5000/api/canvas/list",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("Canvas list fetched:", response.data);
      setCanvases(response.data);

      // If we have a canvas ID in the URL, use that
      if (id) {
        console.log("Using canvas ID from URL:", id);
        setCanvasId(id);
        handleCanvasClick(id);
      } else if (response.data.length > 0) {
        console.log("Using first canvas from list:", response.data[0]._id);
        setCanvasId(response.data[0]._id);
        handleCanvasClick(response.data[0]._id);
      }
    } catch (error) {
      console.error("Error in fetchCanvases:", error);
      if (error.response?.status === 401) {
        console.log("Unauthorized access, logging out...");
        localStorage.removeItem("whiteboard_user_token");
        setUserLoginStatus(false);
        navigate("/login");
      }
    }
  };

  const generateRandomName = () => {
    const adjectives = [
      "Creative",
      "Artistic",
      "Digital",
      "Dynamic",
      "Modern",
      "Innovative",
      "Smart",
      "Brilliant",
    ];
    const nouns = [
      "Canvas",
      "Board",
      "Workspace",
      "Studio",
      "Design",
      "Project",
      "Creation",
      "Masterpiece",
    ];
    const randomAdjective =
      adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNumber = Math.floor(Math.random() * 1000);
    return `${randomAdjective} ${randomNoun} ${randomNumber}`;
  };

  const handleCreateCanvas = async () => {
    try {
      console.log("Starting canvas creation...");
      const canvasName = generateRandomName();
      console.log("Generated canvas name:", canvasName);

      // Create new canvas
      console.log("Creating new canvas...");
      const response = await axios.post(
        "http://localhost:5000/api/canvas/create",
        { name: canvasName },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log("Canvas creation response:", response.data);

      // Get the new canvas ID
      const newCanvasId = response.data.canvasId;
      console.log("New canvas ID:", newCanvasId);

      // Clear any existing canvas data
      if (canvasId) {
        localStorage.removeItem(`canvas_${canvasId}`);
      }

      // Initialize new canvas state
      setElements([]);
      setHistory([]);
      setCanvasId(newCanvasId);

      // Add the new canvas to the list immediately
      const newCanvas = {
        _id: newCanvasId,
        name: canvasName,
        elements: [],
        shared: [],
        createdAt: new Date().toISOString(),
      };
      setCanvases((prevCanvases) => [newCanvas, ...prevCanvases]);

      // Navigate to the new canvas
      navigate(`/${newCanvasId}`);

      // Join the new canvas room
      joinCanvas(newCanvasId);

      // Update canvas list from server
      const updatedList = await axios.get(
        "http://localhost:5000/api/canvas/list",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCanvases(updatedList.data);
    } catch (error) {
      console.error("Error creating canvas:", error);
    }
  };

  const handleRenameCanvas = async (canvasId, newName) => {
    try {
      if (!token) {
        setError("Please login to rename canvas");
        return;
      }

      // Update the canvas name in the local state immediately
      setCanvases((prevCanvases) =>
        prevCanvases.map((canvas) =>
          canvas._id === canvasId ? { ...canvas, name: newName } : canvas
        )
      );

      // Try to update on the server in the background
      axios({
        method: "put",
        url: `http://localhost:5000/api/canvas/rename/${canvasId}`,
        data: { name: newName },
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).catch((error) => {
        console.error("Error in rename operation:", error);
      });

      setEditingCanvasId(null);
      setNewCanvasName("");
    } catch (error) {
      console.error("Error in rename operation:", error);
      setEditingCanvasId(null);
      setNewCanvasName("");
    }
  };

  const startEditing = (canvas) => {
    setEditingCanvasId(canvas._id);
    setNewCanvasName(canvas.name || canvas._id);
  };

  const handleKeyPress = (e, canvasId) => {
    if (e.key === "Enter") {
      handleRenameCanvas(canvasId, newCanvasName);
    } else if (e.key === "Escape") {
      setEditingCanvasId(null);
      setNewCanvasName("");
    }
  };

  const handleDeleteCanvas = async (id) => {
    try {
      await axios.delete(`http://localhost:5000/api/canvas/delete/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchCanvases();
      setCanvasId(canvases[0]._id);
      handleCanvasClick(canvases[0]._id);
    } catch (error) {
      console.error("Error deleting canvas:", error);
    }
  };

  const handleCanvasClick = async (id) => {
    try {
      if (!token) {
        console.log("No token found, returning...");
        return;
      }

      console.log("Switching to canvas:", id);

      // Clear any existing canvas data
      if (canvasId) {
        console.log("Clearing data for previous canvas:", canvasId);
        localStorage.removeItem(`canvas_${canvasId}`);
      }

      // Clear current state
      setElements([]);
      setHistory([]);

      // Initialize socket if not already done
      const socket = initializeSocket();
      if (!socket) {
        console.error("Failed to initialize socket");
        return;
      }

      // Join the new canvas room
      joinCanvas(id);

      // Fetch the new canvas data
      console.log("Fetching canvas data for:", id);
      const response = await axios.get(
        `http://localhost:5000/api/canvas/load/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data) {
        console.log("Canvas data received:", response.data);

        // Update the canvas state
        setCanvasId(id);
        setElements(response.data.elements || []);
        setHistory(response.data.history || []);

        // Save the canvas state to localStorage
        localStorage.setItem(
          `canvas_${id}`,
          JSON.stringify({
            elements: response.data.elements || [],
            history: response.data.history || [],
          })
        );

        // Navigate to the canvas
        navigate(`/${id}`);
      }
    } catch (error) {
      console.error("Error loading canvas:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("whiteboard_user_token");
        setUserLoginStatus(false);
        navigate("/login");
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("whiteboard_user_token");
    setCanvases([]);
    setUserLoginStatus(false);
    navigate("/");
  };

  const handleLogin = () => {
    navigate("/login");
  };

  const handleShare = async () => {
    if (!email.trim()) {
      setError("Please enter an email.");
      return;
    }

    try {
      setError(""); // Clear previous errors
      setSuccess(""); // Clear previous success message

      // First get the current canvas data to ensure we have the latest elements
      const canvasResponse = await axios.get(
        `http://localhost:5000/api/canvas/load/${canvasId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Then share the canvas
      const response = await axios.put(
        `http://localhost:5000/api/canvas/share/${canvasId}`,
        { email },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess(response.data.message);
      setTimeout(() => {
        setSuccess("");
      }, 5000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to share canvas.");
      setTimeout(() => {
        setError("");
      }, 5000);
    }
  };

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="sidebar-container">
      <div className={`sidebar ${isOpen ? "open" : ""}`}>
        <button
          className="create-button"
          onClick={handleCreateCanvas}
          disabled={!isUserLoggedIn}
        >
          + Create New Canvas
        </button>
        <ul className="canvas-list">
          {canvases.map((canvas) => (
            <li
              key={canvas._id}
              className={`canvas-item ${
                canvas._id === canvasId ? "selected" : ""
              }`}
            >
              {editingCanvasId === canvas._id ? (
                <input
                  type="text"
                  value={newCanvasName}
                  onChange={(e) => setNewCanvasName(e.target.value)}
                  onKeyDown={(e) => handleKeyPress(e, canvas._id)}
                  onBlur={() => handleRenameCanvas(canvas._id, newCanvasName)}
                  className="canvas-name-input"
                  autoFocus
                />
              ) : (
                <span
                  className="canvas-name"
                  onClick={() => handleCanvasClick(canvas._id)}
                  onDoubleClick={() => startEditing(canvas)}
                >
                  {canvas.name || canvas._id}
                </span>
              )}
              <div className="canvas-actions">
                <button
                  className="rename-button"
                  onClick={() => startEditing(canvas)}
                  title="Rename canvas"
                >
                  ✏️
                </button>
                <button
                  className="delete-button"
                  onClick={() => handleDeleteCanvas(canvas._id)}
                  title="Delete canvas"
                >
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="share-container">
          <input
            type="email"
            placeholder="Enter the email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="share-button"
            onClick={handleShare}
            disabled={!isUserLoggedIn}
          >
            Share
          </button>
          {error && <p className="error-message">{error}</p>}
          {success && <p className="success-message">{success}</p>}
        </div>
        {isUserLoggedIn ? (
          <button className="auth-button logout-button" onClick={handleLogout}>
            Logout
          </button>
        ) : (
          <button className="auth-button login-button" onClick={handleLogin}>
            Login
          </button>
        )}
      </div>
      <button
        className="hamburger-menu"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>
    </div>
  );
};

export default Sidebar;

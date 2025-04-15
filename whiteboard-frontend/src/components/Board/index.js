import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import rough from "roughjs";
import boardContext from "../../store/board-context";
import { TOOL_ACTION_TYPES, TOOL_ITEMS } from "../../constants";
import toolboxContext from "../../store/toolbox-context";
import { initializeSocket, getSocket } from "../../utils/socket";
import { getSvgPathFromStroke } from "../../utils/element";
import getStroke from "perfect-freehand";
import axios from "axios";

import classes from "./index.module.css";

function Board({ id }) {
  const canvasRef = useRef();
  const textAreaRef = useRef();

  const {
    elements = [],
    toolActionType,
    boardMouseDownHandler,
    boardMouseMoveHandler,
    boardMouseUpHandler,
    textAreaBlurHandler,
    undo,
    redo,
    setCanvasId,
    setElements,
    setHistory,
  } = useContext(boardContext);
  const { toolboxState, activeToolItem } = useContext(toolboxContext);

  const token = localStorage.getItem("whiteboard_user_token");
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = initializeSocket();
    if (newSocket) {
      setSocket(newSocket);
    }
    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (socket && id) {
      // Join the canvas room (no need for userId)
      socket.emit("joinCanvas", { canvasId: id });

      // Listen for updates from other users
      socket.on("receiveDrawingUpdate", (updatedElements) => {
        setElements(updatedElements);
      });

      // Load initial canvas data
      socket.on("loadCanvas", (initialElements) => {
        setElements(initialElements);
      });

      socket.on("unauthorized", (data) => {
        console.log(data.message);
        alert("Access Denied: You cannot edit this canvas.");
        setIsAuthorized(false);
      });

      return () => {
        socket.off("receiveDrawingUpdate");
        socket.off("loadCanvas");
        socket.off("unauthorized");
      };
    }
  }, [id, socket]);

  useEffect(() => {
    const fetchCanvasData = async () => {
      if (id && token) {
        try {
          // First try to load from localStorage
          const savedCanvas = localStorage.getItem(`canvas_drawings_${id}`);
          if (savedCanvas) {
            const { elements: savedElements, history: savedHistory } =
              JSON.parse(savedCanvas);
            setElements(savedElements);
            setHistory(savedHistory);
          }

          // Then fetch from server
          const response = await axios.get(
            `https://whiteboard-5lyf.onrender.com/api/canvas/load/${id}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (response.data) {
            setCanvasId(id);
            setElements(response.data.elements || []);
            setHistory(response.data.history || []);

            // Save to localStorage
            localStorage.setItem(
              `canvas_drawings_${id}`,
              JSON.stringify({
                elements: response.data.elements || [],
                history: response.data.history || [],
              })
            );
          }
        } catch (error) {
          console.error("Error loading canvas:", error);
        }
      }
    };

    fetchCanvasData();
  }, [id, token]);

  // Save canvas state whenever elements change
  useEffect(() => {
    if (id && elements.length > 0) {
      localStorage.setItem(
        `canvas_drawings_${id}`,
        JSON.stringify({
          elements,
          history: elements,
        })
      );
    }
  }, [elements, id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.ctrlKey && event.key === "z") {
        undo();
      } else if (event.ctrlKey && event.key === "y") {
        redo();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.save();

    const roughCanvas = rough.canvas(canvas);

    if (Array.isArray(elements)) {
      elements.forEach((element) => {
        if (!element) return;

        switch (element.type) {
          case TOOL_ITEMS.LINE:
          case TOOL_ITEMS.RECTANGLE:
          case TOOL_ITEMS.CIRCLE:
          case TOOL_ITEMS.ARROW:
            if (element.roughEle) {
              roughCanvas.draw(element.roughEle);
            }
            break;
          case TOOL_ITEMS.BRUSH:
            if (element.points) {
              context.fillStyle = element.stroke || "#000000";
              const path = new Path2D(
                getSvgPathFromStroke(getStroke(element.points))
              );
              context.fill(path);
              context.restore();
            }
            break;
          case TOOL_ITEMS.TEXT:
            context.textBaseline = "top";
            context.font = `${element.size || 16}px Caveat`;
            context.fillStyle = element.stroke || "#000000";
            context.fillText(
              element.text || "",
              element.x1 || 0,
              element.y1 || 0
            );
            context.restore();
            break;
          default:
            console.warn("Unknown element type:", element.type);
        }
      });
    }

    return () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [elements]);

  useEffect(() => {
    const textarea = textAreaRef.current;
    if (toolActionType === TOOL_ACTION_TYPES.WRITING) {
      setTimeout(() => {
        textarea.focus();
      }, 0);
    }
  }, [toolActionType]);

  const handleMouseDown = (event) => {
    if (!isAuthorized) return;
    boardMouseDownHandler(event, toolboxState);
  };

  const handleMouseMove = (event) => {
    if (!isAuthorized) return;
    boardMouseMoveHandler(event);
    if (socket) {
      socket.emit("drawingUpdate", { canvasId: id, elements });
    }
  };

  const handleMouseUp = () => {
    if (!isAuthorized) return;
    boardMouseUpHandler();
    if (socket) {
      socket.emit("drawingUpdate", { canvasId: id, elements });
    }
  };

  return (
    <>
      {toolActionType === TOOL_ACTION_TYPES.WRITING && (
        <textarea
          type="text"
          ref={textAreaRef}
          className={classes.textElementBox}
          style={{
            top: elements[elements.length - 1].y1,
            left: elements[elements.length - 1].x1,
            fontSize: `${elements[elements.length - 1]?.size}px`,
            color: elements[elements.length - 1]?.stroke,
          }}
          onBlur={(event) => textAreaBlurHandler(event.target.value)}
        />
      )}
      <canvas
        ref={canvasRef}
        id="canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          cursor:
            toolActionType === TOOL_ACTION_TYPES.ERASING
              ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='%23000' d='M15.14 3c-.51 0-1.02.2-1.41.59L2.59 14.73c-.78.78-.78 2.05 0 2.83L5.03 20h9.11c.51 0 1.02-.2 1.41-.59l7.41-7.41c.78-.78.78-2.05 0-2.83L16.55 3.59c-.39-.39-.9-.59-1.41-.59zM17 14.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5z'/></svg>\") 0 24, auto"
              : toolActionType === TOOL_ACTION_TYPES.DRAWING
              ? activeToolItem === TOOL_ITEMS.LINE
                ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='%23000' d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z'/></svg>\") 0 24, auto"
                : activeToolItem === TOOL_ITEMS.RECTANGLE
                ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='%23000' d='M3 5v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2zm12 4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zm-9 8c0-2 4-3.1 6-3.1s6 1.1 6 3.1v1H6v-1z'/></svg>\") 0 24, auto"
                : activeToolItem === TOOL_ITEMS.CIRCLE
                ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='%23000' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'/></svg>\") 0 24, auto"
                : activeToolItem === TOOL_ITEMS.ARROW
                ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='%23000' d='M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z'/></svg>\") 0 24, auto"
                : "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='%23000' d='M17.75 7L14 3.25l-10 10V17h3.75l10-10zm2.96-2.96c.39-.39.39-1.02 0-1.41L18.37.29c-.39-.39-1.02-.39-1.41 0L15 2.25 18.75 6l1.96-1.96z'/></svg>\") 0 24, auto"
              : "default",
        }}
      />
    </>
  );
}

export default Board;

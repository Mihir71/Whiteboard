import React, { useCallback, useReducer, useEffect } from "react";
import boardContext from "./board-context";
import { BOARD_ACTIONS, TOOL_ACTION_TYPES, TOOL_ITEMS } from "../constants";
import { createElement, isPointNearElement } from "../utils/element";
import { updateCanvas, fetchInitialCanvasElements } from "../utils/api";
import { initializeSocket, getSocket, disconnectSocket } from "../utils/socket";

const canvasId = "67a66a7c2475972d34655e4d";

const boardReducer = (state, action) => {
  switch (action.type) {
    case BOARD_ACTIONS.CHANGE_TOOL: {
      return {
        ...state,
        activeToolItem: action.payload.tool,
      };
    }
    case BOARD_ACTIONS.CHANGE_ACTION_TYPE:
      return {
        ...state,
        toolActionType: action.payload.actionType,
      };
    case BOARD_ACTIONS.DRAW_DOWN: {
      const { clientX, clientY, stroke, fill, size } = action.payload;
      const newElement = createElement(
        state.elements.length,
        clientX,
        clientY,
        clientX,
        clientY,
        { type: state.activeToolItem, stroke, fill, size }
      );
      const prevElements = state.elements;
      return {
        ...state,
        toolActionType:
          state.activeToolItem === TOOL_ITEMS.TEXT
            ? TOOL_ACTION_TYPES.WRITING
            : TOOL_ACTION_TYPES.DRAWING,
        elements: [...prevElements, newElement],
      };
    }
    case BOARD_ACTIONS.DRAW_MOVE: {
      const { clientX, clientY } = action.payload;
      const newElements = [...state.elements];
      const index = state.elements.length - 1;

      // Check if there are any elements and if the index is valid
      if (index < 0 || !newElements[index]) {
        return state;
      }

      const { type } = newElements[index];
      switch (type) {
        case TOOL_ITEMS.LINE:
        case TOOL_ITEMS.RECTANGLE:
        case TOOL_ITEMS.CIRCLE:
        case TOOL_ITEMS.ARROW:
          const { x1, y1, stroke, fill, size } = newElements[index];
          const newElement = createElement(index, x1, y1, clientX, clientY, {
            type: state.activeToolItem,
            stroke,
            fill,
            size,
          });
          newElements[index] = newElement;
          return {
            ...state,
            elements: newElements,
          };
        case TOOL_ITEMS.BRUSH:
          if (!newElements[index].points) {
            newElements[index].points = [];
          }
          newElements[index].points = [
            ...newElements[index].points,
            { x: clientX, y: clientY },
          ];
          return {
            ...state,
            elements: newElements,
          };
        default:
          return state;
      }
    }
    case BOARD_ACTIONS.DRAW_UP: {
      const elementsCopy = [...state.elements];
      const newHistory = state.history.slice(0, state.index + 1);
      newHistory.push(elementsCopy);
      // updateCanvas(state.canvasId, elementsCopy);
      // if (state.isUserLoggedIn) {
      //   updateCanvas(state.canvasId, elementsCopy);
      // }

      return {
        ...state,
        history: newHistory,
        index: state.index + 1,
      };
    }
    case BOARD_ACTIONS.ERASE: {
      const { clientX, clientY } = action.payload;
      let newElements = [...state.elements];
      newElements = newElements.filter((element) => {
        return !isPointNearElement(element, clientX, clientY);
      });
      const newHistory = state.history.slice(0, state.index + 1);
      newHistory.push(newElements);
      // updateCanvas(state.canvasId, newElements);
      // if (state.isUserLoggedIn) {
      //   updateCanvas(state.canvasId, newElements);
      // }
      return {
        ...state,
        elements: newElements,
        history: newHistory,
        index: state.index + 1,
      };
    }
    case BOARD_ACTIONS.CHANGE_TEXT: {
      const index = state.elements.length - 1;
      const newElements = [...state.elements];
      newElements[index].text = action.payload.text;
      const newHistory = state.history.slice(0, state.index + 1);
      newHistory.push(newElements);
      // updateCanvas(state.canvasId, newElements);
      // if (state.isUserLoggedIn) {
      //   updateCanvas(state.canvasId, newElements);
      // }
      return {
        ...state,
        toolActionType: TOOL_ACTION_TYPES.NONE,
        elements: newElements,
        history: newHistory,
        index: state.index + 1,
      };
    }
    case BOARD_ACTIONS.UNDO: {
      if (state.index <= 0) return state;
      console.log("undo testing ", state.history);
      // updateCanvas(state.canvasId, state.history[state.index - 1]);
      // if (state.isUserLoggedIn) {
      //   updateCanvas(state.canvasId, state.history[state.index - 1]);
      // }
      return {
        ...state,
        elements: state.history[state.index - 1],
        index: state.index - 1,
      };
    }
    case BOARD_ACTIONS.REDO: {
      if (state.index >= state.history.length - 1) return state;
      // updateCanvas(state.canvasId, state.history[state.index + 1]);
      // if (state.isUserLoggedIn) {
      //   updateCanvas(state.canvasId, state.history[state.index + 1]);
      // }
      return {
        ...state,
        elements: state.history[state.index + 1],
        index: state.index + 1,
      };
    }
    case BOARD_ACTIONS.SET_INITIAL_ELEMENTS: {
      return {
        ...state,
        elements: action.payload.elements,
        history: [action.payload.elements],
      };
    }
    case BOARD_ACTIONS.SET_CANVAS_ID:
      return {
        ...state,
        canvasId: action.payload.canvasId,
        elements: [],
        history: [[]],
        index: 0,
      };
    case BOARD_ACTIONS.SET_CANVAS_ELEMENTS:
      return {
        ...state,
        elements: action.payload.elements || [],
        history: [action.payload.elements || []],
        index: 0,
      };

    case BOARD_ACTIONS.SET_HISTORY:
      return {
        ...state,
        history: [action.payload.elements || []],
        index: 0,
      };

    case BOARD_ACTIONS.SET_USER_LOGIN_STATUS:
      return {
        ...state,
        isUserLoggedIn: action.payload.isUserLoggedIn,
      };
    default:
      return state;
  }
};

const isUserLoggedIn = !!localStorage.getItem("whiteboard_user_token");

const initialBoardState = {
  activeToolItem: TOOL_ITEMS.BRUSH,
  toolActionType: TOOL_ACTION_TYPES.NONE,
  elements: [],
  history: [[]],
  index: 0,
  canvasId: "",
  isUserLoggedIn: isUserLoggedIn,
};

const BoardProvider = ({ children }) => {
  const [boardState, dispatch] = useReducer(boardReducer, initialBoardState);

  // Load saved canvas state on mount
  useEffect(() => {
    const savedCanvas = localStorage.getItem(
      `canvas_state_${boardState.canvasId}`
    );
    if (savedCanvas) {
      try {
        const { elements, history } = JSON.parse(savedCanvas);
        setElements(elements);
        setHistory(history);
      } catch (error) {
        console.error("Error loading canvas state:", error);
        localStorage.removeItem(`canvas_state_${boardState.canvasId}`);
      }
    }
  }, [boardState.canvasId]);

  // Save canvas state whenever it changes
  useEffect(() => {
    if (boardState.canvasId && boardState.elements.length > 0) {
      try {
        // Only save the last 100 elements to prevent quota issues
        const elementsToSave = boardState.elements.slice(-100);
        const historyToSave = boardState.history.slice(-10);

        const stateToSave = {
          elements: elementsToSave,
          history: historyToSave,
        };

        // Try to save to localStorage
        try {
          localStorage.setItem(
            `canvas_state_${boardState.canvasId}`,
            JSON.stringify(stateToSave)
          );
        } catch (error) {
          // If quota exceeded, clear old states and try again
          if (error.name === "QuotaExceededError") {
            // Clear all canvas states except current
            Object.keys(localStorage).forEach((key) => {
              if (
                key.startsWith("canvas_state_") &&
                key !== `canvas_state_${boardState.canvasId}`
              ) {
                localStorage.removeItem(key);
              }
            });
            // Try saving again
            localStorage.setItem(
              `canvas_state_${boardState.canvasId}`,
              JSON.stringify(stateToSave)
            );
          }
        }
      } catch (error) {
        console.error("Error saving canvas state:", error);
      }
    }
  }, [boardState.elements, boardState.history, boardState.canvasId]);

  useEffect(() => {
    const socket = initializeSocket();
    if (!socket) {
      console.error("Failed to initialize socket connection");
      return;
    }

    if (boardState.canvasId) {
      console.log("Joining canvas:", boardState.canvasId);
      socket.emit("joinCanvas", { canvasId: boardState.canvasId });

      socket.on("unauthorized", (error) => {
        console.error("Socket authentication error:", error);
      });

      socket.on("loadCanvas", (elements) => {
        console.log("Loading canvas elements:", elements);
        setElements(elements || []);
      });

      socket.on("receiveDrawingUpdate", (elements) => {
        console.log("Received drawing update:", elements);
        setElements(elements || []);
      });
    }

    return () => {
      if (socket) {
        socket.off("unauthorized");
        socket.off("loadCanvas");
        socket.off("receiveDrawingUpdate");
        disconnectSocket();
      }
    };
  }, [boardState.canvasId]);

  const changeToolHandler = (tool) => {
    dispatch({
      type: BOARD_ACTIONS.CHANGE_TOOL,
      payload: {
        tool,
      },
    });
  };

  const boardMouseDownHandler = (event, toolboxState) => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    const { clientX, clientY } = event;
    if (boardState.activeToolItem === TOOL_ITEMS.ERASER) {
      dispatch({
        type: BOARD_ACTIONS.CHANGE_ACTION_TYPE,
        payload: {
          actionType: TOOL_ACTION_TYPES.ERASING,
        },
      });
      return;
    }
    dispatch({
      type: BOARD_ACTIONS.DRAW_DOWN,
      payload: {
        clientX,
        clientY,
        stroke: toolboxState[boardState.activeToolItem]?.stroke,
        fill: toolboxState[boardState.activeToolItem]?.fill,
        size: toolboxState[boardState.activeToolItem]?.size,
      },
    });
  };

  const boardMouseMoveHandler = (event) => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    const { clientX, clientY } = event;
    if (boardState.toolActionType === TOOL_ACTION_TYPES.DRAWING) {
      dispatch({
        type: BOARD_ACTIONS.DRAW_MOVE,
        payload: {
          clientX,
          clientY,
        },
      });
    } else if (boardState.toolActionType === TOOL_ACTION_TYPES.ERASING) {
      dispatch({
        type: BOARD_ACTIONS.ERASE,
        payload: {
          clientX,
          clientY,
        },
      });
    }
  };

  const boardMouseUpHandler = () => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    if (boardState.toolActionType === TOOL_ACTION_TYPES.DRAWING) {
      dispatch({
        type: BOARD_ACTIONS.DRAW_UP,
      });
    }
    dispatch({
      type: BOARD_ACTIONS.CHANGE_ACTION_TYPE,
      payload: {
        actionType: TOOL_ACTION_TYPES.NONE,
      },
    });
  };

  const textAreaBlurHandler = (text) => {
    dispatch({
      type: BOARD_ACTIONS.CHANGE_TEXT,
      payload: {
        text,
      },
    });
  };

  const boardUndoHandler = useCallback(() => {
    dispatch({
      type: BOARD_ACTIONS.UNDO,
    });
  }, []);

  const boardRedoHandler = useCallback(() => {
    dispatch({
      type: BOARD_ACTIONS.REDO,
    });
  }, []);

  const setCanvasId = (canvasId) => {
    dispatch({
      type: BOARD_ACTIONS.SET_CANVAS_ID,
      payload: {
        canvasId,
      },
    });
  };

  const setElements = (elements) => {
    dispatch({
      type: BOARD_ACTIONS.SET_CANVAS_ELEMENTS,
      payload: {
        elements,
      },
    });
  };
  // console.log("hello canvas")
  const setHistory = (elements) => {
    dispatch({
      type: BOARD_ACTIONS.SET_HISTORY,
      payload: {
        elements,
      },
    });
  };

  const setUserLoginStatus = (isUserLoggedIn) => {
    dispatch({
      type: BOARD_ACTIONS.SET_USER_LOGIN_STATUS,
      payload: {
        isUserLoggedIn,
      },
    });
  };

  const boardContextValue = {
    activeToolItem: boardState.activeToolItem,
    elements: boardState.elements,
    toolActionType: boardState.toolActionType,
    canvasId: boardState.canvasId,
    isUserLoggedIn: boardState.isUserLoggedIn,
    changeToolHandler,
    boardMouseDownHandler,
    boardMouseMoveHandler,
    boardMouseUpHandler,
    textAreaBlurHandler,
    undo: boardUndoHandler,
    redo: boardRedoHandler,
    setCanvasId,
    setElements,
    setHistory,
    setUserLoginStatus,
  };

  return (
    <boardContext.Provider value={boardContextValue}>
      {children}
    </boardContext.Provider>
  );
};

export default BoardProvider;

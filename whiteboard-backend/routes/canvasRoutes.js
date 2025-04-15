const express = require("express");
const {
  createCanvas,
  updateCanvas,
  loadCanvas,
  shareCanvas,
  unshareCanvas,
  deleteCanvas,
  getUserCanvases,
  renameCanvas,
} = require("../controllers/canvasController");
const { authMiddleware } = require("../middlewares/authMiddleware");

const router = express.Router();

// Debug middleware for canvas routes
router.use((req, res, next) => {
  console.log(`Canvas route: ${req.method} ${req.url}`);
  next();
});

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Canvas routes working" });
});

// Canvas routes
router.post("/create", authMiddleware, createCanvas);
router.put("/update", authMiddleware, updateCanvas);
router.get("/load/:id", authMiddleware, loadCanvas);
router.put("/share/:id", authMiddleware, shareCanvas);
router.put("/unshare/:id", authMiddleware, unshareCanvas);
router.delete("/delete/:id", authMiddleware, deleteCanvas);
router.get("/list", authMiddleware, getUserCanvases);

// Rename route with explicit path
router
  .route("/rename/:id")
  .put(authMiddleware, renameCanvas)
  .all((req, res) => {
    res.status(405).json({ error: "Method not allowed" });
  });

module.exports = router;

import { Command } from "commander";
import fs from "fs";
import express from "express";
import multer from "multer";
import path from "path";

const program = new Command();

program
  .requiredOption("-h, --host <host>", "Server host")
  .requiredOption("-p, --port <port>", "Server port")
  .requiredOption("-c, --cache <path>", "Path to cache directory");

program.parse(process.argv);
const options = program.opts();

if (!fs.existsSync(options.cache)) {
  fs.mkdirSync(options.cache, { recursive: true });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(`/${options.cache}`, express.static(options.cache)); // доступ до фото

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, options.cache),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

let inventory = [];
let nextId = 1;


function createInventoryItem(name, description, photoPath) {
  const item = {
    id: nextId++,
    name,
    description,
    photo: photoPath
  };
  inventory.push(item);
  return item;
}

/**
 * POST /register
 * Створює новий інвентарний елемент.
 */
app.post("/register", upload.single("photo"), (req, res) => {
  const name = req.body.inventory_name;
  const description = req.body.description || "";

  if (!name) {
    return res.status(400).json({ error: "inventory_name is required" });
  }

  const photo = req.file ? req.file.filename : null;
  const item = createInventoryItem(name, description, photo);

  res.status(201).json(item);
});

/**
 * GET /inventory
 * Отримує список усіх інвентарних елементів.
 */
app.get("/inventory", (req, res) => {
  const result = inventory.map(item => ({
    ...item,
    photo: item.photo ? `/${options.cache}/${item.photo}` : null
  }));
  res.json(result);
});

/**
 * GET /inventory/:id
 * Повертає один інвентарний елемент за ID.
 */
app.get("/inventory/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: "Not Found" });
  }

  const enrichedItem = {
    ...item,
    photo: item.photo ? `/${options.cache}/${item.photo}` : null
  };
  res.json(enrichedItem);
});

/**
 * GET /inventory/:id/photo
 * Повертає файл фотографії інвентарного елемента.
 */
app.get("/inventory/:id/photo", (req, res) => {
  const id = Number(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item || !item.photo) {
    return res.status(404).send("Not Found");
  }

  const filePath = path.join(options.cache, item.photo);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Photo not found");
  }

  res.sendFile(filePath, { root: process.cwd() });
});

/**
 * PUT /inventory/:id/photo
 * Оновлює фотографію інвентарного елемента.
 */
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const id = Number(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: "Not Found" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Photo file required" });
  }

  item.photo = req.file.filename;
  res.json(item);
});

/**
 * PUT /inventory/:id
 * Оновлює назву або опис інвентарного елемента.
 */
app.put("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: "Not Found" });
  }

  const { name, description } = req.body;

  if (name !== undefined) item.name = name;
  if (description !== undefined) item.description = description;

  res.json(item);
});

/**
 * DELETE /inventory/:id
 * Видаляє інвентарний елемент.
 */
app.delete("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = inventory.findIndex(i => i.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Not Found" });
  }

  inventory.splice(index, 1);
  res.send("Deleted");
});

/**
 * POST /search
 * Шукає елемент по ID і може додати інфо про фото.
 */
app.post("/search", (req, res) => {
  const id = Number(req.body.id);
  const hasPhoto = req.body.has_photo;

  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: "Not Found" });
  }

  let result = { ...item };

  if (hasPhoto === "yes" && item.photo) {
    result.description += ` (Photo: /${options.cache}/${item.photo})`;
  }

  res.json(result);
});

/**
 * GET /swagger.json
 * Повертає Swagger-документацію в JSON.
 */
app.get("/swagger.json", (req, res) => {
  const swagger = fs.readFileSync("./swagger.json", "utf-8");
  res.setHeader("Content-Type", "application/json");
  res.send(swagger);
});

/**
 * GET /docs
 * Відображає Swagger UI.
 */
app.get("/docs", (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>API Documentation</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">
      </head>
      <body>
        <div id="swagger"></div>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
        <script>
          SwaggerUIBundle({
            url: "/swagger.json",
            dom_id: "#swagger"
          });
        </script>
      </body>
    </html>
  `;
  res.send(html);
});

// 404 handler
app.use((req, res) => {
  res.status(405).send("Method Not Allowed");
});

  
app.listen(options.port, options.host, () => {
  console.log(`Server running at http://${options.host}:${options.port}/`);
});

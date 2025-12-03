import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import express from "express";
import multer from "multer";
import { Command } from "commander";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const program = new Command();

program
  .requiredOption("-h, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port")
  .requiredOption("-c, --cache <path>", "cache directory");

program.parse(process.argv);
const options = program.opts();

const app = express();
const HOST = options.host;
const PORT = options.port;
const CACHE = options.cache;

// --- __dirname для ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- END __dirname ---

// --- Swagger Setup ---
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Inventory API",
    version: "1.0.0",
    description: "API документація для сервісу інвентаризації"
  },
  servers: [
    {
      url: `http://${HOST}:${PORT}`,
      description: "Local Server"
    }
  ]
};

const swaggerOptions = {
  swaggerDefinition,
  apis: [path.join(__dirname, "*.js")]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// --- END Swagger Setup ---

if (!fs.existsSync(CACHE)) {
  fs.mkdirSync(CACHE, { recursive: true });
}

const INVENTORY_FILE = path.join(CACHE, "inventory.json");
if (!fs.existsSync(INVENTORY_FILE)) {
  fs.writeFileSync(INVENTORY_FILE, "[]");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(CACHE));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CACHE);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

/**
 * @openapi
 * /register:
 *   post:
 *     summary: Реєстрація нового інвентарного об'єкта
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Успішно створено об'єкт (повертає створений об'єкт)
 *       400:
 *         description: Невірний запит (наприклад, відсутній inventory_name)
 */
app.post("/register", upload.single("photo"), (req, res) => {
  const name = req.body.inventory_name;
  const desc = req.body.description || "";

  if (!name) {
    return res.status(400).send("name is required");
  }

  const data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  const maxId = data.length > 0 ? Math.max(...data.map(item => item.id)) : 0;
  const photoName = req.file ? req.file.filename : null;

  const item = {
    id: maxId + 1,
    inventory_name: name,
    description: desc,
    photo: photoName
  };

  data.push(item);
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data));
  const photoUrl = photoName ? `${req.protocol}://${req.get("host")}/uploads/${photoName}` : null;
  res.status(201).json({ ...item, photo: photoUrl });
});

/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: Отримати список всіх інвентарних об'єктів
 *     responses:
 *       200:
 *         description: Повертає масив об'єктів
 */
app.get("/inventory", (req, res) => {
  const data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  // Повертаємо URL для всіх фото
  const dataWithUrls = data.map(item => ({
    ...item,
    photo: item.photo ? `${req.protocol}://${req.get("host")}/uploads/${item.photo}` : null
  }));
  res.status(200).json(dataWithUrls);
});

/**
 * @openapi
 * /inventory/{id}:
 *   get:
 *     summary: Отримати інвентарний об'єкт по ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Повертає об'єкт
 *       404:
 *         description: Не знайдено
 */
app.get("/inventory/:id", (req, res) => {
  const data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  const item = data.find((i) => i.id == req.params.id);
  if (!item) return res.status(404).send("Not found");
  const photoUrl = item.photo ? `${req.protocol}://${req.get("host")}/uploads/${item.photo}` : null;
  res.status(200).json({ ...item, photo: photoUrl });
});

/**
 * @openapi
 * /inventory/{id}:
 *   put:
 *     summary: Оновити ім'я або опис інвентарного об'єкта
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Оновлено
 *       404:
 *         description: Не знайдено
 */
app.put("/inventory/:id", (req, res) => {
  const data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  const item = data.find(i => i.id == req.params.id);
  if (!item) return res.status(404).send("Not found");

  if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
  if (req.body.description) item.description = req.body.description;

  if (req.file) item.photo = req.file.filename;

  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data));
  const photoUrl = item.photo ? `${req.protocol}://${req.get("host")}/uploads/${item.photo}` : null;
  res.status(200).json({ ...item, photo: photoUrl });
});

/**
 * @openapi
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото інвентарного об'єкта
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Повертає зображення (image/jpeg)
 *       404:
 *         description: Фото відсутнє або об'єкт не знайдено
 */
app.get("/inventory/:id/photo", (req, res) => {
  const data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  const item = data.find((i) => i.id == req.params.id);

  if (!item || !item.photo) return res.status(404).send("No photo");

  const filePath = path.join(CACHE, item.photo);
  res.sendFile(path.resolve(filePath));
});

/**
 * @openapi
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити/додати фото для інвентарного об'єкта
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       400:
 *         description: Нема фото в запиті
 *       404:
 *         description: Об'єкт не знайдено
 */
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  const item = data.find((i) => i.id == req.params.id);

  if (!item) return res.status(404).send("Not found");
  if (!req.file) return res.status(400).send("No photo");

  item.photo = req.file.filename;
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data));

  res.status(200).json(item);
});

/**
 * @openapi
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити інвентарний об'єкт
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Видалено
 *       404:
 *         description: Не знайдено
 */
app.delete("/inventory/:id", (req, res) => {
  let data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  const index = data.findIndex((i) => i.id == req.params.id);

  if (index === -1) return res.status(404).send("Not found");

  data.splice(index, 1);
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data));
  res.status(200).send("Deleted");
});

/**
 * @openapi
 * /RegisterForm.html:
 *   get:
 *     summary: Повернути HTML-форму реєстрації (RegisterForm.html)
 *     responses:
 *       200:
 *         description: HTML файл
 */
app.get("/RegisterForm.html", (req, res) => {
  res.sendFile(path.resolve("./RegisterForm.html"));
});

/**
 * @openapi
 * /SearchForm.html:
 *   get:
 *     summary: Повернути HTML-форму пошуку (SearchForm.html)
 *     responses:
 *       200:
 *         description: HTML файл
 */
app.get("/SearchForm.html", (req, res) => {
  res.sendFile(path.resolve("./SearchForm.html"));
});

/**
 * @openapi
 * /search:
 *   post:
 *     summary: Пошук інвентарного об'єкта за ID (форма)
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               has_photo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Повертає знайдений об'єкт (за бажанням без поля photo)
 *       404:
 *         description: Не знайдено
 */
app.post("/search", (req, res) => {
  const id = Number(req.body.id);
  const includePhoto = req.body.has_photo === "on"; // якщо чекбокс відмічено

  const data = JSON.parse(fs.readFileSync(INVENTORY_FILE));
  const item = data.find(i => i.id === id);

  if (!item) return res.status(404).send("Not found");

  const result = { ...item };

  if (includePhoto && result.photo) {
    result.photo = `${req.protocol}://${req.get("host")}/uploads/${result.photo}`;
  } else {
    delete result.photo;
  }

  res.status(200).json(result);
});

app.use((req, res) => {
  res.status(405).send("Method not allowed");
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});

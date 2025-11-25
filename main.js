import { Command } from "commander";
import fs from "fs";
import http from "http";
import formidable from "formidable";
import path from "path";

let inventory = [];
let nextId = 1;

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

function handleRegister(req, res) {
  const form = formidable({
    uploadDir: options.cache,
    keepExtensions: true
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.statusCode = 500;
      res.end("Error parsing form");
      return;
    }

    const name = fields.inventory_name;
    const description = fields.description || "";
    const photo = files.photo;

    if (!name) {
      res.statusCode = 400;
      res.end("inventory_name is required");
      return;
    }

    let photoPath = null;

    if (photo && photo[0]) {
      photoPath = path.basename(photo[0].filepath);
    }

    const item = createInventoryItem(name, description, photoPath);

    res.statusCode = 201;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(item));
  });
}


const server = http.createServer((req, res) => {
    const method = req.method;
    const url = req.url;

    if (method === "POST" && url === "/register") {
    handleRegister(req, res);
    return;
  }


  if (method === "GET" && url === "/inventory") {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");

  const result = inventory.map(item => ({
    ...item,
    photo: item.photo ? `/${options.cache}/${item.photo}` : null
  }));

  res.end(JSON.stringify(result));
  return;
}


if (method === "PUT" && url.startsWith("/inventory/") && url.endsWith("/photo")) {
  const id = Number(url.split("/")[2]);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    res.statusCode = 404;
    return res.end("Not Found");
  }

  const form = formidable({
    uploadDir: options.cache,
    keepExtensions: true
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.statusCode = 500;
      return res.end("Error parsing form");
    }

    const photo = files.photo;

    if (photo && photo[0]) {
      const filename = path.basename(photo[0].filepath);
      item.photo = filename;
    } else {
      res.statusCode = 400;
      return res.end("Photo file required");
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(item));
  });

  return;
}


if (method === "PUT" && url.startsWith("/inventory/")) {
  const id = Number(url.split("/")[2]);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    res.statusCode = 404;
    return res.end("Not Found");
  }

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    try {
      const data = JSON.parse(body);

      item.name = data.name ?? item.name;
      item.description = data.description ?? item.description;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(item));

    } catch {
      res.statusCode = 400;
      res.end("Invalid JSON");
    }
  });

  return;
}


if (method === "GET" && url.startsWith("/inventory/") && url.endsWith("/photo")) {
  const id = Number(url.split("/")[2]);
  const item = inventory.find(i => i.id === id);

  if (!item || !item.photo) {
    res.statusCode = 404;
    return res.end("Not Found");
  }

  const filePath = `${options.cache}/${item.photo}`;

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    return res.end("Photo not found");
  }

  res.writeHead(200, { "Content-Type": "image/jpeg" });
  fs.createReadStream(filePath).pipe(res);
  return;
}


if (method === "GET" && url.startsWith("/inventory/")) {
  const id = parseInt(url.split("/")[2]);

  const item = inventory.find(i => i.id === id);

  if (!item) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  const enrichedItem = {
    ...item,
    photo: item.photo ? `/${options.cache}/${item.photo}` : null
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(enrichedItem));
  return;
}


if (method === "DELETE" && url.startsWith("/inventory/")) {
  const id = Number(url.split("/")[2]);
  const index = inventory.findIndex(i => i.id === id);

  if (index === -1) {
    res.statusCode = 404;
    return res.end("Not Found");
  }

  inventory.splice(index, 1);

  res.statusCode = 200;
  res.end("Deleted");
  return;
}


if (method === "POST" && url === "/search") {
  let body = "";

  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    const params = new URLSearchParams(body);

    const id = Number(params.get("id"));
    const hasPhoto = params.get("has_photo"); 

    const item = inventory.find(i => i.id === id);

    if (!item) {
      res.statusCode = 404;
      return res.end("Not Found");
    }

    let result = { ...item };

    if (hasPhoto === "yes" && item.photo) {
      result.description += ` (Photo: /${options.cache}/${item.photo})`;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });

  return;
}


  res.statusCode = 405;
  res.end("Method Not Allowed");
});
  
server.listen(options.port, options.host, () => {
  console.log(`Server running at http://${options.host}:${options.port}/`);
});



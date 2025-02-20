const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  },
});

const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.ah9aw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("ToDoDB");
    const tasksCollection = db.collection("taskList");

    // Socket.io connection
    io.on("connection", (socket) => {
      console.log("A user connected");

      socket.on("disconnect", () => {
        console.log("User disconnected");
      });
    });

    // Get all tasks
    app.get("/tasks", async (req, res) => {
      try {
        const tasks = await tasksCollection.find().toArray();
        res.status(200).json(tasks);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch tasks" });
      }
    });

    // Add a new task
    app.post("/tasks", async (req, res) => {
      const newTask = { ...req.body, createdAt: new Date() };
      try {
        const result = await tasksCollection.insertOne(newTask);
        newTask._id = result.insertedId;
        io.emit("taskAdded", newTask);
        res.status(201).json(newTask);
      } catch (err) {
        res.status(500).json({ error: "Failed to add task" });
      }
    });

    // Update task status (dragging between columns)
    app.patch("/tasks/:id", async (req, res) => {
        const { id } = req.params;
        const { category, newOrder } = req.body;
      
        try {
          const result = await tasksCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { category, order: newOrder } }
          );
      
          if (result.modifiedCount === 0) {
            return res.status(404).json({ error: "Task not found" });
          }
      
          io.emit("taskUpdated", { id, status, newOrder });
          res.status(200).json({ message: "Task updated successfully" });
        } catch (err) {
          console.error("Update error:", err);
          res.status(500).json({ error: "Failed to update task" });
        }
      });
      

    // reorder task
    app.post("/tasks/reorder", async (req, res) => {
        const { category, tasks } = req.body;
      
        try {
          const bulkUpdates = tasks.map(({ _id, order }) => ({
            updateOne: {
              filter: { _id: new ObjectId(_id) },
              update: { $set: { order } },
            },
          }));
      
          if (bulkUpdates.length > 0) {
            await tasksCollection.bulkWrite(bulkUpdates);
          }
      
          const updatedTasks = await tasksCollection.find().toArray();
          io.emit("taskUpdated", updatedTasks);
      
          res.status(200).json({ success: true, message: "Tasks reordered successfully." });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      

    // Delete a task
    app.delete("/tasks/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await tasksCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Task not found" });
        }
        io.emit("taskDeleted", id);
        res.status(200).json({ message: "Task deleted successfully" });
      } catch (err) {
        res.status(500).json({ error: "Failed to delete task" });
      }
    });
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send({
    status: 200,
    message: "Hello, server running with real-time updates...",
  });
});

server.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});

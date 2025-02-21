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
    // console.log("Connected to MongoDB");

    const db = client.db("ToDoDB");
    const tasksCollection = db.collection("taskList");

    // Socket.io connection
    io.on("connection", (socket) => {
      //   console.log("A user connected");

      socket.on("disconnect", () => {
        // console.log("User disconnected");
      });
    });

    // Get all tasks for a specific user based on email
    app.get("/tasks/:email", async (req, res) => {
      const { email } = req.params;
      //   console.log(`Fetching tasks for email: ${email}`); // Debugging log

      try {
        const tasks = await tasksCollection.find({ email }).toArray();
        if (tasks.length === 0) {
          return res
            .status(200)
            .json({ message: "No tasks found for this user" });
        }
        res.status(200).json(tasks);
      } catch (err) {
        console.error("Error fetching tasks:", err); // Debugging log
        res.status(500).json({ error: "Failed to fetch tasks" });
      }
    });

    // Add a new task for a specific user
    app.post("/tasks", async (req, res) => {
      const newTask = { ...req.body, createdAt: new Date() };

      // Ensure the email is passed with the task data
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      try {
        const result = await tasksCollection.insertOne(newTask);
        newTask._id = result.insertedId;
        io.emit("taskAdded", newTask);
        res.status(201).json(newTask);
      } catch (err) {
        res.status(500).json({ error: "Failed to add task" });
      }
    });

    // Update task status for a specific user (dragging between columns)
    app.patch("/tasks/:email/:id", async (req, res) => {
      const { email, id } = req.params;
      const { category, newOrder } = req.body;

      try {
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id), email },
          { $set: { category, order: newOrder } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Task not found" });
        }

        const updatedTasks = await tasksCollection.find({ email }).toArray();
        io.emit("taskUpdated", updatedTasks);
        res.status(200).json({ message: "Task updated successfully" });
      } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ error: "Failed to update task" });
      }
    });

    // Update task content
    app.patch("/tasks/update/:email/:id", async (req, res) => {
      const { email, id } = req.params; // Extract email and id from URL params
      const { title, description, category, endDate } = req.body; // Get task data from the request body

      try {
        // Assuming you are using a MongoDB collection `tasksCollection`
        const updatedTask = await tasksCollection.updateOne(
          { _id: new ObjectId(id), email }, // Find the task by id and email
          {
            $set: {
              title,
              description,
              category,
              endDate,
            },
          }
        );

        if (updatedTask.modifiedCount > 0) {
          return res.status(200).json({ message: "Task updated successfully" });
        } else {
          return res
            .status(404)
            .json({ message: "Task not found or no changes made" });
        }
      } catch (error) {
        console.error("Error updating task:", error);
        return res.status(500).json({ message: "Failed to update task" });
      }
    });

    // Reorder tasks for a specific user
    app.post("/tasks/reorder/:email", async (req, res) => {
      const { email } = req.params;
      const { category, tasks } = req.body;

      try {
        const bulkUpdates = tasks.map(({ _id, order }) => ({
          updateOne: {
            filter: { _id: new ObjectId(_id), email },
            update: { $set: { order } },
          },
        }));

        if (bulkUpdates.length > 0) {
          await tasksCollection.bulkWrite(bulkUpdates);
        }

        const updatedTasks = await tasksCollection.find({ email }).toArray();
        io.emit("taskUpdated", updatedTasks);

        res.status(200).json({
          success: true,
          message: "Tasks reordered successfully.",
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete a task for a specific user
    app.delete("/tasks/:email/:id", async (req, res) => {
      const { email, id } = req.params;

      try {
        const result = await tasksCollection.deleteOne({
          _id: new ObjectId(id),
          email,
        });
        if (result.deletedCount === 1) {
          res.status(200).json({ message: "Task deleted successfully" });
        } else {
          res.status(404).json({ error: "Task not found" });
        }
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

const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

app.use(cors());
app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.send("E-Tution Server is Running...!");
});

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("TutionBD_DB");
    const usersCollection = db.collection("users");

    // users api
    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const cursor = await usersCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Users Not Found" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

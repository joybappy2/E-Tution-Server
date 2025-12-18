const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

//-------Firebase Admin Installation-------
const admin = require("firebase-admin");
const serviceAccount = require("./fbadmin-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors());
app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

//-------Verify Token-------
const verifyToken = async (req, res, next) => {
  const token = req.headers?.authorization;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }

  try {
    const tokenID = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenID);
    req.tokenOwnerEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
};

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
    const tutionsCollection = db.collection("tutions");

    // -------Get A User Role By Email-------
    app.get("/user/:email/role", async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.send({ message: "Email Ruquired" });
      }
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "student" });
    });

    //-------Post User-------
    app.post("/users", async (req, res) => {
      try {
        const existingUserQuery = { email: req.body.email };
        const existingUser = await usersCollection.findOne(existingUserQuery);
        if (existingUser) {
          return res.status(200).send({ message: "Existing user logged in" });
        }

        const newUser = {
          name: req.body?.name,
          email: req.body?.email,
          role: req.body?.role,
          phone: req.body?.phone,
        };
        newUser.createdAt = new Date();

        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // -------Get All User-------
    app.get("/users", verifyToken, async (req, res) => {
      try {
        const cursor = await usersCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Inernal Server Error" });
      }
    });

    //-------Post Tution-------
    app.post("/post-tution", async (req, res) => {
      const newPost = req.body;
      (newPost.status = "pending"), (newPost.createdAt = new Date());
      const result = await tutionsCollection.insertOne(newPost);
      res.send(result);
    });

    //-------My Tutions By Email-------
    app.get("/my-tutions/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };
        const cursor = await tutionsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error" });
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
